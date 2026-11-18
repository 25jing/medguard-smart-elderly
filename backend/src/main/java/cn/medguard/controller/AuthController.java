package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.entity.User;
import cn.medguard.security.UserContext;
import cn.medguard.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/** 账号与鉴权：注册/登录/知情同意/注销（30天级联清除） */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ApiResult<Map<String, Object>> register(@RequestBody Dtos.RegisterReq req) {
        return ApiResult.ok(authService.register(
                req.getPhone(), req.getPassword(), req.getName(), req.getRole(), req.getBirthYear()));
    }

    @PostMapping("/login")
    public ApiResult<Map<String, Object>> login(@RequestBody Dtos.LoginReq req) {
        return ApiResult.ok(authService.login(req.getPhone(), req.getPassword()));
    }

    @GetMapping("/me")
    public ApiResult<Map<String, Object>> me() {
        UserContext.CurrentUser cur = UserContext.require();
        User u = authService.requireUser(cur.id());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("phone", u.getPhone());
        m.put("name", u.getName());
        m.put("role", u.getRole());
        m.put("birthYear", u.getBirthYear());
        m.put("consentAt", u.getConsentAt());
        m.put("healthConsentAt", u.getHealthConsentAt());
        return ApiResult.ok(m);
    }

    /** 健康信息单独同意（可查看、可撤回） */
    @PostMapping("/consent/health")
    public ApiResult<Void> healthConsent(@RequestBody Dtos.ConsentReq req) {
        authService.healthConsent(req.isAgree());
        return ApiResult.ok();
    }

    /** 注销账号：软删除，用药记录保存至注销后30天再级联清除 */
    @DeleteMapping("/account")
    public ApiResult<Void> deleteAccount() {
        authService.deleteAccount();
        return ApiResult.ok();
    }
}
