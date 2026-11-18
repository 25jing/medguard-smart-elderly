package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** RAG 问答留痕：问题/回答/来源/置信度/是否拒答（引用覆盖率可统计） */
@Data
@TableName("mg_qa_log")
public class QaLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String question;
    private String answer;
    private String sources;      // JSON
    private BigDecimal confidence;
    private Integer refused;
    private String mode;         // llm / extractive
    private Integer latencyMs;
    private LocalDateTime createdAt;
}
