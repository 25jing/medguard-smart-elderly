package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 家属风险提醒：老人侧冲突检出后即时生成，SSE 推送 + 落库补看 */
@Data
@TableName("mg_family_alert")
public class FamilyAlert {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long elderId;
    private Long familyId;
    private String type;      // CONFLICT（后续可扩展 MISSED/MED_CHANGED）
    private String level;     // HIGH / MEDIUM
    private String title;     // 已含老人称呼（脱敏）
    private String content;
    private String dedupKey;  // 同组合1小时窗口去重
    private Integer readFlag;
    private LocalDateTime createdAt;
}
