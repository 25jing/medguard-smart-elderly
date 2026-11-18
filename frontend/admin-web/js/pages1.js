/* ============================================================
   MedGuard 管理后台 · 页面（一）：登录 / 数据仪表盘
   ============================================================ */
'use strict';
const ADMIN_PAGES = {};

/* ================= 登录 ================= */
ADMIN_PAGES.login = {
  template: `
<div class="admin-login">
  <div class="admin-login-card">
    <h1>💊 MedGuard 管理后台</h1>
    <div class="sub">智慧养老安全用药辅助平台 · 数据看板 / 知识库维护 / 规则审核 / 日志审计</div>
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="管理员账号">
        <el-input v-model.trim="phone" size="large" placeholder="admin"></el-input>
      </el-form-item>
      <el-form-item label="密码">
        <el-input v-model="password" size="large" type="password" show-password placeholder="请输入密码" @keyup.enter="submit"></el-input>
      </el-form-item>
      <el-button type="primary" size="large" style="width:100%" :loading="busy" @click="submit">登 录</el-button>
    </el-form>
    <div style="margin-top:18px;background:linear-gradient(135deg,#f0fdfa,#ecfdf5);border:1px solid rgba(20,184,166,.2);border-radius:14px;padding:12px 14px;font-size:12.5px;color:#475569;line-height:1.9">
      <b style="color:#0f766e">三个演示账号</b>（密码均为 <b>{{ demoPwd }}</b>）<br>
      🛡️ 管理员：<b>admin</b>（本后台）<a href="javascript:;" @click="fill" style="color:#0d9488;font-weight:700">自动填入</a><br>
      👴 老人端：张桂芳 <b>13900001111</b>（<a href="/h5/" target="_blank" style="color:#0d9488">打开用户端</a>）<br>
      👨‍👩‍👧 家属端：张小芳 <b>13900002222</b>
    </div>
  </div>
</div>`,
  data() { return { phone: 'admin', password: '', busy: false, demoPwd: '1234' + '56' }; },
  methods: {
    fill() { this.phone = 'admin'; this.password = this.demoPwd; },
    async submit() {
      if (!this.phone || !this.password) return ElementPlus.ElMessage.warning('请输入账号和密码');
      this.busy = true;
      try {
        const d = await api('/api/auth/login', { method: 'POST', body: { phone: this.phone, password: this.password }, auth: false });
        if (d.user.role !== 'ADMIN') { ElementPlus.ElMessage.error('该账号不是管理员，无法进入后台'); return; }
        setAdminSession(d.token, d.user);
        ElementPlus.ElMessage.success('欢迎回来，' + d.user.name);
        navigate('dashboard');
      } catch (e) { ElementPlus.ElMessage.error(e.message); }
      finally { this.busy = false; }
    }
  }
};

/* ================= 数据仪表盘 ================= */
ADMIN_PAGES.dashboard = {
  template: `
<div>
  <div class="stat-cards">
    <div class="stat-card">
      <div class="sc-icon" style="background:linear-gradient(135deg,#0f766e,#14b8a6)">👴</div>
      <div><div class="sc-num">{{ d.userCounts ? d.userCounts.elder : '-' }}</div><div class="sc-label">老年用户（家属 {{ d.userCounts ? d.userCounts.family : '-' }} 人）</div></div>
    </div>
    <div class="stat-card">
      <div class="sc-icon" style="background:linear-gradient(135deg,#2563eb,#60a5fa)">💊</div>
      <div><div class="sc-num">{{ d.medicationCount ?? '-' }}</div><div class="sc-label">药品知识库（启用条目）</div></div>
    </div>
    <div class="stat-card">
      <div class="sc-icon" style="background:linear-gradient(135deg,#d97706,#fbbf24)">📋</div>
      <div><div class="sc-num">{{ d.ruleCounts ? d.ruleCounts.total : '-' }}</div><div class="sc-label">冲突规则（待审核 {{ d.ruleCounts ? d.ruleCounts.pending : '-' }} 条）</div></div>
    </div>
    <div class="stat-card">
      <div class="sc-icon" style="background:linear-gradient(135deg,#dc2626,#f87171)">✅</div>
      <div><div class="sc-num">{{ d.todayCheckins ?? '-' }}</div><div class="sc-label">今日打卡（在用计划 {{ d.activePlans ?? '-' }} 个）</div></div>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-card">
      <h3>📈 近7天 AI 调用趋势（识别 / 问答）</h3>
      <div class="chart-box" ref="trendChart"></div>
    </div>
    <div class="chart-card">
      <h3>🎯 核心质量指标</h3>
      <div class="chart-box" ref="gaugeChart"></div>
    </div>
  </div>

  <div class="chart-row">
    <div class="chart-card">
      <h3>👥 用户角色分布</h3>
      <div class="chart-box" ref="roleChart"></div>
    </div>
    <div class="chart-card">
      <h3>🧾 运行摘要</h3>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="问答拒答次数（无依据/超范围）">{{ d.refusedCount ?? '-' }}</el-descriptions-item>
        <el-descriptions-item label="问答引用覆盖率">{{ d.citationCoverage ?? '-' }}%</el-descriptions-item>
        <el-descriptions-item label="近7天全局依从率">{{ d.adherence7dRate ?? '-' }}%</el-descriptions-item>
        <el-descriptions-item label="规则审核状态">已通过 {{ d.ruleCounts ? d.ruleCounts.approved : '-' }} 条 / 共 {{ d.ruleCounts ? d.ruleCounts.total : '-' }} 条</el-descriptions-item>
        <el-descriptions-item label="隐私承诺">识别原图即传即删不落盘；审计日志保存6个月</el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</div>`,
  data() { return { d: {}, charts: [] }; },
  methods: {
    async load() {
      try { this.d = await api('/api/admin/dashboard'); }
      catch (e) { return ElementPlus.ElMessage.error(e.message); }
      Vue.nextTick(() => this.render());
    },
    render() {
      this.charts.forEach(c => c.dispose());
      this.charts = [];
      const C = echarts;
      // 趋势图
      const rT = this.d.recognizeTrend || [], qT = this.d.qaTrend || [];
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date(Date.now() - i * 86400000);
        days.push(dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'));
      }
      const pick = (list, day) => {
        const it = (list || []).find(x => String(x.d).slice(0, 10) === day);
        return it ? Number(it.cnt) : 0;
      };
      const pickMs = (list, day) => {
        const it = (list || []).find(x => String(x.d).slice(0, 10) === day);
        return it && it.avg_ms ? Math.round(Number(it.avg_ms)) : null;
      };
      const t1 = C.init(this.$refs.trendChart);
      t1.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['识药次数', '问答次数', '识别平均延迟(ms)'], bottom: 0 },
        grid: { left: 40, right: 55, top: 30, bottom: 55 },
        xAxis: { type: 'category', data: days.map(x => x.slice(5)) },
        yAxis: [{ type: 'value', name: '次数', minInterval: 1 }, { type: 'value', name: 'ms' }],
        series: [
          { name: '识药次数', type: 'line', smooth: true, data: days.map(x => pick(rT, x)), itemStyle: { color: '#0f766e' }, areaStyle: { opacity: .12 } },
          { name: '问答次数', type: 'line', smooth: true, data: days.map(x => pick(qT, x)), itemStyle: { color: '#2563eb' }, areaStyle: { opacity: .12 } },
          { name: '识别平均延迟(ms)', type: 'line', smooth: true, yAxisIndex: 1, data: days.map(x => pickMs(rT, x)), itemStyle: { color: '#d97706' }, lineStyle: { type: 'dashed' } }
        ]
      });
      this.charts.push(t1);
      // 仪表盘（依从率 + 引用覆盖率）
      const g = C.init(this.$refs.gaugeChart);
      g.setOption({
        series: [
          { type: 'gauge', center: ['28%', '55%'], radius: '78%', startAngle: 210, endAngle: -30,
            min: 0, max: 100, progress: { show: true, width: 14, itemStyle: { color: '#0f766e' } },
            axisLine: { lineStyle: { width: 14 } }, axisTick: { show: false }, splitLine: { show: false },
            axisLabel: { show: false }, pointer: { show: false },
            title: { offsetCenter: [0, '32%'], fontSize: 13, color: '#475569' },
            detail: { offsetCenter: [0, 0], fontSize: 26, fontWeight: 800, color: '#0f172a', formatter: '{value}%' },
            data: [{ value: this.d.adherence7dRate ?? 0, name: '近7天依从率' }] },
          { type: 'gauge', center: ['74%', '55%'], radius: '78%', startAngle: 210, endAngle: -30,
            min: 0, max: 100, progress: { show: true, width: 14, itemStyle: { color: '#2563eb' } },
            axisLine: { lineStyle: { width: 14 } }, axisTick: { show: false }, splitLine: { show: false },
            axisLabel: { show: false }, pointer: { show: false },
            title: { offsetCenter: [0, '32%'], fontSize: 13, color: '#475569' },
            detail: { offsetCenter: [0, 0], fontSize: 26, fontWeight: 800, color: '#0f172a', formatter: '{value}%' },
            data: [{ value: this.d.citationCoverage ?? 0, name: '问答引用覆盖率' }] }
        ]
      });
      this.charts.push(g);
      // 角色分布
      const uc = this.d.userCounts || {};
      const p = C.init(this.$refs.roleChart);
      p.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{
          type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'],
          label: { formatter: '{b}: {c}人' },
          data: [
            { name: '老年人', value: uc.elder || 0, itemStyle: { color: '#0f766e' } },
            { name: '家属', value: uc.family || 0, itemStyle: { color: '#2563eb' } },
            { name: '管理员', value: uc.admin || 0, itemStyle: { color: '#d97706' } }
          ]
        }]
      });
      this.charts.push(p);
      window.addEventListener('resize', this.onResize);
    },
    onResize() { this.charts.forEach(c => c.resize()); }
  },
  mounted() { this.load(); },
  unmounted() { window.removeEventListener('resize', this.onResize); this.charts.forEach(c => c.dispose()); }
};
