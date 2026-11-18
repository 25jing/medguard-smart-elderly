package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 家庭绑定与授权矩阵（授权可随时撤销，撤销即时生效） */
@Data
@TableName("mg_family_bind")
public class FamilyBind {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long elderId;
    private Long familyId;
    private String scopes;   // CSV: VIEW_SUMMARY,VIEW_ADHERENCE,RECEIVE_ALERTS
    private String status;   // PENDING/APPROVED/REJECTED/REVOKED
    private LocalDateTime createdAt;
    private LocalDateTime approvedAt;
    private LocalDateTime revokedAt;
}
