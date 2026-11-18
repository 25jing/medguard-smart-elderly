package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 应用内提醒（小程序订阅消息未授权时的兜底通道） */
@Data
@TableName("mg_reminder")
public class Reminder {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long elderId;
    private Long planId;
    private LocalDateTime dueAt;
    private String title;
    private String content;
    private String status;   // PENDING/READ/EXPIRED
    private LocalDateTime createdAt;
}
