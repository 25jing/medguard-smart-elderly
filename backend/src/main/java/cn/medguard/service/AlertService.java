package cn.medguard.service;

import cn.medguard.common.MaskUtil;
import cn.medguard.entity.FamilyAlert;
import cn.medguard.entity.FamilyBind;
import cn.medguard.entity.User;
import cn.medguard.mapper.FamilyAlertMapper;
import cn.medguard.mapper.FamilyBindMapper;
import cn.medguard.mapper.UserMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 家属风险提醒：老人用药冲突检出（HIGH/MEDIUM）→ 落库 + SSE 即时推送给
 * 已绑定且勾选 RECEIVE_ALERTS 的家属。同组合 1 小时去重防轰炸。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {

    private final FamilyBindMapper bindMapper;
    private final FamilyAlertMapper alertMapper;
    private final UserMapper userMapper;
    private final AuditService audit;

    /** familyId → 在线 SSE 通道（家属端开着页面就能"立即弹出"） */
    private final Map<Long, List<SseEmitter>> channels = new ConcurrentHashMap<>();

    public SseEmitter subscribe(long familyId) {
        SseEmitter em = new SseEmitter(0L);
        channels.computeIfAbsent(familyId, k -> new CopyOnWriteArrayList<>()).add(em);
        em.onCompletion(() -> remove(familyId, em));
        em.onTimeout(() -> remove(familyId, em));
        em.onError(e -> remove(familyId, em));
        try { em.send(SseEmitter.event().name("hello").data("ok")); } catch (Exception ignore) { }
        return em;
    }

    private void remove(long fid, SseEmitter em) {
        List<SseEmitter> l = channels.get(fid);
        if (l != null) { l.remove(em); if (l.isEmpty()) channels.remove(fid); }
    }

    /** 冲突校验出口统一挂钩：有 HIGH/MEDIUM 就通知家属 */
    public void notifyConflicts(long elderId, List<Map<String, Object>> conflicts) {
        if (conflicts == null || conflicts.isEmpty()) return;
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Map<String, Object> c : conflicts) {
            String lv = String.valueOf(c.get("riskLevel"));
            if ("HIGH".equals(lv) || "MEDIUM".equals(lv)) hits.add(c);
        }
        if (hits.isEmpty()) return;

        User elder = userMapper.selectById(elderId);
        if (elder == null) return;
        String elderName = MaskUtil.name(elder.getName());

        List<FamilyBind> binds = bindMapper.selectList(new QueryWrapper<FamilyBind>()
                .eq("elder_id", elderId).eq("status", "APPROVED").like("scopes", "RECEIVE_ALERTS"));
        if (binds.isEmpty()) return;

        String hour = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHH"));
        for (FamilyBind b : binds) {
            for (Map<String, Object> c : hits) {
                String drugs = drugText(c);
                String key = elderId + ":" + c.getOrDefault("ruleCode", c.getOrDefault("explanation", "")) + ":" + drugs + ":" + hour;
                try {
                    FamilyAlert a = new FamilyAlert();
                    a.setElderId(elderId);
                    a.setFamilyId(b.getFamilyId());
                    a.setType("CONFLICT");
                    a.setLevel(String.valueOf(c.get("riskLevel")));
                    a.setTitle(("HIGH".equals(a.getLevel()) ? "【高危用药冲突】" : "【用药冲突提示】") + elderName);
                    a.setContent(drugs + "：" + String.valueOf(c.getOrDefault("explanation", "")));
                    a.setDedupKey(key);
                    a.setReadFlag(0);
                    a.setCreatedAt(LocalDateTime.now());
                    alertMapper.insert(a);   // 唯一键撞车=窗口内已提醒过，静默跳过
                    push(b.getFamilyId(), a);
                    audit.log(b.getFamilyId(), "家属", "ALERT_PUSH", "family_alert",
                            String.valueOf(a.getId()), "冲突提醒已推送：" + a.getTitle());
                } catch (Exception dup) {
                    log.debug("重复告警跳过 key={}", key);
                }
            }
        }
    }

    private String drugText(Map<String, Object> c) {
        Object ds = c.get("drugs");
        if (ds instanceof List<?> l && !l.isEmpty()) {
            List<String> names = new ArrayList<>();
            l.forEach(o -> names.add(String.valueOf(o)));
            return String.join(" × ", names);
        }
        String a = String.valueOf(c.getOrDefault("drugA", ""));
        String b = String.valueOf(c.getOrDefault("drugB", ""));
        return (a + (b.isEmpty() ? "" : " × " + b)).trim();
    }

    private void push(long familyId, FamilyAlert a) {
        List<SseEmitter> list = channels.get(familyId);
        if (list == null) return;
        for (SseEmitter em : list) {
            try { em.send(SseEmitter.event().name("alert").data(a)); }
            catch (Exception e) { remove(familyId, em); }
        }
    }

    /** 家属端补看：最近提醒 + 未读数 */
    public Map<String, Object> recentFor(long familyId, int limit) {
        List<FamilyAlert> items = alertMapper.selectList(new QueryWrapper<FamilyAlert>()
                .eq("family_id", familyId).orderByDesc("id").last("LIMIT " + Math.min(Math.max(limit, 1), 50)));
        long unread = alertMapper.selectCount(new QueryWrapper<FamilyAlert>()
                .eq("family_id", familyId).eq("read_flag", 0));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("unread", unread);
        return out;
    }

    public void markRead(long alertId, long familyId) {
        FamilyAlert a = alertMapper.selectById(alertId);
        if (a == null || !Objects.equals(a.getFamilyId(), familyId)) throw cn.medguard.common.BizException.forbidden("无权操作");
        a.setReadFlag(1);
        alertMapper.updateById(a);
    }
}
