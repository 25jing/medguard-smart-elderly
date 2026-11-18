package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 操作审计日志（保存6个月，超期自动清除） */
@Data
@TableName("mg_audit_log")
public class AuditLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String userName;
    private String action;
    private String targetType;
    private String targetId;
    private String detail;
    private String ip;
    private LocalDateTime createdAt;
}
