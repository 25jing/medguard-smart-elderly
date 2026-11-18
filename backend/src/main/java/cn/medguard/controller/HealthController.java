package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.service.AiClient;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/** 公开健康检查（无需登录）：运维探活 / 启动脚本就绪判断 / 答辩演示服务状态 */
@RestController
@RequiredArgsConstructor
public class HealthController {

    private final AiClient aiClient;
    private final javax.sql.DataSource dataSource;

    @GetMapping("/api/health")
    public ApiResult<Map<String, Object>> health() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "UP");
        m.put("backend", "UP");
        boolean dbUp = false;
        try (java.sql.Connection c = dataSource.getConnection()) {
            dbUp = c.isValid(2);
        } catch (Exception ignore) { }
        m.put("db", dbUp);
        m.put("ai", aiClient.health() ? "UP" : "DOWN");
        m.put("time", LocalDateTime.now().toString());
        return ApiResult.ok(m);
    }
}
