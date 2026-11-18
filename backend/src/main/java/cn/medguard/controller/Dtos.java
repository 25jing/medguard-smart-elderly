package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import lombok.Data;

import java.util.List;
import java.util.Map;

/** 全部请求/响应 DTO（嵌套 record 风格类，集中管理） */
public class Dtos {

    @Data public static class RegisterReq {
        private String phone; private String password; private String name;
        private String role; private Integer birthYear;
    }
    @Data public static class LoginReq { private String phone; private String password; }
    @Data public static class ConsentReq { private boolean agree; }
    @Data public static class BindReq { private String elderPhone; private List<String> scopes; }
    @Data public static class RespondReq { private boolean approve; }
    @Data public static class PlanReq {
        private Long medicationId; private String medName; private String doseText;
        private List<String> times; private String startDate; private String endDate; private String notes;
        private Long elderId;   // 家属代办时指定目标老人（需 MANAGE_PLANS 授权）
    }
    @Data public static class CheckinReq { private String note; }
    @Data public static class QaReq { private String question; private Long medicationId; }
    @Data public static class ConflictReq { private List<Long> medicationIds; }
    @Data public static class RoleReq { private String role; }
    @Data public static class ReviewReq { private String reviewer; private boolean approve; }
    @Data public static class ToggleReq { private boolean enabled; }
}
