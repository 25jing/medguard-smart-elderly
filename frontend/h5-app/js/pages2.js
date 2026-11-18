/* ============================================================
   安心药助手 H5 · 页面组件（二）：今日用药 / 计划 / 记录 / 药品详情 / 查询 / 家庭 / 我的
   ============================================================ */
'use strict';

/* ================= 今日用药（大按钮打卡） ================= */
PAGES.today = {
  template: `
<div class="page">
  <div class="header">
    <div class="title">💊 今日用药</div>
    <button class="head-action" @click="load">刷新</button>
  </div>
  <div class="content page-enter">
    <div v-for="r in reminders" :key="r.id" class="alert-banner remind" @click="readReminder(r)">
      🔔 <div class="flex1"><b>{{ r.title }}</b><br><span class="small">{{ r.content }}</span></div>
    </div>

    <div class="card">
      <div class="stat-row">
        <div class="big-stat"><div class="num">{{ cnt.TAKEN + cnt.LATE }}</div><div class="lbl">已服用</div></div>
        <div class="big-stat"><div class="num" style="color:var(--warn)">{{ cnt.PENDING }}</div><div class="lbl">待服用</div></div>
        <div class="big-stat"><div class="num" style="color:var(--danger)">{{ cnt.MISSED }}</div><div class="lbl">已漏服</div></div>
      </div>
    </div>

    <div v-if="!checkins.length" class="empty">
      <div class="empty-icon">🌿</div>今天没有用药任务<br>
      <button class="btn btn-primary mt16" @click="go('plans')">去添加用药计划</button>
    </div>

    <div v-for="c in checkins" :key="c.id" class="task-item">
      <div class="task-time">{{ fmtHM(c.scheduledAt) }}</div>
      <div class="task-info">
        <div class="task-name">{{ c.medName }}</div>
        <div class="task-dose">{{ doseOf(c) }} · <span class="task-status" :class="'st-' + c.status">{{ statusCn(c.status) }}</span></div>
        <div class="task-dose" v-if="c.checkedAt">打卡于 {{ fmtHM(c.checkedAt) }}</div>
      </div>
      <button v-if="c.status==='PENDING' || c.status==='MISSED'" class="btn btn-primary take-btn" :disabled="busy===c.id" @click="checkin(c)">
        {{ c.status==='MISSED' ? '补打卡' : '已服药' }}
      </button>
      <div v-else style="font-size:34px">{{ c.status==='TAKEN' ? '✅' : '🕐' }}</div>
    </div>

    <template v-if="conflicts.length">
      <div class="card-title mt16">⚠️ 当前用药方案冲突提醒</div>
      <div v-for="w in conflicts" :key="w.ruleCode" class="conflict-item" :class="w.riskLevel">
        <div class="conflict-head">{{ drugNames(w) }} <span class="risk-tag" :class="w.riskLevel">{{ riskCn(w.riskLevel) }}</span> <span class="tag">{{ typeCn(w.ruleType) }}</span></div>
        <div class="mt8">{{ w.explanation }}</div>
        <div class="conflict-basis">依据：{{ w.basisSource }}</div>
        <button class="speak-btn" @click="speakIt(w.explanation)">🔊 朗读</button>
      </div>
    </template>

    <button class="btn btn-outline btn-block mt16" @click="go('plans')">🗂️ 管理用药计划</button>
  </div>
  <TabBar active="today" />
</div>`,
  data() { return { checkins: [], plans: [], reminders: [], conflicts: [], busy: null, cnt: { TAKEN: 0, LATE: 0, MISSED: 0, PENDING: 0 } }; },
  methods: {
    go: navigate, fmtHM, statusCn: s => STATUS_CN[s] || s, riskCn: r => RISK_CN[r] || r,
    typeCn: t => RULE_TYPE_CN[t] || t, speakIt: speak,
    drugNames(c) { return (c.drugs && c.drugs.length ? c.drugs.join(' × ') : [c.drugA, c.drugB].filter(Boolean).join(' × ')) || '在用药'; },
    doseOf(c) { const p = this.plans.find(p => p.id === c.planId); return p ? p.doseText : ''; },
    async load() {
      try {
        const [cks, pls, rms] = await Promise.all([
          api('/api/checkins/today'), api('/api/plans'), api('/api/reminders')
        ]);
        this.checkins = cks; this.plans = pls; this.reminders = rms;
        this.cnt = { TAKEN: 0, LATE: 0, MISSED: 0, PENDING: 0 };
        cks.forEach(c => { this.cnt[c.status] = (this.cnt[c.status] || 0) + 1; });
      } catch (e) { toast(e.message, 'err'); }
      try { this.conflicts = await api('/api/conflict/check', { method: 'POST' }); } catch (e) { this.conflicts = []; }
      if (this.conflicts.some(c => c.riskLevel === 'HIGH')) buzz([350, 150, 350]);
      else if (this.conflicts.length) buzz([180, 100, 180]);
      const due = this.checkins.find(c => c.status === 'PENDING' && new Date(String(c.scheduledAt).replace(/-/g, '/')) <= new Date());
      if (due) toast('⏰ 该服用「' + due.medName + '」了，别忘了', (this.conflicts.some(c => c.riskLevel === 'HIGH') || this.conflicts.length) ? 'info' : 'warn');
    },
    async checkin(c) {
      this.busy = c.id;
      try {
        const updated = await api('/api/checkins/' + c.id, { method: 'POST', body: {} });
        c.status = updated.status; c.checkedAt = updated.checkedAt;
        this.cnt = { TAKEN: 0, LATE: 0, MISSED: 0, PENDING: 0 };
        this.checkins.forEach(x => { this.cnt[x.status] = (this.cnt[x.status] || 0) + 1; });
        toast(updated.status === 'TAKEN' ? '打卡成功，真棒！' : '已补打卡（延迟服用）', 'ok');
        buzz(60);   // 成功轻震，确认反馈
        if (store.ttsOn) speak(updated.status === 'TAKEN' ? '打卡成功' : '已记录为延迟服用');
      } catch (e) { toast(e.message, 'err'); }
      finally { this.busy = null; }
    },
    async readReminder(r) {
      try { await api('/api/reminders/' + r.id + '/read', { method: 'POST' }); } catch (e) { }
      this.reminders = this.reminders.filter(x => x.id !== r.id);
    }
  },
  mounted() { this.load(); }
};

/* ================= 用药计划管理 ================= */
PAGES.plans = {
  template: `
<div class="page no-tab">
  <div class="header">
    <button class="back-btn" @click="go(proxy ? 'home' : 'today')">←</button>
    <div class="title">🗂️ 用药计划{{ proxy ? ' · 帮TA管理' : '' }}</div>
  </div>
  <div class="content page-enter">
    <div class="proxy-banner" v-if="proxy">
      👨‍👩‍👧 正在以<b>家属身份</b>帮「{{ proxy.name }}」管理用药计划 · 已获老人授权 · 操作全程留痕
      <a class="exit" @click="exitProxy">退出代办</a>
    </div>
    <div v-for="p in plans" :key="p.id" class="card">
      <div class="card-title">{{ p.medName }}</div>
      <div class="muted">每次 {{ p.doseText }} · 每天 {{ (p.times || '').split(',').join('、') }}</div>
      <div class="muted small">从 {{ p.startDate }} 起{{ p.endDate ? ' 至 ' + p.endDate : '（长期）' }}</div>
      <div class="row mt8 gap8">
        <button class="btn btn-ghost flex1" style="min-height:48px" @click="askAbout(p)">💬 问一问</button>
        <button class="btn btn-danger flex1" style="min-height:48px" @click="stop(p)">停用</button>
      </div>
    </div>
    <div class="empty" v-if="!plans.length && loaded"><div class="empty-icon">🗂️</div>还没有用药计划</div>

    <div class="card mt16">
      <div class="card-title">➕ 添加新计划</div>
      <div class="field">
        <label>查找药品</label>
        <div class="row gap8">
          <input class="input flex1" v-model.trim="keyword" placeholder="输入药名，如：阿司匹林" @keyup.enter="doSearch">
          <button class="btn btn-primary" style="min-width:96px" :disabled="busy" @click="doSearch">查找</button>
        </div>
      </div>
      <div v-for="m in results" :key="m.id" class="cand-card" :class="{selected: form.medicationId===m.id}" @click="pickMed(m)">
        <div class="cand-rank">药</div>
        <div class="flex1"><div class="cand-name">{{ m.genericName }}</div>
        <div class="cand-conf">{{ m.brandName || '' }} · {{ m.drugClass }}</div></div>
      </div>
      <template v-if="form.medicationId || form.medName">
        <div class="divider"></div>
        <div style="font-weight:800" class="mb8">已选：{{ form.medName }}</div>
        <div class="field"><label>每次剂量</label>
          <input class="input" v-model.trim="form.doseText" placeholder="如：1片"></div>
        <div class="field"><label>每天服药时间（可多选）</label>
          <div class="time-chips">
            <button v-for="t in timeOptions" :key="t" class="time-chip" :class="{on: form.times.includes(t)}" @click="toggleTime(t)">{{ t }}</button>
          </div>
        </div>
        <button class="btn btn-primary btn-block btn-huge" :disabled="busy" @click="save">保存计划（自动检查冲突）</button>
      </template>
    </div>

    <div v-if="warnings.length">
      <div class="card-title">⚠️ 冲突提醒</div>
      <div v-for="w in warnings" :key="w.ruleCode" class="conflict-item" :class="w.riskLevel">
        <div class="conflict-head">{{ drugNames(w) }} <span class="risk-tag" :class="w.riskLevel">{{ riskCn(w.riskLevel) }}</span></div>
        <div class="mt8">{{ w.explanation }}</div>
        <div class="conflict-basis">依据：{{ w.basisSource }}</div>
      </div>
    </div>
  </div>
</div>`,
  data() {
    return {
      plans: [], loaded: false, keyword: '', results: [], busy: false, warnings: [],
      timeOptions: ['08:00', '12:00', '18:00', '20:00'],
      form: { medicationId: null, medName: '', doseText: '1片', times: ['08:00'] },
      proxy: null
    };
  },
  computed: {
    qs() { return this.proxy ? ('?elderId=' + this.proxy.id) : ''; }
  },
  methods: {
    go: navigate, riskCn: r => RISK_CN[r] || r,
    exitProxy() { try { sessionStorage.removeItem('mg_plan_elder'); } catch (e) { } this.proxy = null; this.load(); },
    drugNames(c) { return (c.drugs && c.drugs.length ? c.drugs.join(' × ') : [c.drugA, c.drugB].filter(Boolean).join(' × ')) || '在用药'; },
    async load() { try { this.plans = await api('/api/plans' + this.qs); } catch (e) { toast(e.message, 'err'); } this.loaded = true; },
    async doSearch() {
      if (!this.keyword) return toast('请输入药名', 'warn');
      this.busy = true;
      try { const d = await api('/api/medications?keyword=' + encodeURIComponent(this.keyword) + '&size=8'); this.results = d.records || []; }
      catch (e) { toast(e.message, 'err'); } finally { this.busy = false; }
    },
    pickMed(m) { this.form.medicationId = m.id; this.form.medName = m.genericName; },
    toggleTime(t) {
      const i = this.form.times.indexOf(t);
      if (i >= 0) { if (this.form.times.length > 1) this.form.times.splice(i, 1); else toast('至少保留一个时间点', 'warn'); }
      else this.form.times.push(t);
      this.form.times.sort();
    },
    async save() {
      this.busy = true;
      try {
        const d = await api('/api/plans', { method: 'POST', body: Object.assign({}, this.form, this.proxy ? { elderId: this.proxy.id } : {}) });
        this.warnings = d.conflictWarnings || [];
        toast('计划已保存', 'ok');
        this.form = { medicationId: null, medName: '', doseText: '1片', times: ['08:00'] };
        this.keyword = ''; this.results = [];
        await this.load();
      } catch (e) { toast(e.message, 'err'); } finally { this.busy = false; }
    },
    async stop(p) {
      if (!confirm('确定停用「' + p.medName + '」吗？停用后今日任务会消失。')) return;
      try { await api('/api/plans/' + p.id + '/stop' + this.qs, { method: 'POST' }); toast('已停用', 'ok'); this.load(); }
      catch (e) { toast(e.message, 'err'); }
    },
    askAbout(p) {
      navigate('qa', p.medicationId ? { med: p.medicationId, q: p.medName.split('(')[0] + '怎么吃，有什么要注意的' } : { q: p.medName + '怎么吃，有什么要注意的' });
    }
  },
  mounted() {
    try { const s = sessionStorage.getItem('mg_plan_elder'); this.proxy = s ? JSON.parse(s) : null; } catch (e) { this.proxy = null; }
    if (this.proxy && (store.user || {}).role !== 'FAMILY') this.proxy = null;  // 仅家属账号进入代办态
    this.load();
    if (store.route.params.med) { this.form.medicationId = Number(store.route.params.med); }
  }
};

/* ================= 用药记录 ================= */
PAGES.records = {
  template: `
<div class="page no-tab">
  <div class="header">
    <button class="back-btn" @click="go('home')">←</button>
    <div class="title">📖 用药记录</div>
    <button class="head-action" @click="speakSummary">🔊 播报</button>
  </div>
  <div class="content page-enter">
    <div class="card">
      <div class="card-title">近{{ days }}天依从情况</div>
      <div class="stat-row">
        <div class="big-stat"><div class="num" style="color:var(--ok)">{{ adh.adherenceRate }}%</div><div class="lbl">依从率</div></div>
        <div class="big-stat"><div class="num">{{ adh.taken }}</div><div class="lbl">按时服用</div></div>
        <div class="big-stat"><div class="num" style="color:var(--danger)">{{ adh.missed }}</div><div class="lbl">漏服</div></div>
      </div>
      <div class="conf-bar mt8"><i :style="{width: (adh.adherenceRate || 0) + '%'}"></i></div>
      <div class="muted small mt8" v-if="streak > 0" style="color:var(--warn,#b45309);font-weight:800">🔥 已连续 {{ streak }} 天无漏服，继续保持！</div>
      <div class="row mt8 gap8">
        <button class="time-chip" :class="{on: days===7}" @click="setDays(7)">近7天</button>
        <button class="time-chip" :class="{on: days===30}" @click="setDays(30)">近30天</button>
        <button class="time-chip" :class="{on: days===90}" @click="setDays(90)">近90天</button>
      </div>
    </div>

    <div v-for="g in groups" :key="g.date" class="day-group">
      <div class="day-label">📅 {{ g.date }}（{{ g.weekday }}）
        <button class="speak-btn" style="margin:0 0 0 auto" @click="speakDay(g)">🔊 朗读这天</button>
      </div>
      <div v-for="r in g.items" :key="r.id" class="rec-item">
        <span class="rec-dot" :class="r.status"></span>
        <div class="flex1">
          <b>{{ r.medName }}</b>
          <div class="muted small">计划 {{ fmtHM(r.scheduledAt) }} · {{ statusCn(r.status) }}{{ r.checkedAt ? ' · 实际 ' + fmtHM(r.checkedAt) : '' }}</div>
        </div>
        <button class="speak-btn" style="margin:0" @click="speakOne(r)">🔊</button>
      </div>
    </div>
    <div class="empty" v-if="!groups.length && loaded"><div class="empty-icon">📖</div>暂无记录</div>
  </div>
</div>`,
  data() { return { days: 30, list: [], adh: {}, loaded: false }; },
  computed: {
    groups() {
      const map = {};
      for (const r of this.list) {
        const d = String(r.scheduledAt).slice(0, 10);
        (map[d] = map[d] || []).push(r);
      }
      return Object.entries(map).map(([date, items]) => ({
        date, weekday: '周' + WEEK_CN[new Date(date.replace(/-/g, '/')).getDay()], items
      }));
    },
    streak() {
      // 从今天往回数：当天有漏服(MISSED)即中断；当天全部按时/延迟服用 +1；当天无任务跳过
      const byDay = {};
      for (const r of this.list) {
        const d = String(r.scheduledAt).slice(0, 10);
        byDay[d] = byDay[d] || { t: 0, m: 0 };
        if (r.status === 'MISSED') byDay[d].m++; else if (r.status === 'TAKEN' || r.status === 'LATE') byDay[d].t++;
      }
      let s = 0;
      const cur = new Date();
      for (let i = 0; i < 120; i++) {
        const key = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
        const rec = byDay[key];
        if (rec) {
          if (rec.m > 0) break;
          if (rec.t > 0) s++; else break;
        }
        cur.setDate(cur.getDate() - 1);
      }
      return s;
    }
  },
  methods: {
    go: navigate, fmtHM, statusCn: s => STATUS_CN[s] || s,
    async load() {
      this.loaded = false;
      try {
        this.list = await api('/api/checkins/history?days=' + this.days);
        this.adh = await api('/api/stats/adherence?days=' + this.days);
      } catch (e) { toast(e.message, 'err'); }
      this.loaded = true;
    },
    setDays(d) { this.days = d; this.load(); },
    speakOne(r) { speak(r.medName + '，计划' + fmtHM(r.scheduledAt) + '服用，' + STATUS_CN[r.status] + (r.checkedAt ? '，实际' + fmtHM(r.checkedAt) + '打卡' : '')); },
    speakDay(g) {
      const t = g.items.map(r => r.medName + STATUS_CN[r.status]).join('，');
      speak(g.date + '的用药记录：' + t);
    },
    speakSummary() {
      speak('近' + this.days + '天用药情况：依从率百分之' + this.adh.adherenceRate + '，按时服用' + this.adh.taken + '次，延迟' + this.adh.late + '次，漏服' + this.adh.missed + '次。');
    }
  },
  mounted() { this.load(); }
};

/* ================= 药品详情 ================= */
PAGES.med = {
  template: `
<div class="page no-tab" v-if="m">
  <div class="header">
    <button class="back-btn" @click="back">←</button>
    <div class="title">{{ m.genericName }}</div>
    <button class="head-action" @click="speakAll">🔊 朗读全部</button>
  </div>
  <div class="content page-enter">
    <div class="card">
      <div style="font-size:calc(var(--font-base) + 4px);font-weight:800">{{ m.genericName }}</div>
      <div class="muted" v-if="m.brandName">商品名：{{ m.brandName }}</div>
      <div class="mt8">
        <span class="tag" v-for="ing in ingredients" :key="ing">成分：{{ ing }}</span>
        <span class="tag">{{ m.drugClass }}</span>
      </div>
    </div>

    <div class="med-section" v-for="sec in sections" :key="sec.key">
      <div class="med-sec-head">
        <div class="med-sec-title">{{ sec.icon }} {{ sec.label }}</div>
        <button class="speak-btn" style="margin:0" @click="speakIt(m[sec.key])">🔊 朗读</button>
      </div>
      <div class="med-sec-body">{{ m[sec.key] }}</div>
    </div>

    <div class="med-sec-body muted small">📚 知识来源：{{ m.source || '药品说明书（国家药监局批准文本摘要）' }}<br>⚠️ 本平台内容仅供科普参考，具体用药请遵医嘱。</div>

    <div class="row mt16 gap8">
      <button class="btn btn-outline flex1" @click="ask">💬 问这个药</button>
      <button class="btn btn-primary flex1" @click="addPlan">➕ 加入用药计划</button>
    </div>
  </div>
</div>
<div class="page no-tab" v-else>
  <div class="header"><button class="back-btn" @click="back">←</button><div class="title">药品详情</div></div>
  <div class="content">
    <div v-if="failed" class="empty">
      <div class="empty-icon">😕</div>药品信息加载失败<br><span class="muted small">可能是网络或服务暂时不可用</span>
      <button class="btn btn-primary mt16" @click="reload">🔄 重新加载</button>
    </div>
    <div v-else class="empty loading-dots">加载中</div>
  </div>
</div>`,
  data() {
    return {
      m: null, failed: false,
      sections: [
        { key: 'indications', label: '适应症（治什么）', icon: '🎯' },
        { key: 'dosage', label: '用法用量（怎么吃）', icon: '🥄' },
        { key: 'contraindications', label: '禁忌（谁不能吃）', icon: '⛔' },
        { key: 'precautions', label: '注意事项', icon: '⚠️' },
        { key: 'adverseReactions', label: '不良反应', icon: '🌡️' },
        { key: 'storage', label: '贮藏方法', icon: '📦' }
      ]
    };
  },
  computed: { ingredients() { return (this.m && this.m.ingredients ? String(this.m.ingredients).split(',') : []).filter(Boolean); } },
  methods: {
    back() { history.length > 1 ? history.back() : navigate('search'); },
    speakIt: speak,
    speakAll() {
      if (!this.m) return;
      speak(this.m.genericName + '。' + this.sections.map(s => s.label.replace(/（.*/g, '') + '：' + (this.m[s.key] || '')).join('。'));
    },
    ask() { navigate('qa', { med: this.m.id, q: this.m.genericName + '怎么吃，有什么要注意的' }); },
    addPlan() { navigate('plans', { med: this.m.id }); },
    async reload() {
      this.failed = false;
      try { this.m = await api('/api/medications/' + store.route.params.id); }
      catch (e) { this.failed = true; }
    }
  },
  async mounted() {
    try { this.m = await api('/api/medications/' + store.route.params.id); }
    catch (e) { this.failed = true; toast(e.message, 'err'); }
  }
};

/* ================= 药品查询 ================= */
PAGES.search = {
  template: `
<div class="page no-tab">
  <div class="header">
    <button class="back-btn" @click="go('home')">←</button>
    <div class="title">🔎 药品查询</div>
  </div>
  <div class="content page-enter">
    <div class="card">
      <div class="row gap8">
        <input class="input flex1" v-model.trim="keyword" placeholder="输入药名/成分，如：地平、他汀" @keyup.enter="doSearch(1)">
        <button class="btn btn-primary" style="min-width:96px" @click="doSearch(1)">查询</button>
      </div>
      <div class="quick-chips mt8">
        <button class="quick-chip" v-for="k in hot" :key="k" @click="keyword=k;doSearch(1)">{{ k }}</button>
      </div>
    </div>
    <div v-for="m in records" :key="m.id" class="cand-card" @click="go('med', {id: m.id})">
      <div class="cand-rank">药</div>
      <div class="flex1">
        <div class="cand-name">{{ m.genericName }}</div>
        <div class="cand-conf">{{ m.brandName || '' }} · {{ m.drugClass }}</div>
      </div>
      <div style="font-size:24px;color:var(--ink-2)">›</div>
    </div>
    <div class="empty" v-if="!records.length && searched"><div class="empty-icon">🤔</div>没找到相关药品，换个关键词试试</div>
    <div class="row mt16" v-if="total > records.length">
      <button class="btn btn-ghost flex1" @click="doSearch(page + 1)">加载更多（共{{ total }}条）</button>
    </div>
  </div>
</div>`,
  data() {
    return { keyword: '', records: [], total: 0, page: 1, searched: false, hot: ['阿司匹林', '氨氯地平', '二甲双胍', '他汀', '安眠', '降压', '感冒'] };
  },
  methods: {
    go: navigate,
    async doSearch(page) {
      this.page = page || 1; this.searched = true;
      try {
        const d = await api('/api/medications?keyword=' + encodeURIComponent(this.keyword) + '&page=' + this.page + '&size=20');
        this.records = this.page === 1 ? (d.records || []) : this.records.concat(d.records || []);
        this.total = d.total || 0;
      } catch (e) { toast(e.message, 'err'); }
    }
  },
  mounted() {
    if (store.route.params.kw) { this.keyword = store.route.params.kw; this.doSearch(1); }
    else { this.keyword = ''; this.doSearch(1); }   // 默认展示全部药品库，进页即有内容可浏览
  }
};

/* ================= 家庭协同 ================= */
PAGES.family = {
  template: `
<div class="page no-tab">
  <div class="header">
    <button class="back-btn" @click="go('home')">←</button>
    <div class="title">👨‍👩‍👧 家庭协同</div>
  </div>
  <div class="content page-enter">

    <!-- 老人视图 -->
    <template v-if="isElder">
      <div class="alert-banner remind" v-if="invites.length">
        🔔 有 {{ invites.length }} 位家人申请查看您的用药情况，请在下方处理
      </div>
      <div class="card" v-for="iv in invites" :key="iv.id">
        <div class="card-title">家人申请：{{ iv.familyName }}（{{ iv.familyPhone }}）</div>
        <div class="muted mb8">申请的授权范围：</div>
        <div><span class="tag" v-for="s in iv.scopes" :key="s">{{ scopeCn(s) }}</span></div>
        <div class="consent-box mt8">您可以只同意部分授权，也可以随时撤销。同意后家人只能看到汇总信息，看不到完整明细。</div>
        <div class="row mt16 gap8">
          <button class="btn btn-danger flex1" @click="respond(iv, false)">拒绝</button>
          <button class="btn btn-primary flex1" @click="respond(iv, true)">同意授权</button>
        </div>
      </div>

      <div class="card-title">我的家人（已授权）</div>
      <div class="card" v-for="mb in members" :key="mb.id">
        <div class="row">
          <div class="flex1">
            <b>{{ mb.name }}</b> <span class="tag" v-if="mb.status==='PENDING'">待您确认</span>
            <div class="muted small">{{ mb.phone }}</div>
            <div class="mt8"><span class="tag" v-for="s in mb.scopes" :key="s">{{ scopeCn(s) }}</span></div>
          </div>
          <button class="btn btn-danger" style="min-height:48px" v-if="mb.status==='APPROVED'" @click="revoke(mb)">撤销授权</button>
        </div>
      </div>
      <div class="empty" v-if="!members.length && !invites.length && loaded"><div class="empty-icon">👨‍👩‍👧</div>暂无家人绑定<br><span class="small">让家人在他们的App里发起绑定申请即可</span></div>
    </template>

    <!-- 家属视图 -->
    <template v-else>
      <div class="card">
        <div class="card-title">🔗 绑定老人</div>
        <div class="field">
          <label>老人的注册手机号</label>
          <input class="input" type="tel" inputmode="numeric" maxlength="11" v-model.trim="elderPhone" placeholder="如：13900001111">
        </div>
        <div class="field">
          <label>申请的授权范围（老人确认后才生效）</label>
          <div class="scope-row" v-for="s in allScopes" :key="s">
            <div><div class="scope-name">{{ scopeCn(s) }}</div><div class="scope-desc">{{ scopeDesc(s) }}</div></div>
            <label class="switch"><input type="checkbox" :value="s" v-model="scopes"><span class="slider"></span></label>
          </div>
        </div>
        <button class="btn btn-primary btn-block btn-huge" :disabled="busy" @click="bind">发送绑定申请</button>
        <div class="consent-box mt8">老人同意后您才能查看，且仅限授权范围内；老人可随时撤销，撤销即时生效。</div>
      </div>

      <div class="card-title">我绑定的老人</div>
      <div class="card" v-for="e in elders" :key="e.elderId">
        <div class="row">
          <div class="flex1">
            <b>👴 {{ e.name }}</b>
            <div class="mt8"><span class="tag" v-for="s in e.scopes" :key="s">{{ scopeCn(s) }}</span></div>
          </div>
          <button class="btn btn-ghost" style="min-height:48px" @click="viewSummary(e)">查看汇总</button>
          <button class="btn btn-danger" style="min-height:48px" @click="revokeBind(e)">解除</button>
        </div>
        <div v-if="summaryOf === e.elderId && summary" class="mt16">
          <div class="divider"></div>
          <div class="stat-row">
            <div class="big-stat"><div class="num">{{ summary.todayTaken }}/{{ summary.todayTotal }}</div><div class="lbl">今日已服</div></div>
            <div class="big-stat"><div class="num">{{ summary.medCount }}</div><div class="lbl">在用药物</div></div>
            <div class="big-stat" v-if="summary.adherence7d"><div class="num" style="color:var(--ok)">{{ summary.adherence7d.adherenceRate }}%</div><div class="lbl">近7天依从率</div></div>
          </div>
          <div class="muted mt8" v-if="summary.medBriefs">在用药物（脱敏）：{{ summary.medBriefs.join('、') }}</div>
          <div class="alert-banner danger mt8" v-if="summary.alertLevel==='HIGH'">⚠️ 近7天漏服 {{ summary.missed7d }} 次，请尽快联系老人</div>
        </div>
      </div>
      <div class="empty" v-if="!elders.length && loaded"><div class="empty-icon">🔗</div>还没有绑定老人</div>
    </template>
  </div>
</div>`,
  data() {
    return {
      invites: [], members: [], elders: [], loaded: false, busy: false,
      elderPhone: '', scopes: ['VIEW_SUMMARY', 'RECEIVE_ALERTS'], allScopes: ['VIEW_SUMMARY', 'VIEW_ADHERENCE', 'RECEIVE_ALERTS', 'MANAGE_PLANS'],
      summaryOf: null, summary: null
    };
  },
  computed: { isElder() { return (store.user || {}).role === 'ELDER'; } },
  methods: {
    go: navigate, scopeCn: s => SCOPE_CN[s] || s,
    scopeDesc(s) {
      return { VIEW_SUMMARY: '今日服药进度、在用药物数量（药名脱敏）', VIEW_ADHERENCE: '近7天依从率统计', RECEIVE_ALERTS: '检出用药冲突/漏服时立即收到弹窗提醒', MANAGE_PLANS: '替老人添加/停用用药计划（操作全程留痕，老人可查）' }[s] || '';
    },
    async load() {
      this.loaded = false;
      try {
        if (this.isElder) {
          this.invites = await api('/api/family/invites');
          this.members = (await api('/api/family/members')).filter(m => m.status === 'APPROVED');
        } else {
          this.elders = await api('/api/family/elders');
        }
      } catch (e) { toast(e.message, 'err'); }
      this.loaded = true;
    },
    async respond(iv, approve) {
      try { await api('/api/family/bind/' + iv.id + '/respond', { method: 'POST', body: { approve } }); toast(approve ? '已同意授权' : '已拒绝', 'ok'); this.load(); }
      catch (e) { toast(e.message, 'err'); }
    },
    async revoke(mb) {
      if (!confirm('撤销后 ' + mb.name + ' 将立即无法查看您的用药信息，确定撤销吗？')) return;
      try { await api('/api/family/bind/' + mb.id + '/revoke', { method: 'POST' }); toast('已撤销，即时生效', 'ok'); this.load(); }
      catch (e) { toast(e.message, 'err'); }
    },
    async bind() {
      if (!/^1\d{10}$/.test(this.elderPhone)) return toast('请输入老人注册的11位手机号', 'warn');
      if (!this.scopes.length) return toast('请至少勾选一项授权范围', 'warn');
      this.busy = true;
      try { const d = await api('/api/family/bind', { method: 'POST', body: { elderPhone: this.elderPhone, scopes: this.scopes } }); toast(d.msg || '已发送申请', 'ok'); }
      catch (e) { toast(e.message, 'err'); } finally { this.busy = false; }
    },
    async revokeBind(e) {
      if (!confirm('确定解除与 ' + e.name + ' 的绑定吗？')) return;
      try { await api('/api/family/bind/' + e.bindId + '/revoke', { method: 'POST' }); toast('已解除', 'ok'); this.load(); }
      catch (err) { toast(err.message, 'err'); }
    },
    async viewSummary(e) {
      if (this.summaryOf === e.elderId) { this.summaryOf = null; this.summary = null; return; }
      this.summaryOf = e.elderId; this.summary = null;
      try { const d = await api('/api/family/summary/' + e.elderId); this.summary = d.summary; }
      catch (err) { toast(err.message, 'err'); this.summaryOf = null; }
    }
  },
  mounted() { this.load(); }
};

/* ================= 家属 · 风险提醒收件箱 ================= */
PAGES.alerts = {
  template: `
<div class="page">
  <div class="header">
    <div class="title">🚨 风险提醒</div>
    <button class="head-action" v-if="unread" @click="markAll">全部已读</button>
  </div>
  <div class="content page-enter">
    <div class="alert-banner" :class="connected ? 'safe' : 'remind'" style="margin-top:2px">
      <span v-if="connected">● 实时接收中：老人出现用药冲突风险时，这里会秒级弹出提醒（无需刷新）</span>
      <span v-else>○ 实时通道重连中…当前展示最近拉取的提醒</span>
    </div>
    <div class="quick-chips mb16">
      <button class="quick-chip" :class="{on: filter==='all'}" @click="filter='all'">全部 {{ alerts.length }}</button>
      <button class="quick-chip" :class="{on: filter==='unread'}" @click="filter='unread'">未读 {{ unread }}</button>
      <button class="quick-chip" :class="{on: filter==='HIGH'}" @click="filter='HIGH'">高风险</button>
    </div>
    <div class="live-alerts" v-if="list.length">
      <div class="la-item" :class="[a.level, { unread: !a.readFlag }]" v-for="a in list" :key="a.id" @click="read(a)">
        <div class="la-title">{{ a.title }} <span class="risk-tag" :class="a.level">{{ levelCn(a.level) }}</span></div>
        <div class="la-body">{{ a.content }}</div>
        <div class="la-foot">{{ fmtT(a.createdAt) }} · {{ a.readFlag ? '已读' : '点击标为已读' }}</div>
      </div>
    </div>
    <div class="empty" v-else>
      <div class="empty-icon">🍀</div>
      {{ filter==='all' ? '暂无风险提醒——老人用药平稳时这里很安静' : '没有符合条件的提醒' }}
    </div>
    <div class="consent-box mt16">💡 演示玩法：另开一个窗口登录老人端（13900001111），拍照识药或手动新增一个与在用药冲突的药（如「布洛芬」）并保存 → 本页<b>秒级</b>出现高风险提醒，同时弹窗 + 强震动 + 语音播报。</div>
  </div>
  <TabBar active="alerts" />
</div>`,
  data() { return { filter: 'all' }; },
  computed: {
    alerts() { return familyAlertState.alerts; },
    unread() { return familyAlertState.unread; },
    connected() { return familyAlertState.connected; },
    list() {
      if (this.filter === 'unread') return this.alerts.filter(a => !a.readFlag);
      if (this.filter === 'HIGH') return this.alerts.filter(a => a.level === 'HIGH');
      return this.alerts;
    }
  },
  methods: {
    levelCn: l => RISK_CN[l] || l,
    fmtT(s) { return s ? String(s).replace('T', ' ').slice(5, 16) : ''; },
    read(a) { familyMarkRead(a); },
    async markAll() { await familyMarkAllRead(); toast('已全部标为已读', 'ok'); }
  },
  mounted() { familyConnect(); familyRefresh(); }
};

/* ================= 我的（设置/隐私/注销） ================= */
PAGES.profile = {
  template: `
<div class="page">
  <div class="header"><div class="title">👤 我的</div></div>
  <div class="content page-enter">
    <div class="card">
      <div class="row">
        <div style="font-size:48px">{{ isElder ? '👴' : isFamily ? '👨‍👩‍👧' : '🛠️' }}</div>
        <div class="flex1">
          <div style="font-size:calc(var(--font-base) + 4px);font-weight:800">{{ me.name }}</div>
          <div class="muted">{{ roleCn(me.role) }} · {{ me.phone }}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔠 字体大小（适老化）</div>
      <div class="row gap8">
        <button class="btn flex1" :class="font==='normal' ? 'btn-primary' : 'btn-ghost'" @click="setFont('normal')">标准</button>
        <button class="btn flex1" :class="font==='large' ? 'btn-primary' : 'btn-ghost'" @click="setFont('large')">大</button>
        <button class="btn flex1" :class="font==='xlarge' ? 'btn-primary' : 'btn-ghost'" @click="setFont('xlarge')">特大</button>
      </div>
    </div>

    <div class="card">
      <div class="scope-row" style="border:none;padding:6px 0">
        <div><div class="scope-name">🔊 语音朗读</div><div class="scope-desc">打开后，打卡成功、问答回答等会自动朗读</div></div>
        <label class="switch"><input type="checkbox" v-model="tts" @change="saveTts"><span class="slider"></span></label>
      </div>
      <button class="btn btn-ghost btn-block mt8" style="min-height:48px" @click="speakIt('语音朗读功能已打开，我会把重要信息读给您听')">试听朗读效果</button>
    </div>

    <div class="card">
      <div class="scope-row" style="border:none;padding:6px 0">
        <div><div class="scope-name">📳 震动提醒</div><div class="scope-desc">高危冲突、到点服药时手机震动提醒（iPhone Safari 系统不支持震动，将自动用弹窗+语音代替）</div></div>
        <label class="switch"><input type="checkbox" v-model="buzzEnabled" @change="saveBuzz"><span class="slider"></span></label>
      </div>
    </div>

    <div class="card">
      <div class="scope-row" style="border:none;padding:6px 0">
        <div><div class="scope-name">🩺 健康信息处理单独同意</div><div class="scope-desc">用于AI识别与问答质量改进；可随时撤回，撤回不影响基本功能</div></div>
        <label class="switch"><input type="checkbox" v-model="healthConsent" @change="saveHealth"><span class="slider"></span></label>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔒 隐私与数据</div>
      <div class="muted mb8">· 药品照片即传即删，平台不保存原图</div>
      <div class="muted mb8">· 家属查看须经您逐项授权，可随时撤销</div>
      <div class="muted mb8">· 用药记录保存至注销后30天，之后自动彻底删除</div>
      <div class="muted">· 所有敏感操作均记录审计日志（保存6个月）</div>
    </div>

    <button class="btn btn-danger btn-block" @click="delAccount">🗑️ 注销账号并删除全部数据</button>
    <button class="btn btn-ghost btn-block mt16" @click="doLogout">退出登录</button>

    <div class="center muted small mt16">安心药助手 v1.0 · 智慧养老安全用药辅助平台<br>北方民族大学 大学生创新创业训练计划项目 · 北图科技团队</div>
  </div>
  <TabBar active="profile" />
</div>`,
  data() {
    let bz = true; try { bz = localStorage.getItem('mg_buzz') !== 'off'; } catch (e) { }
    return { me: store.user || {}, font: store.fontLevel, tts: store.ttsOn, buzzEnabled: bz, healthConsent: false, confirming: false };
  },
  computed: {
    isElder() { return this.me.role === 'ELDER'; },
    isFamily() { return this.me.role === 'FAMILY'; }
  },
  methods: {
    go: navigate, speakIt: speak, roleCn: r => ROLE_CN[r] || r,
    setFont(f) { this.font = f; store.fontLevel = f; localStorage.setItem('mg_font', f); applyFont(); },
    saveTts() { store.ttsOn = this.tts; localStorage.setItem('mg_tts', this.tts ? 'on' : 'off'); if (this.tts) speak('语音朗读已打开'); },
    saveBuzz() {
      setBuzzOn(this.buzzEnabled);
      toast(this.buzzEnabled ? '震动提醒已打开' : '震动提醒已关闭', 'ok');
    },
    async saveHealth() {
      try { await api('/api/auth/consent/health', { method: 'POST', body: { agree: this.healthConsent } }); toast(this.healthConsent ? '已同意健康信息处理' : '已撤回同意', 'ok'); }
      catch (e) { toast(e.message, 'err'); this.healthConsent = !this.healthConsent; }
    },
    async delAccount() {
      if (!this.confirming) {
        this.confirming = true;
        toast('数据将在注销后30天彻底删除。3秒内再点一次确认注销', 'warn', 5000);
        setTimeout(() => { this.confirming = false; }, 6000);
        return;
      }
      if (!confirm('最后确认：注销账号将删除您的全部数据（含用药记录、家庭绑定），且不可恢复。确定注销吗？')) { this.confirming = false; return; }
      try { await api('/api/auth/account', { method: 'DELETE' }); toast('账号已注销，数据将在30天后彻底清除', 'ok'); logout(); }
      catch (e) { toast(e.message, 'err'); }
      this.confirming = false;
    },
    doLogout() { logout(); }
  },
  async mounted() {
    try { const d = await api('/api/auth/me'); this.me = d; store.user = d; localStorage.setItem('mg_user', JSON.stringify(d)); this.healthConsent = !!d.healthConsentAt; }
    catch (e) { }
  }
};
