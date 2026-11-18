/* ============================================================
   安心药助手 H5 · 应用入口（根组件 + 路由分发 + 全局 Toast + 角色底栏）
   ============================================================ */
'use strict';

const ToastHost = {
  template: `
<transition name="toast">
  <div v-if="t.show" class="toast" :class="t.type">{{ t.text }}</div>
</transition>`,
  data() { return { t: toastState }; }
};

/* 全局底部导航：按角色渲染不同 tab（家属无"今日用药"，有"风险提醒"+未读红点） */
const TabBar = {
  props: { active: { type: String, default: '' } },
  template: `
<div class="tabbar">
  <button class="tab" :class="{active: active==='home'}" @click="go('home')"><span class="tab-icon">🏠</span>首页</button>
  <button v-if="isFamily" class="tab" :class="{active: active==='alerts'}" @click="go('alerts')">
    <span class="tab-icon">🚨</span>提醒<span class="tab-badge" v-if="unread">{{ unread > 99 ? '99+' : unread }}</span>
  </button>
  <button v-else class="tab" :class="{active: active==='today'}" @click="go('today')"><span class="tab-icon">💊</span>今日用药</button>
  <button class="tab" :class="{active: active==='qa'}" @click="go('qa')"><span class="tab-icon">💬</span>问药</button>
  <button class="tab" :class="{active: active==='profile'}" @click="go('profile')"><span class="tab-icon">👤</span>我的</button>
</div>`,
  computed: {
    isFamily() { return (store.user || {}).role === 'FAMILY'; },
    unread() { return familyAlertState.unread; }
  },
  methods: { go: navigate }
};

const App = {
  components: { ToastHost, TabBar },
  template: `
<div>
  <component :is="pageComp" :key="routeKey" />
  <ToastHost />
</div>`,
  computed: {
    routeKey() { return store.route.path + JSON.stringify(store.route.params); },
    pageComp() {
      const path = store.route.path;
      if (!store.token && path !== 'login') return PAGES.login;
      if (store.token && path === 'login') return PAGES.home;
      return PAGES[path] || PAGES.home;
    }
  }
};

const app = Vue.createApp(App);
app.component('TabBar', TabBar);   // 注册为全局组件，页面模板里直接用 <TabBar active="..."/>
app.mount('#app');

/* 刷新页面后恢复的家属会话：重连 SSE 并拉取收件箱 */
if (store.token && (store.user || {}).role === 'FAMILY') {
  familyConnect();
  familyRefresh();
}
