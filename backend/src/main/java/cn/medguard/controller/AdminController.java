package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.entity.ConflictRule;
import cn.medguard.entity.Medication;
import cn.medguard.service.AdminService;
import cn.medguard.service.MedicationService;
import cn.medguard.service.RuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 管理端（ADMIN 角色，拦截器强制校验）：用户权限 / 知识库维护 / 规则库 / 脱敏统计 / 日志抽查 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final MedicationService medicationService;
    private final RuleService ruleService;

    // ===== 用户与权限 =====
    @GetMapping("/users")
    public ApiResult<Map<String, Object>> users(@RequestParam(required = false) String keyword,
                                                @RequestParam(required = false) String role,
                                                @RequestParam(defaultValue = "1") long page,
                                                @RequestParam(defaultValue = "20") long size) {
        return ApiResult.ok(adminService.users(keyword, role, page, size));
    }

    @PutMapping("/users/{id}/role")
    public ApiResult<Void> changeRole(@PathVariable long id, @RequestBody Dtos.RoleReq req) {
        adminService.changeRole(id, req.getRole());
        return ApiResult.ok();
    }

    // ===== 药品知识库维护 =====
    @PostMapping("/medications")
    public ApiResult<Medication> createMed(@RequestBody Medication m) {
        return ApiResult.ok(medicationService.adminCreate(m));
    }

    @PutMapping("/medications/{id}")
    public ApiResult<Medication> updateMed(@PathVariable long id, @RequestBody Medication m) {
        return ApiResult.ok(medicationService.adminUpdate(id, m));
    }

    @PostMapping("/medications/{id}/toggle")
    public ApiResult<Void> toggleMed(@PathVariable long id, @RequestBody Dtos.ToggleReq req) {
        medicationService.adminToggle(id, req.isEnabled());
        return ApiResult.ok();
    }

    // ===== 冲突规则库 =====
    @GetMapping("/rules")
    public ApiResult<Map<String, Object>> rules(@RequestParam(required = false) String type,
                                                @RequestParam(required = false) String reviewStatus,
                                                @RequestParam(defaultValue = "1") long page,
                                                @RequestParam(defaultValue = "50") long size) {
        return ApiResult.ok(ruleService.list(type, reviewStatus, page, size));
    }

    @PostMapping("/rules")
    public ApiResult<ConflictRule> createRule(@RequestBody ConflictRule r) {
        return ApiResult.ok(ruleService.create(r));
    }

    @PutMapping("/rules/{id}")
    public ApiResult<ConflictRule> updateRule(@PathVariable long id, @RequestBody ConflictRule r) {
        return ApiResult.ok(ruleService.update(id, r));
    }

    @PostMapping("/rules/{id}/review")
    public ApiResult<Void> reviewRule(@PathVariable long id, @RequestBody Dtos.ReviewReq req) {
        ruleService.review(id, req.getReviewer(), req.isApprove());
        return ApiResult.ok();
    }

    @PostMapping("/rules/{id}/toggle")
    public ApiResult<Void> toggleRule(@PathVariable long id, @RequestBody Dtos.ToggleReq req) {
        ruleService.toggle(id, req.isEnabled());
        return ApiResult.ok();
    }

    /** 手动触发规则同步到 AI 服务 */
    @PostMapping("/rules/sync")
    public ApiResult<Void> syncRules() {
        ruleService.pushToAi();
        return ApiResult.ok();
    }

    // ===== 脱敏统计与日志 =====
    @GetMapping("/dashboard")
    public ApiResult<Map<String, Object>> dashboard() {
        return ApiResult.ok(adminService.dashboard());
    }

    @GetMapping("/audits")
    public ApiResult<Map<String, Object>> audits(@RequestParam(defaultValue = "1") long page,
                                                 @RequestParam(defaultValue = "20") long size) {
        return ApiResult.ok(adminService.audits(page, size));
    }

    @GetMapping("/recognize-logs")
    public ApiResult<Map<String, Object>> recognizeLogs(@RequestParam(defaultValue = "1") long page,
                                                        @RequestParam(defaultValue = "20") long size) {
        return ApiResult.ok(adminService.recognizeLogs(page, size));
    }

    @GetMapping("/qa-logs")
    public ApiResult<Map<String, Object>> qaLogs(@RequestParam(defaultValue = "1") long page,
                                                 @RequestParam(defaultValue = "20") long size) {
        return ApiResult.ok(adminService.qaLogs(page, size));
    }
}
