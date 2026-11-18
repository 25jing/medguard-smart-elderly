package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.entity.Medication;
import cn.medguard.service.MedicationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 药品知识库查询（登录用户均可用） */
@RestController
@RequestMapping("/api/medications")
@RequiredArgsConstructor
public class MedicationController {

    private final MedicationService medicationService;

    @GetMapping
    public ApiResult<Map<String, Object>> search(@RequestParam(required = false) String keyword,
                                                 @RequestParam(defaultValue = "1") long page,
                                                 @RequestParam(defaultValue = "20") long size) {
        return ApiResult.ok(medicationService.search(keyword, page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<Medication> detail(@PathVariable long id) {
        return ApiResult.ok(medicationService.detail(id));
    }
}
