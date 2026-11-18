package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 冲突规则：成分重复 DUPLICATE_INGREDIENT / 同类叠加 CLASS_STACKING /
 * 禁忌配伍 CONTRAINDICATED / 老年慎用 ELDERLY_CAUTION（Beers与老年PIM标准）
 */
@Data
@TableName("mg_conflict_rule")
public class ConflictRule {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String ruleCode;
    private String ruleType;
    private String drugA;
    private String drugB;
    private String riskLevel;     // HIGH/MEDIUM/LOW
    private String explanation;
    private String basisSource;
    private String reviewedBy;
    private String reviewStatus;  // PENDING/APPROVED
    private Integer version;
    private Integer enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
