package cn.medguard.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** application.yml 中 app.* 配置映射 */
@Data
@ConfigurationProperties(prefix = "app")
public class AppProps {
    private Jwt jwt = new Jwt();
    private Ai ai = new Ai();
    private Seed seed = new Seed();
    private Frontend frontend = new Frontend();
    private Privacy privacy = new Privacy();

    @Data public static class Jwt {
        private String secret;
        private long expireHours = 72;
    }
    @Data public static class Ai {
        private String baseUrl = "http://127.0.0.1:8100";
        private String serviceKey = "medguard-internal-2026";
        private int timeoutSeconds = 30;
    }
    @Data public static class Seed {
        private String dir = "../data";
    }
    @Data public static class Frontend {
        private String dir = "../frontend";
    }
    @Data public static class Privacy {
        private int accountPurgeDays = 30;
        private int auditKeepMonths = 6;
    }
}
