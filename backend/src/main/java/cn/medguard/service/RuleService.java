package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.entity.ConflictRule;
import cn.medguard.mapper.ConflictRuleMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 冲突规则库管理：四类规则（成分重复/同类叠加/禁忌配伍/老年慎用），
 * 版本管理与审核状态（PENDING→APPROVED 才能上线），变更即推送 AI 服务热更新。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RuleService {

    private final ConflictRuleMapper ruleMapper;
    private final AuditService audit;
    private final AiClient aiClient;

    public static final Set<String> TYPES = Set.of(
            "DUPLICATE_INGREDIENT", "CLASS_STACKING", "CONTRAINDICATED", "ELDERLY_CAUTION");

    public Map<String, Object> list(String type, String reviewStatus, long page, long size) {
        QueryWrapper<ConflictRule> q = new QueryWrapper<>();
        if (type != null && !type.isBlank()) q.eq("rule_type", type);
        if (reviewStatus != null && !reviewStatus.isBlank()) q.eq("review_status", reviewStatus);
        q.orderByAsc("id");
        var p = ruleMapper.selectPage(
                new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(page, Math.min(size, 200)), q);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total", p.getTotal());
        r.put("records", p.getRecords());
        return r;
    }

    /** 只有已审核(APPROVED)且启用的规则参与线上校验（申报书：经执业药师审核后上线） */
    public List<Map<String, Object>> effectiveRules() {
        List<ConflictRule> rules = ruleMapper.selectList(new QueryWrapper<ConflictRule>()
                .eq("review_status", "APPROVED").eq("enabled", 1));
        List<Map<String, Object>> out = new ArrayList<>();
        for (ConflictRule r : rules) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ruleCode", r.getRuleCode());
            m.put("ruleType", r.getRuleType());
            m.put("drugA", r.getDrugA());
            m.put("drugB", r.getDrugB());
            m.put("riskLevel", r.getRiskLevel());
            m.put("explanation", r.getExplanation());
            m.put("basisSource", r.getBasisSource());
            m.put("version", r.getVersion());
            out.add(m);
        }
        return out;
    }

    public ConflictRule create(ConflictRule r) {
        validate(r);
        r.setId(null);
        r.setVersion(1);
        if (r.getReviewStatus() == null) r.setReviewStatus("PENDING");
        r.setEnabled(r.getEnabled() == null ? 1 : r.getEnabled());
        ruleMapper.insert(r);
        audit.log("RULE_CREATE", "conflict_rule", r.getId(), r.getRuleCode() + " " + r.getRuleType());
        pushToAi();
        return r;
    }

    public ConflictRule update(long id, ConflictRule r) {
        ConflictRule old = ruleMapper.selectById(id);
        if (old == null) throw BizException.notFound("规则不存在");
        validate(r);
        r.setId(id);
        r.setVersion(old.getVersion() + 1);
        ruleMapper.updateById(r);
        audit.log("RULE_UPDATE", "conflict_rule", id,
                old.getRuleCode() + " v" + old.getVersion() + "→v" + r.getVersion());
        pushToAi();
        return ruleMapper.selectById(id);
    }

    /** 药师审核动作：PENDING → APPROVED（记录审核人，留痕） */
    public void review(long id, String reviewer, boolean approve) {
        ConflictRule r = ruleMapper.selectById(id);
        if (r == null) throw BizException.notFound("规则不存在");
        r.setReviewStatus(approve ? "APPROVED" : "PENDING");
        r.setReviewedBy(reviewer);
        ruleMapper.updateById(r);
        audit.log("RULE_REVIEW", "conflict_rule", id,
                r.getRuleCode() + " 审核人:" + reviewer + " 结果:" + (approve ? "通过" : "退回"));
        pushToAi();
    }

    public void toggle(long id, boolean enabled) {
        ConflictRule r = ruleMapper.selectById(id);
        if (r == null) throw BizException.notFound("规则不存在");
        r.setEnabled(enabled ? 1 : 0);
        ruleMapper.updateById(r);
        audit.log(enabled ? "RULE_ENABLE" : "RULE_DISABLE", "conflict_rule", id, r.getRuleCode());
        pushToAi();
    }

    private void validate(ConflictRule r) {
        if (r.getRuleCode() == null || r.getRuleCode().isBlank()) throw new BizException("规则编码必填");
        if (r.getRuleType() == null || !TYPES.contains(r.getRuleType())) throw new BizException("规则类型必须是四类之一");
        if (r.getDrugA() == null || r.getDrugA().isBlank()) throw new BizException("药物/成分A必填");
        if (r.getRiskLevel() == null || !Set.of("HIGH", "MEDIUM", "LOW").contains(r.getRiskLevel()))
            throw new BizException("风险级别必须是 HIGH/MEDIUM/LOW");
        if (r.getExplanation() == null || r.getExplanation().isBlank()) throw new BizException("解释话术必填（给老人看的通俗解释）");
        if (r.getBasisSource() == null || r.getBasisSource().isBlank()) throw new BizException("依据来源必填（可追溯）");
    }

    public void pushToAi() {
        aiClient.syncRules(effectiveRules());
    }
}
