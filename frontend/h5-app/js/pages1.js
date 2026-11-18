/* ============================================================
   安心药助手 H5 · 页面组件（一）：登录 / 首页 / 拍照识药 / 问药
   ============================================================ */
'use strict';
const PAGES = {};

/* ================= 登录 / 注册 ================= */
PAGES.login = {
  template: `
<div class="login-wrap">
  <div class="login-logo">
    <div class="logo-icon">💊</div>
    <div class="logo-name">安心药助手</div>
    <div class="logo-sub">智慧养老 · 安全用药 · 家人放心</div>
  </div>
  <div class="login-card">
    <div class="seg">
      <button :class="{on: mode==='login'}" @click="mode='login'">登 录</button>
      <button :class="{on: mode==='reg'}" @click="mode='reg'">注 册</button>
    </div>

    <div class="field">
      <label>手机号</label>
      <input class="input" type="tel" inputmode="numeric" maxlength="11" v-model.trim="phone" placeholder="请输入11位手机号">
    </div>
    <div class="field">
      <label>密码</label>
      <input class="input" type="password" v-model="password" placeholder="请输入密码（至少6位）" @keyup.enter="submit">
    </div>

    <template v-if="mode==='reg'">
      <div class="field">
        <label>您的姓名</label>
        <input class="input" type="text" v-model.trim="name" placeholder="如：张桂芳">
      </div>
      <div class="field">
        <label>我是</label>
        <div class="row gap8">
          <button class="btn flex1" :class="role==='ELDER' ? 'btn-primary' : 'btn-ghost'" @click="role='ELDER'">👴 老年人</button>
          <button class="btn flex1" :class="role==='FAMILY' ? 'btn-primary' : 'btn-ghost'" @click="role='FAMILY'">👨‍👩‍👧 家属</button>
        </div>
      </div>
      <div class="field" v-if="role==='ELDER'">
        <label>出生年份（选填，用于适老化提示）</label>
        <input class="input" type="number" inputmode="numeric" v-model.number="birthYear" placeholder="如：1953">
      </div>
      <div class="consent-box mb16">
        <label class="row" style="align-items:flex-start">
          <input type="checkbox" v-model="agree" style="width:24px;height:24px;margin-top:4px;flex:none">
          <span>我已阅读并同意《用户服务协议》与《隐私政策》：药品照片即传即删不保存原图；用药记录保存至注销后30天；家属查看需经我逐项授权，我可随时撤销。</span>
        </label>
      </div>
    </template>

    <button class="btn btn-primary btn-block btn-huge" :disabled="busy" @click="submit">
      {{ busy ? '请稍候…' : (mode==='login' ? '登 录' : '注册并登录') }}
    </button>

    <div class="demo-hint">
      <b>演示账号</b>（密码均为 {{ demoPwd }}）
      <div class="demo-chips">
        <button class="demo-chip elder" @click="quickLogin('13900001111')">👴 老人端<br><small>一键登录 张桂芳</small></button>
        <button class="demo-chip family" @click="quickLogin('13900002222')">👨‍👩‍👧 家属端<br><small>一键登录 张小芳</small></button>
        <button class="demo-chip admin" @click="goAdmin()">🛡️ 管理后台<br><small>admin · 新窗口打开</small></button>
      </div>
    </div>
  </div>
</div>`,
  data() {
    return { mode: 'login', phone: '', password: '', name: '', role: 'ELDER', birthYear: null, agree: false, busy: false, demoPwd: '1234' + '56' };
  },
  methods: {
    fill(phone) { this.mode = 'login'; this.phone = phone; this.password = this.demoPwd; },
    quickLogin(phone) { this.fill(phone); this.submit(); },
    goAdmin() { window.open(location.origin + '/admin/', '_blank'); },
    async submit() {
      if (this.busy) return;
      if (!this.phone || !this.password) return toast('请填写手机号和密码', 'warn');
      if (this.mode === 'reg') {
        if (!/^1\d{10}$/.test(this.phone)) return toast('手机号格式不对，应为11位数字', 'warn');
        if (this.password.length < 6) return toast('密码至少6位', 'warn');
        if (!this.name) return toast('请填写姓名', 'warn');
        if (!this.agree) return toast('请先勾选同意协议', 'warn');
      }
      this.busy = true;
      try {
        const path = this.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const body = this.mode === 'login'
          ? { phone: this.phone, password: this.password }
          : { phone: this.phone, password: this.password, name: this.name, role: this.role, birthYear: this.birthYear || null };
        const d = await api(path, { method: 'POST', body, auth: false });
        setSession(d.token, d.user);
        toast('欢迎，' + d.user.name + '！', 'ok');
        navigate('home');
      } catch (e) { toast(e.message, 'err'); }
      finally { this.busy = false; }
    }
  }
};

/* ================= 首页 ================= */
PAGES.home = {
  template: `
<div class="page">
  <div class="home-hero" :class="{ family: isFamily }">
    <template v-if="isFamily">
      <div class="hello">👨‍👩‍👧 {{ elderNames }}的家属端</div>
      <div class="date">{{ greeting }}，{{ user.name }} · 您正在守护 TA 的用药安全 · 数据经授权并脱敏</div>
    </template>
    <template v-else>
      <div class="hello">{{ greeting }}，{{ user.name }}</div>
      <div class="date">{{ todayStr }} · {{ roleCn }}</div>
    </template>
  </div>

  <template v-if="isElder">
    <div class="content" style="padding-top:6px">
      <!-- 用药风险置顶（安全永远第一） -->
      <div class="alert-banner danger" v-for="c in highConflicts" :key="c.ruleCode || c.explanation" @click="go('today')">
        <span style="font-size:26px">⚠️</span>
        <div class="flex1">用药风险提醒：{{ drugNames(c) }}（{{ riskCn(c.riskLevel) }}）<br>
        <span class="small">点击查看详细说明</span></div>
      </div>

      <!-- ⭐ 主角一：用药提醒大卡（可直接打卡） -->
      <div class="card remind-card">
        <div class="rc-head">
          <div class="card-title" style="margin:0">⏰ 今日用药提醒</div>
          <span class="rc-count">{{ todayTaken }}/{{ checkins.length }} 已完成</span>
        </div>

        <template v-if="nextTask">
          <div class="rc-next">
            <div class="rc-time">{{ fmtHM(nextTask.scheduledAt) }}</div>
            <div class="rc-med">
              <b>{{ nextTask.medName }}</b>
              <div class="small" :class="isOverdue(nextTask) ? 'rc-late' : 'muted'">
                {{ isOverdue(nextTask) ? '⏰ 到时间啦，现在服用' : '还没到时间，到点我会提醒您' }}
              </div>
            </div>
          </div>
          <button class="btn rc-check" :disabled="checking" @click="checkNow(nextTask)">✓ 已 服 药</button>
          <div class="rc-rest" v-if="restTasks.length" @click="go('today')">
            接下来：
            <span class="rc-chip" v-for="t in restTasks.slice(0,3)" :key="t.id">{{ fmtHM(t.scheduledAt) }} {{ t.medName }}</span>
            <span class="rc-chip more" v-if="restTasks.length > 3">+{{ restTasks.length - 3 }}</span>
          </div>
        </template>
        <div v-else-if="checkins.length" class="rc-done">✅ 今天的全部药都吃完啦，真棒！<div class="small muted mt8">近7天依从率 {{ weekRate }}%，继续保持</div></div>
        <div v-else class="rc-done">🗂️ 今天还没有用药任务<div class="small muted mt8">点下方「拍照识药」或「用药计划」添加您的药</div></div>
        <div class="conf-bar mt8" v-if="checkins.length"><i :style="{width: todayProgress + '%'}"></i></div>
      </div>

      <!-- ⭐ 主角二：拍照识药巨幅入口 -->
      <button class="recog-cta" @click="go('recognize')">
        <span class="rcam">📷</span>
        <span class="rtext"><b>拍照识药</b><small>对准药盒拍一张 · 3步完成 · 自动检查药物冲突</small></span>
        <span class="rarrow">›</span>
      </button>

      <!-- 次要功能 -->
      <div class="card mini-stats">
        <div class="stat-row">
          <div class="big-stat"><div class="num">{{ todayTaken }}</div><div class="lbl">已服用</div></div>
          <div class="big-stat"><div class="num" style="color:var(--warn)">{{ todayPending }}</div><div class="lbl">待服用</div></div>
          <div class="big-stat"><div class="num" style="color:var(--ok)">{{ weekRate }}%</div><div class="lbl">近7天依从率</div></div>
        </div>
      </div>
    </div>

    <div class="feature-grid">
      <button class="feature-card" @click="go('today')">
        <div class="fc-icon">💊</div><div class="fc-name">打卡记录</div><div class="fc-desc">今日任务列表</div>
      </button>
      <button class="feature-card" @click="go('qa')">
        <div class="fc-icon">💬</div><div class="fc-name">问药助手</div><div class="fc-desc">有依据的回答</div>
      </button>
      <button class="feature-card" @click="go('family')">
        <div class="fc-icon">👨‍👩‍👧</div><div class="fc-name">我的家人</div><div class="fc-desc">授权与绑定</div>
      </button>
      <button class="feature-card" @click="go('plans')">
        <div class="fc-icon">🗂️</div><div class="fc-name">用药计划</div><div class="fc-desc">管理我的药</div>
      </button>
      <button class="feature-card" @click="go('records')">
        <div class="fc-icon">📖</div><div class="fc-name">用药记录</div><div class="fc-desc">历史可朗读</div>
      </button>
      <button class="feature-card" @click="go('search')">
        <div class="fc-icon">🔎</div><div class="fc-name">药品查询</div><div class="fc-desc">说明书知识</div>
      </button>
    </div>
    <div style="height:20px"></div>
  </template>

  <!-- 家属首页 -->
  <template v-else-if="isFamily">
    <div class="content">
      <!-- 家属守护概览（与老人端完全不同的信息架构） -->
      <div class="card fam-overview">
        <div class="stat-row">
          <div class="big-stat" style="cursor:pointer" @click="go('alerts')">
            <div class="num" :style="{color: unread ? 'var(--danger)' : 'var(--ok)'}">{{ unread }}</div><div class="lbl">未读风险提醒</div>
          </div>
          <div class="big-stat">
            <div class="num">{{ famTaken }}/{{ famTotal }}</div><div class="lbl">老人今日已服</div>
          </div>
          <div class="big-stat">
            <div class="num" :style="{color: alertConnected ? 'var(--ok)' : 'var(--warn)', fontSize: '30px'}">{{ alertConnected ? '●' : '○' }}</div>
            <div class="lbl">{{ alertConnected ? '实时守护中' : '通道重连中' }}</div>
          </div>
        </div>
      </div>
      <!-- 🚨 实时风险提醒：SSE 全局推送，首页展示最近3条 -->
      <div class="live-alerts" v-if="alerts.length">
        <div class="la-head">🚨 实时风险提醒<span class="la-count" v-if="unread">{{ unread }} 条未读</span>
          <button class="la-more" @click="go('alerts')">查看全部 ›</button>
        </div>
        <div class="la-item" :class="[a.level, { unread: !a.readFlag }]" v-for="a in alerts.slice(0, 3)" :key="a.id" @click="readAlert(a)">
          <div class="la-title">{{ a.title }}</div>
          <div class="la-body">{{ a.content }}</div>
          <div class="la-foot">{{ fmtT(a.createdAt) }} · {{ a.readFlag ? '已读' : '点击标为已读' }}</div>
        </div>
      </div>
      <div class="card" v-for="e in elders" :key="e.elderId">
        <div class="card-title">👴 {{ e.name }} <span class="tag">{{ e.scopes.map(s=>scopeCn(s)).join(' · ') }}</span></div>
        <div v-if="summaries[e.elderId]">
          <div class="stat-row">
            <div class="big-stat"><div class="num">{{ summaries[e.elderId].todayTaken }}/{{ summaries[e.elderId].todayTotal }}</div><div class="lbl">今日已服</div></div>
            <div class="big-stat"><div class="num">{{ summaries[e.elderId].medCount }}</div><div class="lbl">在用药物</div></div>
            <div class="big-stat" v-if="summaries[e.elderId].adherence7d"><div class="num" style="color:var(--ok)">{{ summaries[e.elderId].adherence7d.adherenceRate }}%</div><div class="lbl">近7天依从率</div></div>
          </div>
          <div class="alert-banner danger mt8" v-if="summaries[e.elderId].alertLevel==='HIGH'">⚠️ 近7天漏服较多（{{ summaries[e.elderId].missed7d }}次），建议电话关心一下</div>
          <div class="alert-banner remind mt8" v-else-if="summaries[e.elderId].alertLevel==='MEDIUM'">💛 近7天有 {{ summaries[e.elderId].missed7d }} 次漏服，请留意</div>
          <div class="muted mt8" v-if="summaries[e.elderId].medBriefs">在用药物（脱敏）：{{ summaries[e.elderId].medBriefs.join('、') }}</div>
        </div>
        <div v-else class="muted">正在获取汇总…</div>
        <div class="row mt8 gap8" v-if="(e.scopes || []).includes('MANAGE_PLANS')">
          <button class="btn btn-outline flex1" style="min-height:52px" @click="helpPlans(e)">🗂️ 帮TA设置用药计划</button>
        </div>
      </div>
      <div class="empty" v-if="!elders.length && loaded">
        <div class="empty-icon">👨‍👩‍👧</div>
        还没有绑定老人<br><button class="btn btn-primary mt16" @click="go('family')">去绑定老人</button>
      </div>
    </div>
    <div class="fam-tools">
      <div class="fam-tools-title">🧰 家属工具箱</div>
      <button class="fam-tool" @click="go('alerts')">
        <span class="ft-icon">🚨</span>
        <span class="ft-body"><b>风险提醒收件箱</b><small>全部提醒 · 未读筛选 · 一键已读</small></span>
        <span class="ft-badge" v-if="unread">{{ unread > 99 ? '99+' : unread }}</span>
        <span class="ft-arrow">›</span>
      </button>
      <button class="fam-tool" v-if="canManage" @click="helpPlans(elders[0])">
        <span class="ft-icon">🗂️</span>
        <span class="ft-body"><b>代办用药计划</b><small>帮 {{ elders[0].name }} 新增 / 停用用药计划</small></span>
        <span class="ft-arrow">›</span>
      </button>
      <button class="fam-tool" @click="go('family')">
        <span class="ft-icon">🔗</span>
        <span class="ft-body"><b>绑定与授权管理</b><small>申请绑定老人 · 查看授权范围</small></span>
        <span class="ft-arrow">›</span>
      </button>
      <button class="fam-tool" @click="go('qa')">
        <span class="ft-icon">💬</span>
        <span class="ft-body"><b>问药助手</b><small>帮老人问药 · 回答句句带来源</small></span>
        <span class="ft-arrow">›</span>
      </button>
      <button class="fam-tool" @click="go('recognize')">
        <span class="ft-icon">📷</span>
        <span class="ft-body"><b>拍照识药（帮老人）</b><small>拍药盒识别 · 自动核对冲突</small></span>
        <span class="ft-arrow">›</span>
      </button>
      <button class="fam-tool" @click="go('search')">
        <span class="ft-icon">🔎</span>
        <span class="ft-body"><b>药品查询</b><small>144 种老年常用药说明书知识库</small></span>
        <span class="ft-arrow">›</span>
      </button>
    </div>
    <div style="height:20px"></div>
  </template>

  <!-- 管理员首页 -->
  <template v-else>
    <div class="content">
      <div class="card">
        <div class="card-title">🛠️ 管理员入口</div>
        <p class="muted mb16">数据看板、药品知识库维护、规则审核、日志审计请前往管理后台（同域名 /admin/ 路径）。</p>
        <a class="btn btn-primary btn-block" href="/admin/">打开管理后台</a>
      </div>
    </div>
    <div class="feature-grid">
      <button class="feature-card" @click="go('recognize')"><div class="fc-icon">📷</div><div class="fc-name">拍照识药</div><div class="fc-desc">体验用户功能</div></button>
      <button class="feature-card" @click="go('qa')"><div class="fc-icon">💬</div><div class="fc-name">问药助手</div><div class="fc-desc">体验RAG问答</div></button>
    </div>
  </template>

  <TabBar active="home" />
</div>`,
  data() {
    return {
      greeting: greeting(), todayStr: '', checkins: [], conflicts: [], weekRate: 100,
      elders: [], summaries: {}, loaded: false, checking: false
    };
  },
  computed: {
    user() { return store.user || { name: '', role: 'ELDER' }; },
    isElder() { return this.user.role === 'ELDER'; },
    isFamily() { return this.user.role === 'FAMILY'; },
    roleCn() { return ROLE_CN[this.user.role] || ''; },
    todayTaken() { return this.checkins.filter(c => c.status === 'TAKEN' || c.status === 'LATE').length; },
    todayPending() { return this.checkins.filter(c => c.status === 'PENDING').length; },
    todayProgress() {
      if (!this.checkins.length) return 0;
      return Math.round(this.todayTaken * 100 / this.checkins.length);
    },
    nextTask() { return this.pendingTasks[0]; },
    pendingTasks() {
      const now = new Date();
      return this.checkins
        .filter(c => c.status === 'PENDING' && new Date(String(c.scheduledAt).replace(/-/g, '/')) >= new Date(now.getTime() - 60 * 60000))
        .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
    },
    restTasks() { return this.pendingTasks.slice(1); },
    highConflicts() { return this.conflicts.filter(c => c.riskLevel === 'HIGH').slice(0, 2); },
    alerts() { return familyAlertState.alerts; },
    unread() { return familyAlertState.unread; },
    alertConnected() { return familyAlertState.connected; },
    elderNames() { return this.elders.length ? this.elders.map(e => e.name).join('、') : '老人'; },
    canManage() { return this.elders.length && (this.elders[0].scopes || []).includes('MANAGE_PLANS'); },
    famTaken() {
      return Object.values(this.summaries).reduce((a, s) => a + (parseInt(s.todayTaken) || 0), 0);
    },
    famTotal() {
      return Object.values(this.summaries).reduce((a, s) => a + (parseInt(s.todayTotal) || 0), 0);
    }
  },
  methods: {
    go: navigate, fmtHM, riskCn: r => RISK_CN[r] || r, scopeCn: s => SCOPE_CN[s] || s,
    fmtT(s) { return s ? String(s).slice(5, 16) : ''; },
    helpPlans(e) {
      try { sessionStorage.setItem('mg_plan_elder', JSON.stringify({ id: e.elderId, name: e.name })); } catch (err) { }
      navigate('plans');
    },
    readAlert(a) { familyMarkRead(a); },
    drugNames(c) { return (c.drugs && c.drugs.length ? c.drugs.join(' × ') : [c.drugA, c.drugB].filter(Boolean).join(' × ')) || '在用药'; },
    isOverdue(t) { return new Date(String(t.scheduledAt).replace(/-/g, '/')) < new Date(); },
    async checkNow(t) {
      if (this.checking) return;
      this.checking = true;
      try {
        await api('/api/checkins/' + t.id, { method: 'POST' });
        toast(t.medName + ' 打卡成功，真棒！', 'ok');
        buzz(60);
        await this.load();
      } catch (e) { toast(e.message || '打卡失败', 'err'); }
      this.checking = false;
    },
    async load() {
      const d = new Date();
      this.todayStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + WEEK_CN[d.getDay()];
      if (this.isElder) {
        try { this.checkins = await api('/api/checkins/today'); } catch (e) { }
        try {
          const a = await api('/api/stats/adherence?days=7');
          this.weekRate = a.adherenceRate;
        } catch (e) { }
        try { this.conflicts = await api('/api/conflict/check', { method: 'POST' }); } catch (e) { }
        if (this.highConflicts.length) { buzz([300, 120, 300]); }   // 老人端高危冲突：进入页面即震动
        else if (this.nextTask && this.isOverdue(this.nextTask)) { buzz([250, 120, 250]); }  // 到点未服：双段提醒震动
      } else if (this.isFamily) {
        familyConnect(); familyRefresh();   // 全局SSE守卫 + 收件箱兜底拉取
        try {
          this.elders = await api('/api/family/elders');
          for (const e of this.elders) {
            try {
              const s = await api('/api/family/summary/' + e.elderId);
              this.summaries[e.elderId] = s.summary;
            } catch (err) { this.summaries[e.elderId] = { todayTaken: '-', todayTotal: '-', medCount: '-' }; }
          }
        } catch (e) { toast(e.message, 'err'); }
      }
      this.loaded = true;
    }
  },
  mounted() { this.load(); }
};

/* ================= 拍照识药（≤3步） ================= */
PAGES.recognize = {
  template: `
<div class="page no-tab">
  <div class="header">
    <button class="back-btn" @click="back">←</button>
    <div class="title">📷 拍照识药</div>
  </div>
  <div class="content page-enter">

    <!-- 步骤1：拍照 -->
    <template v-if="step==='idle'">
      <div class="camera-zone" @click="pick(true)">
        <div class="cam-icon">📸</div>
        <div style="font-size:calc(var(--font-base) + 3px);font-weight:800;margin-top:10px">第1步：拍一张药盒照片</div>
        <div class="muted mt8">对准药盒正面（有药名的一面），光线充足</div>
        <button class="btn btn-accent btn-huge mt16" style="pointer-events:none">点击拍照</button>
      </div>
      <div class="row mt16 gap8">
        <button class="btn btn-outline flex1" @click="pick(false)">🖼️ 从相册选择</button>
      </div>
      <div class="row mt16">
        <button class="link-btn" @click="step='manual'">✍️ 识不出来？手动输入药名</button>
      </div>
      <div class="consent-box mt16">🔒 隐私承诺：照片仅用于本次识别，识别完成立即删除，平台不保存原图。</div>
      <input ref="cam" class="hidden-input" type="file" accept="image/*" capture="environment" @change="onFile">
      <input ref="album" class="hidden-input" type="file" accept="image/*" @change="onFile">
    </template>

    <!-- 识别中 -->
    <template v-if="step==='busy'">
      <div class="card center" style="padding:44px 20px">
        <div style="font-size:56px" class="loading-dots">🔎</div>
        <div style="font-weight:800;font-size:calc(var(--font-base) + 2px);margin-top:12px">AI 正在识别</div>
        <div class="muted mt8">检测药盒 → 文字识别 → 与药品知识库匹配</div>
        <img v-if="previewUrl" :src="previewUrl" style="max-width:70%;border-radius:14px;margin-top:16px;border:2px solid var(--line)">
      </div>
    </template>

    <!-- 步骤2：候选确认 -->
    <template v-if="step==='result'">
      <div class="card" v-if="result">
        <div class="muted">识别到文字：{{ (result.ocrText || '（无）').slice(0, 60) }}</div>
        <div class="muted small">字符置信度 {{ Math.round((result.charAccuracyEstimate || 0) * 100) }}% · 用时 {{ result.latencyMs }}ms · 检测模式 {{ result.detect && result.detect.mode }}</div>
      </div>
      <div class="card-title mb8" v-if="candidates.length">第2步：请确认是哪种药（点一下选择）</div>
      <div v-for="(c, i) in candidates" :key="i"
           class="cand-card" :class="{selected: selected === i}" @click="choose(i)">
        <div class="cand-rank">{{ i + 1 }}</div>
        <div class="flex1">
          <div class="cand-name">{{ c.name }}</div>
          <div class="cand-conf" v-if="c.brandName">商品名：{{ c.brandName }}</div>
          <div class="cand-conf">匹配度 {{ Math.round(c.confidence * 100) }}%</div>
          <div class="conf-bar"><i :style="{width: Math.round(c.confidence * 100) + '%'}"></i></div>
        </div>
      </div>
      <div class="alert-banner remind" v-if="result && result.lowConfidence">
        💡 {{ result.hint || '识别把握不大，请仔细核对，或手动输入药名' }}
      </div>
      <div class="row mt16 gap8">
        <button class="btn btn-ghost flex1" @click="reset">📷 重拍</button>
        <button class="btn btn-outline flex1" @click="step='manual'">✍️ 手动输入</button>
      </div>
    </template>

    <!-- 步骤3：加入计划 -->
    <template v-if="step==='plan' && chosen">
      <div class="card">
        <div class="card-title">✅ 第3步：加入用药计划</div>
        <div style="font-weight:800;font-size:calc(var(--font-base) + 2px)">{{ chosen.name }}</div>
        <div class="muted" v-if="chosen.brandName">商品名：{{ chosen.brandName }}</div>
        <div class="field mt16">
          <label>每次剂量</label>
          <input class="input" v-model.trim="doseText" placeholder="如：1片 / 半片 / 1粒">
        </div>
        <div class="field">
          <label>每天服药时间（可多选）</label>
          <div class="time-chips">
            <button v-for="t in timeOptions" :key="t" class="time-chip" :class="{on: times.includes(t)}" @click="toggleTime(t)">{{ t }}</button>
          </div>
          <input class="input mt8" type="time" v-model="customTime">
          <button class="btn btn-ghost mt8" style="min-height:44px" @click="addCustomTime">➕ 添加自定义时间</button>
        </div>
        <button class="btn btn-primary btn-block btn-huge" :disabled="busy" @click="savePlan">
          {{ busy ? '正在保存并检查冲突…' : '保存计划（自动检查用药冲突）' }}
        </button>
      </div>
      <div v-if="warnings.length">
        <div class="card-title">⚠️ 用药冲突提醒</div>
        <div v-for="w in warnings" :key="w.ruleCode" class="conflict-item" :class="w.riskLevel">
          <div class="conflict-head">{{ drugNames(w) }} <span class="risk-tag" :class="w.riskLevel">{{ riskCn(w.riskLevel) }}</span></div>
          <div class="mt8">{{ w.explanation }}</div>
          <div class="conflict-basis">依据：{{ w.basisSource }}</div>
          <button class="speak-btn" @click="speakIt(w.explanation)">🔊 朗读提醒</button>
        </div>
        <div class="consent-box mt8">请尽快把以上提醒告诉医生或药师，由专业人员决定是否调整用药。本平台不能替代医嘱。</div>
      </div>
      <div v-if="saved && !warnings.length" class="card center">
        <div style="font-size:52px">🎉</div>
        <div style="font-weight:800">已加入计划，未发现冲突</div>
        <button class="btn btn-primary mt16" @click="go('today')">去看今日用药</button>
      </div>
      <div v-if="saved && warnings.length" class="row mt16">
        <button class="btn btn-primary flex1" @click="go('today')">完成，去今日用药</button>
      </div>
    </template>

    <!-- 手动输入 -->
    <template v-if="step==='manual'">
      <div class="card">
        <div class="card-title">✍️ 手动输入药名</div>
        <div class="field">
          <input class="input" v-model.trim="keyword" placeholder="输入药名关键词，如：阿司匹林" @keyup.enter="doSearch">
        </div>
        <button class="btn btn-primary btn-block" :disabled="busy" @click="doSearch">🔎 在知识库中查找</button>
      </div>
      <div v-for="m in searchResults" :key="m.id" class="cand-card" @click="chooseManual(m)">
        <div class="cand-rank">药</div>
        <div class="flex1">
          <div class="cand-name">{{ m.genericName }}</div>
          <div class="cand-conf">{{ m.brandName || '' }} · {{ m.drugClass }}</div>
        </div>
      </div>
      <div class="empty" v-if="searched && !searchResults.length">
        <div class="empty-icon">🤔</div>没有找到相关药品<br>请换个关键词，或输入完整药名后直接建计划
      </div>
      <div class="row mt16" v-if="searched && !searchResults.length">
        <button class="btn btn-outline flex1" @click="useRawName">直接用「{{ keyword }}」建计划</button>
      </div>
    </template>
  </div>
</div>`,
  data() {
    return {
      step: 'idle', file: null, previewUrl: '', result: null, selected: -1, chosen: null,
      doseText: '1片', times: ['08:00'], customTime: '', timeOptions: ['08:00', '12:00', '18:00', '20:00'],
      busy: false, saved: false, warnings: [],
      keyword: '', searchResults: [], searched: false
    };
  },
  computed: { candidates() { return (this.result && this.result.candidates) || []; } },
  methods: {
    go: navigate, fmtHM, riskCn: r => RISK_CN[r] || r, speakIt: speak,
    drugNames(c) { return (c.drugs && c.drugs.length ? c.drugs.join(' × ') : [c.drugA, c.drugB].filter(Boolean).join(' × ')) || '在用药'; },
    back() { history.length > 1 ? history.back() : navigate('home'); },
    pick(camera) { this.$refs[camera ? 'cam' : 'album'].click(); },
    async onFile(e) {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      this.step = 'busy';
      try {
        const c = await compressImage(f);
        this.previewUrl = URL.createObjectURL(c.blob);
        const fd = new FormData();
        fd.append('file', c.blob, 'photo.jpg');
        this.result = await api('/api/recognize', { method: 'POST', body: fd });
        this.step = 'result';
        if (this.candidates.length === 1 && this.candidates[0].confidence >= 0.9) this.choose(0);
      } catch (err) {
        toast(err.message, 'err');
        this.step = 'idle';
      }
    },
    async choose(i) {
      this.selected = i;
      const c = this.candidates[i];
      this.chosen = { name: c.name, brandName: c.brandName || '', medicationId: c.medicationId || null };
      if (this.result && this.result.logId && c.medicationId) {
        try { await api('/api/recognize/' + this.result.logId + '/confirm', { method: 'POST', body: { medicationId: c.medicationId } }); } catch (e) { }
      }
      this.step = 'plan';
    },
    toggleTime(t) {
      const i = this.times.indexOf(t);
      if (i >= 0) { if (this.times.length > 1) this.times.splice(i, 1); else toast('至少保留一个时间点', 'warn'); }
      else this.times.push(t);
      this.times.sort();
    },
    addCustomTime() {
      if (!this.customTime) return toast('请先选择时间', 'warn');
      if (!this.times.includes(this.customTime)) this.times.push(this.customTime);
      this.times.sort();
      this.customTime = '';
    },
    async savePlan() {
      if (!this.times.length) return toast('请至少选择一个时间点', 'warn');
      this.busy = true;
      try {
        const d = await api('/api/plans', {
          method: 'POST',
          body: { medicationId: this.chosen.medicationId, medName: this.chosen.name, doseText: this.doseText, times: this.times }
        });
        this.warnings = d.conflictWarnings || [];
        if (this.warnings.some(w => w.riskLevel === 'HIGH')) buzz([350, 150, 350]);      // 高危：长三段
        else if (this.warnings.length) buzz([180, 100, 180]);                            // 中低危：双段
        else buzz(60);                                                                   // 安全：轻一下
        this.saved = true;
        toast('已加入今日用药计划', 'ok');
        if (store.ttsOn) speak(this.warnings.length ? '计划已保存，但发现用药冲突提醒，请仔细查看' : '计划已保存，未发现冲突');
      } catch (e) { toast(e.message, 'err'); }
      finally { this.busy = false; }
    },
    reset() {
      this.step = 'idle'; this.result = null; this.selected = -1; this.chosen = null;
      this.saved = false; this.warnings = []; this.searched = false; this.searchResults = [];
      if (this.previewUrl) { URL.revokeObjectURL(this.previewUrl); this.previewUrl = ''; }
    },
    async doSearch() {
      if (!this.keyword) return toast('请输入药名关键词', 'warn');
      this.busy = true; this.searched = true;
      try {
        const d = await api('/api/medications?keyword=' + encodeURIComponent(this.keyword) + '&size=10');
        this.searchResults = d.records || [];
      } catch (e) { toast(e.message, 'err'); }
      finally { this.busy = false; }
    },
    chooseManual(m) {
      this.chosen = { name: m.genericName, brandName: m.brandName || '', medicationId: m.id };
      this.saved = false; this.warnings = [];
      this.step = 'plan';
    },
    useRawName() {
      this.chosen = { name: this.keyword, brandName: '', medicationId: null };
      this.saved = false; this.warnings = [];
      this.step = 'plan';
    }
  }
};

/* ================= 问药助手（RAG 循证问答） ================= */
PAGES.qa = {
  template: `
<div class="page no-tab">
  <div class="header">
    <button class="back-btn" @click="back">←</button>
    <div class="title">💬 问药助手</div>
    <button class="head-action" @click="clear" v-if="msgs.length > 1">清空</button>
  </div>
  <div class="content page-enter" :style="{paddingBottom: '96px'}">
    <div class="consent-box mb16" v-if="msgs.length <= 1">
      🔎 <b>回答如何产生（RAG 检索增强生成）：</b><br>
      ① 在药品说明书 + 冲突规则 + 老年科普知识库中做<b>向量语义 + 关键词混合检索</b>；② 取相关度最高的原文片段；③ 大模型<b>只准依据这些原文</b>组织回答，逐条标注引用来源；④ 检索置信不足时<b>明确拒答</b>，绝不编造。<br>
      每条回答下方可展开「知识库引用」查看原文出处与相关度分。用药调整请务必咨询医生或药师。
    </div>
    <div class="quick-chips" v-if="msgs.length <= 1">
      <button class="quick-chip" v-for="q in quicks" :key="q" @click="ask(q)">{{ q }}</button>
    </div>
    <div class="chat-list">
      <div v-for="(m, i) in msgs" :key="i" class="bubble" :class="[m.role, m.refused ? 'refused' : '']">
        <template v-if="m.role==='bot'">
          <div>{{ m.text }}</div>
          <div class="rag-panel" v-if="m.sources && m.sources.length">
            <div class="rag-head" @click="m.open = !m.open">
              📚 知识库引用 {{ m.sources.length }} 条 · 混合检索 Top{{ m.sources.length }}
              <span class="rag-toggle">{{ m.open ? '收起 ▴' : '展开原文 ▾' }}</span>
            </div>
            <div class="rag-list" v-if="m.open">
              <div class="rag-src" v-for="s in m.sources" :key="s.index">
                <div class="rag-src-t"><b>[来源{{ s.index }}] {{ s.title }}</b><span class="rag-score" v-if="s.score != null">相关度 {{ s.score }}</span></div>
                <div class="rag-src-m" v-if="s.section || s.source">{{ s.section }}<template v-if="s.section && s.source"> · 出自 </template>{{ s.source }}</div>
                <div class="rag-src-x">{{ (s.text || '').slice(0, 130) }}{{ (s.text || '').length > 130 ? '…' : '' }}</div>
              </div>
            </div>
          </div>
          <div class="row mt8 gap8">
            <button class="speak-btn" @click="speakIt(m.text)">🔊 朗读回答</button>
            <span class="muted small" v-if="m.mode">[{{ modeCn(m.mode) }} · 置信度{{ Math.round((m.confidence || 0) * 100) }}%<template v-if="m.corpusChunks"> · 知识库{{ m.corpusChunks }}片段</template> · {{ m.latencyMs }}ms]</span>
          </div>
        </template>
        <template v-else>{{ m.text }}</template>
      </div>
      <div v-if="busy" class="bubble bot loading-dots">正在查询知识库</div>
      <div ref="tail"></div>
    </div>
  </div>
  <div class="chat-inputbar">
    <input class="input" v-model.trim="input" placeholder="输入用药问题…" @keyup.enter="send" :disabled="busy">
    <button class="btn btn-primary" style="min-width:88px" :disabled="busy || !input" @click="send">发送</button>
  </div>
</div>`,
  data() {
    return {
      input: '', busy: false, medicationId: null,
      msgs: [{ role: 'bot', text: '您好！我是问药助手。您可以问我：这个药怎么吃、有什么禁忌、漏服了怎么办、两种药能不能一起吃……我会给出有依据的回答并标注来源。' }],
      quicks: ['阿司匹林肠溶片怎么吃', '二甲双胍有什么禁忌', '漏服了降压药怎么办', '华法林和阿司匹林能一起吃吗', '老人失眠能不能吃安定', '布洛芬和对乙酰氨基酚能同服吗']
    };
  },
  methods: {
    speakIt: speak,
    back() { history.length > 1 ? history.back() : navigate('home'); },
    modeCn(m) {
      return { llm: 'LLM受控生成', extractive: '知识库摘编', 'extractive-fallback': 'LLM失败·知识库摘编', refuse: '无依据拒答', guard: '超出范围', booting: '启动中' }[m] || m;
    },
    clear() { this.msgs = this.msgs.slice(0, 1); },
    ask(q) { this.input = q; this.send(); },
    async send() {
      const q = this.input;
      if (!q || this.busy) return;
      this.input = '';
      this.msgs.push({ role: 'user', text: q });
      this.busy = true;
      try {
        const d = await api('/api/qa', { method: 'POST', body: { question: q, medicationId: this.medicationId } });
        this.msgs.push({
          role: 'bot', text: d.answer, sources: d.sources || [], refused: !!d.refused,
          mode: d.mode, confidence: d.confidence, latencyMs: d.latencyMs,
          corpusChunks: d.corpusChunks, retrievalMs: d.retrievalMs, open: false
        });
        if (d.refused) buzz([140, 80, 140]);   // 拒答/超范围：轻双段提示"此题不答"
        if (store.ttsOn && !d.refused) speak(d.answer);
      } catch (e) {
        this.msgs.push({ role: 'bot', text: '抱歉，服务暂时不可用：' + e.message, refused: true });
      } finally {
        this.busy = false;
        this.$nextTick(() => { try { this.$refs.tail.scrollIntoView({ behavior: 'smooth', block: 'end' }); } catch (e) { } });
      }
    }
  },
  mounted() {
    if (store.route.params.med) this.medicationId = Number(store.route.params.med);
    if (store.route.params.q) { this.input = store.route.params.q; this.send(); }
  }
};
