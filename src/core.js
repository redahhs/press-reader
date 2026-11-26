/* ============================================================
   core.js — 图标 / 数据层 / 工具 / TTS / 路由 / AI 服务 / SRS
   ============================================================ */
'use strict';

/* ---------- 图标 ---------- */
const ICON_PATHS = {
  lib: '<rect x="3.5" y="5" width="13" height="14" rx="1.5"/><path d="M16.5 8.5h2A1.5 1.5 0 0 1 20 10v7a2 2 0 0 1-2 2h-1.5"/><path d="M6.5 8.5h7M6.5 12h7M6.5 15.5h4.5"/>',
  shelf: '<rect x="3.5" y="4" width="4.2" height="16" rx="1"/><rect x="9.4" y="4" width="4.2" height="16" rx="1"/><path d="M16.1 5.9 19.4 5l2.2 13.1-3.3.9z"/><path d="M3 20.5h17"/>',
  words: '<path d="M12 6c-1.6-1.2-3.8-1.5-6-1v13c2.2-.5 4.4-.2 6 1 1.6-1.2 3.8-1.5 6-1V5c-2.2-.5-4.4-.2-6 1z"/><path d="M12 6v13"/>',
  review: '<rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>',
  gear: '<path d="M4 7h7M17 7h3M4 17h3M13 17h7"/><circle cx="14.5" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeoff: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 4l16 16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.6"/>',
  prev: '<path d="M18 6v12L8.5 12z" fill="currentColor" stroke="none"/><path d="M6 5.5v13"/>',
  next: '<path d="M6 6v12l9.5-6z" fill="currentColor" stroke="none"/><path d="M18 5.5v13"/>',
  sound: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.8a7.6 7.6 0 0 1 0 10.4"/>',
  back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4.5 7h15M9.5 4.5h5M8 7l.8 12h6.4L16 7"/><path d="M10.5 10.5v5M13.5 10.5v5"/>',
  download: '<path d="M12 4v11M7.5 11 12 15.5 16.5 11"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8 12 3.5 16.5 8"/><path d="M5 19.5h14"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  loop: '<path d="M4 12a6 6 0 0 1 6-6h7"/><path d="M14.5 3.5 17 6l-2.5 2.5"/><path d="M20 12a6 6 0 0 1-6 6H7"/><path d="M9.5 20.5 7 18l2.5-2.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 3.5V8h-4.5"/>',
  doc: '<path d="M6 3.5h8L18.5 8v12.5h-13z"/><path d="M13.5 3.5V8H18.5M9 12h6M9 15.5h6"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  stack: '<rect x="3.5" y="7" width="13" height="13" rx="2"/><path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  pen: '<path d="M4 20l4.6-1.1L19 8.5a2.1 2.1 0 0 0-3-3L5.1 15.9z"/><path d="M14.5 6.5l3 3"/>',
  ab: '<path d="M7.5 8.5 4 12l3.5 3.5"/><path d="M16.5 15.5 20 12l-3.5-3.5"/><path d="M4 12h16"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 20 20"/>',
  csv: '<path d="M6 3.5h8L18.5 8v12.5h-13z"/><path d="M13.5 3.5V8H18.5"/><path d="M8.5 13h7M8.5 16.5h5"/>',
  link: '<path d="M10.2 13.8a3.9 3.9 0 0 0 5.6 0l2.6-2.6a3.9 3.9 0 0 0-5.6-5.6l-1.3 1.3"/><path d="M13.8 10.2a3.9 3.9 0 0 0-5.6 0l-2.6 2.6a3.9 3.9 0 0 0 5.6 5.6l1.3-1.3"/>',
  teach: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M10.2 8.2v4.6L14 10.5z"/><path d="M12 16.5V20M8.5 21h7"/>',
  parse: '<circle cx="12" cy="4.6" r="2.1"/><circle cx="6.4" cy="18.6" r="2.1"/><circle cx="17.6" cy="18.6" r="2.1"/><path d="M10.5 6.4 7.5 16.5M13.5 6.4l3 10.1"/>',
};
function ic(name, cls) {
  const d = ICON_PATHS[name];
  if (!d) return '';
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* ---------- 词汇等级 ---------- */
const LEVEL_LABEL = { cet4: 'CET-4', cet6: 'CET-6', ky: '考研', z4: '专四', z8: '专八', toefl: 'TOEFL', ielts: 'IELTS', gre: 'GRE', x: '超纲' };
function normLevel(s) {
  if (!s) return 'x';
  s = String(s).trim().toLowerCase().replace(/[\s_]/g, '');
  if (/cet[-]?4|四级/.test(s)) return 'cet4';
  if (/cet[-]?6|六级/.test(s)) return 'cet6';
  if (/考研|kaoyan/.test(s)) return 'ky';
  if (/专四|tem4/.test(s)) return 'z4';
  if (/专八|tem8/.test(s)) return 'z8';
  if (/toefl|托福/.test(s)) return 'toefl';
  if (/ielts|雅思/.test(s)) return 'ielts';
  if (/gre/.test(s)) return 'gre';
  return 'x';
}
/* 精读目标水平（影响 AI 选词基准） */
const TARGET_LEVELS = [
  { id: 'cet4', label: 'CET-4 / 高考', desc: '高考与四级核心词汇' },
  { id: 'cet6', label: 'CET-6 / 考研', desc: '大学四级词汇' },
  { id: 'adv', label: '专八 / 托福 / 雅思', desc: '大学六级与考研词汇' },
];

/* ---------- 数据层 ---------- */
const LS_KEY = 'pressreader.v1';
const DEFAULT_SETTINGS = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'glm-4.6',
  apiKey: '',
  level: 'cet6',
  theme: 'auto',
  fs: 1,             // 阅读字号 0..3
  fontFamily: 'serif', // 正文字体：serif | sans
  crawlProxy: '',    // 抓取用的本机代理（如 http://127.0.0.1:7890），留空则自动探测
  showTr: 'tap',     // always | tap | hint（只给关键词提示）
  hlWords: true,
  reviewWords: true, // 精读时同时标注 CET-4 / CET-6 大纲内、可能学过但已遗忘的「复习词」
  accent: 'coral',   // 界面主色（与错误/危险红分离）
  readerLayout: 'auto',      // 阅读版式：auto | 手机（immersive 沉浸 / pages 逐段 / big 大字）| 桌面（annotated / desk / classic）
  sentenceMode: false, // 句子解析：打开后每句末尾出现「解析」，点开拆解这一句
  paged: true,       // 经典版式的分页阅读：每页 2–3 段，替代无限滚动
  ttsVoice: '',
  ttsRate: 1,
  ttsRepeat: 1,      // 每句播放遍数：1/2/3/5，0 = 单句无限
};
const Store = { settings: { ...DEFAULT_SETTINGS }, articles: [], words: Object.create(null), log: { reviews: 0 } };

function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.settings) Object.assign(Store.settings, d.settings);
    /* 存量数据也要过一遍 normalizeArticle：备份可能是旧版本写的、写入可能被中断、
       用户也可能手改过 JSON。少一个 words 数组，精读页渲染时就会抛 TypeError，
       而 Router 没有兜底 —— 表现出来就是「点标题没反应」。 */
    if (Array.isArray(d.articles)) {
      let migrated = false;
      Store.articles = d.articles.filter(a => a && typeof a === 'object').map(a => {
        const n = normalizeArticle(a);
        /* 老数据：生词段号是直接信模型给的下标，会落错段。首次加载时按原文重算一次。 */
        if (!n.wordMapV2) { repairWordParagraphs(n); migrated = true; }
        return n;
      });
      if (migrated) save();     // 把 wordMapV2 标记连同修正后的段号一起落盘
    }
    if (d.words && typeof d.words === 'object') {
      Store.words = Object.create(null);
      Object.keys(d.words).forEach(k => { const w = d.words[k]; if (w && w.word) Store.words[k] = w; });
    }
    if (d.log) Store.log = Object.assign(Store.log, d.log);
  } catch (e) { console.warn('load failed', e); }
}
let _saveT, _saveDirty = false;
function save() {
  clearTimeout(_saveT);
  _saveDirty = true;
  _saveT = setTimeout(flushSave, 250);
}
/* 立即落盘。防抖窗口只有 250ms，但用户完全可能在这之后、定时器触发之前关掉标签页
   （「加完词就切走」是最常见的操作），所以 pagehide / 切到后台时必须强行刷一次。 */
function flushSave() {
  clearTimeout(_saveT);
  if (!_saveDirty) return;
  _saveDirty = false;
  try { localStorage.setItem(LS_KEY, JSON.stringify(Store)); }
  catch (e) { toast('⚠ 本地存储空间不足，数据可能未保存'); }
}
addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function normKey(w) { return String(w || '').trim().toLowerCase().replace(/’/g, "'"); }

/* ---------- 通用工具 ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escAttr(s) { return esc(s); }
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  // 底部有固定元素（听力播放条 / 手机底部导航）时把提示抬上去，别压在按钮上
  if (document.querySelector('.listen-ctrl')) t.classList.add('above-ctrl');
  const tb = document.getElementById('tabbar');
  if (tb && getComputedStyle(tb).display !== 'none') t.classList.add('above-tab');
  document.getElementById('layer').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .35s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 380); }, 2300);
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
function fmtDue(ts) {
  const d = ts - Date.now();
  if (d <= 0) return '待复习';
  const day = Math.ceil(d / 864e5);
  if (day <= 1) return '明天';
  return day + ' 天后';
}
function countWords(t) { const m = String(t).trim().match(/[A-Za-z][A-Za-z'’-]*/g); return m ? m.length : 0; }

/* 分页：按段落分组，兼顾「每页 2–3 段」和「单页词数不过载」。
   超长段落独占一页，不硬塞；手机目标词数更小。 */
function buildPages(paragraphs, mobile) {
  const total = paragraphs.reduce((n, p) => n + countWords(p.en), 0);
  const long = total > 2500;                  // 长篇（整期杂志文章）少切几页，避免几十页翻到烦
  const target = mobile ? (long ? 260 : 150) : (long ? 520 : 300);
  const maxParas = mobile ? (long ? 3 : 2) : (long ? 5 : 3);
  const pages = [];
  let cur = [], wc = 0;
  paragraphs.forEach((p, i) => {
    const w = countWords(p.en);
    if (cur.length && (cur.length >= maxParas || wc + w > target * 1.3)) {
      pages.push(cur); cur = []; wc = 0;
    }
    cur.push(i); wc += w;
    if (w >= target * 1.4) { pages.push(cur); cur = []; wc = 0; }
  });
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[0]];
}

/* 分句 / 屈折形式 / 听写差异：见 lib.js（与视图解耦，可被 test/unit.mjs 直接测试） */
function buildHLMap(article) {
  const map = new Map();
  (article.words || []).forEach(e => { wordForms(e).forEach(f => { if (!map.has(f)) map.set(f, e); }); });
  return map;
}
function rxesc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* 手机端长段落：按句子边界切成 35–55 词的小块（不改变原文与段落归属） */
function chunkBySentences(en, target = 46) {
  const sents = splitSentences(en);
  if (sents.length < 3 || countWords(en) < 85) return [en];
  const out = [];
  let cur = '', wc = 0;
  for (const s of sents) {
    cur = cur ? cur + ' ' + s : s;
    wc += countWords(s);
    if (wc >= target) { out.push(cur); cur = ''; wc = 0; }
  }
  if (cur) out.push(cur);
  return out.length > 1 ? out : [en];
}

function renderEnParagraph(en, hlMap, phrases, chunked) {
  if (chunked) {    const cs = chunkBySentences(en);
    if (cs.length > 1) {
      return cs.map(c => `<span class="chunk">${renderEnParagraph(c, hlMap, phrases, false)}</span>`).join(' ');
    }
  }
  let t = esc(en);
  const holds = [];
  (phrases || []).forEach(e => {
    const pats = new Set([e.word, ...(e.forms || [])].map(x => String(x).trim()).filter(Boolean));
    pats.forEach(p => {
      if (!/\s/.test(p)) return;
      const re = new RegExp('\\b' + rxesc(esc(p)) + '\\b', 'gi');
      t = t.replace(re, m => {
        holds.push(`<span class="w vw${e.review ? ' review' : ''} l-${Object.hasOwn(LEVEL_LABEL, e.level) ? e.level : 'x'}" tabindex="0" role="button" data-word="${escAttr(normKey(e.word))}">${m}</span>`);
        return '\u0002' + (holds.length - 1) + '\u0003';
      });
    });
  });
  t = t.replace(/[A-Za-z][A-Za-z'’-]*/g, m => {
    const key = m.toLowerCase().replace(/’/g, "'");
    const e = hlMap.get(key);
    // 标注词给 tabindex：键盘/读屏用户至少要够得着「本篇生词」，普通词仍是鼠标专属（否则每篇多几百个 tab 停靠点）
    if (e) return `<span class="w vw${e.review ? ' review' : ''} l-${Object.hasOwn(LEVEL_LABEL, e.level) ? e.level : 'x'}" tabindex="0" role="button" data-word="${escAttr(key)}">${m}</span>`;
    return `<span class="w" data-word="${escAttr(key)}">${m}</span>`;
  });
  return t.replace(/\u0002(\d+)\u0003/g, (_, i) => holds[+i]);
}

/* 句子解析模式下的段落渲染：按句切，每句包一层 .snt，句尾挂一个「解析」小按钮。
   只在用户主动打开「句子」开关时使用 —— 默认阅读不该被 30 多个小按钮占满。
   注意这里不再做长段分块（chunk）：句子已经是可单独操作的单位了。 */
function renderSentenceBlock(en, hlMap, phrases) {
  const sents = splitSentences(en);
  if (!sents.length) return renderEnParagraph(en, hlMap, phrases, false);
  return sents.map((s, i) =>
    `<span class="snt" data-si="${i}">${renderEnParagraph(s, hlMap, phrases, false)}` +
    `<button class="snt-btn" type="button" data-si="${i}" title="拆解这一句" aria-label="拆解这一句"></button></span>`
  ).join(' ');
}

/* ---------- 主题 ---------- */
/* 主题：只换纸张/墨色，--accent 始终留在暖红系——
   它同时承担「失败 / 危险 / 错误」的语义，换成绿或蓝会让报错看起来像成功。 */
const THEMES = [
  { id: 'paper', name: '纸白', mode: 'light', paper: '#f6f2ea', ink: '#26221c' },
  { id: 'sepia', name: '米黄', mode: 'light', paper: '#f2e8d5', ink: '#3a3226' },
  { id: 'sage',  name: '护眼绿', mode: 'light', paper: '#e9efe5', ink: '#222b21' },
  { id: 'night', name: '夜读', mode: 'dark',  paper: '#191713', ink: '#ece5d6' },
  { id: 'navy',  name: '墨蓝', mode: 'dark',  paper: '#141a23', ink: '#e3e9f1' },
  { id: 'ink',   name: '纯黑', mode: 'dark',  paper: '#0d0d0d', ink: '#e6e6e6' },
];

function resolveTheme(t) {
  if (t === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'paper';
  if (t === 'light') return 'paper';                  // 旧版本存的值
  if (t === 'dark') return 'night';
  return THEMES.some(x => x.id === t) ? t : 'paper';
}

function applyTheme(t) {
  Store.settings.theme = t; save();
  const id = resolveTheme(t);
  const meta = THEMES.find(x => x.id === id) || THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.themeMode = t;
  // 深色主题共用一套「提亮后的等级色」，用 data-dark 统一挂载，避免每个主题写一遍
  if (meta.mode === 'dark') root.dataset.dark = '1'; else delete root.dataset.dark;
  const mt = document.querySelector('meta[name="theme-color"]');
  if (mt) mt.setAttribute('content', meta.paper);
  syncThemeBtn();
}

/* 界面主色：与「错误红」分离后，主色可以自由换色 */
const ACCENTS = [
  { id: 'coral', name: '朱砂', light: '#b5401f', dark: '#e2714d' },
  { id: 'ocean', name: '海蓝', light: '#1f5f9e', dark: '#7fb0dc' },
  { id: 'pine',  name: '松绿', light: '#2f6b55', dark: '#86bda6' },
  { id: 'iris',  name: '藤紫', light: '#6a4f9a', dark: '#b6a0dd' },
  { id: 'teal',  name: '湖青', light: '#1c6f72', dark: '#7cc3c5' },
  { id: 'amber', name: '琥珀', light: '#7d520f', dark: '#d7ad6c' },
];

function applyAccent(id) {
  const a = ACCENTS.find(x => x.id === id) ? id : 'coral';
  Store.settings.accent = a; save();
  const root = document.documentElement;
  if (a === 'coral') delete root.dataset.accent; else root.dataset.accent = a;
}

/* 侧栏底部那个按钮：循环切换六套配色，并显示当前主题名 */
function syncThemeBtn() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  const id = document.documentElement.dataset.theme || 'paper';
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const span = btn.querySelector('span');
  if (span) span.textContent = t.name;
  btn.title = `切换配色（当前：${t.name}）`;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (Store.settings.theme === 'auto') applyTheme('auto');
});

/* ---------- TTS ----------
   Android 外壳里没有 Web Speech API，由原生注入 AndroidTTS 桥（见 android/TtsBridge.java）；
   两条路径对外都是「返回一个在朗读结束时 resolve 的 Promise」。 */
const NATIVE_TTS = (typeof window !== 'undefined' && window.AndroidTTS) ? window.AndroidTTS : null;
const IS_APP = !!NATIVE_TTS;
const _ttsWaiters = new Map();
let _ttsSeq = 0;
if (typeof window !== 'undefined') {
  window.__ttsDone = (id, status) => {
    const cb = _ttsWaiters.get(id);
    if (!cb) return;
    _ttsWaiters.delete(id);
    cb(status === 'end' ? 'end' : status === 'stopped' ? 'stopped' : 'error');
  };
}

const TTS = {
  voices: [], voiceURI: null, unsupported: !NATIVE_TTS && !('speechSynthesis' in window), _cur: null,
  init() {
    if (this.unsupported || NATIVE_TTS) return;
    const load = () => {
      const vs = speechSynthesis.getVoices().filter(v => v.lang && /^en/i.test(v.lang));
      if (vs.length) {
        this.voices = vs;
        if (!this.getVoice()) {
          let v = vs.find(x => x.voiceURI === Store.settings.ttsVoice);
          if (!v) v = this.pickDefault(vs);
          this.voiceURI = v.voiceURI;
        }
      }
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    setTimeout(load, 400);
  },
  pickDefault(vs) {
    const prefs = [/natural.*en-?US/i, /en-?US.*natural/i, /google us english/i, /samantha/i, /microsoft (aria|guy|jenny|emma|christopher)/i, /google uk english/i, /daniel/i, /^en-?US/i, /^en-?GB/i];
    for (const p of prefs) { const v = vs.find(x => p.test(x.name)); if (v) return v; }
    return vs[0];
  },
  getVoice() { return this.voices.find(v => v.voiceURI === this.voiceURI) || null; },
  setVoice(uri) { this.voiceURI = uri; Store.settings.ttsVoice = uri; save(); },
  speak(text, opts = {}) {
    const s = String(text == null ? '' : text);
    if (!s.trim()) return Promise.resolve('empty');
    if (NATIVE_TTS) {
      return new Promise(resolve => {
        const id = 'u' + (++_ttsSeq);
        _ttsWaiters.set(id, resolve);
        try {
          NATIVE_TTS.speak(s, opts.rate != null ? opts.rate : (Store.settings.ttsRate || 1), id);
        } catch (e) {
          _ttsWaiters.delete(id); resolve('error'); return;
        }
        // 兜底：原生若一直不回调，别让 Promise 永远挂着
        setTimeout(() => { if (_ttsWaiters.has(id)) { _ttsWaiters.delete(id); resolve('stopped'); } }, 120000);
      });
    }
    return new Promise(resolve => {
      if (this.unsupported) { resolve('empty'); return; }
      try { speechSynthesis.cancel(); } catch (e) {}
      const u = new SpeechSynthesisUtterance(s);
      const v = this.getVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.rate = opts.rate != null ? opts.rate : (Store.settings.ttsRate || 1);
      u.pitch = 1; u.volume = 1;
      let done = false;
      const fin = r => { if (!done) { done = true; resolve(r); } };
      u.onend = () => fin('end');
      u.onerror = e => fin(e && e.error === 'interrupted' ? 'stopped' : 'error');
      this._cur = u;
      setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) { fin('error'); } }, 50);
    });
  },
  stop() {
    if (NATIVE_TTS) {
      try { NATIVE_TTS.stop(); } catch (e) {}
      _ttsWaiters.forEach(cb => cb('stopped'));
      _ttsWaiters.clear();
      return;
    }
    try { speechSynthesis.cancel(); } catch (e) {}
  },
};

/* ---------- AI 服务 ---------- */
class AIError extends Error {
  constructor(msg, kind) { super(msg); this.kind = kind; }
}
async function apiChat(messages, { temperature = 0.3, timeout = 240000 } = {}) {
  const s = Store.settings;
  if (!s.apiKey) throw new AIError('尚未配置 API Key：请到「设置 → AI 服务」填写后再使用 AI 功能。', 'nokey');
  const url = s.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
      body: JSON.stringify({ model: s.model, messages, temperature, stream: false }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') throw new AIError('请求超时（4 分钟）：文章较长或网络较慢，可重试一次。', 'timeout');
    throw new AIError('无法连接 AI 服务：请检查网络。若网络正常，可能是该服务商不允许浏览器直接调用（CORS 限制），可换一家服务商或使用官方允许直连的地址。', 'network');
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j.error && (j.error.message || j.error.code)) || j.message || ''; } catch (e) {}
    const map = {
      400: '请求被拒绝（400）：多半是模型名写错',
      401: 'API Key 无效或未授权（401）：请检查 Key 是否正确',
      403: '无权调用（403）：Key 可能被禁用或没有该模型权限',
      404: '接口地址或模型不存在（404）：请检查 Base URL 与模型名',
      429: '请求过于频繁或额度不足（429）：稍等片刻再试',
      500: '服务商内部错误（500）：可重试',
      503: '服务暂不可用（503）：可稍后重试',
    };
    throw new AIError((map[res.status] || '请求失败（HTTP ' + res.status + '）') + (detail ? ' —— ' + detail : ''), 'http');
  }
  let data;
  try { data = await res.json(); } catch (e) { throw new AIError('返回内容无法解析：服务商返回了非标准格式。', 'parse'); }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new AIError('AI 未返回内容（可能触发了内容审核，或额度已用尽）。', 'empty');
  return content;
}
function parseJSONLoose(s) {
  let t = String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AIError('AI 返回内容不是 JSON，请重试。', 'json');
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); }
  catch (e) { throw new AIError('AI 返回的 JSON 格式异常，请重试（换一个模型通常可解决）。', 'json'); }
}

const ANALYZE_SYSTEM = (lv, review, budget) => `你是一位资深的外刊英语精读编辑，为中国学习者制作精读材料。用户会提供一篇英文文章（可能来自 The Atlantic、The Economist、The New York Times、The Guardian 等）。你必须严格只输出一个 JSON 对象——禁止 markdown 代码块、禁止任何解释文字。JSON 结构：

{
  "title": "文章英文标题（用户提供了就用用户的）",
  "topic": "中文主题短语，2-8 字，如「注意力经济」",
  "difficulty": "B1|B2|C1|C2 之一（CEFR 难度）",
  "summary_zh": "中文内容概述，2-3 句，讲清核心论点与结论",
  "summary_en": "对应的英文摘要，2-3 句",
  "keyCollocations": [{"en": "文中出现的地道短语搭配", "zh": "中文释义"}],
  "paragraphs": [{"en": "该段完整英文，必须与原文逐字一致，不得改写", "zh": "该段准确流畅的中文翻译"}],
  "words": [
    {
      "word": "词典原形；短语用空格连接（如 carve out）",
      "forms": ["该词在文中实际出现的形式，原样摘录，如 carved"],
      "phonetic": "美式音标，如 /stɪːl/；短语可留空字符串",
      "pos": "词性：v. / n. / adj. / adv. / phr.",
      "level": "CET-4|CET-6|考研|专四|专八|TOEFL|IELTS|GRE|超纲 之一",
      "review": false,
      "meaning_zh": "中文释义，优先给文中之义，多义用「；」分隔",
      "example_en": "含该词的例句：优先摘录原文句子，可截短至 45 词内",
      "example_zh": "例句的中文翻译",
      "paraIndex": 0,
      "collocations": [{"en": "常用搭配", "zh": "搭配含义"}]
    }
  ]
}

要求：
1. paragraphs 按自然段划分、覆盖全文且顺序一致；en 必须逐字保留原文（保留原有拼写与标点），不得改写、缩写或合并；zh 翻译准确自然，长难句拆译得当。
2. 词汇筛选基准：目标读者已完全掌握${lv}。本批收录约 ${budget} 个。基础功能词（make / thing / people / get 一概不收）、人名地名不收。
   - **四六级优先**：只要这个词属于 CET-4 或 CET-6 大纲、且高于读者的掌握基准，就必须收 —— 即使你觉得"读者可能认识"。漏掉一个高频四六级词，比多收一个更糟。
   - **分级要准**：属于四级就标 CET-4，属于六级就标 CET-6，不要因为有难度就一律标成考研 / 专八 / 超纲。只有确实不在四六级大纲内，才往后排。
   - 熟词僻义优先于生僻词：一个认识的词在句中取了不常见的义项，比一个罕见词更值得讲。
3. ${review ? `复习词：除了上面的新词，每段再从文中挑 1-3 个属于 CET-4 或 CET-6 大纲、语境中表意关键、中国学习者通常「学过但容易遗忘」的实词，review 设为 true（level 必须是 CET-4 或 CET-6）。它们不占第 2 条的数量配额，宁少勿多，不要收简单高频词（如 make / thing / people）。其余新词的 review 一律 false。` : `review 一律为 false。`}
4. words 按 paraIndex 升序；paraIndex 是 paragraphs 数组的下标，从 0 开始（第一段就是 0）。keyCollocations 收 3-6 个词组级的地道搭配（如 instant gratification、at the expense of），取文中真实出现的。
5. 每个词的 collocations 给 1-3 个，优先文中出现过的搭配。
6. paragraphs 的条数必须与用户给出的段落数一致，一段对一段，不得省略、合并或新增；顺序与原文相同。
7. summary_zh 的写法（重要）：
   - 不要复述结论，不要用「本文指出 / 作者认为 / 文章强调」开头，也不要写「这启示我们」「由此可见」这类总结句。
   - 它的作用是把读者带进文章：先点出文章在追问的那个具体现象或困惑（一两句，最好带画面或细节），再交代作者的立场往哪儿偏、在哪里留了余地，最后留一个读者读到中段会自己碰上的问题。
   - 语气像一个读完的人在跟你聊，不像论文摘要。可以有一点点判断和疑问，不要通篇陈述句。
   - 不要剧透结尾的最终结论；把"为什么值得读下去"讲出来，而不是把答案先给掉。`;

/* ---------- 新建精读：原文即骨架 ----------
   以前是把用户粘贴的正文整段丢给 AI，再把 AI 返回的 paragraphs 当正文存下来。
   问题有两个：prompt 里限了「只处理前 1800 词」，超长文章的后半段会静默消失；
   模型一旦改写或合并段落，用户看到的就不再是原文，而且原文从来没落过库。
   现在反过来：先把原文切成段落作为骨架（唯一事实来源），AI 只负责回填译文与生词，
   超长自动分批 —— 与内置刊物走完全相同的路径。 */
function splitParagraphs(text) {
  const raw = String(text || '').replace(/\r/g, '');
  let blocks = raw.split(/\n\s*\n+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (blocks.length < 2) {
    /* 复制粘贴经常只剩硬换行、或整篇没有任何空行。
       这时按句子重新拼成每 3 句一段，长文才不会退化成一个巨型段落。 */
    const sents = splitSentences(raw.replace(/\s+/g, ' '));
    blocks = [];
    for (let i = 0; i < sents.length; i += 3) blocks.push(sents.slice(i, i + 3).join(' '));
  }
  return blocks.filter(b => countWords(b) > 0);
}

/* 只建骨架、不调 AI —— 万一后面精读失败，至少能把原文存进文章库。 */
function draftArticle({ title, source, text, level }) {
  const paragraphs = splitParagraphs(text).map(en => ({ en, zh: '' }));
  if (!paragraphs.length) throw new AIError('没有识别到英文段落，请检查粘贴的内容。', 'empty');
  return {
    id: uid(), createdAt: Date.now(),
    title: String(title || '').trim(),
    source: String(source || '').trim() || '外刊',
    topic: '', difficulty: 'C1',
    summary_zh: '', summary_en: '', keyCollocations: [],
    paragraphs, words: [],
    wc: countWords(paragraphs.map(p => p.en).join(' ')),
    level,
  };
}

async function analyzeArticle({ title, source, text, level, budget = 24, timeout = 240000 }) {
  const lv = (TARGET_LEVELS.find(x => x.id === level) || TARGET_LEVELS[1]).desc;
  const user = `【标题】${title || '（无，请根据内容拟定）'}\n【来源】${source || '未注明'}\n【正文】\n${text}`;
  const content = await apiChat([
    { role: 'system', content: ANALYZE_SYSTEM(lv, Store.settings.reviewWords !== false, budget) },
    { role: 'user', content: user },
  ], { temperature: 0.2, timeout });
  const raw = parseJSONLoose(content);
  if (!Array.isArray(raw.paragraphs) || !raw.paragraphs.length || !Array.isArray(raw.words)) {
    throw new AIError('AI 返回的数据缺少 paragraphs 或 words 字段，请重试。', 'json');
  }
  const paragraphs = raw.paragraphs
    .map(p => ({ en: String(p.en || '').trim(), zh: String(p.zh || '').trim() }))
    .filter(p => p.en);
  if (!paragraphs.length) throw new AIError('AI 返回的段落为空，请重试。', 'json');
  const words = raw.words.map(w => ({
    word: String(w.word || '').trim(),
    forms: Array.isArray(w.forms) ? w.forms.map(String) : [],
    phonetic: String(w.phonetic || ''),
    pos: String(w.pos || ''),
    level: normLevel(w.level),
    review: w.review === true,
    meaning_zh: String(w.meaning_zh || ''),
    example_en: String(w.example_en || ''),
    example_zh: String(w.example_zh || ''),
    paraIndex: Math.max(0, Math.min(paragraphs.length - 1, Number(w.paraIndex) || 0)),
    collocations: Array.isArray(w.collocations) ? w.collocations.map(c => ({ en: String(c.en || ''), zh: String(c.zh || '') })).filter(c => c.en) : [],
  })).filter(w => w.word);
  return {
    id: uid(), createdAt: Date.now(),
    title: String(raw.title || title || 'Untitled').trim(),
    source: String(source || raw.source || '外刊').trim() || '外刊',
    topic: String(raw.topic || '').trim(),
    difficulty: /B1|B2|C1|C2/.test(raw.difficulty) ? raw.difficulty : 'B2',
    summary_zh: String(raw.summary_zh || '').trim(),
    summary_en: String(raw.summary_en || '').trim(),
    keyCollocations: Array.isArray(raw.keyCollocations) ? raw.keyCollocations.map(c => ({ en: String(c.en || ''), zh: String(c.zh || '') })).filter(c => c.en) : [],
    paragraphs, words,
    wc: countWords(paragraphs.map(p => p.en).join(' ')),
    level,
  };
}

/* ---------- 可选的本地刊物（离线阅读） ---------- */
function builtinIssues() {
  return (typeof BUILTIN_ISSUES !== 'undefined' && Array.isArray(BUILTIN_ISSUES)) ? BUILTIN_ISSUES : [];
}
function builtinFind(key) {
  for (const iss of builtinIssues()) {
    const item = iss.articles.find(a => a.key === key);
    if (item) return { issue: iss, item };
  }
  return null;
}
/* 把内置文章落进本机文章库（原文模式：无译文、无生词，可先读/可精听） */
function openBuiltin(key) {
  const hit = builtinFind(key);
  if (!hit) { toast('这篇内置文章不存在'); return null; }
  let art = Store.articles.find(a => a.id === key);
  if (!art) {
    const { issue, item } = hit;
    art = {
      id: key, createdAt: Date.now(),
      title: item.title,
      source: issue.source,
      section: item.section || '',
      byline: item.byline || '',
      dek: item.dek || '',
      topic: '',
      difficulty: '',
      summary_zh: '', summary_en: '',
      keyCollocations: [],
      paragraphs: item.paragraphs.map(en => ({ en, zh: '' })),
      words: [],
      wc: item.wc || countWords(item.paragraphs.join(' ')),
      level: Store.settings.level,
      builtin: true,
    };
    Store.articles.unshift(art);
    save();
  }
  return art;
}

/* ---------- 长文分批精读（Atlantic 长文常 3000–6000 词，一次调用装不下） ---------- */
/* 每批的词数与段数上限。段数也设限：一段一句的爬取稿很容易几十段挤在一块，
   模型数不准段数时，译文和生词会一起错位。 */
const ANALYZE_CHUNK_WORDS = 1200;
const ANALYZE_CHUNK_PARAS = 16;
/* 同时跑几批。2 路在大多数服务商的限流内，4 批的等待时间能砍掉一半。 */
const ANALYZE_CONCURRENCY = 2;
function normMatch(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function bestParaIndex(paras, aiText, from, to) {
  const aHead = normMatch(aiText).slice(0, 90);
  if (!aHead) return -1;
  let best = -1, bestScore = 0;
  for (let i = from; i < to; i++) {
    const b = normMatch(paras[i] && paras[i].en);
    if (!b) continue;
    let score;
    if (b.startsWith(aHead) || aHead.startsWith(b.slice(0, 90))) score = 1;
    else {
      const A = new Set(aHead.split(' ').slice(0, 16));
      const B = new Set(b.split(' ').slice(0, 16));
      let inter = 0;
      A.forEach(w => { if (B.has(w)) inter++; });
      score = inter / Math.max(A.size, 1);
    }
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 0.5 ? best : -1;
}

/* ---------- 生词归段 ----------
   模型给的 paraIndex 只当提示：它可能从 1 开始，也可能在段数数错时整体错位。
   可靠的做法是拿「例句 / 词形」回原文里找这个词真正出现在哪一段。 */
function locateWordParagraph(ps, w) {
  const norm = p => (p.n != null ? p.n : (p.n = normMatch(p.en)));
  const ex = normMatch(w && w.example_en);
  if (ex.length >= 12) {
    const head = ex.slice(0, 60);
    for (let k = 0; k < ps.length; k++) {
      if (norm(ps[k]).includes(head)) return ps[k].gi;
    }
  }
  /* wordForms 会把词形变化一起算上：模型给的原形是 carve、原文是 carving 时也能找到 */
  const forms = [...wordForms(w || {})].map(normMatch).filter(Boolean);
  if (forms.length) {
    const hits = [];
    ps.forEach((p, k) => {
      const t = ' ' + norm(p) + ' ';
      if (forms.some(f => t.includes(' ' + f + ' '))) hits.push(k);
    });
    if (hits.length === 1) return ps[hits[0]].gi;
    if (hits.length > 1) {
      const claimed = Math.max(0, Math.min(ps.length - 1, Number(w && w.paraIndex) || 0));
      return ps[hits.includes(claimed) ? claimed : hits[0]].gi;
    }
  }
  return null;
}

/* 译文归段时的「同一段」判断：只比开头 40 个字符，模型偶有轻微改写 */
function sameParagraph(a, b) {
  const na = normMatch(a), nb = normMatch(b);
  if (!na || !nb) return false;
  return nb.startsWith(na.slice(0, 40)) || na.startsWith(nb.slice(0, 40));
}

/* 小并发池：最多同时跑 limit 个任务，结果按输入顺序返回 */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

/* 单批失败重试一次：超时 / 429 / 输出被截断都值得再试。
   Key 没配、正文为空这种重试也没用。 */
async function analyzeChunk(opts) {
  let last;
  for (let i = 0; i < 2; i++) {
    try { return await analyzeArticle(opts); }
    catch (e) {
      last = e;
      if (e && (e.kind === 'nokey' || e.kind === 'empty')) throw e;
      if (i === 0) {
        /* 撞上限流（429）时多等一会儿再试，否则第二次也是 429 */
        const busy = e && /429|频繁|额度/.test(e.message || '');
        await new Promise(r => setTimeout(r, busy ? 2200 : 800));
      }
    }
  }
  throw last;
}

/* 分批时的词量配额：整篇目标 12–48 个，按批数均分。
   以前每批都按「全文 12-40 个」算，三批就是三倍输出 —— 又慢又重复。 */
function analyzeWordBudget(totalWords, nChunks) {
  const target = Math.max(12, Math.min(48, Math.round(totalWords / 150 * 4)));
  return Math.max(4, Math.round(target / Math.max(1, nChunks)));
}

/* 切批规则只写一遍：新建页要用它算「分几批」，分析函数用它真正切 */
function planAnalyzeChunks(paras) {
  const chunks = [];
  let cur = [], curWords = 0;
  (paras || []).forEach((p, i) => {
    const n = countWords((p && p.en) || '');
    if (cur.length && (curWords + n > ANALYZE_CHUNK_WORDS || cur.length >= ANALYZE_CHUNK_PARAS)) {
      chunks.push(cur); cur = []; curWords = 0;
    }
    cur.push(i); curWords += n;
  });
  if (cur.length) chunks.push(cur);
  return chunks;
}
function countAnalyzeChunks(paras) { return planAnalyzeChunks(paras).length; }

async function analyzeFullArticle(art, { onNote } = {}) {
  const paras = art.paragraphs || [];
  if (!paras.some(p => p && p.en)) throw new AIError('这篇没有可分析的正文。', 'empty');

  /* 词数和段数都设上限：一块里塞几十个短段落时模型经常数错段数 —— 译文与生词会一起错位。 */
  const chunks = planAnalyzeChunks(paras);

  const zhOf = new Map();
  const words = [];
  const seen = new Set((art.words || []).map(x => normKey(x.word)));
  const todo = chunks.filter(idx => idx.some(i => !(paras[i] && paras[i].zh)));
  if (!todo.length) return art;        // 全部段落已有译文，无事可做

  const totalWords = countWords(paras.map(p => p.en).join(' '));
  const budget = analyzeWordBudget(totalWords, todo.length);
  let done = 0;
  if (onNote) onNote(`AI 精读中 · 共 ${todo.length} 批 · ${paras.length} 段 / ${totalWords} 词`);

  /* 并行 2 路：4 批串行变 2 批并行，等待时间大致减半。
     单批失败只影响自己，其余译文照常落库，读者可以稍后再补这一批。 */
  const results = await mapLimit(todo, ANALYZE_CONCURRENCY, async (idxs, ci) => {
    const text = idxs.map(i => paras[i].en).join('\n\n');
    const from = idxs[0], to = idxs[idxs.length - 1] + 1;
    try {
      const res = await analyzeChunk({
        title: ci === 0 ? art.title : (art.title || '') + '（续）',
        source: art.source, text, level: art.level || Store.settings.level, budget,
      });
      return { idxs, from, to, res };
    } catch (err) {
      return { idxs, from, to, err };
    } finally {
      done++;
      if (onNote) onNote(`AI 精读中 · 已完成 ${done} / ${todo.length} 批`);
    }
  });

  let meta = null, firstErr = null, ok = 0;
  results.forEach(r => {
    if (r.err) { firstErr = firstErr || r.err; return; }
    ok++;
    if (!meta) meta = r.res;

    const aligned = r.res.paragraphs.length === r.idxs.length;
    r.res.paragraphs.forEach((rp, k) => {
      if (!rp.zh) return;
      const gi = (aligned && sameParagraph(rp.en, paras[r.idxs[k]].en))
        ? r.idxs[k]
        : bestParaIndex(paras, rp.en, r.from, r.to);
      if (gi < 0) return;
      const prev = zhOf.get(gi);
      zhOf.set(gi, prev ? prev + ' ' + rp.zh : rp.zh);
    });

    const chunkPs = r.idxs.map(i => ({ en: paras[i].en, gi: i }));
    r.res.words.forEach(wd => {
      const key = normKey(wd.word);
      if (!key || seen.has(key)) return;
      seen.add(key);
      /* 先按例句/词形回原文定位；实在找不到才用模型给的下标 */
      const found = locateWordParagraph(chunkPs, wd);
      const gi = found != null
        ? found
        : chunkPs[Math.max(0, Math.min(chunkPs.length - 1, wd.paraIndex | 0))].gi;
      words.push(Object.assign({}, wd, { paraIndex: gi }));
    });
  });

  if (!ok) throw firstErr || new AIError('AI 精读失败，请重试。', 'json');

  const mergedParas = paras.map((p, i) => ({ en: p.en, zh: zhOf.get(i) || p.zh || '' }));
  const out = Object.assign({}, art, {
    paragraphs: mergedParas,
    words: (art.words || []).concat(words),
    title: art.title || (meta && meta.title) || '',
    topic: art.topic || (meta && meta.topic) || '',
    difficulty: (meta && meta.difficulty) || art.difficulty || '',
    summary_zh: (meta && meta.summary_zh) || art.summary_zh || '',
    summary_en: (meta && meta.summary_en) || art.summary_en || '',
    keyCollocations: (meta && meta.keyCollocations && meta.keyCollocations.length) ? meta.keyCollocations : (art.keyCollocations || []),
    analyzedAt: Date.now(),
  });
  out.wc = countWords(mergedParas.map(p => p.en).join(' '));
  return out;
}

/* 旧文章的一次性修复：早期版本直接信任模型的 paraIndex，生词会落错段。
   这里按同样的定位规则重算一遍，只在新版本第一次加载时跑。 */
function repairWordParagraphs(art) {
  if (art.wordMapV2) return false;
  art.wordMapV2 = 1;
  const ps = (art.paragraphs || []).map((p, i) => ({ en: p.en, gi: i }));
  if (!ps.length || !Array.isArray(art.words) || !art.words.length) return false;
  let changed = false;
  art.words.forEach(w => {
    const gi = locateWordParagraph(ps, w);
    if (gi != null && gi !== w.paraIndex) { w.paraIndex = gi; changed = true; }
  });
  return changed;
}

const LOOKUP_SYSTEM = `你是英语词典编辑，服务中国学习者。用户给出一个单词或短语及其所在句子。严格只输出 JSON（禁止代码块与解释）：
{"word":"词典原形","phonetic":"美式音标","pos":"词性","level":"CET-4|CET-6|考研|专四|专八|TOEFL|IELTS|GRE|超纲 之一","meaning_zh":"中文释义（优先句中之义，多义用「；」分隔）","example_en":"简明例句（可用原句，20词内）","example_zh":"例句翻译","collocations":[{"en":"常用搭配","zh":"搭配含义"}]}`;
async function lookupWord(word, ctx) {
  const content = await apiChat([
    { role: 'system', content: LOOKUP_SYSTEM },
    { role: 'user', content: `查询：「${word}」\n所在句子：${ctx || '（无）'}` },
  ], { temperature: 0.2, timeout: 60000 });
  const raw = parseJSONLoose(content);
  return {
    word: String(raw.word || word).trim(),
    phonetic: String(raw.phonetic || ''), pos: String(raw.pos || ''),
    level: normLevel(raw.level), meaning_zh: String(raw.meaning_zh || ''),
    example_en: String(raw.example_en || ''), example_zh: String(raw.example_zh || ''),
    collocations: Array.isArray(raw.collocations) ? raw.collocations.map(c => ({ en: String(c.en || ''), zh: String(c.zh || '') })).filter(c => c.en) : [],
  };
}
/* ---------- 长难句解析 ----------
   和「整段翻译」的分工：翻译告诉你这句话是什么意思，这里告诉你它为什么这么写。
   考研/六级的真实痛点在后者 —— 从句套从句、修饰后置、插入语打断主谓。 */
const SNT_SYSTEM = `你是给中国学生讲长难句的老师，不是语法书。用户给出一句英文（可能附所在段落）。严格只输出一个 JSON 对象，禁止代码块与解释：

{
  "gist": "一句话说清这句在讲什么（中文，用大白话，不要出现主语/谓语/定语这类词）",
  "parts": [
    {"en": "从原句照抄的一段（不要改写、不要标点外的增删）", "zh": "这一段在说什么（中文，大白话）", "role": "它在整句里起什么作用（如：先说时间背景 / 举例 / 转折 / 补充说明前面那个人）"}
  ],
  "why_hard": "一句话点破卡在哪（如：中间插了一句题外话，把'谁做了什么'隔开了 30 多个词）",
  "grammar": [{"point": "为什么这里这么写", "note": "一句解释，只在真的影响理解时给"}],
  "rewrite": ["把原句拆成 2–3 个短句的英文，保留原意，不加新信息"],
  "zh": "整句通顺的中文翻译",
  "phrases": [{"en": "值得记的搭配", "zh": "中文"}]
}

写法要求（很重要）：
1. 面向"读不懂"的人，不是面向考试判卷。能用日常说法就不用术语：说"补充说明时间"，不说"时间状语"；说"修饰前面那个名词"，不说"后置定语"。术语最多在括号里带一次。
2. parts 给 2–4 段就够，按原句顺序，覆盖真正需要拆开的地方即可。不要逐词拆，也不要为了凑数把简单句拆碎。
3. role 和 zh 要短，每条不超过 20 字；宁愿少说，也不要堆一串形容词。
4. gist 是给读者的第一个落脚点：先让他知道"这句大概在说什么"，再往下看细节。
5. why_hard 只讲一个原因。如果句子其实不难，就写"结构不复杂，慢一点读就顺了"。
6. grammar 最多 2 条，没有就返回空数组。不要在每条里塞多个概念。
7. rewrite 是给"还是没懂"的人的第二条路：拆短之后，逻辑关系要显出来。
8. zh 要像人话，不要逐词直译。`;

async function parseSentence(sentence, ctx) {
  const s = String(sentence || '').trim();
  if (!s) throw new AIError('没有拿到句子，请重新选择。', 'empty');
  const user = `【本句】\n${s}` + (ctx ? `\n\n【所在段落，仅供理解上下文】\n${String(ctx).slice(0, 1200)}` : '');
  /* 长难句解析只发一句话，但模型偶尔会把 JSON 写坏或超时 —— 自动重试一次，
     比让用户自己点「重试」快得多。 */
  let raw = null, lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await apiChat([
        { role: 'system', content: SNT_SYSTEM },
        { role: 'user', content: user },
      ], { temperature: 0.2, timeout: 90000 });
      raw = parseJSONLoose(content);
      if (raw && (raw.gist || raw.skeleton || Array.isArray(raw.parts) || Array.isArray(raw.chunks))) break;
      raw = null;
      throw new AIError('AI 没给出可用的拆解结果，请重试。', 'json');
    } catch (e) {
      lastErr = e;
      raw = null;
      if (e && e.kind === 'nokey') throw e;
      if (attempt === 0) await new Promise(r => setTimeout(r, 700));
    }
  }
  if (!raw) throw lastErr || new AIError('长难句解析失败，请重试。', 'json');
  const str = v => String(v == null ? '' : v).trim();
  /* 新格式 gist / parts；旧缓存里的 skeleton / chunks 也能读 */
  const parts = (raw.parts || raw.chunks || []).map(c => ({
    en: str(c && c.en),
    zh: str(c && (c.zh !== undefined ? c.zh : c.role)),
    role: str(c && c.role && c.zh !== undefined ? c.role : ''),
  })).filter(c => c.en || c.zh).slice(0, 5);
  return {
    gist: str(raw.gist || raw.skeleton),
    parts,
    grammar: (Array.isArray(raw.grammar) ? raw.grammar : []).map(g => ({ point: str(g && g.point), note: str(g && g.note) })).filter(g => g.point).slice(0, 2),
    why_hard: str(raw.why_hard),
    rewrite: (Array.isArray(raw.rewrite) ? raw.rewrite : []).map(str).filter(Boolean).slice(0, 3),
    zh: str(raw.zh),
    phrases: (Array.isArray(raw.phrases) ? raw.phrases : []).map(p => ({ en: str(p && p.en), zh: str(p && p.zh) })).filter(p => p.en).slice(0, 6),
  };
}

/* ---------- 补标注四六级词 ----------
   精读时模型按「读者大概率不认识」筛词，四六级词常被当成「这个应该会」跳过，
   结果一篇里 CET 词只剩零星几个。这个功能只做一件事：把本篇里属于 CET-4/6
   大纲、却还没标注的词补进来。不动已有词、不复述译文，只追加。 */
const CET_TOPUP_SYSTEM = have => `你是 CET 词汇标注助手。用户给出若干段英文，每段前面有 [段号]。
任务：找出其中属于 CET-4 或 CET-6 大纲的实词，并**排除**下面这份已经标注过的清单。

已标注：${have || '（无）'}

严格只输出 JSON（禁止代码块与解释）：
{"words":[{"word":"词典原形","forms":["文中实际出现的形式"],"phonetic":"","pos":"v./n./adj./adv.","level":"CET-4 或 CET-6","meaning_zh":"中文释义","example_en":"从该段原文照抄一小段（含该词）","example_zh":"例句翻译","paraIndex":段号,"collocations":[]}]}

要求：
1. 只收四六级实词：名词、动词、形容词、副词。不收功能词（make / thing / people / get）、人名地名、专有名词。
2. level 必须准：四级词标 CET-4，六级词标 CET-6；拿不准按 CET-6。
3. 每段 2–5 个，宁可少收，也不要把简单词塞进来凑数。
4. example_en 必须从该段原文照抄，不要改写；paraIndex 填方括号里的段号。
5. 一段里没有可补的就跳过；全篇没有就返回 {"words":[]}。`;

async function supplementCETWords(art, { onNote } = {}) {
  const paras = art.paragraphs || [];
  if (!paras.length) throw new AIError('这篇还没有正文。', 'empty');
  const ps = paras.map((p, i) => ({ en: p.en, gi: i }));
  const have = new Set((art.words || []).map(w => normKey(w.word)).filter(Boolean));

  /* 切块：和精读同一套上限，避免一次塞太多段落模型数不清 */
  const chunks = [];
  let cur = [], w = 0;
  paras.forEach((p, i) => {
    const n = countWords(p.en || '');
    if (cur.length && (w + n > ANALYZE_CHUNK_WORDS || cur.length >= ANALYZE_CHUNK_PARAS)) { chunks.push(cur); cur = []; w = 0; }
    cur.push(i); w += n;
  });
  if (cur.length) chunks.push(cur);
  const todo = chunks.filter(c => c.some(i => paras[i] && paras[i].en));
  if (!todo.length) return { added: 0, total: (art.words || []).length };

  const added = [];
  for (let ci = 0; ci < todo.length; ci++) {
    if (onNote) onNote(`正在找遗漏的四六级词 · 第 ${ci + 1} / ${todo.length} 批`);
    const idxs = todo[ci];
    const text = idxs.map(i => `[${i}] ${paras[i].en}`).join('\n\n');
    const content = await apiChat([
      { role: 'system', content: CET_TOPUP_SYSTEM([...have].slice(0, 160).join(', ')) },
      { role: 'user', content: text },
    ], { temperature: 0.2, timeout: 120000 });
    let raw = null;
    try { raw = parseJSONLoose(content); } catch (e) { raw = null; }
    const list = raw && Array.isArray(raw.words) ? raw.words : [];
    list.forEach(item => {
      const key = normKey(item && item.word);
      if (!key || have.has(key)) return;
      const lv = normLevel(item.level);
      if (lv !== 'cet4' && lv !== 'cet6') return;      // 只补四六级
      have.add(key);
      const gi = locateWordParagraph(ps, item);
      const pi = gi != null ? gi : Math.max(0, Math.min(paras.length - 1, Number(item.paraIndex) || 0));
      added.push({
        word: String(item.word || '').trim(),
        forms: Array.isArray(item.forms) ? item.forms.map(String) : [],
        phonetic: String(item.phonetic || ''),
        pos: String(item.pos || ''),
        level: lv,
        review: false,
        meaning_zh: String(item.meaning_zh || ''),
        example_en: String(item.example_en || ''),
        example_zh: String(item.example_zh || ''),
        paraIndex: pi,
        collocations: Array.isArray(item.collocations)
          ? item.collocations.map(c => ({ en: String(c && c.en || ''), zh: String(c && c.zh || '') })).filter(c => c.en)
          : [],
      });
    });
  }

  if (added.length) {
    art.words = (art.words || []).concat(added).sort((a, b) => (a.paraIndex | 0) - (b.paraIndex | 0));
    save();
  }
  return { added: added.length, total: (art.words || []).length };
}

async function testConnection() {  const t0 = Date.now();
  const r = await apiChat([{ role: 'user', content: '请只回复两个字：正常' }], { temperature: 0, timeout: 30000 });
  return { ms: Date.now() - t0, reply: String(r).trim().slice(0, 30) };
}

/* ---------- 网页正文抓取 ----------
   浏览器直接 fetch 外刊站点会被 CORS 拦，改由 serve.mjs 的 /__fetch 代抓 HTML，
   再在本地做正文提取（不依赖任何第三方服务，正文不出本机）。 */
class CrawlError extends Error {
  constructor(msg, kind) { super(msg); this.kind = kind; }
}

function tidyText(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/[\u00a0\u200b]/g, ' ')
    .split(/\n+/)
    .map(s => s.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

const JUNK_SEL = 'script,style,noscript,nav,header,footer,aside,form,iframe,svg,button,select,input,textarea,figure figcaption,[role="navigation"],[aria-hidden="true"]';
const NOISE_LINE = /^(read more|read also|sign up|subscribe|advertisement|share this|share on|photo(graph)?\s*:|image\s*:|credit\s*:|getty images|continue reading|listen to this (article|story)|heard on|hosted by|this (article|story) was originally published)\b/i;
const DATELINE = /^([A-Z][a-z]+day,\s*)?[A-Z][a-z]+\s+\d{1,2},\s*\d{4}/;
/* 段首混进来的推广句（"📲 Get the latest … in the NPR App" 之类）——只削掉那一句，保留后面的正文 */
const PROMO_LEAD = /^[^\p{L}\p{N}]{0,6}((get the latest|get the full|download (the|our)|listen to (this|the)|subscribe to|sign up for|follow us on)[^.!?]{0,140}[.!?])\s*/iu;
function stripPromo(t) {
  let s = String(t || '').trim();
  for (let i = 0; i < 2; i++) {
    const n = s.replace(PROMO_LEAD, '');
    if (n === s) break;
    s = n.trim();
  }
  return s;
}

function extractArticle(html, srcUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = k => {
    const el = doc.querySelector(`meta[property="${k}"]`) || doc.querySelector(`meta[name="${k}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };
  let host = '';
  try { host = new URL(srcUrl).hostname.replace(/^www\./, ''); } catch (e) {}
  const title = (meta('og:title') || meta('twitter:title') || (doc.querySelector('h1') && doc.querySelector('h1').textContent) || doc.title || '')
    .replace(/\s+/g, ' ').trim();
  const source = (meta('og:site_name') || host || '').trim();

  // 1) 首选 JSON-LD 的 articleBody：多数新闻站都埋了，正文干净、无导航
  let ld = '';
  doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const j = JSON.parse(s.textContent);
      const arr = Array.isArray(j) ? j : (j['@graph'] ? j['@graph'] : [j]);
      arr.forEach(n => {
        if (!n) return;
        const b = typeof n.articleBody === 'string' ? n.articleBody : '';
        if (b.trim().length > ld.length) ld = b;
      });
    } catch (e) { /* 非法 JSON-LD 直接跳过 */ }
  });
  if (countWords(ld) >= 80) {
    return { title, source, text: tidyText(ld), words: countWords(ld), url: srcUrl };
  }

  // 2) 容器打分：正文段落总字数 × (1 − 链接密度)，article/main 加权
  doc.querySelectorAll(JUNK_SEL).forEach(n => n.remove());
  const cands = doc.querySelectorAll('article,main,[role="main"],section,div');
  let best = null, bestScore = 0;
  cands.forEach(el => {
    const ps = el.querySelectorAll('p');
    if (!ps.length) return;
    let pText = 0;
    ps.forEach(p => { pText += (p.textContent || '').trim().length; });
    if (pText < 250) return;
    const all = (el.textContent || '').length || 1;
    let linkText = 0;
    el.querySelectorAll('a').forEach(a => { linkText += (a.textContent || '').length; });
    const density = Math.min(0.9, linkText / all);
    let score = pText * (1 - density);
    const tag = el.tagName.toLowerCase();
    if (tag === 'article') score += 400;
    if (tag === 'main') score += 250;
    if (score > bestScore) { bestScore = score; best = el; }
  });

  let text = '';
  if (best) {
    const blocks = [];
    best.querySelectorAll('p,h2,h3,blockquote,li').forEach(el => {
      if (el.querySelector('p,li')) return;                 // 避免 li > p 之类重复
      const t = stripPromo((el.textContent || '').replace(/\s+/g, ' ').trim());
      if (t.length < 25) return;
      if (NOISE_LINE.test(t)) return;
      if (t.length < 60 && DATELINE.test(t)) return;        // 单独成行的日期 / 时间戳
      blocks.push(t);
    });
    text = tidyText(blocks.join('\n\n'));
  }

  // 3) 兜底：按块级标签断行，再剥标签
  if (countWords(text) < 80) {
    const tmp = doc.createElement('div');
    tmp.innerHTML = (best || doc.body || doc.documentElement).innerHTML
      .replace(/<\/(p|div|h[1-6]|li|blockquote|section|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
    text = tidyText((tmp.textContent || '').split('\n').map(s => stripPromo(s.trim()))
      .filter(s => s.length > 25 && !NOISE_LINE.test(s) && !(s.length < 60 && DATELINE.test(s)))
      .join('\n\n'));
  }

  return { title, source, text, words: countWords(text), url: srcUrl };
}

/* 统一走本地服务的 /__fetch（顺带统一各类错误话术） */
async function proxyFetchText(u) {
  if (location.protocol === 'file:') {
    throw new CrawlError('自动抓取需要本地服务：在项目目录运行 node serve.mjs，然后用 http://localhost:8123 打开本页。', 'needserver');
  }
  const px = String(Store.settings.crawlProxy || '').trim();
  const url = '/__fetch?url=' + encodeURIComponent(u.href) + (px ? '&proxy=' + encodeURIComponent(px) : '');
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch (e) {
    throw new CrawlError('连不上抓取服务：请确认页面是用 node serve.mjs 启动的，且服务仍在运行。', 'needserver');
  }
  if (res.status === 404 || res.status === 405) {
    throw new CrawlError('抓取服务不可用（404）：当前页面不是由 node serve.mjs 提供的，请用它启动后再试。', 'needserver');
  }
  const body = await res.text();
  if (!res.ok) {
    let info = null;
    try { info = JSON.parse(body); } catch (e) {}
    const err = new CrawlError((info && info.error) || ('抓取失败（HTTP ' + res.status + '）'),
      info && info.blocked ? 'blocked' : 'http');
    if (info && info.ray) err.ray = info.ray;
    throw err;
  }
  return body;
}

async function crawlArticle(url) {
  url = String(url || '').trim();
  if (!url) throw new CrawlError('先粘贴文章链接', 'badurl');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
  let u;
  try { u = new URL(url); } catch (e) { throw new CrawlError('链接格式不正确，请检查后重试', 'badurl'); }
  const body = await proxyFetchText(u);
  const art = extractArticle(body, u.href);
  if (countWords(art.text) < 80) {
    throw new CrawlError('只抓到 ' + countWords(art.text) + ' 个词。这个站点可能靠 JS 渲染、需要登录，或正文结构特殊——请打开原文手动全选复制。', 'empty');
  }
  return art;
}

/* 书签小工具：在「浏览器能正常看到原文」的标签页里执行，把正文复制到剪贴板。
   它跑在用户自己的会话语境里（已通过人机验证 / 已登录），不绕过任何访问控制，
   等价于手动全选复制，只是省掉几次点击。 */
const BOOKMARKLET = "javascript:(function(){try{var b=document.querySelector('article')||document.querySelector('[itemprop=articleBody]')||document.querySelector('main')||document.body;var ps=[].slice.call(b.querySelectorAll('p'));var t=ps.map(function(p){return (p.innerText||'').replace(/\\s+/g,' ').trim()}).filter(function(s){return s.length>40}).join('\\n\\n');if(!t||t.split(/\\s+/).length<80){t=(b.innerText||'').trim()}var w=t.split(/\\s+/).filter(Boolean).length;var title=((document.querySelector('h1')||{}).innerText||document.title||'').replace(/\\s+/g,' ').trim();var ok=function(){alert('已复制 '+w+' 词 · '+title+'\\n\\n回到「外刊精读」，粘到正文框里即可。')};var no=function(){window.prompt('浏览器拒绝了自动复制，请手动复制下面的正文：',t)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,no)}else{no()}}catch(e){alert('取正文失败：'+e.message)}})()";

/* ---------- 订阅源（RSS / Atom）----------
   只读取站点自己对外分发的订阅源，拿到「标题 + 链接 + 摘要」列表；
   点某一篇时才去抓那一篇的正文，不做批量下载、不碰付费墙。 */
/* 只列**实测能拿到完整正文**的源（2026-10 逐个验证过：服务端渲染、正文 800+ 词、非付费墙）。
   Atlantic 留着是因为用户的目标站点，但它会被 Cloudflare 拦，报错里会引导用书签取正文。 */
const FEED_SOURCES = [
  { id: 'atlantic', name: '大西洋月刊', feed: 'https://www.theatlantic.com/feed/all/' },
  { id: 'aeon', name: 'Aeon', feed: 'https://aeon.co/feed.rss' },
  { id: 'propublica', name: 'ProPublica', feed: 'https://www.propublica.org/feeds/propublica/main' },
  { id: 'asterisk', name: 'Asterisk', feed: 'https://asteriskmag.com/feed' },
  { id: 'quanta', name: 'Quanta', feed: 'https://www.quantamagazine.org/feed/' },
  { id: 'pdr', name: '公版评论', feed: 'https://publicdomainreview.org/rss.xml' },
  { id: 'marginalian', name: 'The Marginalian', feed: 'https://www.themarginalian.org/feed/' },
  { id: 'npr', name: 'NPR', feed: 'https://feeds.npr.org/1001/rss.xml' },
];

function plainText(html) {
  const d = document.createElement('div');
  d.innerHTML = String(html || '');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/* 子节点按 localName 取，天然忽略 dc:/content: 之类前缀 */
function childText(el, names) {
  for (const c of el.children || []) {
    if (names.includes(c.localName.toLowerCase())) return (c.textContent || '').trim();
  }
  return '';
}

function parseFeed(xmlText, feedUrl) {
  const doc = new DOMParser().parseFromString(String(xmlText || ''), 'text/xml');
  if (!doc || doc.querySelector('parsererror')) throw new CrawlError('这个地址返回的不是有效的 RSS / Atom', 'badfeed');
  const abs = u => { try { return new URL(u, feedUrl).href; } catch (e) { return u || ''; } };
  const out = [];

  doc.querySelectorAll('item').forEach(el => {            // RSS 2.0 / RDF
    const linkEl = [...el.children].find(c => c.localName === 'link');
    let link = childText(el, ['link']);
    if (!link && linkEl) link = linkEl.getAttribute('href') || linkEl.textContent || '';
    const date = childText(el, ['pubdate', 'published', 'updated', 'date']);
    const desc = childText(el, ['description', 'summary', 'encoded', 'content']);
    out.push({
      title: plainText(childText(el, ['title'])),
      url: abs(link.trim()),
      date: date ? Date.parse(date) || 0 : 0,
      desc: plainText(desc).slice(0, 120),
    });
  });

  if (!out.length) {                                      // Atom
    doc.querySelectorAll('entry').forEach(el => {
      const links = [...el.children].filter(c => c.localName === 'link');
      const alt = links.find(c => (c.getAttribute('rel') || 'alternate') === 'alternate') || links[0];
      const date = childText(el, ['published', 'updated']);
      out.push({
        title: plainText(childText(el, ['title'])),
        url: abs(alt ? alt.getAttribute('href') || '' : ''),
        date: date ? Date.parse(date) || 0 : 0,
        desc: plainText(childText(el, ['summary', 'content'])).slice(0, 120),
      });
    });
  }

  return out
    .filter(it => it.title && /^https?:\/\//i.test(it.url))
    .sort((a, b) => (b.date || 0) - (a.date || 0))
    .slice(0, 12);
}

async function fetchFeed(feedUrl) {
  let u;
  try { u = new URL(String(feedUrl || '').trim()); } catch (e) { throw new CrawlError('订阅源地址不正确', 'badurl'); }
  if (!/^https?:$/.test(u.protocol)) throw new CrawlError('只支持 http / https 的订阅源地址', 'badurl');
  const xml = await proxyFetchText(u);
  const list = parseFeed(xml, u.href);
  if (!list.length) throw new CrawlError('这个订阅源里没有可用的文章（可能需要翻页或已停止更新）', 'empty');
  return list;
}

/* ---------- 生词本 & SRS ---------- */
const IVL_SEQ = [1, 3, 7, 15, 30, 60, 120, 240];
function addWord(e, articleId, silent) {
  const key = normKey(e.word);
  if (!key) return;
  const ex = Store.words[key];
  if (ex) {
    if (articleId && !ex.articles.includes(articleId)) ex.articles.push(articleId);
    ['phonetic', 'pos', 'meaning_zh', 'example_en', 'example_zh'].forEach(k => { if (!ex[k] && e[k]) ex[k] = e[k]; });
    if ((!ex.collocations || !ex.collocations.length) && e.collocations) ex.collocations = e.collocations;
  } else {
    Store.words[key] = {
      word: e.word, phonetic: e.phonetic || '', pos: e.pos || '',
      level: e.level || 'x', meaning_zh: e.meaning_zh || '',
      example_en: e.example_en || '', example_zh: e.example_zh || '',
      collocations: e.collocations || [],
      articles: articleId ? [articleId] : [],
      addedAt: Date.now(), srs: { due: Date.now(), ivl: 0, reps: 0, lapses: 0 },
    };
  }
  if (!silent) { save(); refreshBadges(); }
  return Store.words[key];
}
/* 「复习本篇」用：把一篇的标注词全部收进生词本并返回条目。
   未收录的一并加入 —— 用户点「复习本篇」显然就是想学这些词；
   否则复习队列里的词不在生词本里，评分也写不到任何条目上。
   批量场景下用 silent 攒着，最后统一写盘，避免 26 次 save + refreshBadges。 */
function collectArticleWords(art) {
  if (!art || !Array.isArray(art.words)) return [];
  const out = [];
  const seen = new Set();          // 同一个词可能被标在两段里，队列里不该出现两次
  let added = 0;
  art.words.forEach(w => {
    const key = normKey(w.word);
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (!Store.words[key]) { addWord(w, art.id, true); added++; }
    if (Store.words[key]) out.push(Store.words[key]);
  });
  if (added) { save(); refreshBadges(); }
  return out;
}
function removeWord(key) { delete Store.words[key]; save(); refreshBadges(); }
function scheduleWord(w, grade) { /* 0忘了 1模糊 2记得 3简单 */
  const now = Date.now();
  if (!w.srs) w.srs = { due: now, ivl: 0, reps: 0, lapses: 0 };
  const srs = w.srs;
  if (grade === 0) { srs.lapses++; srs.reps = 0; srs.ivl = 0; srs.due = now + 10 * 60e3; }
  else {
    srs.reps++;
    let idx = IVL_SEQ.findIndex(v => v > srs.ivl);
    if (idx === -1) idx = IVL_SEQ.length - 1;
    let ivl;
    if (grade === 1) ivl = Math.max(1, Math.round((IVL_SEQ[Math.max(0, idx - 1)] || 1) * 0.7));
    else if (grade === 2) ivl = IVL_SEQ[Math.min(idx, IVL_SEQ.length - 1)];
    else ivl = Math.min(365, Math.round((IVL_SEQ[Math.min(idx + 1, IVL_SEQ.length - 1)] || 240) * 1.5));
    srs.ivl = ivl; srs.due = now + ivl * 864e5;
  }
  save();
}
/* 到期的词。
   注意：`srs` 缺失不是「不复习」，而是「还没排过」——旧版本加进来的词就是这种状态，
   以前它们永远不会出现在复习队列里（dueWords 要求 w.srs 存在），学习闭环直接断掉。
   现在一律以 addedAt 兜底：没排过的词当场就该复习。 */
function dueWords() {
  const now = Date.now();
  const dueOf = w => (w.srs && w.srs.due) ? w.srs.due : (w.addedAt || 0);
  return Object.values(Store.words)
    /* 还没有释义的词不进复习队列：卡片背面会是空的，评「记得 / 忘了」都无从判断。
       它们留在生词本里（标「待补释义」），补上释义后自然按 addedAt 到期。 */
    .filter(w => w.word && String(w.meaning_zh || '').trim() && dueOf(w) <= now)
    .sort((a, b) => dueOf(a) - dueOf(b));
}
function masteredCount() { return Object.values(Store.words).filter(w => w.srs && w.srs.ivl >= 30).length; }

/* ---------- 导入导出 ---------- */
/* 导出时剔掉 API Key：备份文件经常被丢进网盘 / 发给同学，
   里面躺着明文 key 就等于把账号给出去了。恢复时自己再填一次即可。 */
function exportData() {
  const safe = { ...Store, settings: { ...Store.settings, apiKey: '' } };
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `pressreader-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* 备份文件可能是旧版本导出的、手工改过的、或者传到一半断掉的，
   所以一律先补齐字段再入库 —— 少一个 words 数组，文章库和精读页会直接白屏。 */
function normalizeArticle(a) {
  const paragraphs = (Array.isArray(a.paragraphs) ? a.paragraphs : [])
    .map(p => (typeof p === 'string' ? { en: p, zh: '' } : { en: String((p && p.en) || ''), zh: String((p && p.zh) || '') }))
    .filter(p => p.en || p.zh);
  const words = (Array.isArray(a.words) ? a.words : []).filter(w => w && typeof w.word === 'string');
  return {
    ...a,
    id: typeof a.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(a.id) ? a.id : uid(),
    title: String(a.title || '未命名文章'),
    source: String(a.source || ''),
    topic: String(a.topic || ''),
    difficulty: String(a.difficulty || 'C1'),
    paragraphs,
    words,
    wc: Number(a.wc) || countWords(paragraphs.map(p => p.en).join(' ')),
    createdAt: Number(a.createdAt) || Date.now(),
    keyCollocations: Array.isArray(a.keyCollocations) ? a.keyCollocations : [],
  };
}

function importData(json) {
  const d = JSON.parse(json); // throws → caller handles
  if (!d || typeof d !== 'object' || !Array.isArray(d.articles) || !d.words) throw new Error('文件格式不正确：缺少 articles / words 字段');
  let newArt = 0, newWord = 0;
  d.articles.forEach(raw => {
    if (!raw || !raw.id || !Array.isArray(raw.paragraphs)) return;
    const a = normalizeArticle(raw);
    const i = Store.articles.findIndex(x => x.id === a.id);
    if (i >= 0) Store.articles[i] = a; else { Store.articles.push(a); newArt++; }
  });
  Object.values(d.words || {}).forEach(raw => {
    if (!raw || typeof raw.word !== 'string' || !raw.word) return;
    const key = normKey(raw.word);
    if (!key) return;
    const w = {
      ...raw,
      word: String(raw.word),
      meaning_zh: String(raw.meaning_zh || ''),
      articles: Array.isArray(raw.articles) ? raw.articles : [],
      addedAt: Number(raw.addedAt) || Date.now(),
      srs: raw.srs && raw.srs.due ? raw.srs : null,
    };
    const ex = Store.words[key];
    if (ex) {
      w.articles.forEach(id => { if (!ex.articles.includes(id)) ex.articles.push(id); });
      if (w.srs && (!ex.srs || w.srs.due < ex.srs.due)) ex.srs = w.srs;
    } else { Store.words[key] = w; newWord++; }
  });
  // 导入他人的备份时，不能让文件改写现有 API Key 的发送地址。
  if (d.settings && typeof d.settings === 'object') {
    const localOnly = new Set(['baseUrl', 'model', 'apiKey', 'crawlProxy']);
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const value = d.settings[key];
      if (!localOnly.has(key) && typeof value === typeof DEFAULT_SETTINGS[key]) Store.settings[key] = value;
    }
  }
  save(); applyTheme(Store.settings.theme); refreshBadges();
  return { newArt, newWord };
}

/* 生词本 → CSV（Excel / Anki 均可导入） */
function exportWordsCSV(list) {
  const rows = list && list.length ? list : Object.values(Store.words);
  if (!rows.length) { toast('生词本为空，无需导出'); return; }
  const artTitle = id => (Store.articles.find(a => a.id === id) || {}).title || '';
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  const head = ['单词', '音标', '词性', '等级', '释义', '例句', '例句翻译', '常用搭配', '到期时间', '间隔(天)', '复习次数', '遗忘次数', '来源文章'];
  const day = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const lines = [head.map(q).join(',')];
  [...rows].sort((a, b) => a.word.localeCompare(b.word)).forEach(w => {
    const s = w.srs || {};
    lines.push([
      w.word, w.phonetic, w.pos, LEVEL_LABEL[w.level] || '',
      w.meaning_zh, w.example_en, w.example_zh,
      (w.collocations || []).map(c => c.en + ' — ' + c.zh).join('；'),
      s.due ? day(s.due) : '', s.ivl != null ? s.ivl : '',
      s.reps != null ? s.reps : '', s.lapses != null ? s.lapses : '',
      (w.articles || []).map(artTitle).filter(Boolean).join('；'),
    ].map(q).join(','));
  });
  const d = new Date();
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `生词本-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`已导出 ${rows.length} 个生词`);
}

/* ---------- 弹层 ---------- */
/* 关闭所有浮层（词卡 / 抽屉 / 弹窗 / toast / 处理中遮罩）。
   opts.views === false 时保留当前视图：处理进度遮罩只是浮层，不该顺手把
   当前视图的滚动监听、段落轨、进度条一起拆掉（以前在精读页点「AI 精读本篇」
   会把段轨和进度条从 DOM 里删掉，失败后回滚不回来）。 */
function closeOverlays(opts) {
  const keepView = !!(opts && opts.views === false);
  document.querySelectorAll('.wcard,.wc-backdrop,.voc-drawer,.snt-panel,.modal-backdrop,.proc').forEach(n => n.remove());
  TTS.stop();
  if (typeof stopRec === 'function') { try { stopRec(); } catch (e) {} }
  if (!keepView && typeof runViewCleanups === 'function') { try { runViewCleanups(); } catch (e) {} }
}
/* Esc 关闭最上层浮层。
   以前词卡、词汇抽屉、确认框全都只能用鼠标点关闭按钮，键盘用户没有退出口。
   确认框自己处理 Esc（它要 resolve promise），这里只管纯展示类浮层；
   处理中遮罩不在此列 —— 请求还在跑，关掉遮罩只会留下一个说不清的状态。 */
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.modal-backdrop')) return;
  const open = document.querySelector('.wcard, .wc-backdrop, .voc-drawer, .snt-panel');
  if (!open) return;
  e.preventDefault();
  document.querySelectorAll('.wcard, .wc-backdrop, .voc-drawer, .snt-panel').forEach(n => n.remove());
}, true);

function confirmModal({ title, body, okText = '确定', danger = false }) {
  return new Promise(resolve => {
    const bd = document.createElement('div');
    bd.className = 'modal-backdrop';
    bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3><p>${esc(body)}</p>
      <div class="m-acts">
        <button class="btn sm ghost" data-r="0">取消</button>
        <button class="btn sm ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okText)}</button>
      </div></div>`;
    // Esc 等价于「取消」：删除类确认框以前只能用鼠标点，键盘用户被卡住
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
    const finish = v => { bd.remove(); removeEventListener('keydown', onKey, true); resolve(v); };
    bd.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) finish(b.dataset.r === '1');
    });
    document.getElementById('layer').appendChild(bd);
    addEventListener('keydown', onKey, true);
    const focusEl = bd.querySelector(danger ? '[data-r="0"]' : '[data-r="1"]');
    if (focusEl) focusEl.focus();
  });
}

/* ---------- 路由 ---------- */
const NAV_OF = { library: 'library', new: 'library', reader: 'library', teach: 'library', listen: 'library', shelf: 'shelf', words: 'words', review: 'review', settings: 'settings' };
function setNav(name) {
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
}
function refreshBadges() {
  const n = dueWords().length;
  ['dueBadge1', 'dueBadge2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.hidden = n === 0; el.textContent = n > 99 ? '99+' : n; }
  });
}
const Router = {
  current: null,
  start() {
    addEventListener('hashchange', () => this.dispatch());
    this.dispatch();
  },
  go(hash) { if (location.hash === hash) this.dispatch(); else location.hash = hash; },
  dispatch() {
    const h = (location.hash || '#/library').replace(/^#\/?/, '');
    const name = h.split('/')[0] || 'library';
    const id = h.split('/')[1] || '';
    closeOverlays();
    TTS.stop();
    const tb = document.getElementById('tabbar');
    if (tb) tb.style.display = '';   // 听力页会自行隐藏
    const fn = Views[name] || Views.library;
    Router.current = name;
    /* 单个视图渲染失败（数据缺字段 / 旧备份 / 手改过的 JSON）不该让整个页面「点了没反应」：
       兜住异常，渲染一个能自救援的错误页；导航、角标、标题照常更新。 */
    try {
      fn({ id });
    } catch (e) {
      console.error('视图渲染失败：' + name, e);
      try { renderViewError(name, id, e); } catch (e2) { console.error(e2); }
    }
    setNav(NAV_OF[name] || '');
    refreshBadges();
    window.scrollTo(0, 0);
    const titles = { library: '文章库', new: '新建精读', reader: '精读', teach: '教学模式', listen: '听力精听', shelf: '刊物', words: '生词本', review: '复习', settings: '设置' };
    document.title = (titles[name] ? titles[name] + ' · ' : '') + '外刊精读';
  },
};
