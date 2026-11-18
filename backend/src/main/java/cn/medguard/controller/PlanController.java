package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.entity.Checkin;
import cn.medguard.entity.MedPlan;
import cn.medguard.entity.Reminder;
import cn.medguard.security.UserContext;
import cn.medguard.service.PlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 用药计划 / 打卡 / 提醒 / 依从率 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PlanController {

    private final PlanService planService;

    /** 计划列表：本人或持 MANAGE_PLANS 授权的家属代办（?elderId=） */
    @GetMapping("/plans")
    public ApiResult<List<MedPlan>> plans(@RequestParam(required = false) Long elderId) {
        return ApiResult.ok(planService.myPlans(elderId));
    }

    /** 新建计划（自动做冲突校验，返回体带 conflictWarnings；家属代办需授权，操作留痕） */
    @PostMapping("/plans")
    public ApiResult<Map<String, Object>> createPlan(@RequestBody Dtos.PlanReq req) {
        LocalDate start = req.getStartDate() == null || req.getStartDate().isBlank()
                ? null : LocalDate.parse(req.getStartDate());
        LocalDate end = req.getEndDate() == null || req.getEndDate().isBlank()
                ? null : LocalDate.parse(req.getEndDate());
        return ApiResult.ok(planService.createPlan(req.getMedicationId(), req.getMedName(),
                req.getDoseText(), req.getTimes(), start, end, req.getNotes(), req.getElderId()));
    }

    @PostMapping("/plans/{id}/stop")
    public ApiResult<Void> stopPlan(@PathVariable long id, @RequestParam(required = false) Long elderId) {
        planService.deactivate(id, elderId);
        return ApiResult.ok();
    }

    /** 手动触发当前在用药物冲突校验（AI服务规则链路） */
    @PostMapping("/conflict/check")
    public ApiResult<List<Map<String, Object>>> conflictCheck() {
        UserContext.CurrentUser cur = UserContext.require();
        return ApiResult.ok(planService.checkConflictsFor(cur.id(), null));
    }

    @GetMapping("/checkins/today")
    public ApiResult<List<Checkin>> today() {
        return ApiResult.ok(planService.todayCheckins());
    }

    @PostMapping("/checkins/{id}")
    public ApiResult<Checkin> checkin(@PathVariable long id, @RequestBody(required = false) Dtos.CheckinReq req) {
        return ApiResult.ok(planService.doCheckin(id, req == null ? null : req.getNote()));
    }

    @GetMapping("/checkins/history")
    public ApiResult<List<Map<String, Object>>> history(@RequestParam(defaultValue = "30") int days) {
        return ApiResult.ok(planService.history(days));
    }

    @GetMapping("/reminders")
    public ApiResult<List<Reminder>> reminders() {
        return ApiResult.ok(planService.myReminders());
    }

    @PostMapping("/reminders/{id}/read")
    public ApiResult<Void> readReminder(@PathVariable long id) {
        planService.readReminder(id);
        return ApiResult.ok();
    }

    @GetMapping("/stats/adherence")
    public ApiResult<Map<String, Object>> adherence(@RequestParam(defaultValue = "30") int days) {
        UserContext.CurrentUser cur = UserContext.require();
        return ApiResult.ok(planService.adherence(cur.id(), days, false));
    }
}
