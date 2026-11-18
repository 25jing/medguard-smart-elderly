package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.common.MaskUtil;
import cn.medguard.entity.Checkin;
import cn.medguard.entity.FamilyBind;
import cn.medguard.entity.MedPlan;
import cn.medguard.entity.Medication;
import cn.medguard.entity.Reminder;
import cn.medguard.mapper.CheckinMapper;
import cn.medguard.mapper.FamilyBindMapper;
import cn.medguard.mapper.MedPlanMapper;
import cn.medguard.mapper.MedicationMapper;
import cn.medguard.mapper.ReminderMapper;
import cn.medguard.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 用药计划 / 服药打卡 / 提醒 / 依从率。
 * 判定规则（可解释、写进文档）：
 *   TAKEN  = 在计划时间 ±10 分钟内打卡
 *   LATE   = 超过计划时间 10~60 分钟内打卡
 *   MISSED = 超过计划时间 60 分钟仍未打卡（定时任务标记，仍可补打卡→转为 LATE）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanService implements FamilyService.AdherenceSupplier {

    private final MedPlanMapper planMapper;
    private final CheckinMapper checkinMapper;
    private final ReminderMapper reminderMapper;
    private final MedicationMapper medicationMapper;
    private final FamilyBindMapper bindMapper;
    private final AuditService audit;
    private final AiClient aiClient;
    private final AlertService alertService;

    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");
    private static final int ON_TIME_MIN = 10;
    private static final int MISSED_MIN = 60;

    // ================= 用药计划 =================

    /**
     * 家属代办支持：解析计划操作的目标老人。
     * 本人/ADMIN 直通；FAMILY 必须持有该老人 APPROVED 的 MANAGE_PLANS 授权，否则 403。
     */
    public long resolveTarget(Long elderId) {
        UserContext.CurrentUser cur = UserContext.require();
        if (elderId == null || elderId == cur.id()) return cur.id();
        if (cur.isAdmin()) return elderId;
        if (!cur.isFamily()) throw BizException.forbidden("无权操作他人用药计划");
        FamilyBind b = bindMapper.selectOne(new QueryWrapper<FamilyBind>()
                .eq("elder_id", elderId).eq("family_id", cur.id()).eq("status", "APPROVED").last("LIMIT 1"));
        if (b == null || !Arrays.asList(b.getScopes().split(",")).contains("MANAGE_PLANS"))
            throw BizException.forbidden("老人尚未授权您管理用药计划");
        return elderId;
    }

    /** 新建计划；返回体附带与现有在服药物的冲突校验结果（成分级四类规则） */
    public Map<String, Object> createPlan(Long medicationId, String medName, String doseText,
                                          List<String> times, LocalDate startDate, LocalDate endDate,
                                          String notes, Long targetElderId) {
        UserContext.CurrentUser cur = UserContext.require();
        long elderId = resolveTarget(targetElderId);
        if (times == null || times.isEmpty()) throw new BizException("请设置至少一个服药时间点");
        for (String t : times) {
            try { LocalTime.parse(t, HHMM); } catch (Exception e) { throw new BizException("时间点格式应为 HH:mm，如 08:00"); }
        }
        String name = medName;
        if (medicationId != null) {
            Medication m = medicationMapper.selectById(medicationId);
            if (m == null) throw BizException.notFound("药品不存在");
            name = m.getGenericName() + (m.getBrandName() != null && !m.getBrandName().isBlank()
                    ? "(" + m.getBrandName() + ")" : "");
        }
        if (name == null || name.isBlank()) throw new BizException("请填写药品名称");

        MedPlan p = new MedPlan();
        p.setElderId(elderId);
        p.setMedicationId(medicationId);
        p.setMedName(name.trim());
        p.setDoseText(doseText == null || doseText.isBlank() ? "1次量" : doseText.trim());
        p.setTimes(String.join(",", times));
        p.setStartDate(startDate == null ? LocalDate.now() : startDate);
        p.setEndDate(endDate);
        p.setNotes(notes);
        p.setActive(1);
        planMapper.insert(p);
        String byFamily = elderId == cur.id() ? "" : "【家属代办·操作人:" + cur.name() + "】";
        audit.log("PLAN_CREATE", "med_plan", p.getId(), p.getMedName() + " " + p.getTimes() + byFamily);
        ensureTodayCheckins(elderId);

        // 冲突校验：新药 + 现有全部在用药物
        List<Map<String, Object>> warnings = checkConflictsFor(elderId, p);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("plan", p);
        r.put("conflictWarnings", warnings);
        return r;
    }

    public List<MedPlan> myPlans(Long elderId) {
        long target = resolveTarget(elderId);
        return planMapper.selectList(new QueryWrapper<MedPlan>()
                .eq("elder_id", target).eq("active", 1).orderByAsc("id"));
    }

    public void deactivate(long planId, Long elderId) {
        UserContext.CurrentUser cur = UserContext.require();
        MedPlan p = planMapper.selectById(planId);
        if (p == null) throw BizException.notFound("计划不存在");
        long target = resolveTarget(elderId);
        if (!p.getElderId().equals(target) && !cur.isAdmin()) throw BizException.forbidden("无权操作");
        p.setActive(0);
        planMapper.updateById(p);
        String byFamily = target == cur.id() ? "" : "【家属代办·操作人:" + cur.name() + "】";
        audit.log("PLAN_STOP", "med_plan", planId, "停用: " + p.getMedName() + byFamily);
    }

    /** 组装当前在用药物列表（含成分），供 AI 冲突校验 */
    public List<Map<String, Object>> activeMedPayload(Long elderId, MedPlan extra) {
        List<MedPlan> plans = planMapper.selectList(new QueryWrapper<MedPlan>()
                .eq("elder_id", elderId).eq("active", 1));
        List<Map<String, Object>> meds = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (MedPlan p : plans) meds.add(medPayloadOf(p, seen));
        if (extra != null) meds.add(medPayloadOf(extra, seen));
        meds.removeIf(Objects::isNull);
        return meds;
    }

    private Map<String, Object> medPayloadOf(MedPlan p, Set<String> seen) {
        if (!seen.add(p.getMedName())) return null;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", p.getMedName());
        m.put("ingredients", List.of());
        if (p.getMedicationId() != null) {
            Medication med = medicationMapper.selectById(p.getMedicationId());
            if (med != null) {
                m.put("name", med.getGenericName());
                m.put("ingredients", Arrays.asList(
                        med.getIngredients() == null ? new String[0] : med.getIngredients().split(",")));
                m.put("drugClass", med.getDrugClass());
            }
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> checkConflictsFor(Long elderId, MedPlan newPlan) {
        try {
            List<Map<String, Object>> meds = activeMedPayload(elderId, null);
            if (meds.size() < 2) return List.of();
            Map<String, Object> r = aiClient.conflict(meds);
            Object conflicts = r == null ? null : r.get("conflicts");
            if (conflicts instanceof List<?> l) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object o : l) if (o instanceof Map<?, ?> mm) out.add((Map<String, Object>) mm);
                boolean hasHigh = out.stream().anyMatch(c -> "HIGH".equals(String.valueOf(c.get("riskLevel"))));
                if (hasHigh) audit.log("CONFLICT_HIGH", "med_plan", newPlan == null ? null : newPlan.getId(),
                        "检出高风险用药组合，已提示用户");
                try { alertService.notifyConflicts(elderId, out); }
                catch (Exception ae) { log.warn("家属告警推送失败: {}", ae.getMessage()); }
                return out;
            }
        } catch (Exception e) {
            log.warn("冲突校验调用失败(AI服务未启动?): {}", e.getMessage());
        }
        return List.of();
    }

    // ================= 打卡 =================

    /** 今日任务（懒生成当日打卡行 + 标记漏服） */
    public List<Checkin> todayCheckins() {
        UserContext.CurrentUser cur = UserContext.require();
        return ensureTodayCheckins(cur.id());
    }

    public List<Checkin> ensureTodayCheckins(Long elderId) {
        LocalDate today = LocalDate.now();
        List<MedPlan> plans = planMapper.selectList(new QueryWrapper<MedPlan>()
                .eq("elder_id", elderId).eq("active", 1)
                .le("start_date", today)
                .and(w -> w.isNull("end_date").or().ge("end_date", today)));
        for (MedPlan p : plans) {
            for (String t : p.getTimes().split(",")) {
                LocalDateTime at;
                try { at = LocalDateTime.of(today, LocalTime.parse(t.trim(), HHMM)); }
                catch (Exception e) { continue; }
                Checkin c = new Checkin();
                c.setPlanId(p.getId());
                c.setElderId(elderId);
                c.setMedName(p.getMedName());
                c.setScheduledAt(at);
                c.setStatus("PENDING");
                try { checkinMapper.insert(c); } catch (DuplicateKeyException ignore) { }
            }
        }
        markMissed(elderId);
        return checkinMapper.selectList(new QueryWrapper<Checkin>()
                .eq("elder_id", elderId)
                .ge("scheduled_at", today.atStartOfDay())
                .lt("scheduled_at", today.plusDays(1).atStartOfDay())
                .orderByAsc("scheduled_at"));
    }

    /** 漏服规则：超过计划时间60分钟仍未打卡 → MISSED（可解释规则判定） */
    public void markMissed(Long elderId) {
        LocalDateTime deadline = LocalDateTime.now().minusMinutes(MISSED_MIN);
        List<Checkin> pending = checkinMapper.selectList(new QueryWrapper<Checkin>()
                .eq("elder_id", elderId).eq("status", "PENDING").lt("scheduled_at", deadline));
        for (Checkin c : pending) {
            c.setStatus("MISSED");
            checkinMapper.updateById(c);
        }
    }

    /** 打卡服药（大按钮一键操作；超时补卡记为 LATE） */
    public Checkin doCheckin(long checkinId, String note) {
        UserContext.CurrentUser cur = UserContext.require();
        Checkin c = checkinMapper.selectById(checkinId);
        if (c == null) throw BizException.notFound("打卡任务不存在");
        if (!c.getElderId().equals(cur.id())) throw BizException.forbidden("只能为自己打卡");
        if ("TAKEN".equals(c.getStatus()) || "LATE".equals(c.getStatus()))
            throw new BizException("这次已经打过卡啦");
        LocalDateTime now = LocalDateTime.now();
        long diffMin = Duration.between(c.getScheduledAt(), now).toMinutes();
        c.setCheckedAt(now);
        c.setStatus(diffMin <= ON_TIME_MIN ? "TAKEN" : "LATE");
        c.setNote(note);
        checkinMapper.updateById(c);
        audit.log("CHECKIN", "checkin", c.getId(), c.getMedName() + " → " + c.getStatus());
        return c;
    }

    public List<Map<String, Object>> history(int days) {
        UserContext.CurrentUser cur = UserContext.require();
        days = Math.min(Math.max(days, 1), 90);
        List<Checkin> list = checkinMapper.selectList(new QueryWrapper<Checkin>()
                .eq("elder_id", cur.id())
                .ge("scheduled_at", LocalDate.now().minusDays(days).atStartOfDay())
                .orderByDesc("scheduled_at"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Checkin c : list) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("medName", c.getMedName());
            m.put("scheduledAt", c.getScheduledAt());
            m.put("checkedAt", c.getCheckedAt());
            m.put("status", c.getStatus());
            out.add(m);
        }
        return out;
    }

    // ================= 提醒 =================

    /** 每分钟扫描：服药前10分钟生成应用内提醒；2小时未读过期 */
    @Scheduled(fixedDelay = 60_000)
    public void reminderScan() {
        LocalDateTime now = LocalDateTime.now();
        List<Checkin> upcoming = checkinMapper.selectList(new QueryWrapper<Checkin>()
                .eq("status", "PENDING")
                .ge("scheduled_at", now.minusMinutes(5))
                .le("scheduled_at", now.plusMinutes(10)));
        for (Checkin c : upcoming) {
            Reminder r = new Reminder();
            r.setElderId(c.getElderId());
            r.setPlanId(c.getPlanId());
            r.setDueAt(c.getScheduledAt());
            r.setTitle("该吃药啦：" + c.getMedName());
            r.setContent("请在 " + c.getScheduledAt().format(HHMM) + " 左右服用 " + c.getMedName() + "，服完点大按钮打卡");
            r.setStatus("PENDING");
            try { reminderMapper.insert(r); } catch (DuplicateKeyException ignore) { }
        }
        // 过期清理
        Reminder exp = new Reminder();
        reminderMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper<Reminder>()
                .set("status", "EXPIRED")
                .eq("status", "PENDING")
                .lt("due_at", now.minusHours(2)));
    }

    public List<Reminder> myReminders() {
        UserContext.CurrentUser cur = UserContext.require();
        return reminderMapper.selectList(new QueryWrapper<Reminder>()
                .eq("elder_id", cur.id()).eq("status", "PENDING").orderByAsc("due_at"));
    }

    public void readReminder(long id) {
        UserContext.CurrentUser cur = UserContext.require();
        Reminder r = reminderMapper.selectById(id);
        if (r != null && r.getElderId().equals(cur.id())) {
            r.setStatus("READ");
            reminderMapper.updateById(r);
        }
    }

    // ================= 依从率 =================

    /** 本人/管理员看全量；家属需 VIEW_ADHERENCE 授权且只见汇总 */
    public Map<String, Object> adherence(Long elderId, int days, boolean familyView) {
        days = Math.min(Math.max(days, 1), 90);
        List<Map<String, Object>> counts = checkinMapper.countByStatus(elderId, days);
        long taken = 0, late = 0, missed = 0, pending = 0;
        for (Map<String, Object> m : counts) {
            long cnt = ((Number) m.get("cnt")).longValue();
            switch (String.valueOf(m.get("status"))) {
                case "TAKEN" -> taken = cnt;
                case "LATE" -> late = cnt;
                case "MISSED" -> missed = cnt;
                default -> pending = cnt;
            }
        }
        long done = taken + late + missed;
        double rate = done == 0 ? 100.0 : Math.round((taken + late) * 10000.0 / done) / 100.0;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("taken", taken); out.put("late", late); out.put("missed", missed); out.put("pending", pending);
        out.put("adherenceRate", rate);
        if (!familyView) out.put("trend", checkinMapper.dailyTrend(elderId, days));
        return out;
    }

    /** FamilyService.AdherenceSupplier：家属端脱敏汇总（申报书：只见汇总不见明细） */
    @Override
    public Map<String, Object> summary(long elderId, String scopes) {
        Set<String> scope = new HashSet<>(Arrays.asList(scopes.split(",")));
        Map<String, Object> s = new LinkedHashMap<>();
        List<MedPlan> plans = planMapper.selectList(new QueryWrapper<MedPlan>()
                .eq("elder_id", elderId).eq("active", 1));
        s.put("medCount", plans.size());
        s.put("medBriefs", plans.stream().map(p -> MaskUtil.medBrief(p.getMedName())).limit(5).toList());
        long todayTaken = checkinMapper.selectCount(new QueryWrapper<Checkin>()
                .eq("elder_id", elderId).in("status", "TAKEN", "LATE")
                .ge("scheduled_at", LocalDate.now().atStartOfDay()));
        long todayTotal = checkinMapper.selectCount(new QueryWrapper<Checkin>()
                .eq("elder_id", elderId)
                .ge("scheduled_at", LocalDate.now().atStartOfDay()));
        s.put("todayTaken", todayTaken);
        s.put("todayTotal", todayTotal);
        if (scope.contains("VIEW_ADHERENCE")) {
            s.put("adherence7d", adherence(elderId, 7, true));
        }
        if (scope.contains("RECEIVE_ALERTS")) {
            long missed7d = checkinMapper.selectCount(new QueryWrapper<Checkin>()
                    .eq("elder_id", elderId).eq("status", "MISSED")
                    .ge("scheduled_at", LocalDate.now().minusDays(7).atStartOfDay()));
            s.put("missed7d", missed7d);
            s.put("alertLevel", missed7d >= 3 ? "HIGH" : missed7d >= 1 ? "MEDIUM" : "NONE");
        }
        return s;
    }
}
