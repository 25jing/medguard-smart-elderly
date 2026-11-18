package cn.medguard.security;

import cn.medguard.config.AppProps;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Map;

/**
 * 鉴权拦截器：解析 Bearer Token → UserContext；
 * /api/internal/** 走服务间共享密钥（X-Service-Key）；
 * /api/admin/** 要求 ADMIN 角色（越权拦截率100%的技术保障点）。
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;
    private final AppProps props;
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object handler) throws Exception {
        if ("OPTIONS".equalsIgnoreCase(req.getMethod())) return true;
        String path = req.getRequestURI();

        // 服务间调用：AI 服务拉取规则/药品词典
        if (path.startsWith("/api/internal/")) {
            String key = req.getHeader("X-Service-Key");
            if (props.getAi().getServiceKey().equals(key)) return true;
            return reject(resp, 403, "内部接口密钥错误");
        }

        String auth = req.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            // EventSource(SSE) 无法带请求头 → 允许 ?token= 兜底（仅同源 JWT，校验逻辑一致）
            String qt = req.getParameter("token");
            if (qt != null && !qt.isBlank()) auth = "Bearer " + qt;
        }
        if (auth == null || !auth.startsWith("Bearer ")) {
            return reject(resp, 401, "未登录或登录已过期");
        }
        try {
            UserContext.CurrentUser user = jwtUtil.parse(auth.substring(7));
            UserContext.set(user);
        } catch (Exception e) {
            return reject(resp, 401, "登录状态无效，请重新登录");
        }

        if (path.startsWith("/api/admin/") && !UserContext.require().isAdmin()) {
            return reject(resp, 403, "需要管理员权限");
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse resp, Object handler, Exception ex) {
        UserContext.clear();
    }

    private boolean reject(HttpServletResponse resp, int status, String msg) throws Exception {
        resp.setStatus(status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.getWriter().write(mapper.writeValueAsString(Map.of("code", status, "msg", msg)));
        return false;
    }
}
