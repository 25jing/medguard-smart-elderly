package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.security.UserContext;
import cn.medguard.service.AlertService;
import cn.medguard.service.FamilyService;
import cn.medguard.service.PlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/** 家庭协同：绑定申请→老人确认→授权矩阵→脱敏汇总视图→随时撤销；冲突实时告警(SSE) */
@RestController
@RequestMapping("/api/family")
@RequiredArgsConstructor
public class FamilyController {

    private final FamilyService familyService;
    private final PlanService planService;
    private final AlertService alertService;

    /** 家属发起绑定（勾选授权范围） */
    @PostMapping("/bind")
    public ApiResult<Map<String, Object>> bind(@RequestBody Dtos.BindReq req) {
        return ApiResult.ok(familyService.requestBind(req.getElderPhone(), req.getScopes()));
    }

    /** 老人：待处理申请列表 */
    @GetMapping("/invites")
    public ApiResult<List<Map<String, Object>>> invites() {
        return ApiResult.ok(familyService.pendingInvites());
    }

    /** 老人：同意/拒绝 */
    @PostMapping("/bind/{id}/respond")
    public ApiResult<Void> respond(@PathVariable long id, @RequestBody Dtos.RespondReq req) {
        familyService.respond(id, req.isApprove());
        return ApiResult.ok();
    }

    /** 撤销授权（老人/家属均可发起，即时生效） */
    @PostMapping("/bind/{id}/revoke")
    public ApiResult<Void> revoke(@PathVariable long id) {
        familyService.revoke(id);
        return ApiResult.ok();
    }

    /** 老人：我的家属列表 */
    @GetMapping("/members")
    public ApiResult<List<Map<String, Object>>> members() {
        return ApiResult.ok(familyService.myFamilyMembers());
    }

    /** 家属：我绑定的老人列表（脱敏） */
    @GetMapping("/elders")
    public ApiResult<List<Map<String, Object>>> elders() {
        return ApiResult.ok(familyService.myElders());
    }

    /** 家属：老人用药汇总视图（按授权范围脱敏返回，只见汇总不见明细） */
    @GetMapping("/summary/{elderId}")
    public ApiResult<Map<String, Object>> summary(@PathVariable long elderId) {
        return ApiResult.ok(familyService.summaryForFamily(elderId, planService));
    }

    /** 家属：SSE 实时告警通道（老人侧一检出 HIGH/MEDIUM 冲突立即推送弹出）。EventSource 走 ?token= 鉴权 */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return alertService.subscribe(UserContext.require().id());
    }

    /** 家属：告警补看（离线期间产生的提醒 + 未读数） */
    @GetMapping("/alerts")
    public ApiResult<Map<String, Object>> alerts(@RequestParam(defaultValue = "20") int limit) {
        return ApiResult.ok(alertService.recentFor(UserContext.require().id(), limit));
    }

    /** 家属：标记已读 */
    @PostMapping("/alerts/{id}/read")
    public ApiResult<Void> alertRead(@PathVariable long id) {
        alertService.markRead(id, UserContext.require().id());
        return ApiResult.ok();
    }
}
