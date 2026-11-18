package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.common.MaskUtil;
import cn.medguard.entity.*;
import cn.medguard.mapper.*;
import cn.medguard.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 家庭绑定与授权矩阵：
 * - 家属发起绑定 → 老人确认（双重同意）
 * - 授权范围三项独立勾选：VIEW_SUMMARY(模糊汇总) / VIEW_ADHERENCE(依从率) / RECEIVE_ALERTS(高风险提醒)
 * - 授权可随时撤销，撤销即时生效
 * - 家属端只见汇总不见明细（姓名脱敏、药名模糊化）
 */
@Service
@RequiredArgsConstructor
public class FamilyService {

    private final FamilyBindMapper bindMapper;
    private final UserMapper userMapper;
    private final AuditService audit;

    public static final Set<String> ALL_SCOPES = Set.of("VIEW_SUMMARY", "VIEW_ADHERENCE", "RECEIVE_ALERTS", "MANAGE_PLANS");

    /** 家属发起绑定申请 */
    public Map<String, Object> requestBind(String elderPhone, List<String> scopes) {
        UserContext.CurrentUser cur = UserContext.require();
        if (!cur.isFamily()) throw BizException.forbidden("只有家属账号能发起绑定");
        if (scopes == null || scopes.isEmpty()) scopes = List.of("VIEW_SUMMARY");
        for (String s : scopes)
            if (!ALL_SCOPES.contains(s)) throw new BizException("无效的授权范围: " + s);

        User elder = userMapper.selectOne(new QueryWrapper<User>()
                .eq("phone", elderPhone).eq("role", "ELDER"));
        if (elder == null) throw BizException.notFound("未找到该手机号对应的老人账号");

        FamilyBind exist = bindMapper.selectOne(new QueryWrapper<FamilyBind>()
                .eq("elder_id", elder.getId()).eq("family_id", cur.id()));
        String scopeCsv = String.join(",", scopes);
        if (exist == null) {
            FamilyBind b = new FamilyBind();
            b.setElderId(elder.getId());
            b.setFamilyId(cur.id());
            b.setScopes(scopeCsv);
            b.setStatus("PENDING");
            bindMapper.insert(b);
            audit.log("BIND_REQUEST", "family_bind", b.getId(),
                    "家属申请绑定老人 " + MaskUtil.phone(elderPhone) + " 授权:" + scopeCsv);
            return Map.of("id", b.getId(), "status", "PENDING",
                    "msg", "已发送绑定申请，等待老人在App中确认");
        }
        if ("APPROVED".equals(exist.getStatus())) {
            exist.setScopes(scopeCsv);
            bindMapper.updateById(exist);
            return Map.of("id", exist.getId(), "status", "APPROVED", "msg", "已绑定，授权范围已更新");
        }
        exist.setScopes(scopeCsv);
        exist.setStatus("PENDING");
        bindMapper.updateById(exist);
        audit.log("BIND_REQUEST", "family_bind", exist.getId(), "重新发起绑定申请");
        return Map.of("id", exist.getId(), "status", "PENDING", "msg", "已重新发送绑定申请");
    }

    /** 老人查看待处理申请 */
    public List<Map<String, Object>> pendingInvites() {
        UserContext.CurrentUser cur = UserContext.require();
        List<FamilyBind> list = bindMapper.selectList(new QueryWrapper<FamilyBind>()
                .eq("elder_id", cur.id()).eq("status", "PENDING")
                .orderByDesc("created_at"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (FamilyBind b : list) {
            User f = userMapper.selectById(b.getFamilyId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getId());
            m.put("familyName", f == null ? "?" : MaskUtil.name(f.getName()));
            m.put("familyPhone", f == null ? "?" : MaskUtil.phone(f.getPhone()));
            m.put("scopes", Arrays.asList(b.getScopes().split(",")));
            m.put("createdAt", b.getCreatedAt());
            out.add(m);
        }
        return out;
    }

    /** 老人同意/拒绝 */
    public void respond(long bindId, boolean approve) {
        UserContext.CurrentUser cur = UserContext.require();
        FamilyBind b = requireOwnBind(bindId, cur.id(), true);
        if (!"PENDING".equals(b.getStatus())) throw new BizException("该申请已处理过");
        b.setStatus(approve ? "APPROVED" : "REJECTED");
        b.setApprovedAt(approve ? LocalDateTime.now() : null);
        bindMapper.updateById(b);
        audit.log(approve ? "BIND_APPROVE" : "BIND_REJECT", "family_bind", b.getId(),
                "授权范围: " + b.getScopes());
    }

    /** 撤销授权：老人可撤任何绑定；家属可解除自己（撤销即时生效） */
    public void revoke(long bindId) {
        UserContext.CurrentUser cur = UserContext.require();
        FamilyBind b = bindMapper.selectById(bindId);
        if (b == null) throw BizException.notFound("绑定不存在");
        boolean isElder = b.getElderId().equals(cur.id());
        boolean isFamily = b.getFamilyId().equals(cur.id());
        if (!isElder && !isFamily && !cur.isAdmin()) throw BizException.forbidden("无权操作该绑定");
        b.setStatus("REVOKED");
        b.setRevokedAt(LocalDateTime.now());
        bindMapper.updateById(b);
        audit.log("BIND_REVOKE", "family_bind", b.getId(), (isElder ? "老人" : "家属") + "撤销授权，即时生效");
    }

    /** 老人查看已授权家属列表 */
    public List<Map<String, Object>> myFamilyMembers() {
        UserContext.CurrentUser cur = UserContext.require();
        List<FamilyBind> list = bindMapper.selectList(new QueryWrapper<FamilyBind>()
                .eq("elder_id", cur.id()).in("status", "APPROVED", "PENDING"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (FamilyBind b : list) {
            User f = userMapper.selectById(b.getFamilyId());
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getId());
            m.put("name", f == null ? "?" : f.getName());
            m.put("phone", f == null ? "?" : MaskUtil.phone(f.getPhone()));
            m.put("scopes", Arrays.asList(b.getScopes().split(",")));
            m.put("status", b.getStatus());
            out.add(m);
        }
        return out;
    }

    /** 家属查看自己绑定的老人（脱敏） */
    public List<Map<String, Object>> myElders() {
        UserContext.CurrentUser cur = UserContext.require();
        List<FamilyBind> list = bindMapper.selectList(new QueryWrapper<FamilyBind>()
                .eq("family_id", cur.id()).eq("status", "APPROVED"));
        List<Map<String, Object>> out = new ArrayList<>();
        for (FamilyBind b : list) {
            User e = userMapper.selectById(b.getElderId());
            if (e == null) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("bindId", b.getId());
            m.put("elderId", e.getId());
            m.put("name", MaskUtil.name(e.getName()));
            m.put("scopes", Arrays.asList(b.getScopes().split(",")));
            out.add(m);
        }
        return out;
    }

    /**
     * 家属汇总视图：按授权范围返回脱敏汇总（无原始明细）。
     * VIEW_SUMMARY=基本盘；VIEW_ADHERENCE=依从率与趋势；RECEIVE_ALERTS=高风险提醒数。
     */
    public Map<String, Object> summaryForFamily(long elderId, AdherenceSupplier adherence) {
        UserContext.CurrentUser cur = UserContext.require();
        FamilyBind b = approvedBindWithScope(elderId, cur.id(), "VIEW_SUMMARY");
        User elder = userMapper.selectById(elderId);
        if (elder == null) throw BizException.notFound("老人账号不存在");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("elderName", MaskUtil.name(elder.getName()));
        out.put("bindId", b.getId());
        out.put("scopes", Arrays.asList(b.getScopes().split(",")));
        out.put("summary", adherence.summary(elderId, b.getScopes())); // 脱敏汇总由 PlanService 提供
        return out;
    }

    public interface AdherenceSupplier {
        Map<String, Object> summary(long elderId, String scopes);
    }

    // ===== 内部工具 =====

    private FamilyBind requireOwnBind(long bindId, long elderId, boolean asElder) {
        FamilyBind b = bindMapper.selectById(bindId);
        if (b == null) throw BizException.notFound("绑定申请不存在");
        if (!b.getElderId().equals(elderId)) throw BizException.forbidden("无权处理该申请");
        return b;
    }

    /** 校验家属对老人的有效授权（越权访问拦截率100%的核心关卡） */
    public FamilyBind approvedBindWithScope(long elderId, long familyId, String scope) {
        FamilyBind b = bindMapper.selectOne(new QueryWrapper<FamilyBind>()
                .eq("elder_id", elderId).eq("family_id", familyId).eq("status", "APPROVED"));
        if (b == null) throw BizException.forbidden("未获得该老人的授权");
        if (!Arrays.asList(b.getScopes().split(",")).contains(scope))
            throw BizException.forbidden("老人未授权此项数据，无法查看");
        return b;
    }

    public boolean hasScope(long elderId, long familyId, String scope) {
        FamilyBind b = bindMapper.selectOne(new QueryWrapper<FamilyBind>()
                .eq("elder_id", elderId).eq("family_id", familyId).eq("status", "APPROVED"));
        return b != null && Arrays.asList(b.getScopes().split(",")).contains(scope);
    }
}
