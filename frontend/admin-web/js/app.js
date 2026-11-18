/* ============================================================
   MedGuard 管理后台 · 应用入口（布局 + 路由分发 + 挂载）
   ============================================================ */
'use strict';

const MENUS = [
  { group: '总览' },
  { path: 'dashboard', icon: '📊', label: '数据仪表盘' },
  { group: '运营维护' },
  { path: 'users', icon: '👥', label: '用户与权限' },
  { path: 'meds', icon: '💊', label: '药品知识库' },
  { path: 'rules', icon: '⚖️', label: '冲突规则库' },
  { group: '安全合规' },
  { path: 'logs', icon: '🧾', label: '日志审计' },
];

const TITLES = { dashboard: '数据仪表盘', users: '用户与权限管理', meds: '药品知识库维护', rules: '冲突规则库（含药师审核流）', logs: '日志审计（识别 / 问答 / 操作）' };

const AdminApp = {
  template: `
<div v-if="!store.token" class="admin-login-wrap">
  <component :is="pageComp" :key="'login'"></component>
</div>
<div v-else class="admin-layout">
  <aside class="admin-sidebar">
    <div class="admin-logo">
      <div class="logo-icon">💊</div>
      <div class="logo-text"><b>MedGuard</b><span>智慧养老安全用药平台</span></div>
    </div>
    <nav class="admin-menu">
      <template v-for="m in menus" :key="m.path || m.group">
        <div v-if="m.group" class="menu-group">{{ m.group }}</div>
        <a v-else class="menu-item" :class="{active: route.path === m.path}" href="javascript:;" @click="go(m.path)">
          <span class="mi-icon">{{ m.icon }}</span>{{ m.label }}
        </a>
      </template>
    </nav>
    <div class="admin-side-foot">v1.0 · 北图科技<br>北方民族大学 大创项目</div>
  </aside>
  <div class="admin-main">
    <header class="admin-header">
      <div class="crumb">{{ title }}</div>
      <div class="spacer"></div>
      <div class="who">
        <el-tag size="small" type="warning" effect="light">管理员</el-tag>
        {{ store.user ? store.user.name : '' }}
        <el-button size="small" @click="openH5" plain>打开用户端H5</el-button>
        <el-button size="small" type="danger" plain @click="doLogout">退出</el-button>
      </div>
    </header>
    <main class="admin-body">
      <component :is="pageComp" :key="route.path"></component>
    </main>
  </div>
</div>`,
  data() { return { store, menus: MENUS }; },
  computed: {
    route() { return store.route; },
    title() { return TITLES[this.route.path] || '管理后台'; },
    pageComp() {
      if (!store.token) return ADMIN_PAGES.login;
      return ADMIN_PAGES[this.route.path] || ADMIN_PAGES.dashboard;
    }
  },
  methods: {
    go: navigate,
    openH5() { window.open('/h5/', '_blank'); },
    doLogout() { adminLogout(); }
  }
};

const adminApp = Vue.createApp(AdminApp);
adminApp.use(ElementPlus);
if (window.ElementPlusIconsVue) {
  for (const [name, comp] of Object.entries(ElementPlusIconsVue)) adminApp.component(name, comp);
}
adminApp.mount('#app');
