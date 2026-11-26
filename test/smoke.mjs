// 端到端冒烟测试：无头 Edge/Chrome + CDP。仅用 Node 内置模块，无需安装依赖。
//   node test/smoke.mjs
// 会自己按需拉起本地服务；临时用户目录放在系统临时目录，不污染项目。
// 截图输出到 test/shots/，失败项以 FAIL 列出并以非 0 退出。
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { once } from 'node:events';
import { request } from 'node:http';

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
].filter(Boolean);
const EDGE = CANDIDATES.find(p => existsSync(p));
if (!EDGE) { console.error('未找到浏览器，可用 BROWSER_PATH 环境变量指定'); process.exit(2); }

const PORT = 9330 + Math.floor(Math.random() * 400);   // 随机端口，避免接到上次残留的实例上
let BASE;
const OUT = new URL('./shots/', import.meta.url);
const PROFILE = join(tmpdir(), `press-reader-smoke-${process.pid}`);
const PROC = { browser: null, server: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}

/* 启动独立的本机服务，由系统分配端口，不复用其它实例。 */
async function ensureServer() {
  PROC.server = spawn(process.execPath, ['serve.mjs', '--port', '0'], {
    cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'],
  });
  const ready = async () => {
    let output = '';
    for await (const chunk of PROC.server.stdout.setEncoding('utf8')) {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) return 'http://127.0.0.1:' + match[1] + '/';
    }
    throw new Error('本地服务提前退出');
  };
  BASE = await Promise.race([ready(), once(PROC.server, 'error').then(([error]) => { throw error; }), sleep(10000).then(() => { throw new Error('本地服务启动超时'); })]);
}

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--window-size=1360,900',
  'about:blank',
], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/json/list`);
      const j = await r.json();
      const p = j.find(x => x.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('CDP 未就绪');
}

const url = await wsUrl();
const ws = new WebSocket(url);
let seq = 0; const pending = new Map(); const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
    logs.push(m.params.type.toUpperCase() + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
};
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++seq;
    // 硬超时：页面里若有 eval 不返回（比如 await 一个永不 settle 的 Promise），
    // 没有这个保护整个测试会一直挂着。
    const timer = setTimeout(() => { pending.delete(i); rej(new Error(method + ' 超时 25s')); }, 25000);
    pending.set(i, m => {
      clearTimeout(timer);
      m.error ? rej(new Error(method + ' → ' + JSON.stringify(m.error))) : res(m.result);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}
await new Promise(r => ws.onopen = r);
await send('Page.enable'); await send('Runtime.enable');

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('EVAL FAIL: ' + expression.slice(0, 110) + ' → ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
// 截图只用于人工查看，偶发超时（渲染进程忙）不该让整个测试失败
async function shot(name) {
  try {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(new URL(name + '.png', OUT), Buffer.from(r.data, 'base64'));
  } catch (e) {
    results.push('SKIP  截图 ' + name + '  ·  ' + e.message);
  }
}
async function shotClip(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 }, captureBeyondViewport: true });
  writeFileSync(new URL(name + '.png', OUT), Buffer.from(r.data, 'base64'));
}
const results = [];
function check(name, cond, extra = '', soft = false) {
  if (soft && !cond) { results.push(`SKIP  ${name}${extra ? '  ·  ' + extra : ''}`); return; }
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ·  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}
// 用应用自己的 Router 跳转：同 hash 时也会重新渲染（直接改 location.hash 不会）
const go = async hash => { await ev(`Router.go('${hash}')`); await sleep(950); };

async function main() {
  await ensureServer();
  console.log('（已自动启动本地服务 ' + BASE + '）');
  for (const path of ['.git/config', 'src/atlantic.js', 'android/debug.keystore', 'package.json']) {
    check('服务不公开项目文件：' + path, (await fetch(new URL(path, BASE))).status === 404);
  }
  const wrongHost = await new Promise((resolve, reject) => {
    const req = request(BASE, { headers: { Host: 'reader.example' } }, res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  check('拒绝不匹配的 Host', wrongHost === 403, 'status ' + wrongHost);
  const crossOrigin = await fetch(BASE + '__fetch', { headers: { Origin: 'https://example.org' } });
  check('拒绝跨源抓取', crossOrigin.status === 403);
  const near = await fetch(BASE + '__fetch?url=' + encodeURIComponent(BASE));
  check('内网地址被拒绝（SSRF 防护）', near.status === 403, 'status ' + near.status);
  await send('Page.navigate', { url: BASE });
  await sleep(1500);
  await ev(`localStorage.clear()`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1600);

  /* 1. 首页 */
  check('首页渲染（空态 hero）', await ev(`!!document.querySelector('.hero h1')`));
  await shot('01-home');

  /* 这一整段断言描述的是「经典」版式（分页 / 段轨 / 段落后跟译文），先把它固定下来。
     新版式（注释本 / 卡片）在末尾单独测。 */
  await ev(`Store.settings.readerLayout='classic'; save()`);

  /* 2. 载入示例 → 精读页 */
  await ev(`document.querySelector('#loadSample').click()`);
  await sleep(1000);
  check('示例载入并进入精读页', await ev(`location.hash.startsWith('#/reader/') && !!document.querySelector('#rBody')`), await ev(`location.hash`));
  check('段落数量 > 5', await ev(`document.querySelectorAll('#rBody .para').length`) > 5, await ev(`document.querySelectorAll('#rBody .para').length + ' 段'`));
  check('生词高亮存在', await ev(`document.querySelectorAll('#rBody span.vw').length`) > 8, await ev(`document.querySelectorAll('#rBody span.vw').length + ' 处'`));

  /* 分页阅读（默认）：有限页 + 翻页 */
  const pgA = await ev(`(()=>{const info=document.querySelector('#pgInfo');
    return {paged:document.querySelector('#rBody').classList.contains('paged'), info:info?info.textContent:'',
            shown:!!document.querySelector('#pager') && !document.querySelector('#pager').hidden}})()`);
  check('默认进入分页阅读', pgA.paged && pgA.shown && /^1 \//.test(pgA.info), pgA.info);
  const firstOnPage1 = await ev(`[...document.querySelectorAll('#rBody .para')].findIndex(p=>getComputedStyle(p).display!=='none')`);
  await ev(`document.querySelector('#pgNext').click()`);
  await sleep(700);
  const pgB = await ev(`(()=>{const idx=[...document.querySelectorAll('#rBody .para')].map((p,i)=>getComputedStyle(p).display!=='none'?i:-1).filter(i=>i>=0);
    return {info:document.querySelector('#pgInfo').textContent, idx}})()`);
  check('翻页只显示下一组段落', /^2 \//.test(pgB.info) && pgB.idx[0] > firstOnPage1, `${pgB.info} · 段 ${pgB.idx.join(',')}`);

  /* 后续滚动相关断言切回连续模式 */
  await ev(`Store.settings.paged=false; save(); Router.go('#/reader/'+Store.articles[0].id)`);
  await sleep(900);

  /* 排版：栏宽 / 字号 / 行高 / 每行字符数 / 字体 */
  const typo = await ev(`(()=>{
    const p=document.querySelector('.para-en'), c=document.querySelector('.reader-page'), cs=getComputedStyle(p);
    const w=c.getBoundingClientRect().width;
    const sp=document.createElement('span');
    sp.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;left:-9999px';
    sp.style.fontFamily=cs.fontFamily; sp.style.fontSize=cs.fontSize; sp.style.letterSpacing=cs.letterSpacing;
    sp.style.fontWeight=cs.fontWeight; sp.style.fontKerning=cs.fontKerning;
    sp.textContent='The quick brown fox jumps over the lazy dog and keeps running through the field '.repeat(2).slice(0,120);
    document.body.appendChild(sp); const cw=sp.getBoundingClientRect().width/120; sp.remove();
    return {w:Math.round(w), fs:parseFloat(cs.fontSize), lh:parseFloat(cs.lineHeight)/parseFloat(cs.fontSize),
            ff:cs.fontFamily, cpl:Math.round(w/cw)}})()`);
  check('正文栏宽 620px', typo.w === 620, typo.w + 'px');
  check('正文字号 20px / 行高 1.76', typo.fs === 20 && Math.abs(typo.lh - 1.76) < 0.02, typo.fs + 'px / ' + typo.lh.toFixed(2));
  check('每行 60–70 字符（英文长文最佳区间）', typo.cpl >= 60 && typo.cpl <= 70, typo.cpl + ' 字符/行');
  check('衬线字体优先 Sitka Text（Windows 可读性最好）', /^"?Sitka Text"?/.test(typo.ff.trim()), typo.ff.split(',')[0]);

  /* 段落导航轨：把长文切成可见的段 */
  const rail0 = await ev(`(()=>{const t=[...document.querySelectorAll('.para-rail .pr-tick')];return {n:t.length, on:t.findIndex(x=>x.classList.contains('on')), onTop:Math.round(t[0].getBoundingClientRect().top)}})()`);
  check('段落导航轨刻度数 = 段数', rail0.n === (await ev(`document.querySelectorAll('#rBody .para').length`)), rail0.n + ' 个');
  check('进页时高亮第 1 段', rail0.on === 0, '第 ' + (rail0.on + 1) + ' 段');
  await ev(`document.querySelectorAll('#rBody .para')[3].scrollIntoView({block:'start'})`);
  await sleep(700);
  check('滚动后刻度跟着走', (await ev(`[...document.querySelectorAll('.para-rail .pr-tick')].findIndex(x=>x.classList.contains('on'))`)) === 3, '滚到第 4 段');
  await ev(`document.querySelectorAll('.para-rail .pr-tick')[0].click()`);
  await sleep(700);
  check('点刻度能跳回该段', (await ev(`Math.abs(document.querySelectorAll('#rBody .para')[0].getBoundingClientRect().top) < 120`)));

  await ev(`document.querySelector('#fsFont').click()`);
  await sleep(250);
  check('可切到无衬线正文', (await ev(`getComputedStyle(document.querySelector('.para-en')).fontFamily`)).includes('Segoe UI')
    && (await ev(`document.querySelector('#readerBody').dataset.font`)) === 'sans');
  await ev(`document.querySelector('#fsFont').click()`);
  await sleep(200);
  check('可切回衬线正文', (await ev(`document.querySelector('#readerBody').dataset.font`)) === 'serif');
  await shot('02-reader-tap');

  /* 阅读进度条 */
  check('精读页有顶部进度条', await ev(`!!document.querySelector('.read-progress')`));  await ev(`scrollTo(0, document.documentElement.scrollHeight)`);
  await sleep(350);
  const pw = await ev(`document.querySelector('.read-progress i').style.width`);
  check('进度条随滚动增长', parseFloat(pw) > 50, pw);
  await shot('02b-reader-progress');
  await ev(`scrollTo(0,0)`);
  await sleep(250);

  /* 3. 译文三模式 */
  await ev(`document.querySelector('#trSeg [data-mode="hint"]').click()`);
  await sleep(400);
  check('提示模式：正文 class 切换', await ev(`document.querySelector('#rBody').classList.contains('mode-hint')`));
  await ev(`document.querySelector('#rBody .para .tr-btn').click()`);
  await sleep(300);
  check('提示模式：展开后显示关键词区', await ev(`(()=>{const p=document.querySelector('#rBody .para');return p.classList.contains('open') && getComputedStyle(p.querySelector('.tr-hint')).display!=='none'})()`));
  check('提示模式：提示 chip / 空态已渲染', await ev(`!!document.querySelector('#rBody .hint-chip, #rBody .hint-none')`));
  check('提示模式：完整译文默认隐藏', await ev(`(()=>{const p=document.querySelector('#rBody .para');return getComputedStyle(p.querySelector('.tr-full')).display==='none'})()`));
  await shot('03-reader-hint');
  await ev(`document.querySelector('#rBody [data-full]').click()`);
  await sleep(300);
  check('「看整段译文」展开全文', await ev(`(()=>{const p=document.querySelector('#rBody .para');return getComputedStyle(p.querySelector('.tr-full')).display!=='none'})()`));
  await ev(`document.querySelector('#trSeg [data-mode="always"]').click()`);
  await sleep(300);
  check('全译模式：全部段落展开', await ev(`[...document.querySelectorAll('#rBody .para')].every(p=>p.classList.contains('open'))`));
  await shot('04-reader-always');

  /* 4. 点词弹卡 */
  await ev(`document.querySelector('#trSeg [data-mode="tap"]').click()`);
  await sleep(250);
  await ev(`document.querySelector('#rBody span.vw').click()`);
  await sleep(450);
  check('点词弹出生词卡', await ev(`!!document.querySelector('.wcard') && !!document.querySelector('.wcard-word')`), await ev(`document.querySelector('.wcard-word')?.textContent || ''`));
  await ev(`document.querySelector('#wcAdd')?.click()`);
  await sleep(350);
  check('加入生词本成功', await ev(`Object.keys(Store.words).length`) >= 1, await ev(`Object.keys(Store.words).length + ' 词'`));
  /* 这里必须断言「新词立刻进复习队列」——以前 addWord 写的是 srs:null，
     而 dueWords 只认 w.srs，新词永远不会到期，学习闭环是断的；
     下面的复习用例自己注入 srs 假状态，等于替应用把这一步做了，掩盖了这个缺陷。 */
  check('新加的生词当天即到期（能进复习队列）', await ev(`dueWords().length`) >= 1, await ev(`dueWords().length + ' 个到期'`));
  check('侧栏角标同步点亮', await ev(`!document.getElementById('dueBadge1').hidden`));
  await ev(`document.querySelector('.wc-backdrop')?.click()`);
  await sleep(250);

  /* 5. 词汇表抽屉 → 全部加入 */
  await ev(`document.querySelector('#tbVoc').click()`);
  await sleep(400);
  check('词汇抽屉打开', await ev(`!!document.querySelector('.voc-drawer')`), await ev(`document.querySelectorAll('.voc-item').length + ' 条'`));
  await shot('05-voc-drawer');
  await ev(`document.querySelector('#vocAll').click()`);
  await sleep(700);
  const wordCount = await ev(`Object.keys(Store.words).length`);
  check('一键加入全部标注词', wordCount >= 10, wordCount + ' 词');
  await ev(`document.querySelector('#vocX').click()`);
  await sleep(250);

  /* 6. 听力精听 */
  const artId = await ev(`location.hash.split('/')[2]`);
  await go('#/listen/' + artId);
  check('听力页渲染句块', await ev(`document.querySelectorAll('#sents .sent').length`) > 10, await ev(`document.querySelectorAll('#sents .sent').length + ' 句'`));
  /* 分句器曾经在小数 / U.N. / Ph.D. 处误切出 "N." "5 percent…" 这种碎片，
     逐句朗读和听写核对都跟着碎掉。碎片句的长度会明显短于正常句子。 */
  check('没有碎片句（分句没在小数/缩写处断开）',
    await ev(`[...document.querySelectorAll('#sents .sent')].every(n => n.textContent.trim().length >= 12)`),
    await ev(`JSON.stringify([...document.querySelectorAll('#sents .sent')].map(n=>n.textContent.trim()).filter(t=>t.length<12).slice(0,3))`));
  check('遍数选择器 5 档', await ev(`document.querySelectorAll('#repSeg button').length === 5`));
  check('听力页隐藏底部 tabbar', await ev(`getComputedStyle(document.getElementById('tabbar')).display === 'none'`));
  check('录音条默认隐藏', await ev(`getComputedStyle(document.querySelector('#recRow')).display === 'none'`));
  check('A-B 控件默认隐藏', await ev(`getComputedStyle(document.querySelector('#abBox')).display === 'none'`));

  /* 用桩替换真实 TTS：无头环境没有音色，onend 不会触发，无法验证推进逻辑 */
  await ev(`window.__calls=[]; TTS.speak=(t)=>{window.__calls.push(String(t));return new Promise(r=>setTimeout(()=>r('end'),12));};`);
  const sentTexts = await ev(`[...document.querySelectorAll('#sents .sent')].map(n=>n.textContent.trim())`);

  /* 6a. 每句连播 N 遍后自动下一句 */
  await ev(`document.querySelector('#repSeg [data-rep="2"]').click()`);
  await sleep(200);
  check('切到「2 遍」并持久化', await ev(`Store.settings.ttsRepeat`) === 2);
  await ev(`window.__calls=[]; document.querySelectorAll('#sents .sent')[0].click()`);
  await sleep(150);
  await ev(`document.querySelector('#lPlay').click()`);
  await sleep(200);
  const calls2 = await ev(`window.__calls.slice()`);
  check('每句连播 2 遍后自动跳下一句',
    calls2.length >= 4 && calls2[0] === calls2[1] && calls2[2] === calls2[3] && calls2[1] !== calls2[2],
    calls2.slice(0, 4).map(t => t.split(' ').slice(0, 3).join(' ') + '…').join(' | '));

  /* 6b. 单句无限循环 */
  await ev(`document.querySelector('#repSeg [data-rep="0"]').click()`);
  await ev(`window.__calls=[]; document.querySelectorAll('#sents .sent')[3].click()`);
  await sleep(220);
  await ev(`document.querySelector('#lPlay').click()`);
  await sleep(200);
  const callsInf = await ev(`window.__calls.slice()`);
  check('∞ 模式反复朗读同一句', callsInf.length >= 3 && new Set(callsInf).size === 1, callsInf.length + ' 次');

  /* 6c. A-B 区间复读 */
  await ev(`document.querySelector('#abBtn').click()`);
  await sleep(250);
  check('A-B 开启并显示区间', await ev(`!document.querySelector('#abBox').hidden`), await ev(`'A ' + document.querySelector('#abAVal').textContent + ' – B ' + document.querySelector('#abBVal').textContent`));  check('区间内句子被标记', await ev(`document.querySelectorAll('#sents .sent.inab').length`) >= 2, await ev(`document.querySelectorAll('#sents .sent.inab').length + ' 句'`));
  check('区间提示文案更新', /A-B/.test(await ev(`document.querySelector('#lTip').textContent`)));
  await shot('06-listen-ab');
  await ev(`document.querySelectorAll('#sents .sent')[5].click()`);
  await sleep(80);
  await ev(`document.querySelector('#abSetB').click()`);
  await sleep(250);
  check('「设 B」以当前句为终点', (await ev(`document.querySelector('#abBVal').textContent`)) === '6', 'B = 第 6 句');
  await ev(`document.querySelector('#repSeg [data-rep="1"]').click()`);
  await ev(`window.__calls=[]; document.querySelectorAll('#sents .sent')[3].click()`);
  await sleep(240);
  await ev(`document.querySelector('#lPlay').click()`);
  await sleep(200);
  const callsAB = await ev(`window.__calls.slice()`);
  check('A-B 区间内循环、不越界',
    callsAB.length >= 4 && new Set(callsAB).size >= 2 && [...new Set(callsAB)].every(t => sentTexts.slice(3, 6).includes(t)),
    callsAB.length + ' 次 / ' + new Set(callsAB).size + ' 句');
  await ev(`document.querySelector('#abClear').click()`);
  await sleep(250);
  check('A-B 清除', await ev(`document.querySelector('#abBox').hidden && document.querySelectorAll('#sents .sent.inab').length === 0`));

  /* 重进听力页，拿干净状态测盲听 / 听写 */
  await go('#/library'); await go('#/listen/' + artId);
  await ev(`document.querySelector('#blindBtn').click()`);
  await sleep(350);
  check('盲听：正文透明', (await ev(`getComputedStyle(document.querySelector('#sents .sent')).color`)) === 'rgba(0, 0, 0, 0)', await ev(`getComputedStyle(document.querySelector('#sents .sent')).color`));
  await ev(`document.querySelector('#blindBtn').click()`);
  await sleep(250);

  /* 6d. 听写挖空 */
  await ev(`document.querySelector('#dictBtn').click()`);
  await sleep(800);
  check('听写面板打开', await ev(`!document.querySelector('#dictPanel').hidden`));
  check('听写时正文隐藏', await ev(`document.querySelector('#lshell').classList.contains('dict')`));
  const dpNo = Number(await ev(`document.querySelector('#dpNo').textContent`));
  const target = sentTexts[dpNo - 1];
  const tw = target.split(/\s+/);
  const partial = tw.slice(0, Math.max(1, tw.length - 2)).join(' ');
  await ev(`(()=>{const i=document.querySelector('#dpInput');i.value=${JSON.stringify(partial)};document.querySelector('#dpCheck').click();})()`);
  await sleep(400);
  const dpHtml = await ev(`document.querySelector('#dpResult').innerHTML`);
  const acc = Number((dpHtml.match(/<b>(\d+)%<\/b>/) || [])[1] || 0);
  check('听写核对：正确率按词计分', acc >= 50 && acc < 100, acc + '%（漏写 2 / 共 ' + tw.length + ' 词）');
  check('听写核对：漏写词被标记', /class="dw miss"/.test(dpHtml));
  check('听写核对：自动揭示原文', await ev(`!!document.querySelector('#lshell .sent.revealed')`));
  await shot('07-listen-dictation');
  await ev(`document.querySelector('#dictBtn').click()`);
  await sleep(300);
  check('退出听写面板', await ev(`document.querySelector('#dictPanel').hidden`));

  /* 6e. 录音降级 */
  await ev(`document.querySelector('#recBtn').click()`);
  await sleep(1000);
  check('无麦克风时给出提示而非崩溃', await ev(`document.querySelectorAll('.toast').length > 0 || document.querySelector('#recBtn').classList.contains('rec')`));
  await shot('08-listen-main');

  /* 7. 生词本 */
  await go('#/words');
  check('生词本列表渲染', await ev(`document.querySelectorAll('.word-row').length`) >= 10, await ev(`document.querySelectorAll('.word-row').length + ' 行'`));
  const before = await ev(`[...document.querySelectorAll('.word-row')].filter(r=>!r.classList.contains('hide')).length`);
  const firstWord = await ev(`document.querySelector('.word-row').dataset.k`);
  await ev(`(()=>{const q=document.querySelector('#wq');q.value=${JSON.stringify('')};q.dispatchEvent(new Event('input'));})()`);
  await ev(`(()=>{const q=document.querySelector('#wq');q.value=${JSON.stringify('%KEY%')};q.dispatchEvent(new Event('input'));})()`.replace('%KEY%', firstWord));
  await sleep(400);
  const after = await ev(`[...document.querySelectorAll('.word-row')].filter(r=>!r.classList.contains('hide')).length`);
  check('搜索可过滤列表', after >= 1 && after < before, `${before} → ${after}（关键词 ${firstWord}）`);
  await shot('09-words-search');
  await ev(`(()=>{const q=document.querySelector('#wq');q.value='';q.dispatchEvent(new Event('input'));})()`);
  await sleep(300);
  await ev(`(()=>{const s=document.querySelector('#wsort');s.value='az';s.dispatchEvent(new Event('change'));})()`);
  await sleep(350);
  check('按字母排序生效', await ev(`(()=>{const k=[...document.querySelectorAll('.word-row')].map(r=>r.dataset.k);return k.join('|')===k.slice().sort((a,b)=>a.localeCompare(b)).join('|')})()`));
  const lvVal = await ev(`document.querySelector('.word-row').dataset.lv`);
  await ev(`(()=>{const s=document.querySelector('#wlv');s.value='${lvVal}';s.dispatchEvent(new Event('change'));})()`.replace('${lvVal}', lvVal));
  await sleep(350);
  check('按等级筛选生效', await ev(`[...document.querySelectorAll('.word-row')].filter(r=>!r.classList.contains('hide')).every(r=>r.dataset.lv==='${lvVal}')`.replace('${lvVal}', lvVal)), '等级 ' + lvVal);
  await ev(`(()=>{const s=document.querySelector('#wlv');s.value='';s.dispatchEvent(new Event('change'));})()`);
  await sleep(250);
  await shot('10-words');
  check('导出 CSV 不抛错', await ev(`(()=>{try{exportWordsCSV();return true}catch(e){console.error(e);return false}})()`));

  /* 7b. 文章库搜索 */
  await go('#/library');
  check('文章库出现搜索框', await ev(`!!document.querySelector('#aq')`));
  await ev(`(()=>{const q=document.querySelector('#aq');q.value='zzz';q.dispatchEvent(new Event('input'));})()`);
  await sleep(350);
  check('无匹配时显示空结果', await ev(`document.querySelectorAll('.art-row.hide').length === document.querySelectorAll('.art-row').length && !document.querySelector('#aNone').hidden`));
  await ev(`(()=>{const q=document.querySelector('#aq');q.value='quiet';q.dispatchEvent(new Event('input'));})()`);
  await sleep(350);
  check('搜索能命中标题', (await ev(`[...document.querySelectorAll('.art-row')].filter(r=>!r.classList.contains('hide')).length`)) === 1);
  await shot('10b-library-search');
  await ev(`(()=>{const q=document.querySelector('#aq');q.value='';q.dispatchEvent(new Event('input'));})()`);
  await sleep(250);

  /* 8. 复习 */
  await ev(`Object.values(Store.words).forEach(w=>{w.srs={due:Date.now()-1000,ivl:0,reps:0,lapses:0}}); save(); refreshBadges();`);
  await go('#/review');
  check('复习页出现闪卡', await ev(`!!document.querySelector('#flashCard')`));
  await shot('11-review-front');
  await ev(`document.querySelector('#fcFlip').click()`);
  await sleep(500);
  check('翻面显示四个评分档', await ev(`document.querySelectorAll('#flashBack .grade').length === 4`));
  check('键盘提示已展示', await ev(`!!document.querySelector('.fkbd')`));
  await shot('12-review-back');
  const rb = await ev(`Store.log.reviews || 0`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'2',bubbles:true}))`);
  await sleep(600);
  const ra = await ev(`Store.log.reviews || 0`);
  check('键盘「2」评分生效', ra > rb, `${rb} → ${ra}`);

  /* 无到期词时的「再练一组」 */
  await ev(`Object.values(Store.words).forEach(w=>{w.srs={due:Date.now()+864e5,ivl:1,reps:1,lapses:0}}); save(); refreshBadges();`);
  await go('#/review');
  check('无到期词时显示完成态', await ev(`!!document.querySelector('.review-done')`));
  check('完成态提供「再练 10 个」', await ev(`!!document.querySelector('#extra10')`));
  await shot('12b-review-done');
  await ev(`document.querySelector('#extra10').click()`);
  await sleep(600);
  check('加练能开出闪卡', await ev(`!!document.querySelector('#flashCard')`));
  check('加练进度标记为「加练」', (await ev(`document.querySelector('.review-prog span:last-child')?.textContent || ''`)).includes('加练'));

  /* 9. 设置页：分类两栏 —— 左边分区，右边一次只显示一个面板 */
  await go('#/settings');
  check('设置页渲染', await ev(`document.querySelectorAll('.sn-item').length`) >= 6);
  check('设置页是两栏布局', await ev(`getComputedStyle(document.querySelector('.set-shell')).gridTemplateColumns.split(' ').length`) === 2,
    await ev(`getComputedStyle(document.querySelector('.set-shell')).gridTemplateColumns`));
  check('译文模式含「提示」选项', await ev(`!!document.querySelector('[data-trmode="hint"]')`));

  /* 点分区切面板 + 阅读预览联动 */
  await ev(`document.querySelector('.sn-item[data-tab="read"]').click()`);
  await sleep(450);
  check('点分区会切到对应面板',
    await ev(`location.hash === '#/settings/read' && getComputedStyle(document.querySelector('#pn-read')).display !== 'none'`),
    await ev(`location.hash`));
  const pvBefore = await ev(`(()=>{const p=document.querySelector('.pv-en');return p?getComputedStyle(p).fontSize:''})()`);
  await ev(`[...document.querySelectorAll('[data-fs]')][2].click()`);
  await sleep(250);
  const pvAfter = await ev(`(()=>{const p=document.querySelector('.pv-en');return p?getComputedStyle(p).fontSize:''})()`);
  check('字号改变会同步到预览', !!pvBefore && pvBefore !== pvAfter, `${pvBefore} → ${pvAfter}`);
  await ev(`[...document.querySelectorAll('[data-fs]')][1].click()`);
  await sleep(200);
  await shot('13-settings-read');

  /* 抓取代理设置 */
  await go('#/settings/net');
  check('设置页有抓取代理入口', await ev(`!!document.querySelector('#sProxy') && !!document.querySelector('#sProxyCheck')`));
  await ev(`(()=>{const i=document.querySelector('#sProxy');i.value='http://127.0.0.1:7890';i.dispatchEvent(new Event('change'));})()`);
  await sleep(300);
  check('代理地址会保存下来', (await ev(`Store.settings.crawlProxy`)) === 'http://127.0.0.1:7890');
  await ev(`document.querySelector('#sProxyCheck').click()`);
  await sleep(3000);
  const pout = await ev(`document.querySelector('#sProxyOut').textContent.trim()`);
  check('「检测」能给出结论（不是空转）', /代理/.test(pout) && pout.length > 6, pout.slice(0, 46));
  await shot('13b-proxy');
  await go('#/settings');
  await sleep(300);
  await shot('13-settings');
  await ev(`Store.settings.crawlProxy = ''; save();`);   // 复位，避免影响后续抓取

  /* 10. 链接抓取：先离线验证提取器，再对真实网络做软校验 */
  const P = 'For most of human history, silence was not a luxury but an ordinary condition of daily life, and people moved through it without noticing.';
  const Q = 'Only in the last two decades has that changed, as the phone turned every idle minute into a slot to be filled with something.';
  const R = 'The researchers found that participants who sat alone for fifteen minutes reported a sharper sense of their own thoughts than those who scrolled.';
  const S = 'What looks like wasted time, they argue, is where the mind quietly sorts experience into memory, and where most original ideas are actually born.';
  const T = 'In one experiment, people who had been bored on purpose were twice as likely to find a novel use for a plastic cup.';
  const FIXTURE = `<html><head><title>Site | The Quiet Revolution</title>
    <meta property="og:title" content="The Quiet Revolution">
    <meta property="og:site_name" content="Example Press"></head><body>
    <nav><a href="/">Home</a><a href="/world">World</a><a href="/tech">Tech</a></nav>
    <div class="sidebar"><p>Subscribe to our newsletter for daily updates and exclusive offers.</p><a href="#">Sign up now</a></div>
    <article><h2>A note on silence</h2><p>${P}</p><p>${Q}</p><p>${R}</p><p>${S}</p><p>📲 Get the latest on our app and more in Example App. ${T}</p></article>
    <footer>© 2026 Example Press. All rights reserved.</footer></body></html>`;
  const ex = await ev(`(()=>{const a=extractArticle(${JSON.stringify(FIXTURE)},'https://example.com/x');return {t:a.title,s:a.source,w:a.words,txt:a.text}})()`);
  check('提取器：标题取 og:title', ex.t === 'The Quiet Revolution', ex.t);
  check('提取器：来源取 og:site_name', ex.s === 'Example Press', ex.s);
  check('提取器：正文字数达标', ex.w >= 80, ex.w + ' 词');
  check('提取器：剔除导航与订阅模块', !/Subscribe|Sign up|All rights reserved|World/.test(ex.txt));
  check('提取器：削掉段首推广句、保住同段正文', !/Get the latest/.test(ex.txt) && /plastic cup/.test(ex.txt));
  check('提取器：保留全部正文段落', (ex.txt.match(/\./g) || []).length >= 3 && /idle minute/.test(ex.txt), ex.txt.slice(0, 60).replace(/\n/g, ' ') + '…');

  /* Cloudflare 拦截页不能被当成正文 */
  const blk = await ev(`(async()=>{
    const of = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ blocked:'cloudflare', ray:'a50e99758897bdff', error:'被 Cloudflare 判定为机器人访问，已拒绝（Ray ID a50e99758897bdff）' }),
      { status:403, headers:{ 'content-type':'application/json' } }));
    try { await crawlArticle('https://www.theatlantic.com/ideas/x'); return { kind:'none' }; }
    catch (e) { return { kind:e.kind, msg:e.message, ray:e.ray || '' }; }
    finally { window.fetch = of; }
  })()`);
  check('识别 Cloudflare 拦截并区分于网络故障', blk.kind === 'blocked' && /Ray ID/.test(blk.msg), blk.msg.slice(0, 34) + '…');
  check('拦截时带出 Ray ID', blk.ray === 'a50e99758897bdff', blk.ray);

  /* 新建精读：原文必须是「骨架」，而不是 AI 返回的段落。
     以前把用户原文整段喂给 AI、直接拿返回值当正文，prompt 又限了 1800 词，
     长文会被静默截断；这里用一段 1800 词的稿子验证「一字不少 + 自动分批」。 */
  await ev(`window.analyzeArticle = async ({ text }) => ({
    paragraphs: text.split(/\\n\\n+/).filter(Boolean).map(en => ({ en, zh: '【译】' + en.slice(0, 8) })),
    words: [], topic: '长文', difficulty: 'C1', summary_zh: '长文测试概要', summary_en: 'Long test', keyCollocations: [],
  })`);
  const pasteParas = [];
  for (let i = 0; i < 6; i++) pasteParas.push(Array.from({ length: 300 }, (_, j) => `alpha${i}beta${j}`).join(' ') + '.');
  const pasteText = pasteParas.join('\n\n');
  await go('#/new');
  await ev(`document.querySelector('#nText').value = ${JSON.stringify(pasteText)}`);
  await ev(`document.querySelector('#nText').dispatchEvent(new Event('input'))`);
  await ev(`document.querySelector('#nTitle').value = '长文测试'`);
  await ev(`document.querySelector('#nGo').click()`);
  await sleep(3000);
  const pasteRun = JSON.parse(await ev(`(()=>{const a=Store.articles.find(x=>x.title==='长文测试');
    return JSON.stringify(a ? { n:a.paragraphs.length, wc:a.wc, zh:a.paragraphs.filter(p=>p.zh).length,
      same:a.paragraphs.map(p=>p.en).join('\\n\\n')===${JSON.stringify(pasteText)} } : null)})()`));
  check('长文按原文段落切分（6 段）', pasteRun && pasteRun.n === 6, String(pasteRun && pasteRun.n));
  check('长文正文与粘贴内容逐字一致（AI 不改写、不截断）', pasteRun && pasteRun.same === true, String(pasteRun && pasteRun.same));
  check('长文全部段落拿到译文（自动分批）', pasteRun && pasteRun.zh === pasteRun.n, pasteRun ? `${pasteRun.zh}/${pasteRun.n}` : '');
  check('长文词数完整（≈1800 词）', pasteRun && pasteRun.wc >= 1800, String(pasteRun && pasteRun.wc));

  /* 分批并行 + 单批失败只影响自己（「有时候读不成功」的回归） */
  const perfParas = [];
  for (let i = 0; i < 6; i++) perfParas.push(Array.from({ length: 300 }, (_, j) => `omega${i}delta${j}`).join(' ') + '.');
  const perfText = perfParas.join('\n\n');
  await ev(`window.__ac = { active: 0, max: 0, done: 0 };
    window.analyzeArticle = async ({ text }) => {
      const ps = text.split(/\\n\\n+/).filter(Boolean);
      window.__ac.active++; window.__ac.max = Math.max(window.__ac.max, window.__ac.active);
      await new Promise(r => setTimeout(r, 350));
      window.__ac.active--; window.__ac.done++;
      return { paragraphs: ps.map(en => ({ en, zh: '【并行译】' })), words: [], topic: '', difficulty: 'C1',
        summary_zh: '', summary_en: '', keyCollocations: [] };
    };`);
  await go('#/new');
  await ev(`document.querySelector('#nText').value = ${JSON.stringify(perfText)}`);
  await ev(`document.querySelector('#nText').dispatchEvent(new Event('input'))`);
  await ev(`document.querySelector('#nTitle').value = '并行测试'`);
  await ev(`document.querySelector('#nGo').click()`);
  await sleep(3200);
  const par = await ev(`(()=>{const a=Store.articles.find(x=>x.title==='并行测试');
    return { max: window.__ac.max, done: window.__ac.done, zh: a ? a.paragraphs.filter(p=>p.zh).length : -1 };})()`);
  check('长文分批并行执行（不是一批批串行）', par.max >= 2 && par.done >= 2, JSON.stringify(par));
  check('并行后全部段落拿到译文', par.zh === 6, String(par.zh));

  await ev(`window.analyzeArticle = async ({ text }) => {
    const ps = text.split(/\\n\\n+/).filter(Boolean);
    if (ps.some(en => en.includes('omega5'))) throw new Error('模拟单批失败');
    return { paragraphs: ps.map(en => ({ en, zh: '【部分译】' })), words: [], topic: '', difficulty: 'C1',
      summary_zh: '', summary_en: '', keyCollocations: [] };
  };`);
  await go('#/new');
  await ev(`document.querySelector('#nText').value = ${JSON.stringify(perfText)}`);
  await ev(`document.querySelector('#nText').dispatchEvent(new Event('input'))`);
  await ev(`document.querySelector('#nTitle').value = '部分失败测试'`);
  await ev(`document.querySelector('#nGo').click()`);
  await sleep(3400);
  const part = await ev(`(()=>{const a=Store.articles.find(x=>x.title==='部分失败测试');
    return a ? { zh: a.paragraphs.filter(p=>p.zh).length, n: a.paragraphs.length } : null;})()`);
  check('单批失败不影响其余译文（可稍后补）', part && part.zh === 4 && part.n === 6, JSON.stringify(part));

  let artUrl = '';
  for (let i = 0; i < 2 && !artUrl; i++) {
    const rel = await ev(`(async()=>{try{const h=await (await fetch('/__fetch?url='+encodeURIComponent('https://text.npr.org'))).text();const m=h.match(/href="(\\/[a-z]+-s\\d+-\\d+)"/);return m?m[1]:''}catch(e){return ''}})()`);
    if (rel) artUrl = 'https://text.npr.org' + rel;
    else await sleep(600);
  }
  await go('#/new');
  check('新建页出现抓取入口', await ev(`!!document.querySelector('#nUrl') && !!document.querySelector('#nCrawl')`));
  if (artUrl) {
    await ev(`document.querySelector('#nUrl').value=${JSON.stringify(artUrl)}`);
    await ev(`document.querySelector('#nCrawl').click()`);
    await sleep(7000);
    const got = await ev(`({ words: countWords(document.querySelector('#nText').value), title: document.querySelector('#nTitle').value, src: document.querySelector('#nSrc').value, head: document.querySelector('#nText').value.slice(0,80) })`);
    check('真实抓取并填入正文', got.words > 80, got.words + ' 词 · ' + got.title);
    check('自动填入标题与来源', got.title.length > 5 && got.src.length > 2, got.src);
    check('正文开头是文章句子而非导航', got.words > 80 && !/cookie|subscribe|menu/i.test(got.head), got.head.replace(/\n/g, ' '));
    await shot('14-crawl');
    await ev(`document.querySelector('#nCrawl').click()`);
    await sleep(300);
    await ev(`document.querySelector('.modal [data-r="0"]')?.click()`);
    await sleep(200);
  } else {
    check('真实抓取并填入正文', false, '外网不可达 / 站点限流，跳过', true);
  }

  /* 10b. 订阅源：先离线验证解析，再对真实 RSS 做软校验 */
  const RSS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Demo</title>
    <item><title>First &amp; Foremost</title><link>https://example.com/a</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Intro text here.&lt;/p&gt;</description></item>
    <item><title>Second Piece</title><link>https://example.com/b</link><pubDate>Sun, 25 Oct 2026 10:00:00 GMT</pubDate><description>Older one</description></item>
  </channel></rss>`;
  const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>D</title>
    <entry><title>Atom One</title><link rel="alternate" href="https://example.com/c"/><updated>2026-10-26T08:00:00Z</updated><summary>Sum here</summary></entry>
  </feed>`;
  const rf = await ev(`parseFeed(${JSON.stringify(RSS)},'https://example.com/feed')`);
  check('RSS 解析：条目齐全且按时间倒序',
    rf.length === 2 && rf[0].title === 'First & Foremost' && (rf[0].date || 0) > (rf[1].date || 0),
    rf.map(x => x.title).join(' | '));
  check('RSS 解析：摘要去标签', rf[0].desc === 'Intro text here.', rf[0].desc);
  const af = await ev(`parseFeed(${JSON.stringify(ATOM)},'https://example.com/feed')`);
  check('Atom 解析：取 alternate 链接', af.length === 1 && af[0].url === 'https://example.com/c', af[0] && af[0].url);

  await go('#/new');
  await ev(`document.querySelector('#nText').value=''`);   // 清掉上一节抓进来的正文，避免触发覆盖确认
  check('新建页列出内置订阅源', (await ev(`document.querySelectorAll('#srcChips .src-chip[data-feed]').length`)) >= 5,
    await ev(`document.querySelectorAll('#srcChips .src-chip[data-feed]').length + ' 个'`));
  check('内置大西洋月刊', await ev(`[...document.querySelectorAll('#srcChips .src-chip')].some(b=>b.dataset.name==='大西洋月刊')`));

  await ev(`[...document.querySelectorAll('#srcChips .src-chip')].find(b=>b.dataset.name==='NPR').click()`);
  await sleep(8000);
  const nItems = await ev(`document.querySelectorAll('#fbBody .fb-item').length`);
  check('点来源能列出最新文章', nItems > 3, nItems + ' 篇（NPR）', !nItems);
  if (nItems > 0) {
    await shot('18-feed-list');
    const firstUrl = await ev(`document.querySelector('#fbBody .fb-item').dataset.url`);
    await ev(`document.querySelector('#fbBody .fb-item').click()`);
    await sleep(700);
    check('点某篇会回填链接并开始抓取', (await ev(`document.querySelector('#nUrl').value`)) === firstUrl, firstUrl);
    check('列表面板自动收起', await ev(`document.querySelector('#feedBox').hidden`));
  } else {
    check('点某篇会回填链接并开始抓取', false, 'RSS 不可达，跳过', true);
  }

  /* 11. 深色主题 + 移动端（设备模拟偶发不可用，失败记 SKIP） */
  await ev(`applyTheme('dark')`);
  await go('#/words');
  await shot('14-words-dark');
  await ev(`applyTheme('light')`);

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    await go('#/reader/' + artId);
    await shot('15-mobile-reader');
    const mLeft = await ev(`getComputedStyle(document.querySelector('.read-progress')).left`);
    check('移动端进度条贴左边', mLeft === '0px', mLeft);
    await go('#/shelf');
    await sleep(400);
    const shOverflow = await ev(`document.documentElement.scrollWidth - innerWidth`);
    check('390px 书架无横向溢出', shOverflow <= 0, '溢出 ' + shOverflow + 'px');
    await shot('15b-mobile-shelf');
    await go('#/listen/' + artId);
    await sleep(500);
    await ev(`document.querySelector('#dictBtn').click()`);
    await sleep(700);
    await shot('16-mobile-dictation');
    await ev(`document.querySelector('#dictBtn').click()`);
    await go('#/words');
    await shot('17-mobile-words');

    /* 设置页在手机上变回「分类列表 → 下钻」 */
    await go('#/settings');
    await sleep(450);
    const mSet = await ev(`({
      nav: getComputedStyle(document.querySelector('.set-nav')).display !== 'none',
      pane: getComputedStyle(document.querySelector('.set-pane')).display })`);
    check('390px 设置页先出分类列表', mSet.nav === true && mSet.pane === 'none', JSON.stringify(mSet));
    await go('#/settings/read');
    await sleep(550);
    const mSet2 = await ev(`({
      nav: getComputedStyle(document.querySelector('.set-nav')).display,
      pane: getComputedStyle(document.querySelector('#pn-read')).display,
      back: getComputedStyle(document.querySelector('#setBack')).display,
      ox: document.documentElement.scrollWidth - innerWidth })`);
    check('390px 点分区进入详情（带回退、无横向溢出）',
      mSet2.nav === 'none' && mSet2.pane !== 'none' && mSet2.back !== 'none' && mSet2.ox <= 0,
      JSON.stringify(mSet2));
    await shot('15c-mobile-settings');
  } catch (e) {
    check('移动端布局检查', false, '设备模拟不可用：' + e.message, true);
  } finally {
    try { await send('Emulation.clearDeviceMetricsOverride'); } catch (e) {}
  }

  /* 11b. 布局回归：词卡不出界 / 移动端工具条不溢出 / toast 不压底栏 */
  await go('#/reader/' + artId);
  const cards = await ev(`(async()=>{
    const out=[];
    const els=[...document.querySelectorAll('#rBody span.vw')];
    for (let i=0;i<els.length && out.length<6;i+=4){
      const el=els[i]; el.scrollIntoView({block:'center'});
      await new Promise(r=>setTimeout(r,30));
      const r=el.getBoundingClientRect(); if(r.width<1) continue;
      el.click(); await new Promise(r=>setTimeout(r,60));
      const c=document.querySelector('.wcard'); if(!c) continue;
      const cr=c.getBoundingClientRect();
      out.push(cr.top>=0 && cr.left>=0 && cr.bottom<=innerHeight+0.5 && cr.right<=innerWidth+0.5);
      document.querySelector('.wc-backdrop')?.click();
      await new Promise(r=>setTimeout(r,30));
    }
    return out;
  })()`);
  check('词卡始终完整落在视口内', cards.length > 0 && cards.every(Boolean), `${cards.filter(Boolean).length}/${cards.length}`);

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    await go('#/reader/' + artId);
    const tb = await ev(`(()=>{const t=document.querySelector('.toolbar');const it=[...t.children].filter(c=>c.offsetWidth>0);const last=it[it.length-1];return {o:t.scrollWidth-t.clientWidth,r:Math.round(last.getBoundingClientRect().right),vw:innerWidth,n:it.length}})()`);
    check('390px 工具条无横向溢出、末项可见', tb.o <= 0 && tb.r <= tb.vw, `溢出 ${tb.o}px · 末项右边界 ${tb.r}/${tb.vw}`);
    const tz = await ev(`(async()=>{toast('t');await new Promise(r=>setTimeout(r,150));
      const t=document.querySelector('.toast'),b=document.querySelector('#tabbar');
      if(!t||!b) return null; return t.getBoundingClientRect().bottom <= b.getBoundingClientRect().top;})()`);
    check('toast 不压住底部导航', tz === true, String(tz));
  } catch (e) {
    check('移动端布局检查（第二轮）', false, e.message, true);
  } finally {
    try { await send('Emulation.clearDeviceMetricsOverride'); } catch (e) {}
  }

  /* 11c. 主题：六套配色都能正确解析，正文对比度达标 */
  const themeInfo = await ev(`(async()=>{
    const ids = THEMES.map(t=>t.id), out=[];
    const lum = h => { const n=h.replace('#',''); const [r,g,b]=[0,2,4].map(i=>parseInt(n.substr(i,2),16)/255)
      .map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)); return .2126*r+.7152*g+.0722*b; };
    for (const id of ids) {
      applyTheme(id);
      await new Promise(r=>setTimeout(r,60));
      const cs = getComputedStyle(document.documentElement);
      const p = cs.getPropertyValue('--paper').trim(), i = cs.getPropertyValue('--ink').trim();
      const l1 = lum(p), l2 = lum(i);
      out.push({ id, got: document.documentElement.dataset.theme,
                 ratio: +((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)).toFixed(2) });
    }
    applyTheme('auto');
    return out;
  })()`);
  check('六套主题都能正确解析', themeInfo.filter(t => t.id === t.got).length === 6, themeInfo.map(t => t.got).join('/'));
  const worst = Math.min(...themeInfo.map(t => t.ratio));
  check('每套主题正文对比度 ≥ 7:1', worst >= 7, '最低 ' + worst + ':1');

  /* 11d. 新特性：界面主色 / 复习词点线 / 手机长段分块 */
  const accTest = await ev(`(async()=>{
    const root=document.documentElement;
    const before=getComputedStyle(root).getPropertyValue('--accent').trim();
    applyAccent('ocean');
    await new Promise(r=>setTimeout(r,50));
    const after=getComputedStyle(root).getPropertyValue('--accent').trim();
    applyAccent('coral');
    return { before, after };
  })()`);
  check('切换界面主色会改变强调色', accTest.before !== accTest.after, accTest.before + ' → ' + accTest.after);
  await go('#/settings');
  check('设置页提供 6 套界面主色', (await ev(`document.querySelectorAll('#sAccentPicks .accent-pick').length`)) === 6);
  check('设置页有复习词标注开关', await ev(`!!document.querySelector('#sReviewSw')`));
  const layList = await ev(`[...document.querySelectorAll('[data-layout]')].map(b=>b.dataset.layout)`);
  check('设置页提供六种阅读版式', layList.length === 6, layList.join('/'));
  check('手机三种读法齐全', ['immersive', 'pages', 'big'].every(k => layList.includes(k)), layList.join('/'));

  const rev = await ev(`(()=>{
    const a=Store.articles[0]; if(!a||!a.words.length) return {skip:true};
    a.words[0].review=true; a.words[0].level='cet4';
    save(); Router.go('#/reader/'+a.id); return {skip:false};
  })()`);
  if (!rev.skip) {
    await sleep(800);
    const rr = await ev(`(()=>{const s=document.querySelector('#rBody .vw.review');
      return {n:document.querySelectorAll('#rBody .vw.review').length, style:s?getComputedStyle(s).borderBottomStyle:'', legend:!!document.querySelector('.hl-legend')}})()`);
    check('复习词用点线与新词区分', rr.n > 0 && rr.style === 'dotted', `${rr.n} 处 · ${rr.style}`);
    check('复习词有图例说明', rr.legend);
    await ev(`(()=>{Store.articles[0].words.forEach(w=>delete w.review); save()})()`);
  }

  const long = await ev(`(()=>{
    const s='The arrival of the telegraph compressed distance, and the arrival of the smartphone compressed everything else. ';
    const p=(s+'We now expect an answer within seconds and a verdict within minutes. ').repeat(6);
    const art={id:'zz-long',createdAt:Date.now(),title:'Long',source:'Test',topic:'',difficulty:'C1',
      summary_zh:'',summary_en:'',keyCollocations:[],paragraphs:[{en:p,zh:'译文'}],words:[],wc:countWords(p),level:'cet6'};
    Store.articles.push(art); save(); Router.go('#/reader/zz-long');
    return {words:countWords(p)};
  })()`);
  await sleep(900);
  check('长段落生成句子块', (await ev(`document.querySelectorAll('#rBody .chunk').length`)) > 1, long.words + ' 词');
  check('桌面端分块保持行内（不破坏版面）', (await ev(`getComputedStyle(document.querySelector('#rBody .chunk')).display`)) === 'inline');
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    await go('#/reader/zz-long');
    const mk = await ev(`(()=>{const cs=[...document.querySelectorAll('#rBody .chunk')];
      const r=cs.map(c=>c.getBoundingClientRect());
      return {display:getComputedStyle(cs[0]).display, gap:Math.round(r[1].top-r[0].bottom), overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
    check('手机端长段切成独立小块', mk.display === 'block' && mk.gap >= 10, `块间距 ${mk.gap}px`);
    check('分块后仍无横向滚动', !mk.overflow);
  } finally {
    try { await send('Emulation.clearDeviceMetricsOverride'); } catch (e) {}
    await ev(`(()=>{Store.articles=Store.articles.filter(a=>a.id!=='zz-long'); save()})()`);
  }

  /* 12. 书签小工具：在一个独立页面上跑，验证它真能取到正文 */
  const bmSrc = String(await ev(`BOOKMARKLET`)).replace(/^javascript:/i, '');   // 要先在应用页里取到
  const fixture = 'data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!doctype html><meta charset="utf-8"><title>Fixture</title><article><h1>Fixture Title</h1><p>'
    + 'The morning light fell across an empty desk and nobody came to collect the papers. '.repeat(12)
    + '</p></article>');
  await send('Page.navigate', { url: fixture });
  await sleep(900);
  const bmWords = await ev(`(async()=>{
    const src = ${JSON.stringify(bmSrc)};
    let got = null;
    const oa = window.alert, op = window.prompt;
    window.alert = () => {};
    window.prompt = (m, v) => { got = v; return null; };      // clipboard 不可用时的兜底路径
    try {
      if (navigator.clipboard) navigator.clipboard.writeText = t => { got = t; return Promise.resolve(); };
    } catch (e) {}
    try { (0, eval)(src); await new Promise(r => setTimeout(r, 200)); }
    finally { window.alert = oa; window.prompt = op; }
    return got ? got.split(/\\s+/).filter(Boolean).length : 0;
  })()`);
  check('书签脚本能从原文页取出正文', bmWords > 80, bmWords + ' 词');

  /* 文件导入不应更改 API 凭据或连接设置。 */
  await send('Page.navigate', { url: BASE });
  await sleep(1500);
  const backupResult = await ev(`(() => {
    const original = { ...Store.settings };
    Store.settings.apiKey = 'local-test-key';
    const imported = importData(JSON.stringify({ articles: [], words: {}, settings: {
      apiKey: 'backup-test-key', baseUrl: 'https://example.invalid/v1', model: 'different-model',
      crawlProxy: 'http://127.0.0.1:8080', showTr: 'always',
    }}));
    const result = {
      kept: Store.settings.apiKey === 'local-test-key' && Store.settings.baseUrl === original.baseUrl
        && Store.settings.model === original.model && Store.settings.crawlProxy === original.crawlProxy,
      restored: Store.settings.showTr === 'always' && imported.newArt === 0,
    };
    Object.assign(Store.settings, original);
    save();
    return result;
  })()`);
  check('导入备份不会替换本地 API 凭据、服务地址或代理', backupResult.kept);
  check('导入备份仍可以恢复阅读偏好', backupResult.restored);

  /* 9. 刊物书架：先验证默认空态，再注入原创测试数据 */
  await send('Page.navigate', { url: BASE });      // 上一节跑在 data: 页面上，回到应用
  await sleep(1500);
  await go('#/shelf');
  check('导航含「刊物」入口', await ev(`!!document.querySelector('[data-nav="shelf"]')`));
  check('默认构建不包含第三方刊物', await ev(`builtinIssues().length === 0 && !!document.querySelector('.empty')`));
  const fixtureParagraphs = [
    'The first ferry reached the quiet harbor shortly after sunrise.',
    'A small group of volunteers waited beside an empty warehouse.',
    'They could testify that the old clock had never missed a morning.',
    'A baker opened her window and set a tray beside the counter.',
    'Across the street, someone was learning to mend a bicycle tire.',
    'When the tide came in, the ferry returned to collect the crew.',
    'Nobody expected the afternoon to pass quite so quickly.',
    'At dusk the harbor lights reflected on the glassy water.',
  ];
  const issues = [1, 2].map(issue => ({
    id: 'fixture-issue-' + issue,
    label: '测试刊物 ' + issue,
    source: '原创测试数据',
    articles: Array.from({ length: 8 }, (_, i) => ({
      key: `fixture-${issue}-${i}`,
      title: i % 2 ? `Morning trip ${i}` : `The Harbor ${i}`,
      paragraphs: fixtureParagraphs,
      wc: fixtureParagraphs.join(' ').split(/\s+/).length,
    })),
  }));
  await ev(`window.BUILTIN_ISSUES = ${JSON.stringify(issues)}`);
  await go('#/shelf');
  const issueN = await ev(`document.querySelectorAll('#issueChips .src-chip').length`);
  check('书架渲染期号 chips', issueN >= 2, issueN + ' 期');
  const shelfN = await ev(`document.querySelectorAll('#sList .art-row').length`);
  check('书架列出内文章', shelfN >= 8, shelfN + ' 篇');
  check('书架标注词量', await ev(`/\\d+ 词/.test(document.querySelector('#sList .art-meta').textContent)`));
  await shot('10-shelf');

  const firstIssue = await ev(`document.querySelector('#issueChips .src-chip.on').dataset.issue`);
  await ev(`document.querySelectorAll('#issueChips .src-chip')[1].click()`);
  await sleep(800);
  check('切换期号刷新列表', await ev(`document.querySelector('#issueChips .src-chip.on').dataset.issue`) !== firstIssue,
    await ev(`document.querySelector('#issueChips .src-chip.on').textContent.trim()`));

  await ev(`document.querySelector('#sq').value='the'; document.querySelector('#sq').dispatchEvent(new Event('input'))`);
  await sleep(300);
  check('书架搜索能过滤', await ev(`document.querySelector('#sCount').textContent.includes('匹配')`),
    await ev(`document.querySelector('#sCount').textContent`));
  await ev(`document.querySelector('#sq').value=''; document.querySelector('#sq').dispatchEvent(new Event('input'))`);
  await sleep(200);

  await ev(`document.querySelector('#sList [data-open2]').click()`);
  await sleep(1100);
  const builtinId = await ev(`location.hash.replace('#/reader/','')`);
  check('点「精读」进入内置文章', builtinId.startsWith('fixture-') && await ev(`document.querySelectorAll('#rBody .para').length`) > 5, builtinId);
  check('原文模式提示条出现', await ev(`!!document.querySelector('#aiBanner')`));
  check('未精读段落显示占位文案', await ev(`!!document.querySelector('#rBody .tr-empty')`));
  check('内置文章已进入文章库', await ev(`Store.articles.some(a=>a.id==='${builtinId}')`));
  check('未配置 Key 时点 AI 精读会引导去设置', await ev(`(()=>{document.querySelector('#rdAI').click(); return true})()`));
  await sleep(700);
  check('未配置 Key 时跳到设置页', await ev(`location.hash === '#/settings'`), await ev(`location.hash`));
  await go('#/reader/' + builtinId);
  await shot('11-reader-builtin');

  /* 用假的 AI 结果验证「精读合并」：段落对齐 / 译文落位 / 生词归属段落 */
  await ev(`window.analyzeArticle = async ({ text }) => {
    const ps = text.split(/\\n\\n+/).filter(Boolean);
    const ex = (ps[2] || ps[0] || '').slice(0, 40);
    return {
      paragraphs: ps.map(en => ({ en, zh: '【测试译文】' + en.slice(0, 10) })),
      words: [{ word: 'testify', forms: ['testified'], phonetic: '/ˈtestɪfaɪ/', pos: 'v.', level: 'CET-6',
        meaning_zh: '证明；作证', example_en: ex, example_zh: '测试例句',
        paraIndex: 5, collocations: [{ en: 'testify to', zh: '证明' }] }],
      topic: '测试主题', difficulty: 'C1', summary_zh: '测试概要', summary_en: 'Test summary',
      keyCollocations: [{ en: 'at the expense of', zh: '以…为代价' }],
    };
  };`);
  await ev(`Store.settings.apiKey = 'sk-test'`);
  await ev(`document.querySelector('#rdAI').click()`);
  await sleep(2600);
  check('AI 精读后提示条消失', await ev(`!document.querySelector('#aiBanner')`));
  const zhRatio = await ev(`(()=>{const a=Store.articles.find(x=>x.id==='${builtinId}');return a.paragraphs.filter(p=>p.zh).length + '/' + a.paragraphs.length})()`);
  const zhPair = zhRatio.split('/').map(Number);
  check('全部段落拿到译文', zhPair[0] > 0 && zhPair[0] === zhPair[1], zhRatio);
  check('段落译文只落在对应段', await ev(`/^【测试译文】/.test(document.querySelector('#rBody .tr-full').textContent)`));
  check('生词按原文归位（不信任 AI 的 paraIndex）', await ev(`(()=>{
    const a=Store.articles.find(x=>x.id==='${builtinId}');const w=(a.words||[])[0];
    if(!w) return false;
    const i=a.paragraphs.findIndex(p=>(p.en||'').startsWith(w.example_en));
    return i >= 0 && w.paraIndex === i && i !== 5;
  })()`),
    await ev(`(()=>{const a=Store.articles.find(x=>x.id==='${builtinId}');const w=(a.words||[])[0];
      const i=a.paragraphs.findIndex(p=>(p.en||'').startsWith(w.example_en));
      return 'paraIndex=' + (w||{}).paraIndex + ' 实际段=' + i})()`));
  check('概要已写入', await ev(`/测试概要/.test(document.querySelector('.rd-sum')?.textContent||'')`));
  await shot('12-reader-analyzed');
  await ev(`Store.settings.apiKey = ''`);

  await go('#/listen/' + builtinId);
  const sents = await ev(`document.querySelectorAll('#sents .sent').length`);
  check('内置文章可精听（逐句）', sents > 5, sents + ' 句');

  /* 12. 闭环：文末小结 → 复习本篇 → 阅读位置记忆 */
  // 前面的连续滚动用例把 paged 关掉了，这里切回分页（这也是默认值）
  await ev(`Store.settings.paged = true; save()`);
  await go('#/reader/sample-doing-nothing');
  await sleep(500);
  const pagesTotal = Number((await ev(`document.querySelector('#pgInfo').textContent`)).split('/')[1].trim()) || 1;
  check('小结卡在第 1 页不出现', await ev(`document.querySelector('#artEnd').hidden`), '共 ' + pagesTotal + ' 页');
  for (let i = 1; i < pagesTotal; i++) { await ev(`document.querySelector('#pgNext').click()`); await sleep(260); }
  check('翻到最后一页出现小结卡', await ev(`!document.querySelector('#artEnd').hidden`));
  check('小结卡给出本篇读数', await ev(`/\\d+/.test(document.querySelector('.ae-stats b').textContent)`),
    await ev(`[...document.querySelectorAll('.ae-stats div')].map(d=>d.textContent.trim()).join(' · ')`));
  check('小结卡有「复习本篇生词」', await ev(`!!document.querySelector('#aeReview')`));
  await ev(`document.querySelector('#artEnd').scrollIntoView({ block: 'center' })`);
  await sleep(400);
  await shot('13-art-end');

  await ev(`document.querySelector('#aeReview').click()`);
  await sleep(600);
  check('进入按篇复习', (await ev(`location.hash`)).startsWith('#/review/'), await ev(`location.hash`));
  check('进度条标记「本篇」', (await ev(`document.querySelector('.review-prog span:last-child').textContent`)).includes('本篇'),
    await ev(`document.querySelector('.review-prog span:last-child').textContent`));
  check('按篇复习能开出闪卡', await ev(`!!document.querySelector('#flashCard')`),
    await ev(`document.querySelector('.review-prog span').textContent`));
  await shot('14-review-by-article');

  /* 位置记忆：离开时记住了最后一页，回来应该还在最后一页 */
  await go('#/reader/sample-doing-nothing');
  await sleep(600);
  const backPage = await ev(`document.querySelector('#pgInfo').textContent`);
  check('重新进入回到上次那一页', Number(backPage.split('/')[0].trim()) === pagesTotal, backPage);

  /* 13. 注释本版式：正文 + 右侧词注外栏 */
  await ev(`Store.settings.readerLayout='annotated'; save(); Router.go('#/reader/sample-doing-nothing')`);
  await sleep(800);
  const anno = await ev(`({
    marg: document.querySelectorAll('#rBody .marg').length,
    para: document.querySelectorAll('#rBody .para').length,
    items: document.querySelectorAll('#rBody .m-item').length,
    no: document.querySelectorAll('.a-head .a-no').length,
    pager: !!document.querySelector('#pager'),
    end: !!document.querySelector('#artEnd') && !document.querySelector('#artEnd').hidden })`);
  check('注释本：每段一个外栏', anno.marg === anno.para && anno.marg > 5, `${anno.marg} 栏 / ${anno.para} 段`);
  check('注释本：外栏列出本段词条', anno.items > 10, anno.items + ' 条');
  check('注释本：段号行齐备', anno.no === anno.para, anno.no + ' 个');
  check('注释本：不再有分页条', anno.pager === false);
  check('注释本：文末小结仍然可见', anno.end === true);
  await shot('15-layout-annotated');

  await ev(`document.querySelector('#rBody .m-item').click()`);
  await sleep(450);
  check('注释本：点外栏词条弹出生词卡', await ev(`!!document.querySelector('.wcard')`),
    await ev(`document.querySelector('.wcard .wcard-word')?.textContent || ''`));
  await ev(`document.querySelector('.wc-backdrop')?.click()`);
  await sleep(200);

  await ev(`document.querySelector('#rBody [data-tr]').click()`);
  await sleep(300);
  check('注释本：段落译文可展开', await ev(`(p=>getComputedStyle(p.querySelector('.tr-body')).display!=='none')(document.querySelector('#rBody .para'))`));

  await ev(`Store.settings.theme='night'; applyTheme('night'); save()`);
  await sleep(400);
  check('注释本：夜间主题下外栏仍可读', await ev(`(()=>{const m=document.querySelector('.m-item b');
    return m && getComputedStyle(m).color !== getComputedStyle(document.body).backgroundColor})()`));
  await shot('16-layout-annotated-night');
  await ev(`Store.settings.theme='paper'; applyTheme('paper'); save()`);
  await sleep(300);

  /* 14. 卡片版式：段落卡片 + 词汇栏 */
  await ev(`Store.settings.readerLayout='desk'; save(); Router.go('#/reader/sample-doing-nothing')`);
  await sleep(800);
  const desk = await ev(`({
    cards: document.querySelectorAll('#rBody .dcard').length,
    side: document.querySelectorAll('.vs-item').length,
    chips: document.querySelectorAll('#rBody .d-chip').length })`);
  check('卡片：每段一张卡', desk.cards > 5, desk.cards + ' 张');
  check('卡片：右栏列出全部生词', desk.side >= 20, desk.side + ' 词');
  check('卡片：每张卡底部有本段词条', desk.chips > 10, desk.chips + ' 个');
  await shot('17-layout-desk');

  await ev(`document.querySelectorAll('.vs-item')[3].click()`);
  await sleep(700);
  check('卡片：点词汇栏能定位并高亮该段', await ev(`[...document.querySelectorAll('#rBody .dcard')].some(c=>c.classList.contains('flash'))`));

  await ev(`document.querySelector('#rBody .dcard [data-tr]').click()`);
  await sleep(300);
  check('卡片：段落译文可展开', await ev(`(p=>getComputedStyle(p.querySelector('.tr-body')).display!=='none')(document.querySelector('#rBody .dcard'))`));
  await shot('18-layout-desk-open');

  /* 换回默认版式，别把状态留给下一个人 */
  await ev(`Store.settings.readerLayout='annotated'; save()`);

  /* 15. 长难句解析：工具栏开关 → 句末圆点 → 拆解面板 */
  await ev(`Store.settings.sentenceMode=false; save(); Router.go('#/reader/sample-doing-nothing')`);
  await sleep(700);
  check('默认不显示句子层', await ev(`document.querySelectorAll('.snt').length`) === 0,
    String(await ev(`document.querySelectorAll('.snt').length`)));

  await ev(`document.querySelector('#tbSent').click()`);
  await sleep(500);
  const sntN = await ev(`document.querySelectorAll('.snt').length`);
  check('打开句子层后按句切分', sntN > 20, sntN + ' 句');
  check('每句都有拆解入口', await ev(`document.querySelectorAll('.snt-btn').length`) === sntN);
  await shot('19-sentence-mode');

  /* 桩掉 AI，顺便数调用次数验证缓存 */
  await ev(`window.__sntCalls = 0;
    window.parseSentence = async () => { window.__sntCalls++; return {
      gist: '维多利亚时代的人凭直觉就明白这件事。',
      parts: [
        { en: 'The Victorians', zh: '维多利亚时代的人', role: '先说清楚是谁' },
        { en: 'understood this instinctively', zh: '本能地理解了这一点', role: '说明他们怎么懂的' },
      ],
      grammar: [{ point: '先否定再肯定', note: 'not A but B，重心落在后半句' }],
      why_hard: '中间插了一句题外话，把"谁做了什么"隔开了三十多个词。',
      rewrite: ['The Victorians understood this by instinct.'],
      zh: '维多利亚时代的人凭直觉就明白了这一点。',
      phrases: [{ en: 'quiet foundation', zh: '安静的根基' }],
    }; }`);

  await ev(`document.querySelectorAll('.snt-btn')[1].click()`);
  await sleep(600);
  check('点句末圆点打开拆解面板', await ev(`!!document.querySelector('.snt-panel')`));
  check('面板先用一句话说清这句', await ev(`/维多利亚/.test(document.querySelector('.sp-gist').textContent)`),
    await ev(`document.querySelector('.sp-gist').textContent`));
  check('拆开看按"中文 + 原文 + 作用"三层给', (await ev(`document.querySelectorAll('.sp-part').length`)) === 2,
    await ev(`[...document.querySelectorAll('.sp-part b')].map(n=>n.textContent).join(' / ')`));
  check('面板分节完整（说清/拆解/写法/卡在哪/意思）',
    await ev(`['sp-gist','sp-part','sp-gram','sp-why','sp-zh'].every(c => !!document.querySelector('.' + c))`),
    String(await ev(`document.querySelectorAll('.sp-sec').length`)) + ' 节');
  await shot('20-sentence-panel');

  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(300);
  check('Esc 关闭拆解面板', await ev(`!document.querySelector('.snt-panel')`));

  await ev(`document.querySelectorAll('.snt-btn')[1].click()`);
  await sleep(500);
  check('同一句再点不重复调 AI（走缓存）', await ev(`window.__sntCalls`) === 1, '调用 ' + await ev(`window.__sntCalls`) + ' 次');
  await ev(`document.querySelector('.sp-x').click()`);
  await sleep(200);

  await ev(`document.querySelector('#tbSent').click()`);
  await sleep(400);
  check('关掉句子层后恢复纯阅读', await ev(`document.querySelectorAll('.snt').length`) === 0);

  await ev(`Store.settings.sentenceMode=false; save()`);

  /* ============================================================
     16. 回归：异步生命周期与容错（2026-11-04 的修复项，防再次退化）
     ============================================================ */

  /* 16a. 离开听力页后必须真的停下。
     playFrom 的循环以前只把 'error' 当终止，而外部 stop() 让 speak resolve 成 'stopped'，
     于是「被停掉」被当成「读完」，跳页之后还在继续朗读。 */
  await go('#/library');
  await go('#/listen/' + artId);
  await sleep(400);
  await ev(`window.__calls=[]; TTS.speak=(t)=>{window.__calls.push(1);return new Promise(r=>setTimeout(()=>r('end'),60));};`);
  await ev(`document.querySelector('#lPlay').click()`);
  await sleep(450);
  const callsStay = await ev(`window.__calls.length`);
  await ev(`Router.go('#/library')`);
  await sleep(1300);
  const callsAfterNav = await ev(`window.__calls.length`);
  check('离开听力页后停止朗读', callsAfterNav - callsStay <= 1, `${callsStay} → ${callsAfterNav}`);
  check('听力页已切走', (await ev(`location.hash`)) === '#/library');

  /* 16b. 句子面板跨路由要自动关闭（closeOverlays 以前漏了 .snt-panel） */
  await go('#/reader/' + artId);
  await sleep(400);
  await ev(`document.querySelector('#tbSent').click()`);
  await sleep(450);
  await ev(`document.querySelectorAll('.snt-btn')[0].click()`);
  await sleep(600);
  check('句子面板打开（前置）', await ev(`!!document.querySelector('.snt-panel')`));
  await ev(`Router.go('#/library')`);
  await sleep(600);
  check('切页后句子面板自动关闭', await ev(`!document.querySelector('.snt-panel')`));

  /* 16c. 缺字段的文章：给可自救援的错误页，而不是「点了没反应」 */
  await ev(`Store.articles.push({id:'probe-bad', title:'坏数据探针', paragraphs:[{en:'Hello world. This is a probe.'}], wc:6, createdAt:Date.now()}); save();`);
  /* 这个用例故意触发一次渲染异常，Router 会 console.error —— 暂时静音，
     否则「控制台异常」里会多一条预期内的报错，掩盖以后真正的异常。 */
  await ev(`window.__ce = console.error; console.error = () => {};`);
  await go('#/reader/probe-bad');
  check('缺字段的文章给出错误页', await ev(`!!document.querySelector('#viewErr')`));
  check('错误页提供「修复这篇」', await ev(`!!document.querySelector('#veFix')`));
  await ev(`console.error = window.__ce;`);
  await ev(`document.querySelector('#veFix').click()`);
  await sleep(700);
  check('修复后能正常打开', await ev(`!!document.querySelector('#rBody')`));
  await ev(`Store.articles = Store.articles.filter(a => a.id !== 'probe-bad'); save();`);

  /* 16d. 没填 API Key 也能收词；没有释义的词不进复习队列 */
  await go('#/reader/' + artId);
  await sleep(500);
  const rawWord = await ev(`(()=>{const sp=[...document.querySelectorAll('#rBody span.w')].find(n=>!n.classList.contains('vw')); if(!sp) return ''; sp.click(); return sp.dataset.word;})()`);
  await sleep(400);
  check('未标注词卡提供「直接收录」', await ev(`!!document.querySelector('#wcAddRaw')`), rawWord || '（没找到未标注词）');
  await ev(`document.querySelector('#wcAddRaw').click()`);
  await sleep(350);
  check('无 API Key 也能收词', await ev(`!!Store.words[${JSON.stringify(rawWord)}]`), rawWord);
  check('待补释义的词不进复习队列', await ev(`!dueWords().some(w => w.word === ${JSON.stringify(rawWord)})`), rawWord);
  await ev(`Router.go('#/words')`);
  await sleep(600);
  check('生词本标出「待补释义」', await ev(`[...document.querySelectorAll('.word-row .due-tag')].some(n => n.textContent === '待补释义')`), rawWord);
  await ev(`delete Store.words[${JSON.stringify(rawWord)}]; Store.settings.sentenceMode=false; save();`);

  /* 15b. 补标四六级词：只追加、去重、非四六级过滤 */
  await ev(`window.apiChat = async () => JSON.stringify({ words: [
    { word: 'scroll', level: 'CET-6', meaning_zh: '滚动；滑动', example_en: 'a scroll, a swipe, a video', paraIndex: 0 },
    { word: 'abolish', level: 'CET-6', meaning_zh: '废除', example_en: 'has quietly abolished them', paraIndex: 0 },
    { word: 'xyzzy', level: '考研', meaning_zh: '假词', example_en: 'zzz', paraIndex: 1 },
  ] })`);
  const top = await ev(`(async () => {
    const a = Store.articles.find(x => x.id === 'sample-doing-nothing');
    const before = a.words.length;
    const r = await supplementCETWords(a, {});
    const w = a.words.find(x => x.word === 'scroll') || {};
    return { before, added: r.added, after: a.words.length, pi: w.paraIndex, hasXyzzy: a.words.some(x => x.word === 'xyzzy') };
  })()`);
  check('补标注：只追加未收过的四六级词', top.added === 1 && top.after === top.before + 1, JSON.stringify(top));
  check('补标注：非四六级与重复词被挡掉', top.hasXyzzy === false, '共 ' + top.after + ' 词');
  check('补标注：按例句归到正确段落', top.pi === 0, 'paraIndex=' + top.pi);

  /* 15c. 教学模式（PPT 式） */
  await ev(`Router.go('#/teach/sample-doing-nothing')`);
  await sleep(800);
  const tc = await ev(`({ teach: !!document.querySelector('.teach'), en: !!document.querySelector('.t-en'),
    count: document.querySelector('#tCount').textContent,
    rail: getComputedStyle(document.getElementById('rail')).display })`);
  check('教学模式：一屏一段、左栏让位', tc.teach && tc.en && tc.rail === 'none', JSON.stringify(tc));
  check('教学模式：从第 1 段开始', tc.count === '1 / 8', tc.count);
  await shot('25-teach');

  await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
  await sleep(450);
  check('教学模式：→ 翻到下一段', (await ev(`document.querySelector('#tCount').textContent`)) === '2 / 8',
    await ev(`document.querySelector('#tCount').textContent`));

  await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }))`);
  await sleep(350);
  check('教学模式：T 展开译文',
    (await ev(`getComputedStyle(document.querySelector('.t-zh-body')).display`)) === 'block');
  await shot('26-teach-zh');

  await ev(`document.querySelector('#tStage').click()`);
  await sleep(400);
  check('教学模式：点正文也能翻页', (await ev(`document.querySelector('#tCount').textContent`)) === '3 / 8');

  await ev(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(600);
  check('教学模式：Esc 退回阅读页', (await ev(`location.hash`)).startsWith('#/reader/'), await ev(`location.hash`));

  /* 16. 手机三种读法：沉浸式 / 逐段翻页 / 大字 */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);

  await ev(`Store.settings.readerLayout='immersive'; save(); Router.go('#/reader/sample-doing-nothing')`);
  await sleep(900);
  const im = await ev(`({ read: document.body.classList.contains('m-read'), pill: !!document.querySelector('#mPill'),
    tb: getComputedStyle(document.querySelector('.toolbar')).display,
    tab: getComputedStyle(document.getElementById('tabbar')).display,
    sw: document.documentElement.scrollWidth, vw: innerWidth })`);
  check('沉浸式：进入手机外壳（无工具栏/底栏）', im.read && im.pill && im.tb === 'none' && im.tab === 'none',
    `toolbar ${im.tb} / tabbar ${im.tab}`);
  check('沉浸式：无横向溢出', im.sw <= im.vw + 1, `${im.sw}/${im.vw}`);
  await shot('21-m-immersive');
  await ev(`document.querySelector('#mZh').click()`);
  await sleep(400);
  check('沉浸式：胶囊「译」能展开译文',
    (await ev(`getComputedStyle(document.querySelector('#rBody .para .tr-body')).display`)) === 'block');

  await ev(`Store.settings.readerLayout='pages'; save(); Router.go('#/reader/sample-doing-nothing')`);
  await sleep(1000);
  const pg = await ev(`({ seg: document.querySelectorAll('#mSeg i').length,
    pages: document.querySelectorAll('.m-page').length,
    count: document.querySelector('#mCount').textContent,
    snap: document.documentElement.classList.contains('m-snap'),
    cover: !!document.querySelector('.rd-head') })`);
  check('逐段翻页：顶部段进度数 = 段数', pg.seg === 8, pg.seg + ' 格');
  check('逐段翻页：每段一屏 + 结尾小结屏', pg.pages === 9, pg.pages + ' 屏');
  check('逐段翻页：开启吸附滚动与封面', pg.snap && pg.cover);
  await shot('22-m-pages');
  await ev(`document.querySelector('#mNext').click()`);
  await sleep(1000);
  const pg2 = await ev(`document.querySelector('#mCount').textContent`);
  check('逐段翻页：下一段按钮生效', pg2 !== pg.count, pg.count + ' → ' + pg2);

  await ev(`Store.settings.readerLayout='big'; save(); Router.go('#/reader/sample-doing-nothing')`);
  await sleep(900);
  const bg = await ev(`({ dock: !!document.querySelector('.m-dock-big'), bar: !!document.querySelector('#mBar'), y: scrollY })`);
  check('大字：底部坞与进度条就位', bg.dock && bg.bar);
  await shot('23-m-big');
  await ev(`document.querySelector('#mNext').click()`);
  await sleep(1000);
  const bg2 = await ev(`scrollY`);
  check('大字：下一段按钮生效', bg2 > bg.y, bg.y + ' → ' + bg2);

  /* 桌面宽度下同样的版式：左栏必须在，主区不能被挤成一条线 */
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 820, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await ev(`Router.go('#/reader/sample-doing-nothing')`);
  await sleep(800);
  const deskM = await ev(`({ main: Math.round(document.querySelector('#main').getBoundingClientRect().width),
    rail: getComputedStyle(document.getElementById('rail')).display,
    page: Math.round(document.querySelector('.reader-page').getBoundingClientRect().width) })`);
  check('桌面下手机版式不压塌主区', deskM.main > 700 && deskM.rail !== 'none',
    `主区 ${deskM.main}px · 左栏 ${deskM.rail} · 正文 ${deskM.page}px`);
  await shot('24-m-on-desktop');

  await ev(`Store.settings.readerLayout='annotated'; save()`);
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);

}

try { await main(); } catch (e) {
  check('测试流程未中断', false, e.message);
}

console.log('\n' + results.join('\n'));
console.log('\n控制台异常：' + (logs.length ? '\n  ' + logs.join('\n  ') : '无'));
console.log(`\n${results.filter(r => r.startsWith('FAIL')).length} 项失败 / ${results.length} 项`);

/* 关掉浏览器：headless 的启动进程会提前退出，kill 父进程杀不掉子进程，
   所以走 CDP 的 Browser.close，避免留下一堆孤儿 msedge。 */
async function closeBrowser() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const bws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise(res => { bws.onopen = res; bws.onerror = res; setTimeout(res, 1500); });
    bws.send(JSON.stringify({ id: 1, method: 'Browser.close', params: {} }));
    await sleep(700);
    try { bws.close(); } catch (e) {}
  } catch (e) {}
}

function killTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch (e) {}
}

await closeBrowser();
ws.close();
killTree(proc);
killTree(PROC.server);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
process.exit(process.exitCode || 0);
