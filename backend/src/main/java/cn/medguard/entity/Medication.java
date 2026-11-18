package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 药品知识库条目（结构化字段 + 知识来源，支持版本管理与更新留痕） */
@Data
@TableName("mg_medication")
public class Medication {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String genericName;
    private String brandName;
    private String ingredients;      // CSV 归一化成分
    private String drugClass;
    private String indications;
    private String dosage;
    private String contraindications;
    private String precautions;
    private String adverseReactions;
    private String storage;
    private String source;
    private String version;
    private Integer enabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
