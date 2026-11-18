/* ============================================================
   MedGuard 管理后台 · 页面（二）：用户管理 / 药品知识库 / 冲突规则库
   ============================================================ */
'use strict';

/* ================= 用户管理 ================= */
ADMIN_PAGES.users = {
  template: `
<div class="page-card">
  <div class="toolbar">
    <el-input v-model.trim="keyword" placeholder="搜索姓名/手机号" style="width:220px" clearable @keyup.enter="search"></el-input>
    <el-select v-model="role" placeholder="角色筛选" style="width:140px" clearable>
      <el-option label="老年人" value="ELDER"></el-option>
      <el-option label="家属" value="FAMILY"></el-option>
      <el-option label="管理员" value="ADMIN"></el-option>
    </el-select>
    <el-button type="primary" @click="search">查询</el-button>
    <div class="spacer"></div>
    <span class="text-dim" style="font-size:12.5px">手机号按隐私规范脱敏展示</span>
  </div>
  <el-table :data="rows" v-loading="loading" empty-text="暂无数据" stripe>
    <el-table-column prop="id" label="ID" width="70"></el-table-column>
    <el-table-column prop="name" label="姓名" width="140"></el-table-column>
    <el-table-column prop="phone" label="手机号(脱敏)" width="150"></el-table-column>
    <el-table-column label="角色" width="110">
      <template #default="{ row }">
        <el-tag :type="row.role==='ADMIN' ? 'warning' : row.role==='ELDER' ? 'success' : 'primary'" effect="light">{{ roleCn(row.role) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="注册时间" width="180"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
    <el-table-column label="知情同意" width="180"><template #default="{ row }">{{ fmt(row.consentAt) }}</template></el-table-column>
    <el-table-column label="操作">
      <template #default="{ row }">
        <el-popconfirm title="确认变更该用户角色？（将记录审计日志）" @confirm="changeRole(row)">
          <template #reference>
            <el-select v-model="row.role" size="small" style="width:110px" @click.stop>
              <el-option label="老年人" value="ELDER"></el-option>
              <el-option label="家属" value="FAMILY"></el-option>
              <el-option label="管理员" value="ADMIN"></el-option>
            </el-select>
          </template>
        </el-popconfirm>
      </template>
    </el-table-column>
  </el-table>
  <div class="pager">
    <el-button :disabled="page<=1" @click="page--;load()">上一页</el-button>
    <span style="margin:0 14px;color:#64748b;font-size:13px">第 {{ page }} 页 · 共 {{ total }} 条</span>
    <el-button :disabled="page*size>=total" @click="page++;load()">下一页</el-button>
  </div>
</div>`,
  data() { return { keyword: '', role: '', rows: [], total: 0, page: 1, size: 20, loading: false }; },
  methods: {
    roleCn: r => ROLE_CN[r] || r, fmt: fmtTime,
    search() { this.page = 1; this.load(); },
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ page: this.page, size: this.size });
        if (this.keyword) q.set('keyword', this.keyword);
        if (this.role) q.set('role', this.role);
        const d = await api('/api/admin/users?' + q.toString());
        this.rows = d.records; this.total = d.total;
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.loading = false; }
    },
    async changeRole(row) {
      try {
        await api('/api/admin/users/' + row.id + '/role', { method: 'PUT', body: { role: row.role } });
        ElementPlus.ElMessage.success('角色已变更为 ' + ROLE_CN[row.role]);
      } catch (e) { ElementPlus.ElMessage.error(e.message); this.load(); }
    }
  },
  mounted() { this.load(); }
};

/* ================= 药品知识库维护 ================= */
ADMIN_PAGES.meds = {
  template: `
<div class="page-card">
  <div class="toolbar">
    <el-input v-model.trim="keyword" placeholder="搜索药名/成分/分类" style="width:240px" clearable @keyup.enter="search"></el-input>
    <el-button type="primary" @click="search">查询</el-button>
    <div class="spacer"></div>
    <el-button type="success" @click="openEdit(null)">＋ 新增药品</el-button>
  </div>
  <el-table :data="rows" v-loading="loading" empty-text="暂无数据" stripe>
    <el-table-column prop="id" label="ID" width="64"></el-table-column>
    <el-table-column prop="genericName" label="通用名" min-width="150"></el-table-column>
    <el-table-column prop="brandName" label="商品名" width="110"></el-table-column>
    <el-table-column prop="ingredients" label="成分" min-width="130" show-overflow-tooltip></el-table-column>
    <el-table-column prop="drugClass" label="药理分类" min-width="150" show-overflow-tooltip></el-table-column>
    <el-table-column prop="source" label="知识来源" min-width="160" show-overflow-tooltip></el-table-column>
    <el-table-column prop="version" label="版本" width="80"></el-table-column>
    <el-table-column label="启用" width="80">
      <template #default="{ row }">
        <el-switch :model-value="row.enabled===1" @change="v=>toggle(row,v)"></el-switch>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="90" fixed="right">
      <template #default="{ row }"><el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button></template>
    </el-table-column>
  </el-table>
  <div class="pager">
    <el-button :disabled="page<=1" @click="page--;load()">上一页</el-button>
    <span style="margin:0 14px;color:#64748b;font-size:13px">第 {{ page }} 页 · 共 {{ total }} 条</span>
    <el-button :disabled="page*size>=total" @click="page++;load()">下一页</el-button>
  </div>

  <el-dialog v-model="dialog" :title="form.id ? '编辑药品（版本将自动+1并留痕）' : '新增药品'" width="720px" top="4vh">
    <el-form :model="form" label-width="110px" label-position="left">
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="通用名" required><el-input v-model.trim="form.genericName" placeholder="如：阿司匹林肠溶片"></el-input></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="商品名"><el-input v-model.trim="form.brandName" placeholder="如：拜阿司匹灵"></el-input></el-form-item></el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="成分(逗号分隔)" required><el-input v-model.trim="form.ingredients" placeholder="如：阿司匹林"></el-input></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="药理分类"><el-input v-model.trim="form.drugClass" placeholder="如：抗血小板药"></el-input></el-form-item></el-col>
      </el-row>
      <el-form-item label="适应证"><el-input type="textarea" :rows="2" v-model="form.indications"></el-input></el-form-item>
      <el-form-item label="用法用量"><el-input type="textarea" :rows="2" v-model="form.dosage"></el-input></el-form-item>
      <el-form-item label="禁忌"><el-input type="textarea" :rows="2" v-model="form.contraindications"></el-input></el-form-item>
      <el-form-item label="注意事项"><el-input type="textarea" :rows="3" v-model="form.precautions"></el-input></el-form-item>
      <el-form-item label="不良反应"><el-input type="textarea" :rows="2" v-model="form.adverseReactions"></el-input></el-form-item>
      <el-form-item label="贮藏"><el-input v-model="form.storage"></el-input></el-form-item>
      <el-form-item label="知识来源"><el-input v-model="form.source" placeholder="如：药品说明书（国家药监局批准文本摘要）"></el-input></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog=false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</div>`,
  data() {
    return {
      keyword: '', rows: [], total: 0, page: 1, size: 20, loading: false,
      dialog: false, saving: false,
      form: this.emptyForm()
    };
  },
  methods: {
    emptyForm() {
      return { id: null, genericName: '', brandName: '', ingredients: '', drugClass: '', indications: '', dosage: '', contraindications: '', precautions: '', adverseReactions: '', storage: '', source: '' };
    },
    search() { this.page = 1; this.load(); },
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ page: this.page, size: this.size });
        if (this.keyword) q.set('keyword', this.keyword);
        const d = await api('/api/medications?' + q.toString());
        this.rows = d.records; this.total = d.total;
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.loading = false; }
    },
    openEdit(row) {
      this.form = row ? Object.assign(this.emptyForm(), JSON.parse(JSON.stringify(row))) : this.emptyForm();
      this.dialog = true;
    },
    async save() {
      if (!this.form.genericName) return ElementPlus.ElMessage.warning('通用名必填');
      if (!this.form.ingredients) return ElementPlus.ElMessage.warning('成分必填（冲突校验依赖成分归一化）');
      this.saving = true;
      try {
        if (this.form.id) {
          await api('/api/admin/medications/' + this.form.id, { method: 'PUT', body: this.form });
          ElementPlus.ElMessage.success('已更新，版本+1，已同步AI词典与RAG知识库');
        } else {
          await api('/api/admin/medications', { method: 'POST', body: this.form });
          ElementPlus.ElMessage.success('已新增，并同步AI词典与RAG知识库');
        }
        this.dialog = false; this.load();
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.saving = false; }
    },
    async toggle(row, v) {
      try {
        await api('/api/admin/medications/' + row.id + '/toggle', { method: 'POST', body: { enabled: v } });
        row.enabled = v ? 1 : 0;
        ElementPlus.ElMessage.success(v ? '已启用' : '已停用（AI识别与RAG将不再使用该条目）');
      } catch (e) { ElementPlus.ElMessage.error(e.message); this.load(); }
    }
  },
  mounted() { this.load(); }
};

/* ================= 冲突规则库（含药师审核流） ================= */
ADMIN_PAGES.rules = {
  template: `
<div class="page-card">
  <div class="toolbar">
    <el-select v-model="type" placeholder="规则类型" style="width:150px" clearable @change="search">
      <el-option v-for="(cn,t) in types" :key="t" :label="cn" :value="t"></el-option>
    </el-select>
    <el-select v-model="reviewStatus" placeholder="审核状态" style="width:130px" clearable @change="search">
      <el-option label="待审核" value="PENDING"></el-option>
      <el-option label="已通过" value="APPROVED"></el-option>
      <el-option label="已驳回" value="REJECTED"></el-option>
    </el-select>
    <el-button type="primary" @click="search">查询</el-button>
    <el-button @click="syncAi">🔄 同步到AI服务</el-button>
    <div class="spacer"></div>
    <el-button type="success" @click="openEdit(null)">＋ 新增规则</el-button>
  </div>

  <el-alert type="info" :closable="false" style="margin-bottom:14px"
    title="规则引擎说明：只有【已通过审核 + 启用】的规则参与冲突校验；规则变更会记录版本并推送AI服务热更新。种子规则依据 2023版AGS Beers标准 / 中国老年人潜在不适当用药判断标准(2017版) / 药品说明书整理，正式上线前须由执业药师逐条复核。"></el-alert>

  <el-table :data="rows" v-loading="loading" empty-text="暂无数据" stripe>
    <el-table-column prop="ruleCode" label="规则编码" width="150"></el-table-column>
    <el-table-column label="类型" width="105">
      <template #default="{ row }"><el-tag effect="plain" size="small">{{ typeCn(row.ruleType) }}</el-tag></template>
    </el-table-column>
    <el-table-column label="药物A" width="140"><template #default="{ row }">{{ row.drugA }}</template></el-table-column>
    <el-table-column label="药物B" width="140"><template #default="{ row }">{{ row.drugB || '—' }}</template></el-table-column>
    <el-table-column label="风险" width="85">
      <template #default="{ row }"><span :class="'risk-' + row.riskLevel">{{ riskCn(row.riskLevel) }}</span></template>
    </el-table-column>
    <el-table-column prop="explanation" label="通俗解释" min-width="240" show-overflow-tooltip></el-table-column>
    <el-table-column prop="basisSource" label="依据来源" min-width="200" show-overflow-tooltip></el-table-column>
    <el-table-column label="审核" width="95">
      <template #default="{ row }">
        <el-tag size="small" :type="row.reviewStatus==='APPROVED' ? 'success' : row.reviewStatus==='REJECTED' ? 'danger' : 'warning'" effect="light">{{ reviewCn(row.reviewStatus) }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="启用" width="70">
      <template #default="{ row }"><el-switch :model-value="row.enabled===1" size="small" @change="v=>toggle(row,v)"></el-switch></template>
    </el-table-column>
    <el-table-column label="操作" width="150" fixed="right">
      <template #default="{ row }">
        <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
        <el-button size="small" type="warning" link @click="openReview(row)" v-if="row.reviewStatus!=='APPROVED'">审核</el-button>
      </template>
    </el-table-column>
  </el-table>
  <div class="pager">
    <el-button :disabled="page<=1" @click="page--;load()">上一页</el-button>
    <span style="margin:0 14px;color:#64748b;font-size:13px">第 {{ page }} 页 · 共 {{ total }} 条</span>
    <el-button :disabled="page*size>=total" @click="page++;load()">下一页</el-button>
  </div>

  <el-dialog v-model="dialog" :title="form.id ? '编辑规则（版本+1，保存后自动推送AI服务）' : '新增规则（默认待审核）'" width="640px">
    <el-form :model="form" label-width="100px" label-position="left">
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="规则编码" required><el-input v-model.trim="form.ruleCode" placeholder="如：CR-WAR-ASP"></el-input></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="规则类型" required>
          <el-select v-model="form.ruleType" style="width:100%">
            <el-option v-for="(cn,t) in types" :key="t" :label="cn" :value="t"></el-option>
          </el-select>
        </el-form-item></el-col>
      </el-row>
      <el-row :gutter="12">
        <el-col :span="12"><el-form-item label="药物A" required><el-input v-model.trim="form.drugA" placeholder="成分名/药名/药理类别"></el-input></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="药物B"><el-input v-model.trim="form.drugB" placeholder="单药慎用规则可留空"></el-input></el-form-item></el-col>
      </el-row>
      <el-form-item label="风险等级" required>
        <el-radio-group v-model="form.riskLevel">
          <el-radio value="HIGH">高风险</el-radio><el-radio value="MEDIUM">中风险</el-radio><el-radio value="LOW">低风险</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="通俗解释" required><el-input type="textarea" :rows="3" v-model="form.explanation" placeholder="用老人听得懂的话解释风险与建议"></el-input></el-form-item>
      <el-form-item label="依据来源" required><el-input type="textarea" :rows="2" v-model="form.basisSource" placeholder="如：AGS Beers标准(2023) / 药品说明书【药物相互作用】项"></el-input></el-form-item>
      <el-form-item label="整理/复核人"><el-input v-model.trim="form.reviewedBy"></el-input></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog=false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="reviewDialog" title="规则审核（药师工作流）" width="480px">
    <el-alert type="warning" :closable="false" style="margin-bottom:14px"
      :title="'待审核规则：' + (current.ruleCode || '') + '  ' + (current.drugA || '') + (current.drugB ? ' × ' + current.drugB : '')"></el-alert>
    <el-form label-width="90px" label-position="left">
      <el-form-item label="审核人"><el-input v-model.trim="reviewer" placeholder="如：执业药师 王某某"></el-input></el-form-item>
    </el-form>
    <template #footer>
      <el-button type="danger" @click="doReview(false)">驳回</el-button>
      <el-button type="success" @click="doReview(true)">审核通过（立即生效）</el-button>
    </template>
  </el-dialog>
</div>`,
  data() {
    return {
      types: RULE_TYPE_CN, type: '', reviewStatus: '', rows: [], total: 0, page: 1, size: 20, loading: false,
      dialog: false, saving: false, form: this.emptyForm(),
      reviewDialog: false, reviewer: '', current: {}
    };
  },
  methods: {
    typeCn: t => RULE_TYPE_CN[t] || t, riskCn: r => RISK_CN[r] || r, reviewCn: s => REVIEW_CN[s] || s,
    emptyForm() { return { id: null, ruleCode: '', ruleType: 'CONTRAINDICATED', drugA: '', drugB: '', riskLevel: 'MEDIUM', explanation: '', basisSource: '', reviewedBy: '' }; },
    search() { this.page = 1; this.load(); },
    async load() {
      this.loading = true;
      try {
        const q = new URLSearchParams({ page: this.page, size: this.size });
        if (this.type) q.set('type', this.type);
        if (this.reviewStatus) q.set('reviewStatus', this.reviewStatus);
        const d = await api('/api/admin/rules?' + q.toString());
        this.rows = d.records; this.total = d.total;
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.loading = false; }
    },
    openEdit(row) { this.form = row ? Object.assign(this.emptyForm(), JSON.parse(JSON.stringify(row))) : this.emptyForm(); this.dialog = true; },
    async save() {
      if (!this.form.ruleCode || !this.form.drugA || !this.form.explanation || !this.form.basisSource)
        return ElementPlus.ElMessage.warning('规则编码、药物A、通俗解释、依据来源为必填项');
      this.saving = true;
      try {
        if (this.form.id) await api('/api/admin/rules/' + this.form.id, { method: 'PUT', body: this.form });
        else await api('/api/admin/rules', { method: 'POST', body: this.form });
        ElementPlus.ElMessage.success('已保存并推送AI服务热更新');
        this.dialog = false; this.load();
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.saving = false; }
    },
    openReview(row) { this.current = row; this.reviewer = ''; this.reviewDialog = true; },
    async doReview(approve) {
      if (!this.reviewer) return ElementPlus.ElMessage.warning('请填写审核人（执业药师）姓名');
      try {
        await api('/api/admin/rules/' + this.current.id + '/review', { method: 'POST', body: { reviewer: this.reviewer, approve } });
        ElementPlus.ElMessage.success(approve ? '已通过审核并推送AI服务生效' : '已驳回');
        this.reviewDialog = false; this.load();
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
    },
    async toggle(row, v) {
      try {
        await api('/api/admin/rules/' + row.id + '/toggle', { method: 'POST', body: { enabled: v } });
        row.enabled = v ? 1 : 0;
        ElementPlus.ElMessage.success(v ? '规则已启用' : '规则已停用');
      } catch (e) { ElementPlus.ElMessage.error(e.message); this.load(); }
    },
    async syncAi() {
      try { await api('/api/admin/rules/sync', { method: 'POST' }); ElementPlus.ElMessage.success('已推送全部生效规则到AI服务'); }
      catch (e) { ElementPlus.ElMessage.error('同步失败：' + e.message + '（请确认AI服务已启动）'); }
    }
  },
  mounted() { this.load(); }
};
