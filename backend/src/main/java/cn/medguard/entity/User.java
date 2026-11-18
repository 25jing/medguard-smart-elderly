package cn.medguard.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/** 用户：老人 ELDER / 家属 FAMILY / 管理员 ADMIN 三级角色 */
@Data
@TableName("mg_user")
public class User {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String phone;
    private String password;
    private String name;
    private String role;
    private Integer birthYear;
    private LocalDateTime consentAt;
    private LocalDateTime healthConsentAt;
    @TableLogic
    private Integer deleted;
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
