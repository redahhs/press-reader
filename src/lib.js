/* ============================================================
   lib.js — 纯函数层（不碰 DOM、不读全局状态，可被 Node 直接测试）
   ------------------------------------------------------------
   为什么单独拆一个文件：这里放的都是「算错了也不会抛异常，只会让结果
   变得似是而非」的函数——分句错了听力就被切碎，屈折错了就标错词。
   它们必须有单元测试，而单元测试要求能被 require/import。
   构建时本文件排在最前面内联进 index.html，仍然保持单文件交付。
   测试见 test/unit.mjs。
   ============================================================ */
'use strict';

/* ============================================================
   分句
   ------------------------------------------------------------
   旧实现是「先把缩写屏蔽掉，再按 [.!?] 全切」，两类必然会碎：
     1. 小数：12.5 → "The figure was 12." / "5 percent…"
     2. 缩写不全：U.N. / Ph.D. / Jan.
   听力页按「句」朗读与做 A-B 循环，切碎了就是逐句读半句；听写核对也在比对碎片。
   现在改成逐字符扫描 + 前瞻判定：句号只有在「不是假句号」且「后面确实是句首形态」
   时才断句，其余情形一路合并。
   ============================================================ */

/* 常见缩写（去点、小写）。命中即视为「不是句末」。 */
const ABBR = new Set((
  'mr mrs ms dr prof sr jr st vs etc inc ltd co corp no nos fig figs al ave blvd dept est ' +
  'jan feb mar apr jun jul aug sep sept oct nov dec mon tue wed thu fri sat sun ' +
  'approx ca cf ed eds esp gov vol vols pp am pm resp viz'
).split(' '));

/* 跟在缩写点后面、几乎一定是新句子开头的词。
   用来区分「the U.S. economy」和「in the U.S. The next day」：
   只有后面是这些词时，缩写点才当成真句号；否则 U.S. / U.K. / etc. 会把两句粘成一句，
   而粘出来的长句会被送去长难句解析——又长又慢，还容易解析失败。 */
const SENT_START = new Set((
  'the this that these those it he she they we i you but and yet so however meanwhile ' +
  'after before when while if in on at as by for from most many some one no not there ' +
  'here its his her their our my such then now later still even all both each another ' +
  'other perhaps maybe why what how who where whether according despite during since ' +
  'although though because instead moreover nevertheless therefore thus'
).split(' '));
function nextWordAfter(t, i) {
  const m = /^[^A-Za-z]*([A-Za-z][A-Za-z'’-]*)/.exec(t.slice(i + 1));
  return m ? m[1].toLowerCase() : '';
}

/* 点号前是不是「假句号」：首字母缩写 / 常见缩写 / 全大写首字母链 / Ph.D. 这类链式缩写 */
function isFakePeriod(t, i) {
  let s = i;
  while (s > 0 && /[A-Za-z.]/.test(t[s - 1])) s--;
  const raw = t.slice(s, i);
  const tok = raw.replace(/\./g, '');
  if (!tok) return false;                                  // "9." 这种前面不是字母
  if (tok.length === 1) return true;                       // J. K. Rowling
  if (ABBR.has(tok.toLowerCase())) return !SENT_START.has(nextWordAfter(t, i));       // Dr. / Jan. / etc.
  if (raw.includes('.') && /^[A-Z]+$/.test(tok)) return !SENT_START.has(nextWordAfter(t, i));  // U.S / U.N
  const next = /^ *([A-Za-z])\./.exec(t.slice(i + 1));     // "Ph." + "D."
  if (next && raw.length <= 3) return true;
  return false;
}

function splitSentences(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  let start = 0;
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') { i++; continue; }

    // 1) 吃掉连在一起的句末标点：?! / ... / ……
    let j = i;
    while (j + 1 < t.length && '.!?…'.includes(t[j + 1])) j++;
    // 2) 吃掉紧跟的收尾引号 / 括号
    let k = j + 1;
    while (k < t.length && '"\')]}’”'.includes(t[k])) k++;
    // 3) 后面必须跟空格或结尾，否则是词内部的点（12.5 / U.S）
    if (k < t.length && t[k] !== ' ') { i = j + 1; continue; }
    // 4) 假句号不断
    if (ch === '.' && isFakePeriod(t, i)) { i = j + 1; continue; }
    // 5) 下一句必须以「句首形态」开头，否则多半是缩写/从句
    let m = k;
    while (m < t.length && t[m] === ' ') m++;
    if (m < t.length && !/^["'“‘(\[]?[A-Z0-9\u4e00-\u9fff]/.test(t.slice(m, m + 2))) { i = j + 1; continue; }

    const seg = t.slice(start, k).trim();
    if (seg) out.push(seg);
    start = m;
    i = m;
  }
  const tail = t.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/* ============================================================
   屈折形式（生词高亮的兜底匹配）
   ------------------------------------------------------------
   旧实现是「原形 + 词干 × ['s','es','ed','d','ing','ly'] 全排列」，会造出
   hat→hates、sit→sites、car→cares 这类假形式：文章里出现 sites 会被链到 sit，
   点「加入生词本」入的还是错词；同时 note→noting、try→tries 反而漏掉。
   现在按英语形态规则生成，宁可少生成，不要造错。
   ============================================================ */
function inflect(base) {
  const out = new Set();
  const add = s => { if (s && s !== base) out.add(s); };
  const last = base.slice(-1), last2 = base.slice(-2);
  const sibilant = /(s|x|z|ch|sh)$/.test(base);
  const consY = /[^aeiou]y$/.test(base);

  // 复数 / 三单
  if (sibilant) add(base + 'es');
  else if (consY) add(base.slice(0, -1) + 'ies');
  else add(base + 's');

  // 过去式 / 过去分词
  if (last === 'e') add(base + 'd');
  else if (consY) add(base.slice(0, -1) + 'ied');
  else add(base + 'ed');

  // 现在分词
  if (last2 === 'ie') add(base.slice(0, -2) + 'ying');
  else if (last === 'e' && !/(ee|ye|oe)$/.test(base)) add(base.slice(0, -1) + 'ing');
  else add(base + 'ing');

  // stop → stopped / stopping（短词 CVC 结尾双写）
  if (base.length <= 6 && /[^aeiou][aeiou][^aeiouwxy]$/.test(base)) {
    add(base + last + 'ed');
    add(base + last + 'ing');
  }

  // 副词
  if (consY) add(base.slice(0, -1) + 'ily');
  else if (!/ly$/.test(base)) add(base + 'ly');
  return out;
}

function wordForms(entry) {
  const norm = s => String(s).trim().toLowerCase().replace(/’/g, "'");
  const base = norm(entry.word || '');
  const forms = new Set();
  if (base) forms.add(base);
  // AI 给的是「文中实际出现的形式」，优先级高于任何规则推导
  (entry.forms || []).forEach(f => { const v = norm(f); if (v) forms.add(v); });
  if (base && base.length >= 3 && !base.includes(' ') && /^[a-z][a-z'-]*$/.test(base)) {
    inflect(base).forEach(v => forms.add(v));
  }
  return forms;
}

/* ============================================================
   听写核对：词级 LCS 差异
   ============================================================ */
const DICT_RE = /[A-Za-z0-9'’\-]+/g;

function tokenize(s) {
  return (String(s).match(DICT_RE) || []).map(w => w.toLowerCase().replace(/’/g, "'"));
}

function diffWords(user, target) {
  const a = tokenize(user), b = tokenize(target);
  const n = b.length, m = a.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = b[i] === a[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (b[i] === a[j]) { out.push({ t: 'ok', w: b[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: 'miss', w: b[i] }); i++; }
    else { out.push({ t: 'extra', w: a[j] }); j++; }
  }
  while (i < n) out.push({ t: 'miss', w: b[i++] });
  while (j < m) out.push({ t: 'extra', w: a[j++] });
  return out;
}
