package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 服药打卡：PENDING/TAKEN/LATE/MISSED（漏服规则=超时60分钟未打卡，可解释） */
@Data
@TableName("mg_checkin")
public class Checkin {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long planId;
    private Long elderId;
    private String medName;
    private LocalDateTime scheduledAt;
    private LocalDateTime checkedAt;
    private String status;
    private String note;
}
