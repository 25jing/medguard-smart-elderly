package cn.medguard;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 智慧养老安全用药辅助平台 - 业务后端入口
 * 四层架构中的第二层：账号/三级权限/家庭授权/用药计划/打卡/提醒/审计/脱敏，
 * 并转发识别与问答请求到 Python AI 服务（FastAPI :8100）。
 */
@SpringBootApplication
@EnableScheduling
@MapperScan("cn.medguard.mapper")
@ConfigurationPropertiesScan
public class MedGuardApplication {
    public static void main(String[] args) {
        SpringApplication.run(MedGuardApplication.class, args);
    }
}
