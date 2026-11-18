package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** 用药计划：一种药 × 每日时间点列表 */
@Data
@TableName("mg_med_plan")
public class MedPlan {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long elderId;
    private Long medicationId;
    private String medName;
    private String doseText;
    private String times;        // CSV "08:00,20:00"
    private LocalDate startDate;
    private LocalDate endDate;
    private String notes;
    private Integer active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
