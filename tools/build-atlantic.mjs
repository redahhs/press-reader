// 把 Atlantic EPUB 解析成 app 可用的内置刊物数据（src/atlantic.js）
// 用法: node tools/build-atlantic.mjs <epub目录> [输出文件] [--verbose]
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { inflateRawSync } from 'zlib';
import { join, basename } from 'path';

/* ---------- 最小 ZIP 读取（仅取文件内容，够 EPUB 用） ---------- */
function openZip(buf) {
  let eocd = -1;
  const min = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip/epub（文件可能没下完）');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    files.set(name, { method, csize, lho });
    off += 46 + nlen + elen + clen;
  }
  return {
    names: [...files.keys()],
    has: n => files.has(n),
    get(n) {
      const f = files.get(n);
      if (!f) return null;
      const nlen = buf.readUInt16LE(f.lho + 26);
      const elen = buf.readUInt16LE(f.lho + 28);
      const start = f.lho + 30 + nlen + elen;
      const raw = buf.subarray(start, start + f.csize);
      return f.method === 0 ? raw : inflateRawSync(raw);
    },
    text(n) { const b = this.get(n); return b ? b.toString('utf8') : null; },
  };
}

/* ---------- 实体与标签清理 ---------- */
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à',
  ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', ntilde: 'ñ', ocirc: 'ô', ecirc: 'ê', acirc: 'â',
  frac12: '½', deg: '°', copy: '©', reg: '®', trade: '™', times: '×', middot: '·', shy: '' };
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, n) => (NAMED[n.toLowerCase()] !== undefined ? NAMED[n.toLowerCase()] : m));
}
const stripTags = s => s.replace(/<[^>]+>/g, '');
/* 先解实体再剥标签（原文里可能有 &lt;em&gt; 这类转义的标签） */
const tidy = s => stripTags(decode(stripTags(s))).replace(/[\u00a0\u200b\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------- OPF / spine ---------- */
function readOpf(zip) {
  const container = zip.text('META-INF/container.xml') || '';
  const m = container.match(/full-path="([^"]+)"/);
  const opfPath = m ? m[1] : (zip.names.find(n => /\.opf$/i.test(n)) || '');
  const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = zip.text(opfPath) || '';
  const manifest = new Map();
  for (const mm of opf.matchAll(/<item\b([^>]+)>/g)) {
    const attrs = {};
    for (const a of mm[1].matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    if (attrs.id && attrs.href) manifest.set(attrs.id, { href: dir + decodeURIComponent(attrs.href), type: attrs['media-type'] || '' });
  }
  const spine = [];
  for (const sm of opf.matchAll(/<itemref\b([^>]+)>/g)) {
    const id = (sm[1].match(/idref="([^"]+)"/) || [])[1];
    if (id && manifest.has(id)) spine.push(manifest.get(id).href);
  }
  return { spine };
}

/* ---------- XHTML → 结构块 ---------- */
function htmlToBlocks(html) {
  const body = (html.match(/<body[\s\S]*?<\/body>/i) || [html])[0]
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<div class="calibre_navbar[^"]*">[\s\S]*?<\/div>/g, ' ')   // 顶部/底部导航条
    .replace(/<\/?div\b[^>]*>/gi, ' ');                                   // 去掉 div 外壳，避免贪婪吞段
  const out = [];
  const re = /<(h1|h2|h3|h4|p|blockquote|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    const cls = ((m[2] || '').match(/class="([^"]*)"/) || [])[1] || '';
    if (/navbar/i.test(cls)) continue;
    const text = tidy(m[3]);
    if (!text) continue;
    out.push({ tag, cls, text });
  }
  return out;
}

const NOISE = [
  /^\|?\s*(next|previous)\b/i,
  /\|\s*(section menu|main menu)\s*\|/i,
  /^(the atlantic|atlantic media|all rights reserved|copyright ©)/i,
  /^(illustration|photograph|photo|image|getty images|illustrations?)\b/i,
  /^subscribe\b/i, /^sign up\b/i, /^read more\b/i, /^listen to this (article|story)/i,
  /^this (article|story|piece) (appears|was published|originally appeared)/i,
  /^want to (read|see) more/i, /^support (our )?journalism/i,
  /^share\b/i, /^advertisement$/i,
];
const CREDIT = /(photo|photograph|collection|shutterstock|getty|illustration|reuters|afp|alamy|library|lifetime|archive|museum)/i;
/* 图注：整段被括号包住，或以“(摄影者 / 机构)”这类版权署名结尾 */
const isCaption = t => {
  if (t.length > 400) return false;
  if (/^\(.{8,}\)$/.test(t)) return true;
  const m = t.match(/\(([^()]{3,120})\)\s*$/);
  if (!m) return false;
  return /\//.test(m[1]) || CREDIT.test(m[1]);
};
const isByline = t => /^(by\s+|text by\s+)[A-Z]/i.test(t) && t.length < 90;
const isBio = t => /\bis (a|an|the) (staff writer|senior editor|contributing writer|deputy editor|editor at large|writer|correspondent|freelance)/i.test(t) && t.length < 400;

/* ---------- 解析一本刊 ---------- */
export function parseEpub(buf, { verbose = false } = {}) {
  const zip = openZip(buf);
  const { spine } = readOpf(zip);

  /* 第一遍：识别章节索引页（feed_N/index.html），拿到栏目名 */
  const sectionOf = new Map();   // 'feed_2' → 'Culture & Critics'
  for (const href of spine) {
    const html = zip.text(href);
    if (!html || !/calibre_feed_title|calibre_feed_list/.test(html)) continue;
    const dirKey = href.replace(/\/[^/]*$/, '');   // feed_2
    const name = tidy((html.match(/<h2 class="calibre_feed_title">([\s\S]*?)<\/h2>/) || [])[1] || '')
      || tidy((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    if (name) sectionOf.set(dirKey, name);
  }

  /* 第二遍：逐页抽文章 */
  const arts = [];
  const seenHead = new Set();
  for (const href of spine) {
    const html = zip.text(href);
    if (!html) continue;
    if (/calibre_feed_title|calibre_feed_list/.test(html)) continue;           // 栏目索引页
    if (/titlepage|toc\.ncx|^index_/i.test(href) && !/feed_\d+\/article_/.test(href)) {
      if (verbose) console.error('  skip  ', href, '(封面/目录)');
      continue;
    }
    const bl = htmlToBlocks(html);
    const h1i = bl.findIndex(b => b.tag === 'h1' && b.text.length > 2);
    if (h1i < 0) {
      if (verbose) console.error('  skip  ', href, '(无标题)');
      continue;
    }
    let title = bl[h1i].text.replace(/\s*[|·—-]\s*The Atlantic\s*$/i, '').trim();
    const rest = bl.slice(h1i + 1);
    let dek = '', byline = '';
    const paras = [];
    for (const b of rest) {
      if (!dek && (b.tag === 'h2' || /dek|subtitle|subhead/i.test(b.cls)) && b.text.length > 8) { dek = b.text; continue; }
      if (!byline && (isByline(b.text) || /byline|author/i.test(b.cls))) { byline = b.text.replace(/^(by|text by)\s+/i, ''); continue; }
      if (NOISE.some(r => r.test(b.text))) continue;
      if (isCaption(b.text)) continue;
      if (isBio(b.text)) continue;
      if (b.text.length < 2) continue;
      paras.push(b.text);
    }
    const wc = (paras.join(' ').match(/[A-Za-z][A-Za-z'’-]*/g) || []).length;
    if (wc < 150) { if (verbose) console.error('  skip  ', href, `(太短 ${wc} 词)`, title); continue; }
    const head = (paras[0] || '').slice(0, 100).toLowerCase();
    if (head && seenHead.has(head)) { if (verbose) console.error('  skip  ', href, '(重复)', title); continue; }
    seenHead.add(head);
    const feedDir = (href.match(/^(.*?feed_\d+)\//) || [])[1] || '';
    const section = sectionOf.get(feedDir) || '';
    if (verbose) console.error(`  ok    ${href}  ${wc}w  [${section}]  ${title.slice(0, 50)}`);
    arts.push({ title, dek, byline, section, paragraphs: paras, wc });
  }
  return arts;
}

/* ---------- CLI ---------- */
if (process.argv[1] && process.argv[1].endsWith('build-atlantic.mjs')) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const pos = args.filter(a => !a.startsWith('--'));
  const dir = pos[0];
  const outPath = pos[1] || 'src/atlantic.js';
  const files = readdirSync(dir).filter(f => /\.epub$/i.test(f)).sort();
  const issues = [];
  for (const f of files) {
    const m = f.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    if (!m) continue;
    const [_, y, mo, d] = m;
    console.error(`\n${f}`);
    let parsed;
    try { parsed = parseEpub(readFileSync(join(dir, f)), { verbose }); }
    catch (e) { console.error(`  ✗ 解析失败：${e.message}`); continue; }
    console.error(`  → ${parsed.length} 篇, ${parsed.reduce((s, a) => s + a.wc, 0)} 词`);
    if (!parsed.length) continue;
    const label = `${y} 年 ${+mo} 月号`;
    issues.push({
      id: `atl-${y}-${mo}`,
      label,
      date: `${y}-${mo}-${d}`,
      source: `The Atlantic · ${label}`,
      articles: parsed.map((a, i) => ({
        key: `atl-${y}-${mo}-${String(i + 1).padStart(2, '0')}`,
        title: a.title, dek: a.dek, byline: a.byline, section: a.section,
        wc: a.wc, paragraphs: a.paragraphs,
      })),
    });
  }
  issues.sort((a, b) => (a.date < b.date ? 1 : -1));

  /* 仓库里偶尔同一期被重复上传（例如 07 与 08 内容相同）：按标题集合去重，保留较新的一期 */
  const sig = iss => new Set(iss.articles.map(a => a.title.toLowerCase().replace(/<[^>]+>/g, '').trim()));
  const kept = [];
  for (const iss of issues) {
    const s1 = sig(iss);
    const dup = kept.find(k => {
      const s2 = sig(k);
      let inter = 0;
      s1.forEach(t => { if (s2.has(t)) inter++; });
      return inter / Math.max(1, s1.size) > 0.8;
    });
    if (dup) { console.error(`  ! ${iss.label} 与 ${dup.label} 内容相同（仓库重复上传），跳过`); continue; }
    kept.push(iss);
  }
  const finalIssues = kept;

  const body = `/* ============================================================
   atlantic.js — 内置刊物数据（The Atlantic 近期各号，离线随包分发）
   由 tools/build-atlantic.mjs 从 EPUB 自动生成，勿手改。
   仅供个人学习使用，请勿再分发。
   ============================================================ */
'use strict';

const BUILTIN_ISSUES = ${JSON.stringify(finalIssues)};
`;
  writeFileSync(outPath, body);
  console.error(`\n✓ ${outPath}  ${(body.length / 1024).toFixed(0)} KB  共 ${finalIssues.length} 期 ${finalIssues.reduce((s, i) => s + i.articles.length, 0)} 篇`);
}
