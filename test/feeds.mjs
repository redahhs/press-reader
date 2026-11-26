// 订阅源健康检查：逐个跑「列表 → 第一篇 → 抓正文」，看你这台机器到底哪些源能用。
//   node test/feeds.mjs
//
// 为什么要单独跑：不同网络环境下可达性差别很大（有的站点能开 RSS 却打不开文章，
// 有的正文是 JS 渲染的抓不到）。这个脚本用和 App 完全相同的路径去验证，结果才作数。
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// 从 core.js 里取出 FEED_SOURCES，保证和应用内一致
const src = readFileSync(join(ROOT, 'src', 'core.js'), 'utf8');
const start = src.indexOf('const FEED_SOURCES');
const end = src.indexOf('];', start) + 2;
if (start < 0) { console.error('没找到 FEED_SOURCES'); process.exit(2); }
const FEED_SOURCES = new Function(src.slice(start, end) + '\nreturn FEED_SOURCES;')();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT = 25000;

async function get(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return { status: r.status, ct: r.headers.get('content-type') || '', text: await r.text() };
}

const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

function firstArticle(xml) {
  const chunks = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map(m => m[0]);
  for (const c of chunks) {
    let m = /<link[^>]*href="([^"]+)"/i.exec(c);
    if (m) return m[1];
    m = /<link>([^<]+)<\/link>/i.exec(c);
    if (m) return m[1].trim();
  }
  return '';
}

const C = { g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m` };
const rows = [];

for (const s of FEED_SOURCES) {
  let line = { name: s.name, feed: '', body: '', note: '' };
  try {
    const f = await get(s.feed);
    if (f.status !== 200) { line.feed = C.r(f.status); line.note = 'RSS 打不开'; rows.push(line); continue; }
    line.feed = C.g('200');
    const url = firstArticle(f.text);
    if (!url) { line.note = 'RSS 里没有文章'; rows.push(line); continue; }
    const a = await get(url);
    if (a.status !== 200) { line.body = C.r(a.status); line.note = '正文打不开'; rows.push(line); continue; }
    if (/cloudflare ray id|access has been blocked|just a moment\.\.\./i.test(a.text)) {
      line.body = C.r('拦截'); line.note = 'Cloudflare 挡住（用书签到浏览器里取）'; rows.push(line); continue;
    }
    const body = a.text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const ps = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => strip(m[1])).filter(t => t.length > 45);
    const words = ps.join(' ').split(/\s+/).filter(Boolean).length;
    line.body = words >= 600 ? C.g(words + ' 词') : C.y(words + ' 词');
    line.note = words >= 600 ? '可用' : '正文偏短（可能付费墙/JS 渲染）';
  } catch (e) {
    line.feed = line.feed || C.r('—');
    line.note = '连不上：' + (e.name === 'TimeoutError' ? '超时' : String(e.message).slice(0, 30));
  }
  rows.push(line);
}

console.log('');
// 中文是双宽字符，padEnd 按码元算会错位；另外颜色码不能被算进宽度
const noAnsi = s => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const dw = s => [...noAnsi(s)].reduce((n, ch) => n + (ch.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - dw(s)));
console.log(pad('源', 20) + pad('RSS', 8) + pad('正文', 12) + '结论');
console.log('─'.repeat(72));
for (const r of rows) {
  console.log(pad(r.name, 20) + pad(r.feed, 8) + pad(r.body, 12) + C.d(r.note));
}
const ok = rows.filter(r => r.note === '可用').length;
console.log('\n' + `可用 ${ok} / ${rows.length} 个源。` + (ok ? '' : C.y(' 一个都不通——大概率是这台机器的网络环境（同 Atlantic 那类问题）。')));
console.log(C.d('提示：本脚本直连，不经过 serve.mjs 的代理；如果你的网络需要代理，先看 App 里能否正常抓取。\n'));
