// 极简静态服务器 + 文章抓取接口
//   node serve.mjs              默认 8123 端口，只监听本机
//   node serve.mjs 8080         指定端口
//   node serve.mjs --open       启动后自动打开浏览器
//   node serve.mjs --lan        允许同一局域网的设备访问
//   node serve.mjs --proxy http://127.0.0.1:7890    抓取走本地代理（Clash/v2ray 等）
//   端口被占用时会自动往后找可用端口。
//
// 抓取接口：GET /__fetch?url=<文章链接 或 RSS 地址>
//   浏览器直接请求外刊站点会被 CORS 拦住，这里由本地服务代抓，再把原文交回页面，
//   正文/订阅解析在前端用 DOMParser 完成。只允许 http/https，且禁止访问内网地址（SSRF 防护）。
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import http from 'http';
import https from 'https';
import tls from 'tls';
import dns from 'dns/promises';
import os from 'os';

const APP_HTML = new URL('./index.html', import.meta.url);

const args = process.argv.slice(2);
const has = f => args.includes(f);
const autoOpen = has('--open');
const localOnly = has('--local') || !has('--lan');
const host = localOnly ? '127.0.0.1' : '0.0.0.0';
const portArg = args[has('--port') ? args.indexOf('--port') + 1 : -1] || args.find(a => /^\d+$/.test(a)) || '';
let port = /^\d+$/.test(portArg) ? Number(portArg) : 8123;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT = 25000;
const HEADERS = {
  'user-agent': UA,
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
  'accept-encoding': 'identity',   // 让代理路径不用解压
};

/* 代理：--proxy <url>，或环境变量 PRESS_READER_PROXY / HTTPS_PROXY。
   还支持运行中由页面指定（设置页填的代理，随 /__fetch?proxy= 传上来），
   以及启动后自动探测本机常见代理端口（Clash / v2rayN 等）。 */
const LOOPBACK_PROXY = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?\/?$/i;

function normProxy(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!LOOPBACK_PROXY.test(s)) return '';      // 页面只能指定本机代理，避免变成任意中继
  return s.replace(/\/$/, '');
}

const PROXY = (() => {
  const i = args.indexOf('--proxy');
  const v = i >= 0 ? (args[i + 1] || '') : '';
  return normProxy(v) || normProxy(process.env.PRESS_READER_PROXY)
    || normProxy(process.env.HTTPS_PROXY) || normProxy(process.env.https_proxy) || '';
})();
const NO_AUTO_PROXY = has('--no-proxy');
let AUTO_PROXY = '';        // 启动后探测到的本机代理，探测完成前为空

const PROXY_PORTS = [7890, 7897, 10809, 8080, 8888, 8118, 1087, 20171, 33210, 1080];

/* 判断某个端口上是不是一个能用的 HTTP 代理（真的发 CONNECT，而不是只看端口通不通） */
function probeProxy(port, host = 'www.example.com', timeout = 1200) {
  return new Promise(resolve => {
    const req = http.request({
      host: '127.0.0.1', port, method: 'CONNECT', path: host + ':443', timeout,
      headers: { host: host + ':443', 'proxy-connection': 'keep-alive' },
    });
    let settled = false;
    const fin = v => { if (!settled) { settled = true; resolve(v); } };
    req.on('connect', (res, socket) => { socket.destroy(); fin(res.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); fin(false); });
    req.on('error', () => fin(false));
    req.end();
  });
}

async function detectProxy() {
  for (const p of PROXY_PORTS) {
    if (await probeProxy(p)) return `http://127.0.0.1:${p}`;
  }
  return '';
}

/* 通过 HTTP 代理建立到目标站点的 TLS 隧道（CONNECT） */
function tunnelAgent(proxy, hostName, portNum) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${hostName}:${portNum}`,
      headers: { host: `${hostName}:${portNum}`, 'proxy-connection': 'keep-alive' },
      timeout: 12000,
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return reject(new Error('代理拒绝连接（HTTP ' + res.statusCode + '）')); }
      const t = tls.connect({ socket, servername: hostName }, () => {
        resolve(new https.Agent({ createConnection: () => t, keepAlive: false, maxCachedSessions: 0 }));
      });
      t.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('代理连接超时')); });
    req.end();
  });
}

function collect(req) {
  return new Promise((resolve, reject) => {
    let done = false;
    const req2 = req;
    req2.on('response', res => {
      const chunks = [];
      let size = 0;
      res.on('data', c => {
        size += c.length;
        if (size > MAX_BYTES) { done = true; req2.destroy(); reject(new Error('页面体积过大（> 8MB）')); return; }
        chunks.push(c);
      });
      res.on('end', () => { if (!done) resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
      res.on('error', reject);
    });
    req2.on('error', reject);
    req2.setTimeout(TIMEOUT, () => req2.destroy(new Error('抓取超时')));
    req2.end();
  });
}

async function proxyGet(urlStr, proxyUrl, depth = 0) {
  const u = new URL(urlStr);
  const proxy = new URL(proxyUrl);
  let req;
  if (u.protocol === 'https:') {
    const agent = await tunnelAgent(proxy, u.hostname, Number(u.port) || 443);
    req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'GET', agent, headers: HEADERS });
  } else {
    // 明文 HTTP 走代理：请求行直接给绝对地址
    req = http.request({ host: proxy.hostname, port: proxy.port || 80, method: 'GET', path: u.href, headers: { ...HEADERS, host: u.host } });
  }
  const res = await collect(req);
  const loc = res.headers.location;
  if ([301, 302, 303, 307, 308].includes(res.status) && loc && depth < 4) {
    const next = new URL(loc, u);
    if (!/^https?:$/.test(next.protocol)) throw new Error('重定向到不支持的协议：' + next.protocol);
    if (await blockedHost(next.hostname)) throw new Error('重定向到内网或本机地址，已拒绝');
    return proxyGet(next.href, proxyUrl, depth + 1);
  }
  return res;
}

/* 直连（不经过代理）
   注意：不能用 fetch 的 redirect:'follow' —— 跳转目标会绕过上面的 host 校验
   （公网站点 302 到 http://169.254.169.254/ 这种）。这里手动跟随并逐跳复查；
   同时用流式读取，避免把一个 500MB 的文件整个读进内存。 */
async function directGet(urlStr, depth = 0) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(urlStr, { redirect: 'manual', signal: ctrl.signal, headers: HEADERS });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location');
      if (r.body) { try { await r.body.cancel(); } catch (e) {} }
      if (!loc || depth >= 4) return { status: r.status, headers: {}, body: Buffer.alloc(0) };
      const next = new URL(loc, urlStr);
      if (!/^https?:$/.test(next.protocol)) throw new Error('重定向到不支持的协议：' + next.protocol);
      if (await blockedHost(next.hostname)) throw new Error('重定向到内网或本机地址，已拒绝');
      const rr = await directGet(next.href, depth + 1);
      clearTimeout(timer);
      return rr;
    }
    const body = await readCapped(r);
    const h = {};
    r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    return { status: r.status, headers: h, body };
  } finally {
    clearTimeout(timer);
  }
}

/* 流式读，超 MAX_BYTES 立刻中止 —— 大小校验必须在读之前/读的过程中，
   不能等 arrayBuffer() 全量进内存之后再数长度。 */
async function readCapped(r) {
  const declared = Number(r.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    if (r.body) { try { await r.body.cancel(); } catch (e) {} }
    throw new Error('页面体积过大（> 8MB）');
  }
  if (!r.body) return Buffer.from(await r.arrayBuffer());
  const reader = r.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      try { await reader.cancel(); } catch (e) {}
      throw new Error('页面体积过大（> 8MB）');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/* ---------- SSRF 防护 ----------
   只写字面 IP 的黑名单是不够的：127.0.0.1.nip.io 这类「公网域名解析到内网 IP」、
   IPv4-mapped IPv6（::ffff:127.0.0.1）、以及 302 跳到内网，都能绕过去。
   所以这里分两步：先查字面形态，再真正解析 DNS，对**每一个**返回地址做判定；
   重定向在 directGet 里逐跳复查。 */
const BLOCKED_NAMES = /(^|\.)(localhost|local|internal|home\.arpa)$/i;

function isBlockedIp(ip) {
  const s = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!s) return true;
  if (s === '::1' || s === '::' || s === '0.0.0.0') return true;

  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;          // link-local / 云元数据
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true;                         // 组播 / 保留
    return false;
  }

  // ::ffff:127.0.0.1 / ::127.0.0.1 —— 拆出内嵌的 v4 再判一次
  const mapped = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (mapped) return isBlockedIp(mapped[1]);

  if (/^f[cd][0-9a-f]{2}:/.test(s)) return true;        // fc00::/7 唯一本地地址
  if (/^fe[89ab][0-9a-f]:/.test(s)) return true;       // fe80::/10 链路本地
  return false;
}

function blockedHostName(h0) {
  const h = String(h0 || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (BLOCKED_NAMES.test(h)) return true;
  return isBlockedIp(h);
}

async function blockedHost(h0) {
  if (blockedHostName(h0)) return true;
  const h = String(h0 || '').replace(/^\[|\]$/g, '');
  if (!h || isBlockedIp(h)) return true;
  let addrs;
  try { addrs = await dns.lookup(h, { all: true, verbatim: true }); }
  catch { return false; }   // 解析不了就交给真正的请求去报错，别在这里假装成功
  return addrs.some(a => isBlockedIp(a.address));
}


function decodeBuf(buf, charset) {
  try { return new TextDecoder(charset || 'utf-8').decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

/* 识别「人机验证 / 反爬拦截」页——这类页面是 200 或 403 都可能出现，必须在解析前拦下，
   否则会把「Your access has been blocked…」当成正文喂给 AI。 */
const BLOCK_SIGNS = [
  /cloudflare ray id:\s*([a-z0-9]{8,})/i,
  /attention required!?\s*\|\s*cloudflare/i,
  /checking your browser before accessing/i,
  /cf-browser-verification|cf-challenge|cf_chl_|cf-error-details/i,
  /<title>\s*just a moment\.\.\.\s*<\/title>/i,
  /enable javascript and cookies to continue/i,
  /sorry, you have been blocked/i,
  /your access has been blocked/i,
  /security protections triggered a block/i,
  /you have been blocked from accessing/i,
];

function detectBlock(buf, status, headers) {
  if (!buf || !buf.length) return null;
  const ct = (headers && headers['content-type']) || '';
  const head = decodeBuf(buf.subarray(0, 24000), /charset=["']?([\w-]+)/i.exec(ct)?.[1]);
  if (!BLOCK_SIGNS.some(re => re.test(head))) return null;

  const ray = (BLOCK_SIGNS[0].exec(head) || [])[1] || '';
  const vendor = /cloudflare/i.test(head) ? 'cloudflare' : 'waf';
  const challenge = /checking your browser|enable javascript and cookies|just a moment/i.test(head);
  return {
    vendor,
    ray,
    msg: (challenge
      ? '被 ' + (vendor === 'cloudflare' ? 'Cloudflare' : '站点防火墙') + ' 的人机验证挡住了（需要真人点一下验证才放行）'
      : '被 ' + (vendor === 'cloudflare' ? 'Cloudflare' : '站点防火墙') + ' 判定为机器人访问，已拒绝')
      + (ray ? `（Ray ID ${ray}）` : '')
      + '。这不是网络问题：浏览器能正常打开，只是服务端抓取被拦。请在浏览器里打开原文复制正文，或用下方「把书签拖到书签栏」一键取正文。',
  };
}

/* ---------- 同源校验 ----------
   这是本地服务，唯一合法的调用方就是它自己发出的页面。
   之前对所有响应发 `Access-Control-Allow-Origin: *`，等于把「代抓」能力开放给
   用户浏览的任意网站（对方 JS 一句 fetch 就能驱动你的机器出网、扫本机端口）。
   现在只接受同源请求，且不再发任何 CORS 头。 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  if (!origin) return true;                       // curl / 脚本类请求没有 Origin
  if (origin === 'null') return false;            // file:// 页面 / 沙箱 iframe
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

async function handleFetch(req, reqUrl, res) {
  const send = (code, obj) => {
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(obj));
  };
  if (!sameOrigin(req)) {
    return send(403, { error: '只接受由本应用页面发起的抓取请求。若你是用 file:// 直接打开的 index.html，请改用 node serve.mjs 启动后通过 http://localhost 访问。' });
  }
  const target = reqUrl.searchParams.get('url');
  if (!target) return send(400, { error: '缺少 url 参数' });

  let t;
  try { t = new URL(target); } catch { return send(400, { error: '链接格式不正确' }); }
  if (!/^https?:$/.test(t.protocol)) return send(400, { error: '只支持 http / https 链接' });
  if (await blockedHost(t.hostname)) return send(403, { error: '不允许抓取内网或本机地址' });

  // 代理优先级：页面指定（设置页）> 启动参数/环境变量 > 自动探测到的本机代理
  const qProxy = isLocalRequest(req) ? normProxy(reqUrl.searchParams.get('proxy')) : '';
  const chosen = qProxy || PROXY || AUTO_PROXY;
  const tried = [];

  try {
    let r = null;
    if (chosen) {
      tried.push('代理 ' + chosen);
      try { r = await proxyGet(t.href, chosen); }
      catch (e) {
        // 代理不通时退回直连，避免「明明直连能用却被代理挡住」
        tried.push('直连');
        r = await directGet(t.href);
      }
    } else {
      tried.push('直连');
      try { r = await directGet(t.href); }
      catch (e) {
        // 直连失败（多半是 DNS 被污染 / 被墙），若探测到本机代理就再试一次
        const auto = AUTO_PROXY || (NO_AUTO_PROXY ? '' : await detectProxy());
        if (auto) {
          AUTO_PROXY = auto;
          tried.push('代理 ' + auto);
          r = await proxyGet(t.href, auto);
        } else throw e;
      }
    }

    const status = r.status, ct = r.headers['content-type'] || '', buf = r.body;

    // 反爬 / 人机验证页：Cloudflare 之类会对「非浏览器请求」直接返回拦截页
    const blocked = detectBlock(buf, status, r.headers);
    if (blocked) {
      return send(403, {
        blocked: blocked.vendor,
        ray: blocked.ray || '',
        error: blocked.msg,
      });
    }

    if (status < 200 || status >= 300) {
      const tip = status === 401 || status === 403 ? '（站点要求登录或拒绝访问，请用浏览器打开后复制正文）' : '';
      return send(502, { error: `目标站点返回 ${status}${tip}` });
    }
    if (buf.length > MAX_BYTES) return send(413, { error: '页面体积过大（> 8MB），请手动复制正文' });
    // 网页与 RSS/Atom 都放行：订阅源需要拿 XML 原文
    if (!/text\/html|application\/xhtml|text\/plain|text\/xml|application\/(xml|rss|atom|feed)\+xml|application\/xml/i.test(ct)) {
      return send(415, { error: `该链接不是网页或订阅源（${ct || '未知类型'}）` });
    }

    let charset = /charset=["']?([\w-]+)/i.exec(ct)?.[1];
    let html = decodeBuf(buf, charset);
    // 头部没声明或声明成 latin1/iso-8859-1 时，以文档里的 <meta charset> 为准
    if (!charset || /^(iso-8859-1|latin1|us-ascii)$/i.test(charset)) {
      const m = /<meta[^>]+charset=["']?([\w-]+)/i.exec(html.slice(0, 4096));
      if (m) html = decodeBuf(buf, m[1]);
    }
    /* 一律按纯文本回吐：这份内容是第三方站点的原始 HTML，
       如果以 text/html 交付，一旦有人把这个 URL 直接开在标签页里，
       对方站点的脚本就会跑在 localhost 这个源下，能读走 localStorage（含 API Key）。
       前端本来就只拿它做 DOMParser 解析，改纯文本零成本。 */
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(html);
  } catch (e) {
    let msg = String((e && e.message) || e);
    const cause = (e && e.cause && (e.cause.code || e.cause.message)) || '';
    const timeout = e && (e.name === 'AbortError' || /超时|ETIMEDOUT/.test(msg) || /ETIMEDOUT/.test(cause));
    if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(msg + ' ' + cause)) msg = '连不上目标站点（域名解析失败或被网络拦截）';
    else if (/ECONNRESET|socket hang up/.test(msg + ' ' + cause)) msg = '连接被重置';
    else if (/CERT|SSL|TLS/i.test(msg + ' ' + cause)) msg = 'TLS / 证书握手失败';
    const via = tried.length ? `（已尝试：${tried.join(' → ')}）` : '';
    send(502, {
      error: timeout
        ? `抓取超时 ${via}，该站点可能较慢`
        : `抓取失败${via}：${msg}。` + (chosen
          ? '代理和直连都没通——确认代理软件在运行且节点可用，或在「设置 → 网络与抓取」换一个代理地址。'
          : '没检测到本机代理。如果你用 Clash / v2rayN，先把它启动起来再点一次抓取（会自动走代理），也可以在「设置 → 网络与抓取」手动填地址。'),
    });
  }
}

/* GET /__probe[?proxy=…] → 探测本机可用的 HTTP 代理，供设置页「检测」按钮使用 */
async function handleProbe(req, reqUrl, res) {
  const send = (code, obj) => {
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(JSON.stringify(obj));
  };
  // 探测结果等于「本机开了哪些端口」，不能让外部网页借用户的浏览器扫内网
  if (!isLocalRequest(req) || !sameOrigin(req)) return send(403, { error: '只接受由本应用页面发起的检测请求', candidates: [], current: '', static: PROXY || '' });
  // 并发探，别让设置页那个按钮转 12 秒
  const hits = await Promise.all(PROXY_PORTS.map(p => probeProxy(p, 'www.example.com', 900).then(ok => (ok ? `http://127.0.0.1:${p}` : ''))));
  send(200, {
    candidates: hits.filter(Boolean),
    current: normProxy(reqUrl.searchParams.get('proxy')) || PROXY || AUTO_PROXY || '',
    static: PROXY || '',
  });
}

function isLocalRequest(req) {
  return req.socket.remoteAddress === '127.0.0.1';
}

const server = createServer(async (req, res) => {
  // 只接受与监听地址对应的 Host，防止可控域名在浏览器里指向本机服务。
  const localPort = req.socket.localPort;
  const localAddress = req.socket.localAddress;
  const allowedHosts = localAddress === '127.0.0.1' ? ['127.0.0.1', 'localhost'] : [localAddress];
  const suffix = localPort === 80 ? '' : ':' + localPort;
  if (!allowedHosts.some(name => req.headers.host?.toLowerCase() === name + suffix)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let u;
  try { u = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400).end('bad request'); return; }
  if (req.method === 'GET' && u.pathname === '/__fetch') return handleFetch(req, u, res);
  if (req.method === 'GET' && u.pathname === '/__probe') return handleProbe(req, u, res);
  // 页面已经内联了全部资源，项目目录无需作为静态文件根目录。
  if (!['GET', 'HEAD'].includes(req.method) || !['/', '/index.html'].includes(u.pathname)) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const data = await readFile(APP_HTML);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404).end('请先运行 npm run build');
  }
});

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces()))
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
  return out;
}

function openBrowser(url) {
  const p = process.platform;
  const [cmd, argv] = p === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : p === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  try { spawn(cmd, argv, { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* 打不开就算了 */ }
}

function banner() {
  const line = '─'.repeat(52);
  console.log('\n' + line);
  console.log('  外刊精读 · 本地服务已启动');
  console.log(line);
  console.log(`  本机      http://localhost:${port}`);
  if (!localOnly) for (const ip of lanAddresses()) console.log(`  局域网    http://${ip}:${port}   ← 手机同 Wi-Fi 可打开`);
  else console.log('  仅本机访问（可用 --lan 开启局域网访问）');
  console.log('  抓取接口  /__fetch?url=…');
  if (PROXY) console.log(`  代理      ${PROXY}（抓取经此代理）`);
  console.log(line);
  console.log('  Ctrl+C 停止。数据只存在浏览器里，服务不保存任何内容。');
  console.log('  改了 src/ 下的文件后，记得另开终端跑 node build.mjs。\n');
}

let tries = 0;
let announced = false;
/* 用持久的 listening 监听器，不用 listen(port, host, cb)：
   首次 listen 失败时它的回调会一直挂着，端口顺延成功后会和第二次的回调一起触发，
   导致横幅和浏览器各来两遍。 */
server.on('listening', () => {
  if (announced) return;
  announced = true;
  port = server.address().port;
  banner();
  if (autoOpen) openBrowser(`http://localhost:${port}`);
  // 没显式指定代理时，后台悄悄探一下本机常见代理端口（Clash / v2rayN）
  if (!PROXY && !NO_AUTO_PROXY) {
    detectProxy().then(p => {
      if (p) {
        AUTO_PROXY = p;
        console.log(`  ✓ 发现本机代理 ${p}，境外站点抓取会自动经它进行（--no-proxy 可关闭）\n`);
      }
    }).catch(() => {});
  }
});

function start() {
  server.listen(port, host);
}
server.on('error', err => {
  if (err.code === 'EADDRINUSE' && tries < 10) {
    const used = port; tries++; port++;
    console.log(`端口 ${used} 被占用，改用 ${port} …`);
    start();
  } else if (err.code === 'EACCES') {
    console.error(`没有权限监听端口 ${port}，换一个 1024 以上的端口试试：node serve.mjs 8123`);
    process.exit(1);
  } else {
    console.error('启动失败：' + err.message);
    process.exit(1);
  }
});
start();
