/* ============================================================
   安心药助手 H5 · 核心层（存储 / API / 语音朗读 / 图片压缩 / 路由）
   技术栈：Vue 3（全局构建）+ 原生 Web Speech API + Canvas 压缩
   ============================================================ */
'use strict';

/* ---------------- 全局状态（简单响应式 store） ---------------- */
const store = Vue.reactive({
  token: localStorage.getItem('mg_token') || '',
  user: JSON.parse(localStorage.getItem('mg_user') || 'null'),
  fontLevel: localStorage.getItem('mg_font') || 'normal', // normal | large | xlarge
  ttsOn: localStorage.getItem('mg_tts') === 'on',   // 默认关闭：进入页面不自动播报，需要的人在「我的」里手动打开
  route: { path: '', params: {} },
});

function applyFont() {
  document.documentElement.setAttribute('data-font', store.fontLevel);
}
applyFont();

/* ---------------- 路由（hash） ---------------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  const params = {};
  (qs || '').split('&').forEach(kv => {
    if (!kv) return;
    const [k, v] = kv.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { path: path || 'home', params };
}
function navigate(path, params) {
  let h = '#/' + path;
  if (params) {
    const qs = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    if (qs) h += '?' + qs;
  }
  location.hash = h;
}
window.addEventListener('hashchange', () => { store.route = parseHash(); window.scrollTo(0, 0); });
store.route = parseHash();

/* ---------------- API 封装 ---------------- */
const API_BASE = ''; // 同源部署：后端静态托管 /h5/**，接口在 /api/**

async function api(path, { method = 'GET', body = null, auth = true, raw = false } = {}) {
  const headers = {};
  if (body !== null && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (auth && store.token) headers['Authorization'] = 'Bearer ' + store.token;
  const opt = { method, headers };
  if (body instanceof FormData) opt.body = body;
  else if (body !== null) opt.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opt);
  if (raw) return res;
  let data;
  try { data = await res.json(); } catch (e) { data = { code: res.status, msg: '服务器响应异常(' + res.status + ')' }; }
  if (data.code === 401) { // 登录失效
    if (store.token) { logout(false); }
    throw Object.assign(new Error(data.msg || '请先登录'), { data });
  }
  if (data.code !== 0) throw Object.assign(new Error(data.msg || '请求失败'), { data });
  return data.data;
}

function setSession(token, user) {
  store.token = token; store.user = user;
  localStorage.setItem('mg_token', token);
  localStorage.setItem('mg_user', JSON.stringify(user));
  familyDisconnect();            // 防串号：先清旧连接
  if ((user || {}).role === 'FAMILY') { familyConnect(); familyRefresh(); }
}
function logout(redirect = true) {
  familyDisconnect();
  store.token = ''; store.user = null;
  localStorage.removeItem('mg_token'); localStorage.removeItem('mg_user');
  window.speechSynthesis && speechSynthesis.cancel();
  if (redirect) navigate('login');
}

/* ---------------- 全局轻提示（无 Element Plus，自绘 toast） ---------------- */
const toastState = Vue.reactive({ show: false, text: '', type: 'info' });
let toastTimer = null;
function toast(text, type = 'info', ms = 2600) {
  toastState.text = text; toastState.type = type; toastState.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastState.show = false; }, ms);
  if (type === 'err') buzz([260, 100, 260]);        // 危险：强震动三段
  else if (type === 'warn') buzz([140, 80, 140]);   // 提醒：双段
}

/* ---------------- 震动提醒（适老化：冲突/告警弹窗同步震动，支持则震） ---------------- */
let buzzOn = (() => { try { return localStorage.getItem('mg_buzz') !== 'off'; } catch (e) { return true; } })();
function setBuzzOn(v) {
  buzzOn = !!v;
  try { localStorage.setItem('mg_buzz', v ? 'on' : 'off'); } catch (e) { }
  if (v) buzz([80, 60, 80]);   // 打开时给一个确认震动
}
function buzz(pattern) {
  try { if (buzzOn && navigator.vibrate) navigator.vibrate(Array.isArray(pattern) ? pattern : 120); } catch (e) { }
}

/* ---------------- 语音朗读（Web Speech API，适老化核心） ---------------- */
let zhVoice = null;
function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /zh[-_]CN/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
  return zhVoice;
}
if (window.speechSynthesis) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text) {
  if (!window.speechSynthesis) { toast('当前浏览器不支持语音朗读', 'warn'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text || '').slice(0, 2000));
  u.lang = 'zh-CN';
  if (zhVoice) u.voice = zhVoice;
  u.rate = 0.9;  // 稍慢，老人易听清
  u.pitch = 1;
  speechSynthesis.speak(u);
}

/* ---------------- 图片压缩（申报书指标：长边≤1280、体积<1MB） ---------------- */
function compressImage(file, maxSide = 1280, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片格式不支持'));
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let quality = 0.88;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        // 逐步降质直到 <1MB
        let guard = 0;
        while (dataUrl.length * 0.75 > maxBytes && quality > 0.3 && guard < 8) {
          quality -= 0.12; guard++;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        const byteStr = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
        resolve({ blob: new Blob([bytes], { type: 'image/jpeg' }), width: w, height: h, quality });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- 小工具 ---------------- */
function fmtTime(iso) {
  if (!iso) return '';
  const s = String(iso).replace('T', ' ');
  return s.length >= 16 ? s.slice(0, 16) : s;
}
function fmtHM(iso) {
  const s = String(iso || '');
  const m = s.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : s.slice(11, 16);
}
function fmtDate(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
const STATUS_CN = { PENDING: '待服药', TAKEN: '已服用', LATE: '延迟服用', MISSED: '已漏服' };
const ROLE_CN = { ELDER: '老年人', FAMILY: '家属', ADMIN: '管理员' };
const SCOPE_CN = { VIEW_SUMMARY: '查看用药概况', VIEW_ADHERENCE: '查看依从性数据', RECEIVE_ALERTS: '接收风险提醒', MANAGE_PLANS: '帮管理用药计划' };
const RISK_CN = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' };
const RULE_TYPE_CN = { DUPLICATE_INGREDIENT: '成分重复', CLASS_STACKING: '同类叠加', CONTRAINDICATED: '禁忌配伍', ELDERLY_CAUTION: '老年慎用' };

/* ---------------- 家属端全局警报守卫 ----------------
   SSE 连接提升为全局单例：登录即连、登出即断、切换页面不断线，
   任何页面上都能实时弹出风险提醒（弹窗+强震动+语音三通道）。 */
const familyAlertState = Vue.reactive({
  alerts: [], unread: 0, es: null, connected: false
});

function familyConnect() {
  const u = store.user || {};
  if (familyAlertState.es || !store.token || u.role !== 'FAMILY' || !window.EventSource) return;
  try {
    const es = new EventSource('/api/family/stream?token=' + encodeURIComponent(store.token));
    familyAlertState.es = es;
    es.addEventListener('hello', () => { familyAlertState.connected = true; });
    es.addEventListener('alert', ev => {
      let a = null; try { a = JSON.parse(ev.data); } catch (err) { return; }
      familyAlertState.alerts.unshift(a);
      familyAlertState.unread++;
      toast('🚨 ' + a.title + '，请尽快联系老人', 'err', 6000);
      buzz([350, 150, 350]);   // 高危级强震动（toast err 已带震动，这里叠加确保触达）
      if (a.level === 'HIGH' && store.ttsOn) speak(a.title + '。' + (a.content || '') + '请尽快与老人确认用药安全。');
    });
    es.onerror = () => { familyAlertState.connected = false; };  // 浏览器 EventSource 自动重连
    es.onopen = () => { familyAlertState.connected = true; };
  } catch (e) { }
}
function familyDisconnect() {
  if (familyAlertState.es) { try { familyAlertState.es.close(); } catch (e) { } }
  familyAlertState.es = null;
  familyAlertState.connected = false;
  familyAlertState.alerts = [];
  familyAlertState.unread = 0;
}
async function familyRefresh() {   // REST 拉取收件箱（首屏加载 / SSE 断线兜底）
  if ((store.user || {}).role !== 'FAMILY') return;
  try {
    const d = await api('/api/family/alerts?limit=50');
    familyAlertState.alerts = d.items || [];
    familyAlertState.unread = d.unread || 0;
  } catch (e) { }
}
async function familyMarkRead(a) {
  if (!a || a.readFlag) return;
  try {
    await api('/api/family/alerts/' + a.id + '/read', { method: 'POST' });
    a.readFlag = 1;
    familyAlertState.unread = Math.max(0, familyAlertState.unread - 1);
  } catch (e) { }
}
async function familyMarkAllRead() {
  const unreads = familyAlertState.alerts.filter(a => !a.readFlag);
  for (const a of unreads) { await familyMarkRead(a); }
}
