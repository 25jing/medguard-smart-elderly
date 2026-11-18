package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.service.MedicationService;
import cn.medguard.service.RuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 服务间接口（AI 服务专用，X-Service-Key 校验在拦截器完成）：
 * AI 服务启动时拉取药品词典与生效规则，保持 Java 端为唯一权威数据源。
 */
@RestController
@RequestMapping("/api/internal")
@RequiredArgsConstructor
public class InternalController {

    private final MedicationService medicationService;
    private final RuleService ruleService;

    @GetMapping("/medications-lite")
    public ApiResult<List<Map<String, Object>>> medicationsLite() {
        return ApiResult.ok(medicationService.liteDict());
    }

    @GetMapping("/rules")
    public ApiResult<List<Map<String, Object>>> rules() {
        return ApiResult.ok(ruleService.effectiveRules());
    }
}
