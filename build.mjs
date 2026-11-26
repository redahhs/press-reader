// 构建：把 src/ 下的 CSS/JS 内联进 index.html（单文件交付）
//
// 拼接顺序有讲究：lib.js 只含纯函数，排最前，core.js 顶层就能直接用；
// 本地刊物数据默认不打包；sample.js 最后兜底。
import { readFileSync, writeFileSync } from 'fs';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');

const SOURCES = ['src/lib.js', 'src/core.js', 'src/views.js', 'src/sample.js'];
if (process.argv.includes('--with-atlantic')) SOURCES.splice(2, 0, 'src/atlantic.js');
const src = Object.fromEntries(SOURCES.map(f => [f, read(f)]));

let shell = read('src/shell.html');

/* 图标注入：__ICON__name → 内联 SVG。
   定义只认 core.js 里的 ICON_PATHS 一份 —— 以前 build.mjs 另存了一份 6 个图标的副本，
   改图标要改两处，忘一处就静默不生效。 */
const ICON_DEFS = (() => {
  const s = src['src/core.js'];
  const a = s.indexOf('const ICON_PATHS = {');
  const b = a < 0 ? -1 : s.indexOf('\n};', a);
  if (a < 0 || b < 0) throw new Error('core.js 里找不到 ICON_PATHS');
  const out = {};
  for (const m of s.slice(a, b).matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
})();

shell = shell.replace(/__ICON__(\w+)/g, (_, n) => {
  const d = ICON_DEFS[n];
  if (!d) throw new Error('unknown icon: ' + n);
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
});

const css = read('src/app.css');
const js = SOURCES.map(f => src[f]).join('\n;\n');

shell = shell.replace('<!--__CSS__-->', () => '<style>\n' + css + '\n</style>');
shell = shell.replace('<!--__JS__-->', () => '<script>\n' + js + '\n</script>');

writeFileSync(new URL('index.html', import.meta.url), shell);
console.log('built index.html (' + (shell.length / 1024).toFixed(1) + ' KB)');
