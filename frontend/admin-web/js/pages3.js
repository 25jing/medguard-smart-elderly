/* ============================================================
   MedGuard 管理后台 · 页面（三）：日志审计（识别日志 / 问答日志 / 操作审计）
   ============================================================ */
'use strict';

ADMIN_PAGES.logs = {
  template: `
<div class="page-card">
  <el-tabs v-model="tab" @tab-change="onTab">
    <el-tab-pane label="📷 识别日志" name="recognize">
      <el-table :data="rows" v-loading="loading" empty-text="暂无数据" stripe>
        <el-table-column prop="id" label="ID" width="64"></el-table-column>
        <el-table-column prop="userId" label="用户ID" width="80"></el-table-column>
        <el-table-column prop="ocrText" label="OCR识别文本" min-width="240" show-overflow-tooltip></el-table-column>
        <el-table-column label="Top-3候选" min-width="240">
          <template #default="{ row }"><span class="text-dim" style="font-size:12px">{{ cands(row) }}</span></template>
        </el-table-column>
        <el-table-column label="Top置信度" width="100">
          <template #default="{ row }">{{ row.topConfidence != null ? Math.round(row.topConfidence * 100) + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="用户确认" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.chosenMedicationId" size="small" type="success">已确认#{{ row.chosenMedicationId }}</el-tag>
            <span v-else class="text-dim">未确认</span>
          </template>
        </el-table-column>
        <el-table-column label="延迟" width="90"><template #default="{ row }">{{ row.latencyMs }}ms</template></el-table-column>
        <el-table-column label="时间" width="170"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
      </el-table>
    </el-tab-pane>

    <el-tab-pane label="💬 问答日志" name="qa">
      <el-table :data="rows" v-loading="loading" empty-text="暂无数据" stripe>
        <el-table-column prop="id" label="ID" width="64"></el-table-column>
        <el-table-column prop="userId" label="用户ID" width="80"></el-table-column>
        <el-table-column prop="question" label="问题" min-width="200" show-overflow-tooltip></el-table-column>
        <el-table-column prop="answer" label="回答" min-width="260" show-overflow-tooltip></el-table-column>
        <el-table-column label="模式" width="110">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ modeCn(row.mode) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="引用" width="70">
          <template #default="{ row }">{{ srcCount(row) }}</template>
        </el-table-column>
        <el-table-column label="置信度" width="90">
          <template #default="{ row }">{{ row.confidence != null ? Math.round(row.confidence * 100) + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="拒答" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.refused===1" size="small" type="danger">拒答</el-tag><span v-else class="text-dim">—</span>
          </template>
        </el-table-column>
        <el-table-column label="延迟" width="90"><template #default="{ row }">{{ row.latencyMs }}ms</template></el-table-column>
        <el-table-column label="时间" width="170"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
      </el-table>
    </el-tab-pane>

    <el-tab-pane label="🛡️ 操作审计" name="audit">
      <el-alert type="info" :closable="false" style="margin-bottom:12px"
        title="全链路留痕：登录、建计划、打卡、绑定授权、识别、问答、高危冲突、后台变更均记录审计日志，保存6个月，超期自动清除。"></el-alert>
      <el-table :data="rows" v-loading="loading" empty-text="暂无数据" stripe>
        <el-table-column prop="id" label="ID" width="70"></el-table-column>
        <el-table-column label="操作人" width="150">
          <template #default="{ row }">{{ row.userName || ('用户#' + row.userId) }}</template>
        </el-table-column>
        <el-table-column prop="action" label="动作" width="170">
          <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.action }}</el-tag></template>
        </el-table-column>
        <el-table-column label="对象" width="170">
          <template #default="{ row }">{{ row.targetType }}{{ row.targetId ? ' #' + row.targetId : '' }}</template>
        </el-table-column>
        <el-table-column prop="detail" label="详情" min-width="260" show-overflow-tooltip></el-table-column>
        <el-table-column prop="ip" label="IP" width="130"></el-table-column>
        <el-table-column label="时间" width="170"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
      </el-table>
    </el-tab-pane>
  </el-tabs>
  <div class="pager">
    <el-button :disabled="page<=1" @click="page--;load()">上一页</el-button>
    <span style="margin:0 14px;color:#64748b;font-size:13px">第 {{ page }} 页 · 共 {{ total }} 条</span>
    <el-button :disabled="page*size>=total" @click="page++;load()">下一页</el-button>
  </div>
</div>`,
  data() { return { tab: 'recognize', rows: [], total: 0, page: 1, size: 20, loading: false }; },
  methods: {
    fmt: fmtTime,
    modeCn(m) { return { llm: 'LLM受控生成', extractive: '知识库摘编', 'extractive-fallback': 'LLM失败回退', refuse: '无依据拒答', guard: '超范围拒答', booting: '启动中' }[m] || m || '-'; },
    cands(row) {
      try {
        const arr = JSON.parse(row.candidates || '[]');
        return arr.map(c => c.name + '(' + Math.round((c.confidence || 0) * 100) + '%)').join('、') || '-';
      } catch (e) { return row.candidates || '-'; }
    },
    srcCount(row) {
      try { const arr = JSON.parse(row.sources || '[]'); return arr.length ? arr.length + '条' : '—'; }
      catch (e) { return '—'; }
    },
    onTab() { this.page = 1; this.rows = []; this.load(); },
    async load() {
      this.loading = true;
      const ep = { recognize: '/api/admin/recognize-logs', qa: '/api/admin/qa-logs', audit: '/api/admin/audits' }[this.tab];
      try {
        const d = await api(ep + '?page=' + this.page + '&size=' + this.size);
        this.rows = d.records; this.total = d.total;
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.loading = false; }
    }
  },
  mounted() { this.load(); }
};
