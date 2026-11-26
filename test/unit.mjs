// 纯函数单测：直接跑 src/lib.js，不需要浏览器、不联网。
//   node test/unit.mjs
//
// 这些函数是「算错了也不报错」的类型（分句、屈折、词级差异），
// 端到端测试只能间接照到，所以单独拎出来断言。
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'lib.js'), 'utf8');
const { splitSentences, wordForms, tokenize, diffWords } =
  new Function(SRC + '\nreturn { splitSentences, wordForms, tokenize, diffWords };')();

let pass = 0;
const fails = [];

function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fails.push(`${name}\n    得到 ${g}\n    期望 ${w}`);
}
function ok(name, cond, extra = '') {
  if (cond) { pass++; return; }
  fails.push(`${name}${extra ? '\n    ' + extra : ''}`);
}

/* ---------------- 分句 ---------------- */
eq('小数不该断句',
  splitSentences('The figure was 12.5 percent, up from 9.8. Analysts were surprised.'),
  ['The figure was 12.5 percent, up from 9.8.', 'Analysts were surprised.']);

eq('U.N. / Jan. / 3.5',
  splitSentences('The U.N. report, published Jan. 5, says 3.5 million people left. It was bad.'),
  ['The U.N. report, published Jan. 5, says 3.5 million people left.', 'It was bad.']);

eq('Ph.D. 不该断',
  splitSentences('He earned a Ph.D. in 2019. Then he left.'),
  ['He earned a Ph.D. in 2019.', 'Then he left.']);

eq('引号里的句号',
  splitSentences('She said, "Stop." He did not.'),
  ['She said, "Stop."', 'He did not.']);

eq('省略号 + 问号',
  splitSentences('Wait... what happened? Nothing!'),
  ['Wait... what happened?', 'Nothing!']);

eq('常见缩写 Dr. / Mr. / St.',
  splitSentences('Dr. Smith met Mr. Jones at St. Mary. They talked.'),
  ['Dr. Smith met Mr. Jones at St. Mary.', 'They talked.']);

eq('逗号结尾的省略号后接大写',
  splitSentences('Nothing! And then... He left.'),
  ['Nothing!', 'And then...', 'He left.']);

eq('无句末标点时整段算一句',
  splitSentences('just a fragment with no stop'),
  ['just a fragment with no stop']);

/* 缩写点在句末：后面是常见句首词时要断开，否则两句会被粘成一句长难句 */
eq('U.S. 后接句首词要断开',
  splitSentences('The report was published in the U.S. The next day it went viral.'),
  ['The report was published in the U.S.', 'The next day it went viral.']);

eq('U.S. 后接普通名词不断句',
  splitSentences('He met the U.S. President in Washington.'),
  ['He met the U.S. President in Washington.']);

eq('U.K. 后接句首词要断开',
  splitSentences('She moved to the U.K. He stayed in Paris.'),
  ['She moved to the U.K.', 'He stayed in Paris.']);

eq('etc. 后接句首词要断开',
  splitSentences('Read the chapter, take notes, etc. Then write a summary.'),
  ['Read the chapter, take notes, etc.', 'Then write a summary.']);

eq('空串', splitSentences('   '), []);

ok('分句不丢字符（拼接回原文）',
  (() => {
    const t = 'The U.S. economy grew 2.5 percent in Q3. Dr. Lee said it was "unexpected." Others disagreed!';
    return splitSentences(t).join(' ').replace(/\s+/g, ' ') === t.replace(/\s+/g, ' ');
  })());

/* ---------------- 屈折形式 ---------------- */
const has = (w, f) => wordForms({ word: w }).has(f);
const not = (w, f) => !has(w, f);

ok('hat 不该生成 hates', not('hat', 'hates'));
ok('sit 不该生成 sites', not('sit', 'sites'));
ok('car 不该生成 cares', not('car', 'cares'));
ok('hat 仍保留 hats', has('hat', 'hats'));
ok('sit 仍保留 sitting', has('sit', 'sitting'));
ok('note 应生成 noting（e 脱落）', has('note', 'noting'));
ok('note 不该生成 noteing', not('note', 'noteing'));
ok('try 应生成 tries / tried', has('try', 'tries') && has('try', 'tried'));
ok('die 应生成 dying', has('die', 'dying'));
ok('box 应生成 boxes', has('box', 'boxes'));
ok('brief 应生成 briefly', has('brief', 'briefly'));
ok('AI 给的 forms 优先', wordForms({ word: 'go', forms: ['went', 'gone'] }).has('went'));
ok('多词短语不推导屈折', !wordForms({ word: 'carry out' }).has('carry outs'));
ok('短语本身在集合里', wordForms({ word: 'carry out' }).has('carry out'));

/* ---------------- 听写差异 ---------------- */
eq('tokenize 统一弯引号', tokenize("Don’t stop"), ["don't", 'stop']);
ok('漏写识别', diffWords('the quick fox', 'the quick brown fox').some(x => x.t === 'miss' && x.w === 'brown'));
ok('多写识别', diffWords('the very quick fox', 'the quick fox').some(x => x.t === 'extra' && x.w === 'very'));
ok('完全正确时没有 miss/extra', diffWords('the quick fox', 'the quick fox').every(x => x.t === 'ok'));

/* ---------------- 结果 ---------------- */
if (fails.length) {
  console.error(`\n✗ 失败 ${fails.length} 项 / 共 ${pass + fails.length} 项\n`);
  fails.forEach(f => console.error('  · ' + f + '\n'));
  process.exit(1);
}
console.log(`✓ 单元测试全部通过（${pass} 项）`);
