package cn.medguard.service;

import cn.medguard.config.AppProps;
import cn.medguard.entity.*;
import cn.medguard.mapper.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.EncodedResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/**
 * 启动引导：建表(schema.sql 幂等) → 种子数据(data/*.json) → 管理员账号 → 演示家庭数据。
 * 全部带"已存在则跳过"判断，可反复重启。
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class DbBootstrap implements ApplicationRunner {

    private final DataSource dataSource;
    private final AppProps props;
    private final UserMapper userMapper;
    private final MedicationMapper medicationMapper;
    private final ConflictRuleMapper ruleMapper;
    private final FamilyBindMapper bindMapper;
    private final MedPlanMapper planMapper;
    private final CheckinMapper checkinMapper;
    private final QaLogMapper qaLogMapper;
    private final RecognizeLogMapper recognizeLogMapper;
    private final RuleService ruleService;
    private final ObjectMapper mapper = new ObjectMapper();
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @Override
    public void run(ApplicationArguments args) throws Exception {
        // 1. 建表（幂等 DDL）
        try (Connection c = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(c,
                    new EncodedResource(new ClassPathResource("db/schema.sql"), StandardCharsets.UTF_8));
        }
        log.info("数据库表结构就绪");

        // 2. 药品知识库种子
        if (medicationMapper.selectCount(null) == 0) {
            Path p = seedFile("medications.json");
            if (Files.exists(p)) {
                JsonNode arr = mapper.readTree(Files.readString(p, StandardCharsets.UTF_8));
                int n = 0;
                for (JsonNode j : arr) {
                    Medication m = new Medication();
                    m.setGenericName(txt(j, "genericName"));
                    m.setBrandName(txt(j, "brandName"));
                    m.setIngredients(txt(j, "ingredients"));
                    m.setDrugClass(txt(j, "drugClass"));
                    m.setIndications(txt(j, "indications"));
                    m.setDosage(txt(j, "dosage"));
                    m.setContraindications(txt(j, "contraindications"));
                    m.setPrecautions(txt(j, "precautions"));
                    m.setAdverseReactions(txt(j, "adverseReactions"));
                    m.setStorage(txt(j, "storage"));
                    m.setSource(txt(j, "source"));
                    m.setVersion("v1.0");
                    m.setEnabled(1);
                    medicationMapper.insert(m);
                    n++;
                }
                log.info("药品知识库导入 {} 条", n);
            } else {
                log.warn("未找到种子文件 {}，跳过药品导入", p);
            }
        }

        // 3. 冲突规则种子（review_status 直接标 APPROVED：种子规则源自动态权威标准，演示可上线；生产需药师逐条复核）
        if (ruleMapper.selectCount(null) == 0) {
            Path p = seedFile("rules.json");
            if (Files.exists(p)) {
                JsonNode arr = mapper.readTree(Files.readString(p, StandardCharsets.UTF_8));
                int n = 0;
                for (JsonNode j : arr) {
                    ConflictRule r = new ConflictRule();
                    r.setRuleCode(txt(j, "ruleCode"));
                    r.setRuleType(txt(j, "ruleType"));
                    r.setDrugA(txt(j, "drugA"));
                    r.setDrugB(txt(j, "drugB"));
                    r.setRiskLevel(txt(j, "riskLevel"));
                    r.setExplanation(txt(j, "explanation"));
                    r.setBasisSource(txt(j, "basisSource"));
                    r.setReviewedBy(txt(j, "reviewedBy"));
                    r.setReviewStatus(j.hasNonNull("reviewStatus") ? txt(j, "reviewStatus") : "APPROVED");
                    r.setVersion(1);
                    r.setEnabled(1);
                    ruleMapper.insert(r);
                    n++;
                }
                log.info("冲突规则导入 {} 条", n);
            }
        }

        // 4. 管理员账号
        if (userMapper.selectCount(new QueryWrapper<User>().eq("role", "ADMIN")) == 0) {
            createUser("admin", "123456", "系统管理员", "ADMIN", null);
            log.info("管理员账号已创建: admin / 123456");
        }

        // 5. 演示家庭（老人+家属+绑定+计划+30天历史），仅当老人表为空时
        if (userMapper.selectCount(new QueryWrapper<User>().eq("role", "ELDER")) == 0) {
            seedDemoFamily();
        }

        // 5b. 家庭协同能力升级：为演示绑定幂等追加 MANAGE_PLANS（家属代办用药计划）
        List<FamilyBind> ups = bindMapper.selectList(new QueryWrapper<FamilyBind>()
                .eq("status", "APPROVED").like("scopes", "RECEIVE_ALERTS").notLike("scopes", "MANAGE_PLANS"));
        for (FamilyBind b : ups) {
            b.setScopes(b.getScopes() + ",MANAGE_PLANS");
            bindMapper.updateById(b);
        }
        if (!ups.isEmpty()) log.info("已为 {} 个演示绑定追加 MANAGE_PLANS 授权", ups.size());

        // 5c. 数据库完善：补齐高频查询的复合索引（information_schema 判存，幂等可重复执行）
        ensureIndex("mg_family_bind", "idx_elder_status", "(elder_id, status)");   // 老人查授权成员/提醒路由
        ensureIndex("mg_audit_log", "idx_user_time", "(user_id, created_at)");      // 管理端按用户查审计
        ensureIndex("mg_qa_log", "idx_refused_time", "(refused, created_at)");      // 拒答率看板统计
        ensureIndex("mg_checkin", "idx_plan_status", "(plan_id, status)");          // 漏服扫描按计划聚合
        ensureIndex("mg_family_alert", "idx_elder_level", "(elder_id, level)");     // 老人维度风险聚合

        // 5d. 种子增量同步：扩容 data/*.json 后重启即自动并入存量库（唯一键判存，幂等）
        syncSeedIncrement();

        // 6. 推送生效规则到 AI 服务（AI 未启动也没关系，它会自己来拉）
        try { ruleService.pushToAi(); } catch (Exception ignore) { }
        log.info("DbBootstrap 完成");
    }

    /** 种子增量同步：按 generic_name / rule_code 判存补录种子文件新增条目（幂等，扩容只需改 JSON 再重启） */
    private void syncSeedIncrement() {
        try {
            Path mp = seedFile("medications.json");
            if (Files.exists(mp)) {
                JsonNode arr = mapper.readTree(Files.readString(mp, StandardCharsets.UTF_8));
                Set<String> have = new HashSet<>();
                for (Medication m : medicationMapper.selectList(new QueryWrapper<Medication>().select("generic_name"))) {
                    have.add(m.getGenericName());
                }
                int n = 0;
                for (JsonNode j : arr) {
                    String gn = txt(j, "genericName");
                    if (gn == null || have.contains(gn)) continue;
                    Medication m = new Medication();
                    m.setGenericName(gn);
                    m.setBrandName(txt(j, "brandName"));
                    m.setIngredients(txt(j, "ingredients"));
                    m.setDrugClass(txt(j, "drugClass"));
                    m.setIndications(txt(j, "indications"));
                    m.setDosage(txt(j, "dosage"));
                    m.setContraindications(txt(j, "contraindications"));
                    m.setPrecautions(txt(j, "precautions"));
                    m.setAdverseReactions(txt(j, "adverseReactions"));
                    m.setStorage(txt(j, "storage"));
                    m.setSource(txt(j, "source"));
                    m.setVersion("v1.2");
                    m.setEnabled(1);
                    medicationMapper.insert(m);
                    have.add(gn);
                    n++;
                }
                if (n > 0) log.info("药品词典增量同步：新增 {} 条", n);
            }
            Path rp = seedFile("rules.json");
            if (Files.exists(rp)) {
                JsonNode arr = mapper.readTree(Files.readString(rp, StandardCharsets.UTF_8));
                Set<String> have = new HashSet<>();
                for (ConflictRule r : ruleMapper.selectList(new QueryWrapper<ConflictRule>().select("rule_code"))) {
                    have.add(r.getRuleCode());
                }
                int n = 0;
                for (JsonNode j : arr) {
                    String rc = txt(j, "ruleCode");
                    if (rc == null || have.contains(rc)) continue;
                    ConflictRule r = new ConflictRule();
                    r.setRuleCode(rc);
                    r.setRuleType(txt(j, "ruleType"));
                    r.setDrugA(txt(j, "drugA"));
                    r.setDrugB(txt(j, "drugB"));
                    r.setRiskLevel(txt(j, "riskLevel"));
                    r.setExplanation(txt(j, "explanation"));
                    r.setBasisSource(txt(j, "basisSource"));
                    r.setReviewedBy(txt(j, "reviewedBy"));
                    r.setReviewStatus(j.hasNonNull("reviewStatus") ? txt(j, "reviewStatus") : "APPROVED");
                    r.setVersion(1);
                    r.setEnabled(1);
                    ruleMapper.insert(r);
                    have.add(rc);
                    n++;
                }
                if (n > 0) log.info("冲突规则增量同步：新增 {} 条", n);
            }
        } catch (Exception e) {
            log.warn("种子增量同步跳过：{}", e.getMessage());
        }
    }

    /** 索引判存再建，已存在则跳过；失败只告警不阻断启动 */
    private void ensureIndex(String table, String index, String cols) {
        try (Connection c = dataSource.getConnection();
             java.sql.PreparedStatement ps = c.prepareStatement(
                     "SELECT COUNT(*) FROM information_schema.statistics " +
                     "WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?")) {
            ps.setString(1, table);
            ps.setString(2, index);
            try (java.sql.ResultSet rs = ps.executeQuery()) {
                if (rs.next() && rs.getInt(1) == 0) {
                    try (java.sql.Statement st = c.createStatement()) {
                        st.execute("CREATE INDEX " + index + " ON " + table + " " + cols);
                    }
                    log.info("已创建复合索引 {}.{}", table, index);
                }
            }
        } catch (Exception e) {
            log.warn("索引 {}.{} 创建跳过：{}", table, index, e.getMessage());
        }
    }

    private void seedDemoFamily() {
        User elder = createUser("13900001111", "123456", "张桂芳", "ELDER", 1953);
        User family = createUser("13900002222", "123456", "张小芳", "FAMILY", 1980);
        elder.setConsentAt(LocalDateTime.now());
        elder.setHealthConsentAt(LocalDateTime.now());
        userMapper.updateById(elder);

        FamilyBind b = new FamilyBind();
        b.setElderId(elder.getId());
        b.setFamilyId(family.getId());
        b.setScopes("VIEW_SUMMARY,VIEW_ADHERENCE,RECEIVE_ALERTS,MANAGE_PLANS");
        b.setStatus("APPROVED");
        b.setApprovedAt(LocalDateTime.now());
        bindMapper.insert(b);

        // 用药计划：高血压+糖尿病+冠心病典型老年多药联用（演示冲突校验价值）
        Long aspirin = findMedId("阿司匹林肠溶片");
        Long amlodipine = findMedId("苯磺酸氨氯地平片");
        Long atorvastatin = findMedId("阿托伐他汀钙片");
        Long metformin = findMedId("盐酸二甲双胍缓释片");
        createPlan(elder.getId(), aspirin, "阿司匹林肠溶片", "1片(100mg)", List.of("08:00"));
        createPlan(elder.getId(), amlodipine, "苯磺酸氨氯地平片", "1片(5mg)", List.of("08:00"));
        createPlan(elder.getId(), atorvastatin, "阿托伐他汀钙片", "1片(20mg)", List.of("20:00"));
        createPlan(elder.getId(), metformin, "盐酸二甲双胍缓释片", "1片(0.5g)", List.of("08:00", "18:00"));

        // 30天历史打卡（固定随机种子，可复现）：约88%准点 7%迟服 5%漏服
        Random rnd = new Random(20261115);
        List<MedPlan> plans = planMapper.selectList(new QueryWrapper<MedPlan>().eq("elder_id", elder.getId()));
        LocalDate start = LocalDate.now().minusDays(30);
        for (int d = 30; d >= 1; d--) {
            LocalDate day = start.plusDays(30 - d);
            for (MedPlan p : plans) {
                for (String t : p.getTimes().split(",")) {
                    LocalDateTime at = LocalDateTime.of(day, LocalTime.parse(t.trim()));
                    double x = rnd.nextDouble();
                    Checkin c = new Checkin();
                    c.setPlanId(p.getId());
                    c.setElderId(elder.getId());
                    c.setMedName(p.getMedName());
                    c.setScheduledAt(at);
                    if (x < 0.88) {
                        c.setStatus("TAKEN");
                        c.setCheckedAt(at.plusMinutes(rnd.nextInt(9) - 3));
                    } else if (x < 0.95) {
                        c.setStatus("LATE");
                        c.setCheckedAt(at.plusMinutes(15 + rnd.nextInt(40)));
                    } else {
                        c.setStatus("MISSED");
                    }
                    try { checkinMapper.insert(c); } catch (Exception ignore) { }
                }
            }
        }
        log.info("演示家庭数据就绪：张桂芳(老人)/张小芳(家属)，4个用药计划，30天打卡历史");
    }

    private Long findMedId(String genericName) {
        Medication m = medicationMapper.selectOne(new QueryWrapper<Medication>()
                .eq("generic_name", genericName).last("LIMIT 1"));
        return m == null ? null : m.getId();
    }

    private void createPlan(Long elderId, Long medId, String name, String dose, List<String> times) {
        MedPlan p = new MedPlan();
        p.setElderId(elderId);
        p.setMedicationId(medId);
        p.setMedName(name);
        p.setDoseText(dose);
        p.setTimes(String.join(",", times));
        p.setStartDate(LocalDate.now().minusDays(30));
        p.setActive(1);
        planMapper.insert(p);
    }

    private User createUser(String phone, String rawPwd, String name, String role, Integer birthYear) {
        User u = new User();
        u.setPhone(phone);
        u.setPassword(encoder.encode(rawPwd));
        u.setName(name);
        u.setRole(role);
        u.setBirthYear(birthYear);
        u.setConsentAt(LocalDateTime.now());
        userMapper.insert(u);
        return u;
    }

    private Path seedFile(String name) {
        return Paths.get(props.getSeed().getDir()).toAbsolutePath().normalize().resolve(name);
    }

    private String txt(JsonNode j, String f) {
        return j.hasNonNull(f) ? j.get(f).asText() : null;
    }
}
