/* ============================================================
   MedGuard 管理后台 · 核心层（状态 / API / 路由）
   ============================================================ */
'use strict';

const store = Vue.reactive({
  token: localStorage.getItem('mg_admin_token') || '',
  user: JSON.parse(localStorage.getItem('mg_admin_user') || 'null'),
  route: { path: '', params: {} },
});

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, qs] = h.split('?');
  const params = {};
  (qs || '').split('&').forEach(kv => {
    if (!kv) return;
    const [k, v] = kv.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { path: path || 'dashboard', params };
}
function navigate(path, params) {
  let h = '#/' + path;
  if (params) {
    const qs = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    if (qs) h += '?' + qs;
  }
  location.hash = h;
}
window.addEventListener('hashchange', () => { store.route = parseHash(); });
store.route = parseHash();

async function api(path, { method = 'GET', body = null, auth = true } = {}) {
  const headers = {};
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (auth && store.token) headers['Authorization'] = 'Bearer ' + store.token;
  const res = await fetch(path, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
  let data;
  try { data = await res.json(); } catch (e) { data = { code: res.status, msg: '服务器响应异常(' + res.status + ')' }; }
  if (data.code === 401) {
    if (store.token) adminLogout(false);
    throw Object.assign(new Error(data.msg || '请先登录'), { data });
  }
  if (data.code === 403) throw Object.assign(new Error(data.msg || '需要管理员权限'), { data });
  if (data.code !== 0) throw Object.assign(new Error(data.msg || '请求失败'), { data });
  return data.data;
}

function setAdminSession(token, user) {
  store.token = token; store.user = user;
  localStorage.setItem('mg_admin_token', token);
  localStorage.setItem('mg_admin_user', JSON.stringify(user));
}
function adminLogout(redirect = true) {
  store.token = ''; store.user = null;
  localStorage.removeItem('mg_admin_token');
  localStorage.removeItem('mg_admin_user');
  if (redirect) navigate('login');
}

const ROLE_CN = { ELDER: '老年人', FAMILY: '家属', ADMIN: '管理员' };
const RISK_CN = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' };
const RULE_TYPE_CN = { DUPLICATE_INGREDIENT: '成分重复', CLASS_STACKING: '同类叠加', CONTRAINDICATED: '禁忌配伍', ELDERLY_CAUTION: '老年慎用' };
const REVIEW_CN = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
function fmtTime(t) { return t ? String(t).replace('T', ' ').slice(0, 19) : '-'; }
