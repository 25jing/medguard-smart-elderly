package cn.medguard.controller;

import cn.medguard.common.ApiResult;
import cn.medguard.common.BizException;
import cn.medguard.entity.*;
import cn.medguard.mapper.QaLogMapper;
import cn.medguard.mapper.RecognizeLogMapper;
import cn.medguard.security.UserContext;
import cn.medguard.service.AiClient;
import cn.medguard.service.AuditService;
import cn.medguard.service.MedicationService;
import cn.medguard.service.PlanService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * AI 能力代理：拍照识药 / RAG 循证问答。
 * - 后端侧限流（每用户每分钟识别≤10次），保护 AI 服务
 * - 识别原图只在内存中转，落库的是结构化结果（隐私承诺：原图即传即删）
 * - 全链路留痕：识别日志 / 问答日志（含来源与置信度）
 */
@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AiProxyController {

    private final AiClient aiClient;
    private final MedicationService medicationService;
    private final PlanService planService;
    private final AuditService audit;
    private final RecognizeLogMapper recognizeLogMapper;
    private final QaLogMapper qaLogMapper;
    private final ObjectMapper mapper = new ObjectMapper();

    private static final long MAX_BYTES = 10L * 1024 * 1024;
    private final Map<Long, Deque<Long>> rateWindow = new ConcurrentHashMap<>();

    @PostMapping("/recognize")
    @SuppressWarnings("unchecked")
    public ApiResult<Map<String, Object>> recognize(@RequestParam("file") MultipartFile file) {
        UserContext.CurrentUser cur = UserContext.require();
        rateLimit(cur.id(), 10, 60_000);
        if (file.isEmpty()) throw new BizException("请先拍照或选择照片");
        if (file.getSize() > MAX_BYTES) throw new BizException("照片太大，请重拍（应小于10MB，App端会自动压缩到1MB内）");
        String ct = file.getContentType();
        if (ct == null || !ct.startsWith("image/")) throw new BizException("只支持图片文件");

        long t0 = System.currentTimeMillis();
        Map<String, Object> result;
        byte[] bytes;
        try {
            bytes = file.getBytes();
            result = aiClient.recognize(bytes, file.getOriginalFilename());
        } catch (BizException e) { throw e; }
        catch (Exception e) {
            log.warn("识别服务调用失败", e);
            throw new BizException(503, "识别服务暂时不可用，请确认 AI 服务已启动，或改用手动输入药名");
        } finally {
            bytes = null; // 内存中转完立即释放，不落盘（隐私承诺）
        }
        int latency = (int) (System.currentTimeMillis() - t0);

        // 候选回填 medicationId（便于前端一键加入计划）
        Object cands = result == null ? null : result.get("candidates");
        List<Map<String, Object>> candList = new ArrayList<>();
        if (cands instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?> mm) {
                    Map<String, Object> c = new LinkedHashMap<>((Map<String, Object>) mm);
                    Object name = c.get("name");
                    if (name != null) {
                        var hits = medicationService.search(String.valueOf(name), 1, 1);
                        var recs = (List<Medication>) hits.get("records");
                        if (!recs.isEmpty()) c.put("medicationId", recs.get(0).getId());
                    }
                    candList.add(c);
                }
            }
        }
        if (result != null) result.put("candidates", candList);

        // 留痕（结构化结果，不含原图）
        RecognizeLog rl = new RecognizeLog();
        rl.setUserId(cur.id());
        rl.setOcrText(result == null ? null : str(result.get("ocrText")));
        try { rl.setCandidates(mapper.writeValueAsString(candList)); } catch (Exception ignore) { }
        if (!candList.isEmpty() && candList.get(0).get("confidence") instanceof Number n)
            rl.setTopConfidence(BigDecimal.valueOf(n.doubleValue()));
        rl.setLatencyMs(latency);
        recognizeLogMapper.insert(rl);
        audit.log("RECOGNIZE", "recognize_log", rl.getId(), "候选数:" + candList.size() + " 延迟:" + latency + "ms");

        if (result == null) throw new BizException(503, "识别服务无响应");
        result.put("latencyMs", latency);
        result.put("logId", rl.getId()); // 前端确认结果时回传，用于识别准确率统计
        return ApiResult.ok(result);
    }

    /** 识别结果确认（用户从Top-3选定或手动输入后回填，用于准确率统计） */
    @PostMapping("/recognize/{logId}/confirm")
    public ApiResult<Void> confirm(@PathVariable long logId, @RequestBody Map<String, Object> body) {
        UserContext.CurrentUser cur = UserContext.require();
        RecognizeLog rl = recognizeLogMapper.selectById(logId);
        if (rl == null || !rl.getUserId().equals(cur.id())) throw BizException.notFound("识别记录不存在");
        Object mid = body.get("medicationId");
        if (mid instanceof Number n) rl.setChosenMedicationId(n.longValue());
        recognizeLogMapper.updateById(rl);
        audit.log("RECOGNIZE_CONFIRM", "recognize_log", logId, "确认药品ID:" + mid);
        return ApiResult.ok();
    }

    @PostMapping("/qa")
    public ApiResult<Map<String, Object>> qa(@RequestBody Dtos.QaReq req) {
        UserContext.CurrentUser cur = UserContext.require();
        rateLimit(cur.id(), 20, 60_000);
        String q = req.getQuestion() == null ? "" : req.getQuestion().trim();
        if (q.isEmpty()) throw new BizException("请输入您的问题");
        if (q.length() > 500) throw new BizException("问题太长了，请精简到500字以内");

        // 组装药物上下文：指定药品详情 + 老人当前在用药清单
        List<Map<String, Object>> ctx = new ArrayList<>();
        if (req.getMedicationId() != null) {
            Medication m = medicationService.detail(req.getMedicationId());
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("name", m.getGenericName());
            c.put("ingredients", m.getIngredients());
            c.put("drugClass", m.getDrugClass());
            ctx.add(c);
        }
        if (cur.isElder()) ctx.addAll(planService.activeMedPayload(cur.id(), null));

        long t0 = System.currentTimeMillis();
        Map<String, Object> result;
        try {
            result = aiClient.qa(q, ctx);
        } catch (Exception e) {
            log.warn("问答服务调用失败", e);
            throw new BizException(503, "问答服务暂时不可用，请稍后再试");
        }
        int latency = (int) (System.currentTimeMillis() - t0);
        if (result == null) throw new BizException(503, "问答服务无响应");

        QaLog ql = new QaLog();
        ql.setUserId(cur.id());
        ql.setQuestion(q);
        ql.setAnswer(str(result.get("answer")));
        try { ql.setSources(mapper.writeValueAsString(result.getOrDefault("sources", List.of()))); } catch (Exception ignore) { }
        if (result.get("confidence") instanceof Number n) ql.setConfidence(BigDecimal.valueOf(n.doubleValue()));
        ql.setRefused(Boolean.TRUE.equals(result.get("refused")) ? 1 : 0);
        ql.setMode(str(result.get("mode")));
        ql.setLatencyMs(latency);
        qaLogMapper.insert(ql);
        audit.log("QA", "qa_log", ql.getId(),
                (ql.getRefused() == 1 ? "[拒答] " : "") + q.substring(0, Math.min(50, q.length())));

        result.put("latencyMs", latency);
        result.put("qaLogId", ql.getId());
        return ApiResult.ok(result);
    }

    /** 滑动窗口限流：保护 AI 服务接口（申报书：限流与签名校验） */
    private void rateLimit(Long uid, int max, long windowMs) {
        long now = System.currentTimeMillis();
        Deque<Long> dq = rateWindow.computeIfAbsent(uid, k -> new ConcurrentLinkedDeque<>());
        dq.addLast(now);
        while (!dq.isEmpty() && now - dq.peekFirst() > windowMs) dq.pollFirst();
        if (dq.size() > max) throw new BizException(429, "操作太频繁了，请歇一分钟再试");
    }

    private String str(Object o) { return o == null ? null : String.valueOf(o); }
}
