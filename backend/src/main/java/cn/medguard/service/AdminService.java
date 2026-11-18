package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.common.MaskUtil;
import cn.medguard.entity.*;
import cn.medguard.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/** 管理端：用户权限管理 / 老年用药数据管理 / 药品知识库维护 / 脱敏统计仪表盘 */
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserMapper userMapper;
    private final CheckinMapper checkinMapper;
    private final MedPlanMapper planMapper;
    private final MedicationMapper medicationMapper;
    private final ConflictRuleMapper ruleMapper;
    private final RecognizeLogMapper recognizeLogMapper;
    private final QaLogMapper qaLogMapper;
    private final AuditLogMapper auditLogMapper;
    private final AuditService audit;

    public Map<String, Object> users(String keyword, String role, long page, long size) {
        QueryWrapper<User> q = new QueryWrapper<>();
        if (role != null && !role.isBlank()) q.eq("role", role);
        if (keyword != null && !keyword.isBlank())
            q.and(w -> w.like("name", keyword).or().like("phone", keyword));
        q.orderByDesc("id");
        Page<User> p = userMapper.selectPage(new Page<>(page, Math.min(size, 100)), q);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (User u : p.getRecords()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", u.getId());
            m.put("name", u.getName());                 // 管理端可见全名（权限管理需要）
            m.put("phone", MaskUtil.phone(u.getPhone())); // 手机号仍脱敏展示
            m.put("role", u.getRole());
            m.put("createdAt", u.getCreatedAt());
            m.put("consentAt", u.getConsentAt());
            rows.add(m);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total", p.getTotal());
        r.put("records", rows);
        return r;
    }

    public void changeRole(long userId, String role) {
        if (!Set.of("ELDER", "FAMILY", "ADMIN").contains(role)) throw new BizException("无效角色");
        User u = userMapper.selectById(userId);
        if (u == null) throw BizException.notFound("用户不存在");
        String old = u.getRole();
        u.setRole(role);
        userMapper.updateById(u);
        audit.log("ROLE_CHANGE", "user", userId, old + " → " + role);
    }

    /** 仪表盘：脱敏统计（申报书：管理端做脱敏统计） */
    public Map<String, Object> dashboard() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("userCounts", Map.of(
                "elder", userMapper.selectCount(new QueryWrapper<User>().eq("role", "ELDER")),
                "family", userMapper.selectCount(new QueryWrapper<User>().eq("role", "FAMILY")),
                "admin", userMapper.selectCount(new QueryWrapper<User>().eq("role", "ADMIN"))));
        d.put("medicationCount", medicationMapper.selectCount(new QueryWrapper<Medication>().eq("enabled", 1)));
        d.put("ruleCounts", Map.of(
                "total", ruleMapper.selectCount(null),
                "approved", ruleMapper.selectCount(new QueryWrapper<ConflictRule>().eq("review_status", "APPROVED")),
                "pending", ruleMapper.selectCount(new QueryWrapper<ConflictRule>().eq("review_status", "PENDING"))));
        d.put("activePlans", planMapper.selectCount(new QueryWrapper<MedPlan>().eq("active", 1)));
        d.put("todayCheckins", checkinMapper.selectCount(new QueryWrapper<Checkin>()
                .ge("scheduled_at", LocalDate.now().atStartOfDay())));
        d.put("recognizeTrend", recognizeLogMapper.weekTrend());
        d.put("qaTrend", qaLogMapper.weekTrend());
        // 全局依从率（脱敏聚合，不含个人明细）
        long taken = checkinMapper.selectCount(new QueryWrapper<Checkin>()
                .in("status", "TAKEN", "LATE")
                .ge("scheduled_at", LocalDate.now().minusDays(7).atStartOfDay()));
        long done = checkinMapper.selectCount(new QueryWrapper<Checkin>()
                .in("status", "TAKEN", "LATE", "MISSED")
                .ge("scheduled_at", LocalDate.now().minusDays(7).atStartOfDay()));
        d.put("adherence7dRate", done == 0 ? 100.0 : Math.round(taken * 10000.0 / done) / 100.0);
        // 问答引用覆盖率（非拒答回答中带来源的比例）——申报书指标之一
        long qaAll = qaLogMapper.selectCount(new QueryWrapper<QaLog>().eq("refused", 0));
        long qaCited = qaLogMapper.selectCount(new QueryWrapper<QaLog>()
                .eq("refused", 0).isNotNull("sources").ne("sources", "[]"));
        d.put("citationCoverage", qaAll == 0 ? 100.0 : Math.round(qaCited * 10000.0 / qaAll) / 100.0);
        d.put("refusedCount", qaLogMapper.selectCount(new QueryWrapper<QaLog>().eq("refused", 1)));
        return d;
    }

    public Map<String, Object> audits(long page, long size) {
        Page<AuditLog> p = auditLogMapper.selectPage(new Page<>(page, Math.min(size, 100)),
                new QueryWrapper<AuditLog>().orderByDesc("id"));
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total", p.getTotal());
        r.put("records", p.getRecords());
        return r;
    }

    public Map<String, Object> recognizeLogs(long page, long size) {
        Page<RecognizeLog> p = recognizeLogMapper.selectPage(new Page<>(page, Math.min(size, 50)),
                new QueryWrapper<RecognizeLog>().orderByDesc("id"));
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total", p.getTotal());
        r.put("records", p.getRecords());
        return r;
    }

    public Map<String, Object> qaLogs(long page, long size) {
        Page<QaLog> p = qaLogMapper.selectPage(new Page<>(page, Math.min(size, 50)),
                new QueryWrapper<QaLog>().orderByDesc("id"));
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total", p.getTotal());
        r.put("records", p.getRecords());
        return r;
    }

    /** 审计日志超期清除（保存6个月） */
    public int purgeOldAudits() {
        LocalDateTime deadline = LocalDateTime.now().minusMonths(6);
        return auditLogMapper.delete(new QueryWrapper<AuditLog>().lt("created_at", deadline));
    }
}
