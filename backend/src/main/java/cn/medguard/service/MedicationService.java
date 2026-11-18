package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.entity.Medication;
import cn.medguard.mapper.MedicationMapper;
import cn.medguard.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;

/** 药品知识库：检索 / 详情 / 管理端维护（版本管理与更新留痕） */
@Service
@RequiredArgsConstructor
public class MedicationService {

    private final MedicationMapper medicationMapper;
    private final AuditService audit;

    public Map<String, Object> search(String keyword, long page, long size) {
        QueryWrapper<Medication> q = new QueryWrapper<Medication>().eq("enabled", 1);
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            q.and(w -> w.like("generic_name", kw).or().like("brand_name", kw)
                    .or().like("ingredients", kw).or().like("drug_class", kw));
        }
        q.orderByAsc("id");
        Page<Medication> p = medicationMapper.selectPage(new Page<>(page, Math.min(size, 100)), q);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("total", p.getTotal());
        r.put("records", p.getRecords());
        return r;
    }

    public Medication detail(long id) {
        Medication m = medicationMapper.selectById(id);
        if (m == null) throw BizException.notFound("药品不存在");
        return m;
    }

    /** AI 服务拉取的轻量词典（名称归一化用）：通用名/商品名/成分 */
    public List<Map<String, Object>> liteDict() {
        List<Medication> all = medicationMapper.selectList(
                new QueryWrapper<Medication>().eq("enabled", 1));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Medication m : all) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", m.getId());
            d.put("genericName", m.getGenericName());
            d.put("brandName", m.getBrandName());
            d.put("ingredients", m.getIngredients());
            d.put("drugClass", m.getDrugClass());
            out.add(d);
        }
        return out;
    }

    // ===== 管理端 =====

    public Medication adminCreate(Medication m) {
        validate(m);
        m.setId(null);
        if (m.getVersion() == null) m.setVersion("v1.0");
        m.setEnabled(m.getEnabled() == null ? 1 : m.getEnabled());
        medicationMapper.insert(m);
        audit.log("MED_CREATE", "medication", m.getId(), m.getGenericName() + " " + m.getVersion());
        return m;
    }

    public Medication adminUpdate(long id, Medication m) {
        Medication old = detail(id);
        validate(m);
        m.setId(id);
        // 版本管理与更新留痕：内容变化则版本号 +0.1
        if (contentChanged(old, m)) {
            m.setVersion(bumpVersion(old.getVersion()));
        } else {
            m.setVersion(old.getVersion());
        }
        medicationMapper.updateById(m);
        audit.log("MED_UPDATE", "medication", id,
                old.getGenericName() + " " + old.getVersion() + "→" + m.getVersion());
        return detail(id);
    }

    public void adminToggle(long id, boolean enabled) {
        Medication m = detail(id);
        m.setEnabled(enabled ? 1 : 0);
        medicationMapper.updateById(m);
        audit.log(enabled ? "MED_ENABLE" : "MED_DISABLE", "medication", id, m.getGenericName());
    }

    private void validate(Medication m) {
        if (m.getGenericName() == null || m.getGenericName().isBlank()) throw new BizException("通用名必填");
        if (m.getIngredients() == null || m.getIngredients().isBlank()) throw new BizException("成分必填（冲突校验的基础）");
        if (m.getSource() == null || m.getSource().isBlank()) throw new BizException("知识来源必填（可追溯要求）");
    }

    private boolean contentChanged(Medication a, Medication b) {
        return !Objects.equals(a.getGenericName(), b.getGenericName())
                || !Objects.equals(a.getBrandName(), b.getBrandName())
                || !Objects.equals(a.getIngredients(), b.getIngredients())
                || !Objects.equals(a.getDosage(), b.getDosage())
                || !Objects.equals(a.getContraindications(), b.getContraindications())
                || !Objects.equals(a.getPrecautions(), b.getPrecautions())
                || !Objects.equals(a.getAdverseReactions(), b.getAdverseReactions())
                || !Objects.equals(a.getIndications(), b.getIndications());
    }

    private String bumpVersion(String v) {
        try {
            String n = v.replaceAll("[^0-9.]", "");
            String[] parts = n.split("\\.");
            int major = Integer.parseInt(parts[0]);
            int minor = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            minor += 1;
            if (minor > 9) { major += 1; minor = 0; }
            return "v" + major + "." + minor;
        } catch (Exception e) {
            return "v1.1";
        }
    }
}
