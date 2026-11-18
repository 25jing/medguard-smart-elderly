package cn.medguard.service;

import cn.medguard.entity.AuditLog;
import cn.medguard.mapper.AuditLogMapper;
import cn.medguard.security.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** 操作审计：关键动作留痕（授权变更/账号注销/识别/问答/管理端修改），保存6个月 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogMapper auditLogMapper;

    public void log(String action, String targetType, Object targetId, String detail) {
        UserContext.CurrentUser u = UserContext.get();
        log(u == null ? null : u.id(), u == null ? null : u.name(), action, targetType, targetId, detail);
    }

    /** 显式指定操作人（登录/注册时 UserContext 尚未建立，用本重载保证审计不丢人名） */
    public void log(Long userId, String userName, String action, String targetType, Object targetId, String detail) {
        try {
            AuditLog a = new AuditLog();
            a.setUserId(userId);
            a.setUserName(userName);
            a.setAction(action);
            a.setTargetType(targetType);
            a.setTargetId(targetId == null ? null : String.valueOf(targetId));
            a.setDetail(detail != null && detail.length() > 990 ? detail.substring(0, 990) : detail);
            a.setIp(clientIp());
            auditLogMapper.insert(a);
        } catch (Exception e) {
            log.warn("审计写入失败: {}", e.getMessage());
        }
    }

    private String clientIp() {
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest req = attrs.getRequest();
            String ip = req.getHeader("X-Forwarded-For");
            if (ip == null || ip.isBlank()) ip = req.getRemoteAddr();
            return ip != null && ip.length() > 45 ? ip.substring(0, 45) : ip;
        } catch (Exception e) {
            return null;
        }
    }
}
