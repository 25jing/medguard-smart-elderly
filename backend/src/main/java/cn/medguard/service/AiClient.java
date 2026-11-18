package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.config.AppProps;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * AI 服务客户端（FastAPI :8100）：识别 / RAG问答 / 冲突校验 / 规则同步。
 * 限流与服务间签名：所有请求带 X-Service-Key；识别接口在后端侧做每用户限流。
 */
@Slf4j
@Component
public class AiClient {

    private final AppProps props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final RestClient rest;

    public AiClient(AppProps props) {
        this.props = props;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(props.getAi().getTimeoutSeconds()));
        this.rest = RestClient.builder()
                .baseUrl(props.getAi().getBaseUrl())
                .requestFactory(factory)
                .defaultHeader("X-Service-Key", props.getAi().getServiceKey())
                .build();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> recognize(byte[] imageBytes, String filename) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new org.springframework.core.io.ByteArrayResource(imageBytes) {
            @Override public String getFilename() { return filename == null ? "photo.jpg" : filename; }
        });
        return rest.post().uri("/recognize")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve().body(Map.class);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> qa(String question, List<Map<String, Object>> medContext) {
        return rest.post().uri("/qa")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("question", question, "medications", medContext == null ? List.of() : medContext))
                .retrieve().body(Map.class);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> conflict(List<Map<String, Object>> medications) {
        return rest.post().uri("/conflict")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("medications", medications))
                .retrieve().body(Map.class);
    }

    /** 规则变更后推送 AI 服务热更新缓存 */
    public void syncRules(List<Map<String, Object>> rules) {
        try {
            rest.post().uri("/rules/sync")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("rules", rules))
                    .retrieve().toBodilessEntity();
            log.info("规则已同步到 AI 服务: {} 条", rules.size());
        } catch (Exception e) {
            log.warn("规则同步失败(AI服务可能未启动，其将使用本地种子规则): {}", e.getMessage());
        }
    }

    public boolean health() {
        try {
            ResponseEntity<String> r = rest.get().uri("/health").retrieve().toEntity(String.class);
            return r.getStatusCode().is2xxSuccessful();
        } catch (Exception e) {
            return false;
        }
    }
}
