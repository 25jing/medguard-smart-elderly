package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 拍照识药留痕（隐私承诺：识别原图不落盘，此处仅结构化结果） */
@Data
@TableName("mg_recognize_log")
public class RecognizeLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String ocrText;
    private String candidates;          // Top-3 JSON
    private Long chosenMedicationId;
    private BigDecimal topConfidence;
    private Integer latencyMs;
    private LocalDateTime createdAt;
}
