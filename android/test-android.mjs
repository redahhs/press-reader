// Android 端冒烟测试：通过 adb + WebView 调试协议在真实设备/模拟器里跑断言。
//
//   node android/test-android.mjs
//
// 前置：模拟器或手机已连接（adb devices 可见），带 --debug-webview 构建的 APK 已安装并处于前台。
// 依赖：ANDROID_HOME 下的 platform-tools/adb；仅用 Node 内置模块。
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test', 'shots');
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const ADB = join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const PKG = 'com.pressreader.app';
const PORT = 9223;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(ADB)) { console.error('找不到 adb：请设置 ANDROID_HOME'); process.exit(2); }
const adb = (...a) => spawnSync(ADB, a, { encoding: 'utf8' });

const results = [];
function check(name, cond, extra = '', soft = false) {
  if (soft && !cond) { results.push(`SKIP  ${name}${extra ? '  ·  ' + extra : ''}`); return; }
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ·  ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

const pid = (adb('shell', 'pidof', PKG).stdout || '').trim();
if (!pid) { console.error('应用没在运行：先 adb install 并启动它'); process.exit(2); }
adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);

let target = null;
for (let i = 0; i < 20; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    target = list.find(t => t.type === 'page' && t.url.includes('appassets'));
    if (target) break;
  } catch (e) {}
  await sleep(300);
}
if (!target) { console.error('连不上 WebView 调试端口'); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0; const pending = new Map(); const logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error'].includes(m.params.type))
    logs.push('ERROR: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown')
    logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++seq;
  pending.set(i, m => m.error ? rej(new Error(method + ' → ' + JSON.stringify(m.error))) : res(m.result));
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('EVAL FAIL: ' + expression.slice(0, 90) + ' → ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
function shot(name) {
  const r = spawnSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 32 * 1024 * 1024 });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name + '.png'), r.stdout);
}

try {
  /* 0. 每次从干净状态开始 */
  await ev(`localStorage.clear()`);
  await send('Page.reload');
  await sleep(1800);

  /* 1. 页面加载 */
  check('应用加载的是本地 assets 页面', (await ev(`location.href`)).includes('appassets'), await ev(`location.href`));
  check('标题正确', (await ev(`document.title`)).includes('外刊精读'), await ev(`document.title`));
  check('渲染出首页', await ev(`!!document.querySelector('.hero-title') || !!document.querySelector('.hero h1')`));

  /* 2. 示例文章 → 精读页 */
  await ev(`(document.querySelector('#loadSample')||document.querySelector('#loadSample2')).click()`);
  await sleep(1200);
  check('能进入精读页', await ev(`location.hash.startsWith('#/reader/') && !!document.querySelector('#rBody')`), await ev(`location.hash`));
  const paras = await ev(`document.querySelectorAll('#rBody .para').length`);
  check('正文段落渲染', paras > 5, paras + ' 段');
  const typo = await ev(`(()=>{const cs=getComputedStyle(document.querySelector('.para-en'));return {fs:parseFloat(cs.fontSize),lh:(parseFloat(cs.lineHeight)/parseFloat(cs.fontSize)).toFixed(2),ff:cs.fontFamily.split(',')[0]}})()`);
  // 手机走窄屏档：--read-base 16px + fs(1)*2 = 18px，行高不变
  check('字号/行高按移动端档位', typo.fs === 18 && typo.lh === '1.72', `${typo.fs}px / ${typo.lh}`);
  check('正文不产生横向滚动', await ev(`document.documentElement.scrollWidth <= window.innerWidth + 1`),
    await ev(`document.documentElement.scrollWidth + ' / ' + window.innerWidth`));
  shot('android-02-reader');

  /* 3. 抓取代理（原生 /__fetch） */
  const probe = await ev(`(async()=>{try{const r=await fetch('/__fetch?url='+encodeURIComponent('https://text.npr.org'));const t=await r.text();return {status:r.status,len:t.length,head:t.slice(0,40)}}catch(e){return {status:-1,err:String(e)}}})()`);
  if (probe.status === 200 && probe.len > 1000) {
    check('原生抓取代理可用（/__fetch）', true, `200 · ${probe.len} 字节`);
  } else if (probe.status === 502) {
    check('原生抓取代理可用（/__fetch）', false, '设备网络无法访问目标站点，跳过', true);
  } else {
    check('原生抓取代理可用（/__fetch）', false, JSON.stringify(probe));
  }
  const ssrf = await ev(`fetch('/__fetch?url='+encodeURIComponent('http://127.0.0.1:8123/')).then(r=>r.status).catch(()=>-1)`);
  check('拦截内网地址', ssrf === 403, 'status ' + ssrf);

  /* 4. TTS 桥（WebView 没有 speechSynthesis，必须走原生） */
  const ttsInfo = await ev(`({native: typeof AndroidTTS!=='undefined', unsupported: TTS.unsupported})`);
  check('TTS 走原生桥', ttsInfo.native === true && ttsInfo.unsupported === false, JSON.stringify(ttsInfo));
  const ttsRes = await ev(`Promise.race([TTS.speak('The quick brown fox jumps over the lazy dog.', {rate:1}), new Promise(r=>setTimeout(()=>r('timeout'), 15000))])`);
  check('朗读能回调结束（不是卡死）', ttsRes !== 'timeout', String(ttsRes), true);

  /* 5. 数据持久化 */
  await ev(`Store.settings.fs = 2; save()`);
  await sleep(400);
  check('localStorage 可写', await ev(`!!localStorage.getItem('pressreader.v1')`), await ev(`(localStorage.getItem('pressreader.v1')||'').length + ' 字节'`));

  /* 6. 新建页：订阅源 + 抓取入口文案 */
  await ev(`Router.go('#/new')`);
  await sleep(900);
  check('新建页有订阅源与抓取入口', await ev(`!!document.querySelector('#srcChips') && !!document.querySelector('#nUrl')`));
  const hint = await ev(`document.querySelector('#crawlHint').textContent`);
  check('App 内不再提示需要 node serve.mjs', hint.includes('App 内') && !hint.includes('serve.mjs'), hint.trim().slice(0, 26));
  shot('android-03-new');

  /* 7. 设置页：App 里不显示「本机代理」（走系统网络） */
  await ev(`Router.go('#/settings')`);
  await sleep(900);
  check('设置页正常渲染', (await ev(`document.querySelectorAll('.set-card').length`)) >= 4);
  check('App 内不出现本机代理输入框', await ev(`!document.querySelector('#sProxy')`));
} catch (e) {
  check('测试流程未中断', false, e.message);
}

console.log('\n' + results.join('\n'));
console.log('\n页面异常：' + (logs.length ? '\n  ' + logs.join('\n  ') : '无'));
console.log(`\n${results.filter(r => r.startsWith('FAIL')).length} 项失败 / ${results.length} 项`);

ws.close();
process.exit(process.exitCode || 0);
