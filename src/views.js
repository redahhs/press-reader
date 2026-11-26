/* ============================================================
   views.js — 视图渲染与交互
   ============================================================ */
'use strict';

const Views = {};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const mainEl = () => document.getElementById('main');
function mount(html) { mainEl().innerHTML = `<div class="view">${html}</div>`; }

/* 视图渲染兜底：数据缺字段（旧备份 / 写入被中断 / 手改过的 JSON）时，
   给一个能自救援的页面，而不是「点了标题没反应」。由 Router.dispatch 调用。 */
function renderViewError(name, id, err) {
  const art = id ? Store.articles.find(a => a.id === id) : null;
  mount(`
    <div class="wrap-narrow" id="viewErr">
      <a href="#/library" class="backlink">${ic('back')} 返回文章库</a>
      <div class="err-panel" style="margin-top:18px">
        <b style="display:block; margin-bottom:6px">这个页面打不开了</b>
        ${art ? `《${esc(art.title)}》的数据不完整（可能来自旧版本备份，或被中断的写入）。`
              : '页面数据不完整，无法渲染。'}
        <div class="muted" style="margin-top:8px; font-size:12px; word-break:break-word">${esc(String((err && err.message) || err).slice(0, 160))}</div>
      </div>
      <div class="row-btns" style="margin-top:16px">
        ${art ? `<button class="btn primary" id="veFix">${ic('refresh')} 修复这篇</button>` : ''}
        <button class="btn" id="veExport">${ic('download')} 导出全部数据</button>
        ${art ? `<button class="btn danger" id="veDel">${ic('trash')} 删除这篇</button>` : ''}
        <a class="btn ghost" href="#/library">回文章库</a>
      </div>
      <p class="hint">建议先导出备份再动手。文章库里的其它文章不受影响。</p>
    </div>`);
  if (art) {
    $('#veFix').onclick = () => {
      const i = Store.articles.findIndex(a => a.id === art.id);
      if (i >= 0) Store.articles[i] = normalizeArticle(art);
      save(); toast('已补齐缺失字段');
      Router.go('#/reader/' + art.id);
    };
    $('#veDel').onclick = async () => {
      const ok = await confirmModal({ title: '删除这篇？', body: `《${art.title}》的数据将被删除，不可撤销。`, okText: '删除', danger: true });
      if (!ok) return;
      Store.articles = Store.articles.filter(a => a.id !== art.id);
      save(); runViewCleanups(); Router.go('#/library');
    };
  }
  $('#veExport').onclick = exportData;
}

/* 视图级清理（路由切换时执行：解绑全局监听、释放录音等） */
const VIEW_CLEANUPS = [];
function runViewCleanups() { while (VIEW_CLEANUPS.length) { try { VIEW_CLEANUPS.pop()(); } catch (e) {} } }

/* ============================================================
   文章库
   ============================================================ */
Views.library = () => {
  const arts = [...Store.articles].sort((a, b) => b.createdAt - a.createdAt);
  const due = dueWords().length;
  const total = Object.keys(Store.words).length;

  if (!arts.length) {
    mount(`
      <div class="wrap-narrow">
        <div class="masthead"><span class="kicker">Press Reading Desk · 外刊精读</span><span class="date">${fmtDate(Date.now())} · 创刊号</span></div>
        <div class="hero">
          <span class="kicker">Close Reading for the Curious</span>
          <h1>把一篇外刊，<br>读成一次完整的训练<span class="dot">。</span></h1>
          <p class="sub">从内置订阅源挑一篇、粘贴链接自动抓取，或直接复制任意英文报刊全文（大西洋月刊、经济学人、纽约时报……），AI 自动分段翻译、标注生词难词、提取地道搭配；配合听力精听与闪卡复习，一篇文章就是一堂精读课。</p>
          <div class="cta-row">
            <button class="btn primary big" id="goNew">${ic('plus')} 开始第一篇精读</button>
            <a class="btn big" href="#/shelf">${ic('shelf')} 查看刊物书架</a>
            <button class="btn big ghost" id="loadSample">${ic('doc')} 载入示例文章</button>
          </div>
        </div>
        <div class="new-tips" style="margin-top:44px">
          <b>开始之前</b>：AI 精读需要在「设置」中填入一个 OpenAI 兼容的 API Key（智谱、OpenAI、DeepSeek 等均可）。
          没配置 Key 也可以先载入示例文章，体验全部功能。
        </div>
      </div>`);
    $('#goNew').onclick = () => Router.go('#/new');
    $('#loadSample').onclick = () => { loadSampleArticle(); };
    return;
  }

  mount(`
    <div class="wrap">
      <div class="masthead"><span class="kicker">Press Reading Desk · 外刊精读</span><span class="date">${fmtDate(Date.now())} · 共 ${arts.length} 篇</span></div>
      <div class="hero" style="margin-bottom:26px">
        <div class="cta-row" style="justify-content:space-between; width:100%">
          <h1 class="hero-title">文章库<span class="dot">.</span></h1>
          <div style="display:flex; gap:10px; flex-wrap:wrap">
            <a class="btn" href="#/shelf">${ic('shelf')} 刊物</a>
            <button class="btn" id="loadSample2">${ic('doc')} 示例</button>
            <button class="btn primary" id="goNew">${ic('plus')} 新文章精读</button>
          </div>
        </div>
      </div>
      <div class="stat-strip">
        <div class="st"><b>${arts.length}</b><span>已精读 · 篇</span></div>
        <div class="st"><b>${total}</b><span>生词本 · 词</span></div>
        <div class="st clickable" id="goReview"><b style="color:${due ? 'var(--accent)' : 'inherit'}">${due}</b><span>今日待复习 →</span></div>
      </div>
      <div class="lib-tools">
        <div class="wt-search">${ic('search')}<input class="input" id="aq" placeholder="搜索标题 / 主题 / 来源…" autocomplete="off"></div>
        <span class="muted" id="aCount"></span>
      </div>
      <div class="art-list" id="aList">
        ${arts.map((a, i) => `
        <div class="art-row" data-id="${a.id}" data-hay="${escAttr([a.title, a.topic, a.source, a.difficulty].filter(Boolean).join(' ').toLowerCase())}">
          <div class="art-idx">${String(i + 1).padStart(2, '0')}</div>
          <div class="art-main">
            <div class="art-title" data-open="${a.id}">${esc(a.title)}</div>
            <div class="art-meta">
              <span>${esc(a.source)}</span>
              ${(a.topic || a.section) ? `<span>${esc(a.topic || a.section)}</span>` : ''}
              ${a.difficulty ? `<span>${esc(a.difficulty)}</span>` : ''}
              <span>${a.wc} 词</span>
              <span>${a.words.length} 个生词</span>
              <span>${fmtDate(a.createdAt)}</span>
            </div>
          </div>
          <div class="art-acts">
            <button class="iconbtn acc" title="听力精听" data-listen="${a.id}">${ic('headphones')}</button>
            <button class="iconbtn danger" title="删除" data-del="${a.id}">${ic('trash')}</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="empty" id="aNone" hidden><div class="big">没有匹配的文章</div><p>换个关键词试试，或清空搜索框。</p></div>
    </div>`);

  const aq = $('#aq');
  if (aq) {
    const rows = $$('.art-row');
    const apply = () => {
      const q = aq.value.trim().toLowerCase();
      let n = 0;
      rows.forEach(r => {
        const ok = !q || r.dataset.hay.includes(q);
        r.classList.toggle('hide', !ok);
        if (ok) n++;
      });
      $('#aCount').textContent = q ? `匹配 ${n} / ${rows.length} 篇` : `${rows.length} 篇`;
      $('#aNone').hidden = n !== 0;
    };
    aq.addEventListener('input', apply);
    apply();
  }

  $('#goNew').onclick = () => Router.go('#/new');
  $('#loadSample2').onclick = () => { loadSampleArticle(); };
  $('#goReview').onclick = () => Router.go('#/review');
  $$('.art-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.art-title').onclick = () => Router.go('#/reader/' + id);
    const lb = row.querySelector('[data-listen]'); if (lb) lb.onclick = () => Router.go('#/listen/' + id);
    const db = row.querySelector('[data-del]');
    if (db) db.onclick = async () => {
      const a = Store.articles.find(x => x.id === id);
      const ok = await confirmModal({ title: '删除这篇文章？', body: `《${a ? a.title : ''}》的精读数据将被删除（生词本不受影响）。此操作不可撤销。`, okText: '删除', danger: true });
      if (!ok) return;
      Store.articles = Store.articles.filter(x => x.id !== id);
      save(); runViewCleanups(); Views.library();
    };
  });
};

/* ============================================================
   刊物书架（可选本地数据）
   ============================================================ */
Views.shelf = () => {
  const issues = builtinIssues();
  if (!issues.length) {
    mount(`<div class="wrap-narrow"><div class="empty"><div class="big">没有内置刊物</div><p>默认构建不附带第三方刊物。可以去<a href="#/library">文章库</a>载入原创示例，或去<a href="#/new">新建文章</a>。</p></div></div>`);
    return;
  }
  const curId = issues.some(i => i.id === Store.settings.shelfIssue) ? Store.settings.shelfIssue : issues[0].id;
  const totalArts = issues.reduce((s, i) => s + i.articles.length, 0);
  const totalWc = issues.reduce((s, i) => s + i.articles.reduce((t, a) => t + a.wc, 0), 0);
  const issue = issues.find(i => i.id === curId) || issues[0];
  const stateOf = k => {
    const a = Store.articles.find(x => x.id === k);
    if (!a) return { t: '原文', cls: '' };
    const done = a.paragraphs.filter(p => p.zh).length;
    if (done === 0) return { t: '已加入', cls: '' };
    if (done >= a.paragraphs.length) return { t: '已精读', cls: 'acc' };
    return { t: `精读 ${done}/${a.paragraphs.length}`, cls: 'acc' };
  };

  mount(`
    <div class="wrap">
      <div class="masthead"><span class="kicker">Press Reading Desk · 内置刊物</span><span class="date">${issues.length} 期 · 离线可读</span></div>
      <div class="hero" style="margin-bottom:22px">
        <h1 class="hero-title">期刊书架<span class="dot">。</span></h1>
        <p class="sub">这些刊物已随当前构建保存在本机，不用联网、不用抓取。挑一篇可以直接读原文、听朗读；点「AI 精读」再补上分段翻译与生词标注。</p>
      </div>
      <div class="stat-strip">
        <div class="st"><b>${issues.length}</b><span>期刊物</span></div>
        <div class="st"><b>${totalArts}</b><span>篇可选</span></div>
        <div class="st"><b>${(totalWc / 1000).toFixed(1)}k</b><span>累计词量</span></div>
      </div>
      <div class="src-chips" id="issueChips">
        ${issues.map(i => `<button class="src-chip${i.id === issue.id ? ' on' : ''}" data-issue="${i.id}">${esc(i.label)}<i>${i.articles.length}</i></button>`).join('')}
      </div>
      <div class="lib-tools">
        <div class="wt-search">${ic('search')}<input class="input" id="sq" placeholder="搜索本期标题 / 栏目 / 作者…" autocomplete="off"></div>
        <span class="muted" id="sCount"></span>
      </div>
      <div class="art-list" id="sList">
        ${issue.articles.map((a, i) => {
          const st = stateOf(a.key);
          return `
        <div class="art-row" data-key="${a.key}" data-hay="${escAttr([a.title, a.section, a.byline].filter(Boolean).join(' ').toLowerCase())}">
          <div class="art-idx">${String(i + 1).padStart(2, '0')}</div>
          <div class="art-main">
            <div class="art-title" data-open="${a.key}">${esc(a.title)}</div>
            ${a.dek ? `<div class="art-dek">${esc(a.dek)}</div>` : ''}
            <div class="art-meta">
              ${a.section ? `<span>${esc(a.section)}</span>` : ''}
              ${a.byline ? `<span>${esc(a.byline)}</span>` : ''}
              <span>${a.wc} 词</span>
              ${st.t ? `<span class="chip ${st.cls}">${st.t}</span>` : ''}
            </div>
          </div>
          <div class="art-acts">
            <button class="iconbtn" title="听力精听" data-listen="${a.key}">${ic('headphones')}</button>
            <button class="btn sm primary" data-open2="${a.key}">精读</button>
          </div>
        </div>`;
        }).join('')}
      </div>
      <div class="empty" id="sNone" hidden><div class="big">没有匹配的文章</div><p>换个关键词试试，或清空搜索框。</p></div>
      <div class="new-tips">
        <b>怎么用</b> · 建议按「先盲读原文 → 再 AI 精读 → 收生词 → 睡前闪卡复习」的节奏；一篇文章的精读数据只存在你本机。
        内置刊物仅限个人学习，请勿再分发。
      </div>
    </div>`);

  const sq = $('#sq');
  if (sq) {
    const rows = $$('#sList .art-row');
    const apply = () => {
      const q = sq.value.trim().toLowerCase();
      let n = 0;
      rows.forEach(r => {
        const ok = !q || r.dataset.hay.includes(q);
        r.classList.toggle('hide', !ok);
        if (ok) n++;
      });
      $('#sCount').textContent = q ? `匹配 ${n} / ${rows.length} 篇` : `${rows.length} 篇`;
      $('#sNone').hidden = n !== 0;
    };
    sq.addEventListener('input', apply);
    apply();
  }

  $$('#issueChips .src-chip').forEach(b => b.onclick = () => {
    Store.settings.shelfIssue = b.dataset.issue; save();
    runViewCleanups();
    Views.shelf();
  });

  const goRead = key => { if (openBuiltin(key)) Router.go('#/reader/' + key); };
  $$('#sList [data-open], #sList [data-open2]').forEach(n => n.onclick = () => goRead(n.dataset.open || n.dataset.open2));
  $$('#sList [data-listen]').forEach(n => n.onclick = () => {
    const key = n.dataset.listen;
    if (openBuiltin(key)) Router.go('#/listen/' + key);
  });
};

/* ============================================================
   新建精读
   ============================================================ */
Views.new = () => {
  const lv = Store.settings.level;
  mount(`
    <div class="wrap-narrow">
      <a href="#/library" class="backlink">${ic('back')} 返回文章库</a>
      <h1 class="serif" style="font-size:28px; margin:14px 0 4px">新文章精读</h1>
      <p class="muted" style="margin-bottom:24px">从订阅源挑一篇、粘贴链接抓取，或直接复制全文，AI 会完成精读加工。</p>
      <div class="new-form">
        <div class="field">
          <label>选一篇来读</label>
          <div class="src-chips" id="srcChips">
            ${FEED_SOURCES.map(s => `<button class="src-chip" data-feed="${escAttr(s.feed)}" data-name="${escAttr(s.name)}">${esc(s.name)}</button>`).join('')}
            <button class="src-chip add" id="srcCustom">＋ 自定义 RSS</button>
          </div>
          <div class="feed-box" id="feedBox" hidden>
            <div class="fb-head">
              <b id="fbName"></b>
              <span class="muted" id="fbMeta"></span>
              <button class="fb-x" id="fbX" title="收起">${ic('close')}</button>
            </div>
            <div class="fb-body" id="fbBody"></div>
          </div>
          <div class="hint" id="feedHint">读取该站对外公开的 RSS 列表（标题 + 摘要），点一篇才去抓那一篇的正文。付费墙文章通常只拿得到开头，需你自己有订阅。</div>
        </div>
        <div class="field">
          <label>或，粘贴文章链接</label>
          <div class="crawl-row">
            <input class="input" id="nUrl" placeholder="粘贴文章链接，如 https://www.theatlantic.com/…" autocomplete="off">
            <button class="btn" id="nCrawl">${ic('link')} 抓取正文</button>
          </div>
          <div class="hint" id="crawlHint">需要本地抓取服务：用 <b>node serve.mjs</b> 启动本页。抓到的正文会填入下方文本框，可自行删改。</div>
          ${IS_APP ? `<div class="bm-row"><span class="bm-tip">被站点拦住时：在手机浏览器里长按选中正文复制，再粘到上面的输入框……或直接粘进下面的正文框。</span></div>`
            : `<div class="bm-row">
            <a class="bm" id="bmLink" title="拖到浏览器书签栏（不要直接点）">${ic('download')} 取正文</a>
            <span class="bm-tip">拖到书签栏。在<b>浏览器能正常打开原文</b>的标签页点它，正文就进剪贴板了——用于被 Cloudflare / 登录页挡住的情况。</span>
            <button class="btn ghost sm" id="bmCopy">复制脚本</button>
          </div>`}
        </div>
        <div class="set-grid">
          <div class="field"><label>标题（可留空，AI 会拟题）</label>
            <input class="input" id="nTitle" placeholder="如：The Quiet Rebellion of Doing Nothing"></div>
          <div class="field"><label>来源（可选）</label>
            <input class="input" id="nSrc" placeholder="如：The Atlantic"></div>
        </div>
        <div class="field paste-area">
          <label>英文正文</label>
          <div class="paste-toolbar"><span>完整文章，按段落粘贴（空行分段）</span><span id="wcHint">0 词</span></div>
          <textarea class="input" id="nText" placeholder="Paste the full article here…&#10;&#10;也可以把文章链接填到上方「从链接抓取」，自动填入正文。"></textarea>
        </div>
        <div class="field"><label>生词标注基准（我的词汇水平）</label>
          <div class="level-picks" id="lvPicks">
            ${TARGET_LEVELS.map(o => `<button class="level-pick${o.id === lv ? ' on' : ''}" data-lv="${o.id}">${o.label}</button>`).join('')}
          </div>
          <div class="hint" id="lvHint">${esc((TARGET_LEVELS.find(o => o.id === lv) || TARGET_LEVELS[1]).desc + ' 之上的词将被标注')}</div>
        </div>
        <button class="btn primary big" id="nGo" style="width:100%">${ic('doc')} 开始 AI 精读</button>
        <div id="errBox"></div>
        <div class="new-tips">
          <b>小提示</b> · 文章仅用于个人学习，请遵守版权。正文会按你粘贴的段落原样保存，AI 只负责补译文与生词。
          短文中约 30–90 秒；超过 1400 词会自动分批（每批一轮请求），请保持页面打开。
        </div>
      </div>
    </div>`);

  let level = lv;
  $$('#lvPicks .level-pick').forEach(b => b.onclick = () => {
    level = b.dataset.lv;
    $$('#lvPicks .level-pick').forEach(x => x.classList.toggle('on', x === b));
    $('#lvHint').textContent = (TARGET_LEVELS.find(o => o.id === level) || TARGET_LEVELS[1]).desc + ' 之上的词将被标注';
  });
  const ta = $('#nText');
  ta.addEventListener('input', () => { $('#wcHint').textContent = countWords(ta.value) + ' 词'; });

  /* 从链接抓取正文 */
  const urlEl = $('#nUrl'), crawlBtn = $('#nCrawl'), crawlHint = $('#crawlHint');
  async function doCrawl() {
    const raw = urlEl.value.trim();
    if (!raw) { toast('先粘贴文章链接'); urlEl.focus(); return; }
    if (ta.value.trim()) {
      const ok = await confirmModal({
        title: '覆盖正文？', body: '正文框里已有内容，抓取会把它整个替换掉（标题与来源不受影响）。', okText: '覆盖',
      });
      if (!ok) return;
    }
    crawlBtn.disabled = true;
    crawlBtn.innerHTML = `<span class="mini-spin"></span> 抓取中…`;
    crawlHint.innerHTML = '正在抓取页面并提取正文，通常 3–10 秒…';
    try {
      const a = await crawlArticle(raw);
      ta.value = a.text;
      if (!$('#nTitle').value.trim()) $('#nTitle').value = a.title || '';
      if (!$('#nSrc').value.trim()) $('#nSrc').value = a.source || '';
      $('#wcHint').textContent = countWords(a.text) + ' 词';
      crawlHint.innerHTML = `<span class="ok-text">✓ 已抓取 ${a.words} 词</span> · 来源 ${esc(a.source || a.url)}`
        + '<br>结果里可能混入导航、图注或作者署名，建议通读一遍、删干净再开始精读。';
      urlEl.value = a.url;
      toast('抓取成功 · ' + a.words + ' 词');
    } catch (e) {
      const target = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      const tail = e.kind === 'blocked'
        ? `<br>这是站点的反爬拦截，不是网络问题。用上面的「取正文」书签在浏览器里取，或<a href="${escAttr(target)}" target="_blank" rel="noopener">打开原文</a>手动复制。`
        : (e.kind === 'needserver' ? ''
          : `<br><a href="${escAttr(target)}" target="_blank" rel="noopener">在新标签打开原文</a>，手动复制正文再贴到下面。`);
      crawlHint.innerHTML = `<span class="bad-text">${esc(e.message || String(e))}</span>` + tail;
    } finally {
      crawlBtn.disabled = false;
      crawlBtn.innerHTML = ic('link') + ' 抓取正文';
    }
  }
  crawlBtn.onclick = doCrawl;
  urlEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doCrawl(); } });

  /* 书签小工具（桌面端） */
  const bmLink = $('#bmLink');
  if (bmLink) {
    bmLink.href = BOOKMARKLET;
    bmLink.addEventListener('click', e => {
      e.preventDefault();
      toast('把它拖到浏览器书签栏——它要在原文页面里用');
    });
    $('#bmCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(BOOKMARKLET);
        toast('脚本已复制：新建书签，把这段粘到「网址」里');
      } catch (e) {
        toast('复制失败，请直接把这个按钮拖到书签栏');
      }
    };
  }

  /* 订阅源：列最新文章 → 点一篇 → 走上面的抓取流程 */
  const feedBox = $('#feedBox'), fbName = $('#fbName'), fbMeta = $('#fbMeta'), fbBody = $('#fbBody');
  async function pickFeedItem(it) {
    feedBox.hidden = true;
    urlEl.value = it.url;
    if (!$('#nTitle').value.trim()) $('#nTitle').value = it.title || '';
    await doCrawl();
  }
  async function loadFeed(feedUrl, name) {
    feedBox.hidden = false;
    fbName.textContent = name || feedUrl;
    fbMeta.textContent = '';
    fbBody.innerHTML = '<div class="fb-note"><span class="mini-spin"></span> 正在读取 RSS…</div>';
    feedBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const slow = setTimeout(() => {
      const n = fbBody.querySelector('.fb-note');
      if (n) n.innerHTML = '<span class="mini-spin"></span> 还在连接…境外站点可能需要走代理';
    }, 6000);
    try {
      const list = await fetchFeed(feedUrl);
      fbMeta.textContent = `最新 ${list.length} 篇`;
      fbBody.innerHTML = list.map(it => `
        <button class="fb-item" data-url="${escAttr(it.url)}">
          <span class="fi-t">${esc(it.title)}</span>
          <span class="fi-m">${it.date ? fmtDate(it.date) : ''}${it.date && it.desc ? ' · ' : ''}${esc(it.desc)}</span>
        </button>`).join('');
      $$('#fbBody .fb-item').forEach((b, i) => b.onclick = () => pickFeedItem(list[i]));
    } catch (e) {
      const tip = IS_APP
        ? ''
        : (e.kind === 'blocked'
          ? '<br>被站点反爬拦住了，换代理也没用。用新建页的「取正文」书签在浏览器里取。'
          : ' <a href="#/settings">去设置抓取代理 →</a>');
      fbBody.innerHTML = `<div class="fb-err">${esc(e.message || String(e))}<br>点右上角关闭，改用下面的「粘贴文章链接」或直接复制正文。${tip}</div>`;
    } finally {
      clearTimeout(slow);
    }
  }
  $$('#srcChips .src-chip[data-feed]').forEach(b => b.onclick = () => {
    $$('#srcChips .src-chip').forEach(x => x.classList.toggle('on', x === b));
    loadFeed(b.dataset.feed, b.dataset.name);
  });
  $('#srcCustom').onclick = () => {
    $$('#srcChips .src-chip').forEach(x => x.classList.remove('on'));
    feedBox.hidden = false;
    fbName.textContent = '自定义 RSS';
    fbMeta.textContent = '';
    fbBody.innerHTML = `<div class="fb-custom">
      <input class="input" id="fbUrl" placeholder="https://example.com/feed.xml" autocomplete="off">
      <button class="btn sm primary" id="fbGo">读取</button></div>`;
    $('#fbGo').onclick = () => { const v = $('#fbUrl').value.trim(); if (v) loadFeed(v, '自定义订阅源'); };
    $('#fbUrl').addEventListener('keydown', e => { if (e.key === 'Enter') $('#fbGo').click(); });
    $('#fbUrl').focus();
  };
  $('#fbX').onclick = () => { feedBox.hidden = true; };
  if (IS_APP) {
    crawlHint.innerHTML = '直接粘贴链接即可抓取，网络请求在 App 内完成。抓到的正文会填入下方文本框，可自行删改。';
  } else if (location.protocol === 'file:') {
    crawlHint.innerHTML = '<span class="bad-text">当前是用本地文件打开的，自动抓取不可用。</span> 请改用 <b>node serve.mjs</b> 启动，并通过 http://localhost:8123 打开本页。';
  }

  async function run() {
    const text = ta.value.trim();
    if (countWords(text) < 60) { showErr('文章太短了（至少 60 个英文单词）。请粘贴完整文章正文。'); return; }
    $('#errBox').innerHTML = '';
    /* 先把原文切成段落当骨架，再让 AI 回填译文。
       这样「用户看到的正文」永远等于「用户粘贴的正文」，长文也会自动分批，不会被截断。 */
    let draft;
    try {
      draft = draftArticle({ title: $('#nTitle').value.trim(), source: $('#nSrc').value.trim(), text, level });
    } catch (e) { showErr(e.message || String(e)); return; }

    const ov = startProcessing('AI 正在精读这篇文章');
    const startHash = location.hash;
    const nChunks = countAnalyzeChunks(draft.paragraphs);
    if (nChunks > 1) ov.note(`${draft.wc} 词 / ${draft.paragraphs.length} 段，分 ${nChunks} 批并行处理，请稍候`);
    try {
      const art = await analyzeFullArticle(draft, { onNote: m => ov.note(m) });
      Store.articles.unshift(art);
      Store.settings.level = level; save();
      ov.done();
      const missing = art.paragraphs.filter(p => !p.zh).length;
      const msg = missing
        ? `已精读 ${art.paragraphs.length - missing}/${art.paragraphs.length} 段，其余可稍后点「AI 精读本篇」补全`
        : '精读完成 · ' + art.words.length + ' 个生词已标注';
      // 用户中途切走了就别强行跳转，只提示结果（同上）
      if (location.hash !== startHash) { ov.close(); toast(missing ? '部分段落未完成，已存到文章库' : '精读完成，已存到文章库'); return; }
      setTimeout(() => { ov.close(); Router.go('#/reader/' + art.id); toast(msg); }, 550);
    } catch (e) {
      // 精读失败也要把原文留下来，别让用户白粘贴一次
      if (!Store.articles.some(a => a.id === draft.id)) { Store.articles.unshift(draft); save(); }
      ov.fail((e.message || String(e))
        + `。原文已保存到文章库（${draft.paragraphs.length} 段 / ${draft.wc} 词），之后可以在精读页点「AI 精读本篇」补全译文。`, run);
    }
  }
  function showErr(m) { $('#errBox').innerHTML = `<div class="err-panel">${esc(m)}</div>`; }
  $('#nGo').onclick = run;
};

/* 处理进度遮罩 */
function startProcessing(title) {
  closeOverlays({ views: false });   // 只清浮层，别动当前视图的监听与挂在 body 上的节点
  const steps = ['解析文章结构', '逐段翻译', '筛选生词难词', '提取词汇搭配', '生成内容概要'];
  const el = document.createElement('div');
  el.className = 'proc';
  el.innerHTML = `<div class="proc-box">
    <div class="proc-seal"></div>
    <div class="proc-title">${esc(title)}</div>
    <div class="proc-steps">${steps.map((s, i) => `<div class="proc-step" data-i="${i}"><span class="tick">${ic('check')}</span>${s}</div>`).join('')}</div>
    <div class="proc-note">文章较长时约需 1–2 分钟，请稍候</div>
  </div>`;
  document.getElementById('layer').appendChild(el);
  let cur = 0;
  const timers = [];
  const mark = i => {
    el.querySelectorAll('.proc-step').forEach((n, j) => {
      n.classList.toggle('done', j < i);
      n.classList.toggle('doing', j === i);
    });
  };
  mark(0);
  [2600, 6500, 11000, 15000].forEach((t, i) => timers.push(setTimeout(() => { if (cur < i + 1) { cur = i + 1; mark(cur); } }, t)));
  return {
    done() { timers.forEach(clearTimeout); mark(steps.length); el.querySelector('.proc-note').textContent = '完成，正在打开…'; },
    note(msg) { const n = el.querySelector('.proc-note'); if (n) n.textContent = msg; },
    fail(msg, retry) {
      timers.forEach(clearTimeout);
      el.querySelector('.proc-box').innerHTML = `
        <div class="proc-title" style="color:var(--accent)">精读失败</div>
        <div class="err-panel" style="margin:0 0 22px">${esc(msg)}</div>
        <div style="display:flex; gap:10px; justify-content:center">
          <button class="btn" id="procBack">返回修改</button>
          <button class="btn primary" id="procRetry">${ic('refresh')} 重试</button>
        </div>`;
      el.querySelector('#procBack').onclick = () => el.remove();
      el.querySelector('#procRetry').onclick = retry;
    },
    close() { el.remove(); },
  };
}

/* ============================================================
   精读视图
   ============================================================ */
Views.reader = ({ id }) => {
  const art = Store.articles.find(a => a.id === id);
  if (!art) { toast('文章不存在'); Router.go('#/library'); return; }
  const hlMap = buildHLMap(art);
  const phrases = art.words.filter(e => /\s/.test(e.word) || (e.forms || []).some(f => /\s/.test(f)));
  document.documentElement.style.setProperty('--fs', Store.settings.fs);
  const mode0 = ['tap', 'always', 'hint'].includes(Store.settings.showTr) ? Store.settings.showTr : 'tap';
  /* 阅读版式：注释本（外栏词注）/ 卡片（段落卡片 + 词汇栏）/ 经典（段落后跟译文 + 分页）。
     版式只决定「信息怎么排」，颜色全走主题变量 —— 所以注释本在 paper 下是一本带眉批的书，
     在 night 下自然变成夜读本，不需要第二套皮肤。 */
  /* 六种版式：三种手机读法（沉浸 / 逐段 / 大字）+ 三种桌面版式（注释本 / 卡片 / 经典）。
     auto = 按屏宽决定首次默认：手机进沉浸式，宽屏进注释本。 */
  const LAYOUTS = ['classic', 'annotated', 'desk', 'immersive', 'pages', 'big'];
  const wantLayout = Store.settings.readerLayout || 'auto';
  const layout = (wantLayout === 'auto' || !LAYOUTS.includes(wantLayout))
    ? (innerWidth <= 760 ? 'immersive' : 'annotated')
    : wantLayout;
  const mMode = layout === 'immersive' || layout === 'pages' || layout === 'big';
  const paged = layout === 'classic' && Store.settings.paged !== false;
  const openAll = mode0 === 'always';
  const hintOf = i => (art.words || []).filter(w => w.paraIndex === i);
  const font0 = Store.settings.fontFamily === 'sans' ? 'sans' : 'serif';
  const zhN = art.paragraphs.filter(p => p && p.zh).length;
  const totalP = art.paragraphs.length;
  const revN = (art.words || []).filter(w => w.review).length;
  const needAI = zhN < totalP;
  // 生词密度：标注词数 / 全文词数，给「这篇对我是难还是易」一个可比较的信号
  const density = art.wc ? (art.words.length / art.wc) * 100 : 0;
  const sntMode = !!Store.settings.sentenceMode;

  /* ---- 三种版式共用的小块 ---- */
  const trBtn = (i, extra) => `<button class="tr-btn ${openAll ? 'on' : ''}${extra ? ' ' + extra : ''}" title="显示 / 隐藏译文" data-tr="${i}">译</button>`;
  const trBody = (p, i) => {
    const hs = hintOf(i);
    return `<div class="tr-body">
        <div class="tr-hint">
          ${hs.length
            ? hs.map(w => `<span class="hint-chip" data-hw="${escAttr(w.word)}"><b>${esc(w.word)}</b><i>${esc(String(w.meaning_zh || '').split('；')[0].slice(0, 16))}</i></span>`).join('')
            : `<span class="hint-none">本段没有标注词</span>`}
          <button class="hint-full" data-full="${i}">看整段译文 →</button>
        </div>
        <div class="tr-full">${p.zh ? esc(p.zh) : '<span class="tr-empty">这段还没有译文 · 点上方「AI 精读本篇」补全</span>'}</div>
      </div>`;
  };
  const enHTML = (p, i) => sntMode
    ? renderSentenceBlock(p.en, hlMap, phrases)
    : renderEnParagraph(p.en, hlMap, phrases, countWords(p.en) >= 100);
  const nohlCls = Store.settings.hlWords ? '' : 'nohl';

  /* 文末小结：三种手机读法把它当作正文最后一块（逐段模式是最后一屏），
     桌面版式仍然挂在外壳末尾。 */
  const artEndHTML = `
      <div class="art-end" id="artEnd">
        <div class="ae-kicker"><span class="kicker">Close Reading · 本篇小结</span></div>
        <div class="ae-stats">
          <div><b>${art.words.length}</b><span>标注生词</span></div>
          <div><b>${density ? density.toFixed(1) + '%' : '—'}</b><span>生词密度</span></div>
          <div><b>${zhN} / ${totalP}</b><span>已精读段落</span></div>
          <div><b id="aeTime">1</b><span>本次停留 · 分钟</span></div>
        </div>
        ${art.words.length ? `
        <div class="ae-acts">
          <button class="btn primary" id="aeReview">${ic('review')} 复习本篇生词</button>
          <a class="btn" href="#/listen/${art.id}">${ic('headphones')} 听力精听</a>
          <a class="btn ghost" href="#/library">再读一篇 →</a>
        </div>
        <p class="ae-tip">「复习本篇」只练这一篇的词，还没收进生词本的会一并加入${revN ? `（含 ${revN} 个复习词）` : ''}。</p>`
          : `<p class="ae-tip">本篇还没有生词标注${needAI ? '，先点上方「AI 精读本篇」' : ''}。</p>`}
      </div>`;

  /* 手机读法共用的段落块：没有段号栏、没有外栏，只有正文 + 可展开译文 */
  const mPara = (p, i) => `
        <div class="para ${openAll ? 'open' : ''}" data-p="${i}">
          <div class="para-en" lang="en">${enHTML(p, i)}</div>
          ${trBody(p, i)}
        </div>`;

  const bodyHTML = mMode && layout !== 'pages' ? `
      <div class="reader-body m-body m-${layout} ${nohlCls} mode-${mode0}" id="rBody">
        ${art.paragraphs.map(mPara).join('')}
        ${artEndHTML}
      </div>`
    : layout === 'pages' ? `
      <div class="reader-body m-pages ${nohlCls} mode-${mode0}" id="rBody">
        ${art.paragraphs.map((p, i) => `
        <section class="m-page" data-i="${i}">
          <div class="m-pno"><b>${String(i + 1).padStart(2, '0')}</b> / ${String(art.paragraphs.length).padStart(2, '0')}</div>
          ${mPara(p, i)}
        </section>`).join('')}
        <section class="m-page m-last">${artEndHTML}</section>
      </div>`
    : layout === 'classic' ? `
      <div class="reader-body ${nohlCls} mode-${mode0} ${paged ? 'paged' : ''}" id="rBody">
        ${art.paragraphs.map((p, i) => `
        <div class="para ${openAll ? 'open' : ''}${countWords(p.en) >= 100 ? ' long' : ''}" data-p="${i}">
          <div class="para-en" lang="en"><span class="para-num">${i + 1}</span>${enHTML(p, i)}</div>
          <div class="tr-row">${trBtn(i)}${trBody(p, i)}</div>
        </div>`).join('')}
      </div>`
    : layout === 'annotated' ? `
      <div class="reader-body annotated ${nohlCls} mode-${mode0}" id="rBody">
        ${art.paragraphs.map((p, i) => {
          const hs = hintOf(i);
          return `
        <div class="para entry ${openAll ? 'open' : ''}" data-p="${i}">
          <div class="a-main">
            <div class="a-head">
              <span class="a-no">${String(i + 1).padStart(2, '0')}</span>
              <span class="a-rule"></span>
              ${trBtn(i)}
            </div>
            <div class="para-en" lang="en">${enHTML(p, i)}</div>
            ${trBody(p, i)}
          </div>
          <aside class="marg">
            ${hs.length
              ? `<span class="m-cap">本段 ${hs.length} 词</span>` + hs.map(w => `<button class="hint-chip m-item" data-hw="${escAttr(w.word)}"><b>${esc(w.word)}</b><i>${esc(w.pos || '')}${w.pos && w.meaning_zh ? ' · ' : ''}${esc(String(w.meaning_zh || '').split('；')[0].slice(0, 14))}</i></button>`).join('')
              : `<span class="m-cap">本段无标注</span>`}
          </aside>
        </div>`;
        }).join('')}
      </div>`
    : `
      <div class="desk-grid">
        <div class="reader-body desk ${nohlCls} mode-${mode0}" id="rBody">
          ${art.paragraphs.map((p, i) => {
            const hs = hintOf(i);
            return `
          <div class="para dcard ${openAll ? 'open' : ''}" data-p="${i}">
            <span class="d-no">${String(i + 1).padStart(2, '0')}</span>
            <div class="para-en" lang="en">${enHTML(p, i)}</div>
            ${trBody(p, i)}
            <div class="d-foot">
              ${trBtn(i)}
              ${hs.map(w => `<button class="hint-chip d-chip" data-hw="${escAttr(w.word)}"><b>${esc(w.word)}</b></button>`).join('')}
            </div>
          </div>`;
          }).join('')}
        </div>
        <aside class="voc-side" id="vocSide">
          <h4>本篇词汇<b>${art.words.length}</b></h4>
          ${art.words.map(w => `<button class="vs-item" data-w="${escAttr(normKey(w.word))}"><span>${esc(w.word)}</span><em>${esc(LEVEL_LABEL[w.level] || '')}</em></button>`).join('')}
          <p class="vs-tip">点词条定位到原文 · 点带下划线的词查释义</p>
        </aside>
      </div>`;

  mount(`
    <div class="reader-page layout-${layout}" id="readerBody" data-font="${font0}">
      <a href="#/library" class="backlink">${ic('back')} 文章库</a>

      <header class="rd-head">
        <div class="rd-kicker">${esc(art.source)} · Close Reading</div>
        <h1>${esc(art.title)}</h1>
        ${art.dek ? `<p class="rd-dek">${esc(art.dek)}</p>` : ''}
        <div class="rd-meta">
          ${art.byline ? `<span>${esc(art.byline)}</span>` : ''}
          ${art.section ? `<span>${esc(art.section)}</span>` : ''}
          ${art.topic ? `<span>${esc(art.topic)}</span>` : ''}
          <span>${esc(art.difficulty || 'C1')}</span>
          <span>${art.wc} 词</span>
          <span>${art.words.length} 个词${revN ? ` · ${revN} 个复习` : ''}</span>
          <span>${fmtDate(art.createdAt)}</span>
        </div>
        ${revN ? `<div class="hl-legend"><span><i class="lg-new"></i>新词</span><span><i class="lg-rev"></i>复习词（学过但可能忘了）</span></div>` : ''}
      </header>

      ${needAI ? `<div class="ai-banner" id="aiBanner">
        <div class="aib-txt">
          <b>${zhN ? `已精读 ${zhN} / ${totalP} 段` : '原文模式'}</b>
          <span>${zhN ? '剩下的段落还没有译文与生词标注。' : '这篇还没有分段翻译和生词标注——可以先读原文、用朗读精听，或让 AI 加工一遍。'}</span>
        </div>
        <button class="btn primary sm" id="rdAI">${ic('doc')} AI 精读本篇</button>
      </div>` : ''}

      ${art.summary_zh ? `<details class="rd-sum">
        <summary><b>读前提示</b><em></em></summary>
        <div class="rd-sum-body">
          <p class="sz">${esc(art.summary_zh)}</p>
          ${art.summary_en ? `<p class="se">${esc(art.summary_en)}</p>` : ''}
        </div>
      </details>` : ''}

      <div class="toolbar">
        <span class="seg mode-seg" id="trSeg" title="译文的呈现方式">
          ${[['tap', '点译'], ['always', '全译'], ['hint', '提示']].map(([m, t]) => `<button data-mode="${m}" class="${mode0 === m ? 'on' : ''}">${t}</button>`).join('')}
        </span>
        <span class="fs-group">
          <button id="fsFont" data-f="${font0}" title="切换正文字体：衬线 / 无衬线">Aa</button>
          <button id="fsDn" title="减小字号">A−</button>
          <button id="fsUp" title="增大字号">A＋</button>
        </span>
        <button class="tb-btn tm-ic ${Store.settings.hlWords ? 'on' : ''}" id="tbHl" title="生词标注">${ic('eye')}<span class="tb-lb">生词标注</span></button>
        <button class="tb-btn tm-ic ${sntMode ? 'on' : ''}" id="tbSent" title="句子解析：打开后每句末尾出现小圆点，点它拆解这一句">${ic('parse')}<span class="tb-lb">句子</span></button>
        <span class="tb-spacer"></span>
        <button class="tb-btn tm-ic" id="tbVoc" title="词汇表">${ic('stack')}<span class="tb-lb">词汇表</span></button>
        <a class="tb-btn tm-ic" href="#/teach/${art.id}" title="教学模式：一屏一段，像 PPT 一样讲">${ic('teach')}<span class="tb-lb">教学</span></a>
        <a class="tb-btn acc tm-ic" href="#/listen/${art.id}" title="听力精听">${ic('headphones')}<span class="tb-lb">听力精听</span></a>
      </div>

      ${bodyHTML}
      ${paged ? `<div class="pager" id="pager" hidden>
        <button class="pg-btn" id="pgPrev" title="上一页（←）">${ic('back')}</button>
        <span class="pg-info" id="pgInfo">1 / 1</span>
        <button class="pg-btn" id="pgNext" title="下一页（→）">${ic('next')}</button>
      </div>` : ''}
      ${mMode ? '' : artEndHTML}

      ${!mMode ? '' : layout === 'pages' ? `
      <div class="m-seg" id="mSeg">${art.paragraphs.map(() => '<i></i>').join('')}</div>
      <div class="m-dock">
        <button class="m-arrow" id="mPrev" title="上一段">${ic('back')}</button>
        <div class="m-mid">
          <span class="m-count" id="mCount">1 / ${art.paragraphs.length}</span>
          <button class="m-zh" id="mZh">译文</button>
        </div>
        <button class="m-arrow" id="mNext" title="下一段">${ic('next')}</button>
      </div>` : layout === 'big' ? `
      <div class="m-dock m-dock-big">
        <div class="m-bar"><i id="mBar"></i></div>
        <div class="m-row">
          <button class="m-arrow" id="mPrev" title="上一段">${ic('back')}</button>
          <button class="m-zh wide" id="mZh">译文</button>
          <button class="m-arrow" id="mNext" title="下一段">${ic('next')}</button>
        </div>
      </div>` : `
      <div class="m-pill" id="mPill">
        <button id="mZh" title="译文">译</button>
        <span class="m-sep"></span>
        <button id="mFont" title="字号">Aa</button>
        <button id="mToc" title="段落"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg></button>
        <span class="m-sep"></span>
        <button id="mMore" title="更多"><svg class="ic" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button>
      </div>`}
    </div>`);

  /* 阅读进度条（顶部细线，随滚动填充） */
  const pbar = document.createElement('div');
  pbar.className = 'read-progress';
  pbar.innerHTML = '<i></i>';
  mainEl().appendChild(pbar);
  const pfill = pbar.firstElementChild;
  let praf = 0;
  const onScrollProgress = () => {
    if (paged) return;                       // 分页模式下进度由页码决定
    if (praf) return;
    praf = requestAnimationFrame(() => {
      praf = 0;
      const h = document.documentElement.scrollHeight - innerHeight;
      const pct = h > 0 ? Math.min(100, Math.max(0, (scrollY / h) * 100)) : 0;
      pfill.style.width = pct + '%';
    });
  };
  addEventListener('scroll', onScrollProgress, { passive: true });
  addEventListener('resize', onScrollProgress, { passive: true });
  onScrollProgress();
  VIEW_CLEANUPS.push(() => {
    removeEventListener('scroll', onScrollProgress);
    removeEventListener('resize', onScrollProgress);
    if (praf) cancelAnimationFrame(praf);
    pbar.remove();
  });

  /* 分页阅读：只显示当前页的段落，其余保留在 DOM 里（译文、生词状态不丢） */
  let pages = [], pageNo = 0;
  const allParas = [...document.querySelectorAll('#rBody .para')];
  const pagerEl = paged ? $('#pager') : null;
  const pgInfoEl = paged ? $('#pgInfo') : null;
  const useMobilePages = () => innerWidth <= 920;
  const paintPage = (n, doScroll) => {
    if (!pages.length) return;
    pageNo = Math.max(0, Math.min(pages.length - 1, n));
    const set = new Set(pages[pageNo]);
    allParas.forEach((el, i) => el.classList.toggle('pg-on', set.has(i)));
    if (pgInfoEl) pgInfoEl.textContent = `${pageNo + 1} / ${pages.length}`;
    if (pagerEl) pagerEl.hidden = pages.length <= 1;
    const prev = $('#pgPrev'), next = $('#pgNext');
    if (prev) prev.disabled = pageNo === 0;
    if (next) next.disabled = pageNo === pages.length - 1;
    pfill.style.width = (((pageNo + 1) / pages.length) * 100) + '%';
    // 小结卡只在最后一页露面：它讲的是「读完了」，出现在第 1 页会打断翻页节奏
    const endEl = $('#artEnd');
    if (endEl) endEl.hidden = pageNo < pages.length - 1;
    if (doScroll) {
      const head = document.querySelector('.rd-head');
      const top = Math.max(0, scrollY + head.getBoundingClientRect().top - 8);
      scrollTo({ top, behavior: 'smooth' });
    }
  };
  if (paged) {
    const rebuild = () => { pages = buildPages(art.paragraphs, useMobilePages()); };
    rebuild();
    paintPage(0, false);
    $('#pgPrev').onclick = () => paintPage(pageNo - 1, true);
    $('#pgNext').onclick = () => paintPage(pageNo + 1, true);
    let lastMobile = useMobilePages();
    const onPgResize = () => {
      if (useMobilePages() === lastMobile) return;
      lastMobile = useMobilePages();
      rebuild(); paintPage(Math.min(pageNo, pages.length - 1), false);
    };
    const onPgKey = e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); paintPage(pageNo - 1, true); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); paintPage(pageNo + 1, true); }
    };
    addEventListener('resize', onPgResize);
    addEventListener('keydown', onPgKey);
    VIEW_CLEANUPS.push(() => {
      removeEventListener('resize', onPgResize);
      removeEventListener('keydown', onPgKey);
    });
  }

  /* ---- 手机读法：外壳交互（胶囊 / 段进度 / 底部坞） ---- */
  let curMPage = 0;
  const mPages = () => [...document.querySelectorAll('#rBody .m-page')];
  const mCur = () => {
    if (layout !== 'pages') return 0;
    let idx = 0;
    mPages().forEach((el, k) => { if (el.getBoundingClientRect().top <= 130) idx = k; });
    return Math.min(idx, Math.max(0, art.paragraphs.length - 1));
  };
  const mGo = i => {
    const els = mPages();
    const t = els[Math.max(0, Math.min(els.length - 1, i))];
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  /* 上一段 / 下一段：按「当前视口顶端那一段」推算，长短段都不会跳错 */
  const mStep = dir => {
    if (layout === 'pages') { mGo(mCur() + dir); return; }
    const paras = [...document.querySelectorAll('#rBody .para')];
    if (!paras.length) return;
    let idx = 0;
    paras.forEach((el, k) => { if (el.getBoundingClientRect().top <= 140) idx = k; });
    const t = paras[Math.max(0, Math.min(paras.length - 1, idx + dir))];
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (mMode) {
    document.body.classList.add('m-read');
    document.body.dataset.rlayout = layout;
    if (openAll) document.body.classList.add('m-zh');
    if (layout === 'pages') document.documentElement.classList.add('m-snap');
    VIEW_CLEANUPS.push(() => {
      document.body.classList.remove('m-read', 'm-zh');
      delete document.body.dataset.rlayout;
      document.documentElement.classList.remove('m-snap');
    });

    const zhBtn = $('#mZh');
    const setZh = on => {
      document.body.classList.toggle('m-zh', on);
      if (zhBtn) zhBtn.classList.toggle('on', on);
    };
    if (openAll && zhBtn) zhBtn.classList.add('on');
    if (zhBtn) zhBtn.onclick = () => setZh(!document.body.classList.contains('m-zh'));

    const mFont = $('#mFont');
    if (mFont) mFont.onclick = () => {
      Store.settings.fs = ((Store.settings.fs ?? 1) + 1) % 4; save();
      document.documentElement.style.setProperty('--fs', Store.settings.fs);
      toast('正文字号 ' + (18 + Store.settings.fs * 2) + 'px');
    };
    const mToc = $('#mToc');
    if (mToc) mToc.onclick = () => openTocSheet(art, i => { if (layout === 'pages') mGo(i); else { const el = $(`#rBody .para[data-p="${i}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    const mMore = $('#mMore');
    if (mMore) mMore.onclick = () => openMoreSheet(art);

    const pv = $('#mPrev'), nx = $('#mNext');
    if (pv) pv.onclick = () => mStep(-1);
    if (nx) nx.onclick = () => mStep(1);

    /* 逐段：段进度格子 + 计数 */
    const segs = [...document.querySelectorAll('#mSeg i')];
    const countEl = $('#mCount');
    const barEl = $('#mBar');
    const sync = () => {
      if (layout === 'pages') {
        const i = mCur();
        curMPage = i;
        if (segs.length) {
          segs.forEach((s, k) => { s.classList.toggle('done', k < i); s.classList.toggle('cur', k === i); });
          if (countEl) countEl.textContent = (i + 1) + ' / ' + art.paragraphs.length;
        }
      } else if (barEl) {
        const h = document.documentElement.scrollHeight - innerHeight;
        barEl.style.width = (h > 0 ? Math.min(100, Math.max(0, scrollY / h * 100)) : 0) + '%';
      }
    };
    addEventListener('scroll', sync, { passive: true });
    VIEW_CLEANUPS.push(() => removeEventListener('scroll', sync));
    sync();

    /* 沉浸式：滚动时收起胶囊，停下浮回 */
    const pill = $('#mPill');
    if (pill) {
      let t = 0;
      const onS = () => {
        pill.classList.add('dim');
        clearTimeout(t);
        t = setTimeout(() => pill.classList.remove('dim'), 420);
      };
      addEventListener('scroll', onS, { passive: true });
      VIEW_CLEANUPS.push(() => { removeEventListener('scroll', onS); clearTimeout(t); });
    }
  }

  /* ---- 阅读位置记忆 ----
     长文关掉再进不该回到第 1 页。分页模式记页码，连续模式记滚动百分比；
     离开视图（路由切换 / 重新精读）与滚动停止时写入，进入时恢复。 */
  const rememberPos = () => {
    if (paged) art.pos = { page: pageNo, at: Date.now() };
    else if (layout === 'pages') art.pos = { mpage: mCur(), at: Date.now() };
    else {
      const h = document.documentElement.scrollHeight - innerHeight;
      art.pos = { pct: h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0, at: Date.now() };
    }
    save();
  };
  VIEW_CLEANUPS.push(rememberPos);

  if (!paged) {
    // 连续滚动靠「滚动停止」落盘，否则关标签页时位置还没写进去
    let posTimer = 0;
    const onPosScroll = () => { clearTimeout(posTimer); posTimer = setTimeout(rememberPos, 1200); };
    addEventListener('scroll', onPosScroll, { passive: true });
    VIEW_CLEANUPS.push(() => { removeEventListener('scroll', onPosScroll); clearTimeout(posTimer); });
  }

  /* 恢复：分页回到上次那页；逐段回到上次那屏；连续模式等布局稳定后再滚 */
  const pos = art.pos;
  if (pos) {
    if (paged && Number.isFinite(pos.page) && pos.page > 0) {
      paintPage(Math.min(pos.page, pages.length - 1), false);
    } else if (layout === 'pages' && Number.isFinite(pos.mpage) && pos.mpage > 0) {
      requestAnimationFrame(() => mGo(pos.mpage));
    } else if (!paged && Number.isFinite(pos.pct) && pos.pct > 0.02) {
      requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - innerHeight;
        if (h > 0) scrollTo(0, pos.pct * h);
      });
    }
  }

  /* 文末小结：停留计时 + 去复习 */
  const t0 = Date.now();
  const aeTime = $('#aeTime');
  if (aeTime) {
    const tick = () => { aeTime.textContent = String(Math.max(1, Math.round((Date.now() - t0) / 60000))); };
    tick();
    const iv = setInterval(tick, 30000);
    VIEW_CLEANUPS.push(() => clearInterval(iv));
  }
  const aeReview = $('#aeReview');
  if (aeReview) aeReview.onclick = () => Router.go('#/review/' + art.id);

  /* 卡片版的词汇栏：点词条 → 滚到正文那一处并闪一下，和注释本的外栏同一个心智 */
  const vocSide = $('#vocSide');
  if (vocSide) {
    vocSide.addEventListener('click', e => {
      const b = e.target.closest('.vs-item');
      if (!b) return;
      const t = document.querySelector(`#rBody .vw[data-word="${CSS.escape(b.dataset.w)}"]`);
      if (!t) { toast('这一段还没有标注'); return; }
      const para = t.closest('.para');
      if (para) {
        para.scrollIntoView({ block: 'center', behavior: 'smooth' });
        para.classList.add('flash');
        setTimeout(() => para.classList.remove('flash'), 1300);
      }
    });
  }

  /* 段落导航轨：右侧刻度把「一条望不到头的长河」变成 8 个可见的段，
     既给方位感（现在第几段、还剩几段），也支持直接点击跳转。 */
  const pRail = document.createElement('div');
  pRail.className = 'para-rail';
  pRail.innerHTML = art.paragraphs.map((_, i) => `<button class="pr-tick" data-i="${i}" title="第 ${i + 1} 段"></button>`).join('');
  document.body.appendChild(pRail);
  if (layout !== 'classic') pRail.style.display = 'none';   // 注释本有外栏、卡片有词汇栏，都不需要段轨
  const pTicks = [...pRail.children];
  const pNodes = [...document.querySelectorAll('#rBody .para')];
  let pCur = -1, pRaf = 0;
  const spyParas = () => {
    pRaf = 0;
    const line = innerHeight * 0.34;          // 以视口上 1/3 判定「正在读的段」
    let idx = 0;
    for (let i = 0; i < pNodes.length; i++) if (pNodes[i].getBoundingClientRect().top <= line) idx = i;
    if (idx !== pCur) {
      pCur = idx;
      pTicks.forEach((t, i) => t.classList.toggle('on', i === idx));
    }
  };
  const onParaScroll = () => { if (!pRaf) pRaf = requestAnimationFrame(spyParas); };
  addEventListener('scroll', onParaScroll, { passive: true });
  addEventListener('resize', onParaScroll, { passive: true });
  spyParas();
  pTicks.forEach((t, i) => t.onclick = () => pNodes[i].scrollIntoView({ block: 'start', behavior: 'smooth' }));

  // 刻度轨按正文栏实际右边界定位，贴外侧 26px
  const placeRail = () => {
    const col = document.querySelector('.reader-page');
    if (!col) return;
    const r = col.getBoundingClientRect();
    pRail.style.left = Math.max(0, Math.min(r.right + 26, innerWidth - 46)) + 'px';
  };
  placeRail();
  addEventListener('resize', placeRail);

  VIEW_CLEANUPS.push(() => {
    removeEventListener('scroll', onParaScroll);
    removeEventListener('resize', onParaScroll);
    removeEventListener('resize', placeRail);
    if (pRaf) cancelAnimationFrame(pRaf);
    pRail.remove();
  });

  /* 正文字体切换（衬线 / 无衬线） */
  const fontBtn = $('#fsFont');
  fontBtn.onclick = () => {
    const next = fontBtn.dataset.f === 'sans' ? 'serif' : 'sans';
    Store.settings.fontFamily = next; save();
    $('#readerBody').dataset.font = next;
    fontBtn.dataset.f = next;
    toast(next === 'sans' ? '正文改用无衬线' : '正文改用衬线');
  };
  /* 逐段译文 */
  $$('#rBody [data-tr]').forEach(b => b.onclick = () => {
    const p = b.closest('.para');
    p.classList.toggle('open');
    b.classList.toggle('on', p.classList.contains('open'));
  });
  /* 「看整段译文」：提示模式下展开该段完整译文 */
  $$('#rBody [data-full]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const p = b.closest('.para');
    p.classList.add('full', 'open');
    const tb = p.querySelector('.tr-btn'); if (tb) tb.classList.add('on');
  });
  /* 提示词点开释义 */
  $$('#rBody .hint-chip').forEach(c => c.onclick = e => {
    e.stopPropagation();
    const w = c.dataset.hw;
    const entry = (art.words || []).find(x => x.word === w) || null;
    openWordCard({ x: e.clientX, y: e.clientY, word: w, entry, articleId: art.id, ctx: '' });
  });
  /* 译文模式：点译 / 全译 / 提示 */
  const applyMode = m => {
    Store.settings.showTr = m; save();
    const body = $('#rBody');
    ['mode-tap', 'mode-always', 'mode-hint'].forEach(c => body.classList.toggle(c, c === 'mode-' + m));
    $$('#trSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    const open = m === 'always';
    $$('#rBody .para').forEach(p => {
      p.classList.toggle('open', open);
      const b = p.querySelector('.tr-btn'); if (b) b.classList.toggle('on', open);
      if (m !== 'hint') p.classList.remove('full');
    });
    if (m === 'hint') toast('提示模式：先只给关键词，卡住了再看整段译文');
  };
  $$('#trSeg button').forEach(b => b.onclick = () => applyMode(b.dataset.mode));
  $('#tbHl').onclick = () => {
    Store.settings.hlWords = !Store.settings.hlWords; save();
    $('#tbHl').classList.toggle('on', Store.settings.hlWords);
    $('#rBody').classList.toggle('nohl', !Store.settings.hlWords);
  };

  /* 句子解析：按需点亮。只重绘 .para-en，不动整页 —— 译文展开状态、阅读位置都保住 */
  const repaintSentences = on => {
    document.querySelectorAll('#rBody .para').forEach(el => {
      const p = art.paragraphs[+el.dataset.p];
      const box = el.querySelector('.para-en');
      if (!p || !box) return;
      const num = box.querySelector('.para-num');
      box.innerHTML = (num ? num.outerHTML : '') + (on
        ? renderSentenceBlock(p.en, hlMap, phrases)
        : renderEnParagraph(p.en, hlMap, phrases, countWords(p.en) >= 100));
    });
  };
  const tbSent = $('#tbSent');
  if (tbSent) tbSent.onclick = () => {
    Store.settings.sentenceMode = !Store.settings.sentenceMode; save();
    const on = Store.settings.sentenceMode;
    tbSent.classList.toggle('on', on);
    repaintSentences(on);
    toast(on ? '句子解析已开：点句末的小圆点拆解这一句' : '句子解析已关');
  };
  const setFs = d => {
    Store.settings.fs = Math.max(0, Math.min(3, Store.settings.fs + d)); save();
    document.documentElement.style.setProperty('--fs', Store.settings.fs);
  };
  $('#fsDn').onclick = () => setFs(-1);
  $('#fsUp').onclick = () => setFs(1);
  $('#tbVoc').onclick = () => openVocDrawer(art, hlMap);

  /* AI 精读本篇（内置刊物长文按批翻译） */
  const rdAI = $('#rdAI');
  if (rdAI) rdAI.onclick = async () => {
    if (!Store.settings.apiKey) {
      toast('先到「设置 → AI 服务」填一个 API Key');
      Router.go('#/settings');
      return;
    }
    const proc = startProcessing('AI 精读 · ' + art.title.slice(0, 22));
    const startHash = location.hash;
    const retry = () => {
      proc.close();
      const again = $('#rdAI');
      if (again) again.click();                  // 视图还在，直接重跑一遍真实的精读
      else { runViewCleanups(); Views.reader({ id: art.id }); }
    };
    try {
      const fresh = await analyzeFullArticle(art, { onNote: m => proc.note(m) });
      const i = Store.articles.findIndex(x => x.id === art.id);
      if (i >= 0) Store.articles[i] = fresh; else Store.articles.unshift(fresh);
      save(); refreshBadges();
      proc.done();
      /* 长文精读要好几分钟，用户完全可能已经切走了。这时只提示结果，
         不要把人家拽回精读页 —— 直接改 #main 会让 hash、导航高亮、滚动位置全对不上。 */
      if (location.hash !== startHash) {
        proc.close();
        toast('《' + art.title.slice(0, 14) + '》精读完成，已存到文章库');
        return;
      }
      setTimeout(() => { proc.close(); runViewCleanups(); Views.reader({ id: art.id }); }, 400);
    } catch (e) {
      proc.fail((e && e.message) || String(e), retry);
    }
  };

  /* 点词 / 键盘选词 */
  const showWord = (sp, x, y) => {
    const key = sp.dataset.word;
    const entry = hlMap.get(key) || null;
    const para = sp.closest('.para');
    const p = para ? art.paragraphs[+para.dataset.p] : null;
    openWordCard({ x, y, word: sp.textContent.trim(), entry, articleId: art.id, ctx: (p && p.en) || '' });
  };
  $('#rBody').addEventListener('click', e => {
    /* 「解析」小按钮优先：它挂在 .snt 里，先判掉，否则会被当成点词 */
    const sb = e.target.closest('.snt-btn');
    if (sb) {
      e.preventDefault();
      const para = sb.closest('.para');
      const src = art.paragraphs[+(para && para.dataset.p)];
      if (!src) return;
      const sents = splitSentences(src.en);
      const idx = +sb.dataset.si;
      if (sents[idx]) openSentencePanel({ art, text: sents[idx], index: idx + 1, total: sents.length, ctx: src.en });
      return;
    }
    const sp = e.target.closest('span.w');
    if (sp) showWord(sp, e.clientX, e.clientY);
  });
  /* 标注词带 tabindex，键盘用户用 Tab 走到词上、回车/空格打开释义卡 */
  $('#rBody').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const sp = e.target.closest('span.w');
    if (!sp) return;
    e.preventDefault();
    const r = sp.getBoundingClientRect();
    showWord(sp, r.left + r.width / 2, r.bottom);
  });
};

/* 长难句解析面板：右侧抽屉（桌面）/ 底部卡片（手机）。
   和生词卡的分工：词卡回答「这个词什么意思」，这里回答「这句为什么这么写」。
   结果按句缓存进 art.sntCache —— 同一句反复点不该反复花钱。 */
function openSentencePanel({ art, text, index, total, ctx }) {
  document.querySelectorAll('.snt-panel').forEach(n => n.remove());
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return;
  const key = 'v2|' + raw;   // 只用于缓存，不要显示出来
  art.sntCache = art.sntCache || {};

  const el = document.createElement('div');
  el.className = 'snt-panel';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '长难句解析');
  el.innerHTML = `
    <div class="sp-head">
      <span class="sp-k">${ic('parse')}长难句解析</span>
      <span class="sp-n">第 ${index} / ${total} 句</span>
      <button class="sp-x" title="关闭">${ic('close')}</button>
    </div>
    <div class="sp-body">
      <p class="sp-quote">${esc(raw)}</p>
      <div class="sp-out"></div>
    </div>`;
  document.getElementById('layer').appendChild(el);
  el.querySelector('.sp-x').onclick = () => el.remove();

  const out = el.querySelector('.sp-out');
  const paint = d => {
    out.innerHTML = `
      ${d.gist ? `<div class="sp-sec"><p class="sp-gist">${esc(d.gist)}</p></div>` : ''}
      ${d.parts.length ? `<div class="sp-sec"><span class="sp-lab">拆开看</span>${d.parts.map((c, i) =>
        `<div class="sp-part"><b>${esc(c.zh || c.role)}</b>${c.en ? `<em>${esc(c.en)}</em>` : ''}${c.zh && c.role ? `<span>${esc(c.role)}</span>` : ''}</div>`).join('')}</div>` : ''}
      ${d.grammar.length ? `<div class="sp-sec"><span class="sp-lab">为什么这么写</span>${d.grammar.map(g =>
        `<div class="sp-gram"><b>${esc(g.point)}</b>${g.note ? `<span>${esc(g.note)}</span>` : ''}</div>`).join('')}</div>` : ''}
      ${d.why_hard ? `<div class="sp-sec"><span class="sp-lab">卡在哪</span><p class="sp-why">${esc(d.why_hard)}</p></div>` : ''}
      ${d.rewrite.length ? `<div class="sp-sec"><span class="sp-lab">换成短句</span>${d.rewrite.map(s => `<p class="sp-rw">${esc(s)}</p>`).join('')}</div>` : ''}
      ${d.zh ? `<div class="sp-sec"><span class="sp-lab">意思</span><p class="sp-zh">${esc(d.zh)}</p></div>` : ''}
      ${d.phrases.length ? `<div class="sp-sec"><span class="sp-lab">搭配</span><div class="sp-ph">${d.phrases.map(p => `<span class="chip" title="${escAttr(p.zh)}">${esc(p.en)}</span>`).join('')}</div></div>` : ''}
      <div class="sp-foot">
        <button class="btn sm ghost" id="spSay">${ic('sound')} 朗读这句</button>
        <button class="btn sm ghost" id="spCopy">${ic('doc')} 复制拆解</button>
      </div>`;
    const say = out.querySelector('#spSay');
    if (say) say.onclick = () => TTS.speak(raw, { rate: 0.92 });
    const cp = out.querySelector('#spCopy');
    if (cp) cp.onclick = async () => {
      const plain = [
        d.gist,
        ...d.parts.map(c => `· ${c.zh || ''}${c.en ? '（' + c.en + '）' : ''}`),
        ...d.grammar.map(g => `为什么这么写：${g.point} ${g.note}`),
        d.why_hard ? '卡在哪：' + d.why_hard : '',
        ...d.rewrite.map(s => '换成短句：' + s),
        d.zh ? '意思：' + d.zh : '',
      ].filter(Boolean).join('\n');
      const body = String(text || '').replace(/\s+/g, ' ').trim();
      try { await navigator.clipboard.writeText(body + '\n\n' + plain); toast('拆解已复制'); }
      catch (e) { toast('复制失败，请手动选择文字'); }
    };
  };

  const load = () => {
    if (art.sntCache[key]) { paint(art.sntCache[key]); return; }
    out.innerHTML = `<div class="sp-load"><span class="mini-spin"></span> 正在拆解这句…</div>`;
    parseSentence(key, ctx)
      .then(d => { art.sntCache[key] = d; save(); paint(d); })
      .catch(e => {
        const msg = (e && e.message) || String(e);
        const noKey = e && e.kind === 'nokey';
        out.innerHTML = `<div class="err-panel">${esc(msg)}</div>
          <div class="sp-foot">${noKey
            ? `<a class="btn sm primary" href="#/settings">去填 API Key</a>`
            : `<button class="btn sm" id="spRetry">${ic('refresh')} 重试</button>`}</div>`;
        const r = out.querySelector('#spRetry');
        if (r) r.onclick = load;
      });
  };
  load();
}

/* 补标四六级词：只追加、不重写。跑完重挂一次阅读页，新高亮立刻生效。 */
async function topupCET(art) {
  if (!Store.settings.apiKey) { toast('补标注需要先填 API Key'); Router.go('#/settings'); return; }
  const ov = startProcessing('正在补标四六级词');
  try {
    const r = await supplementCETWords(art, { onNote: m => ov.note(m) });
    ov.done();
    setTimeout(() => {
      ov.close();
      toast(r.added ? `补了 ${r.added} 个四六级词` : '没有发现遗漏的四六级词');
      if (Router.current === 'reader') Router.go('#/reader/' + art.id);
    }, 520);
  } catch (e) {
    ov.fail((e && e.message) || String(e), () => topupCET(art));
  }
}

/* 手机读法里的「更多」：把原来工具栏上那排按钮收进一张底部面板 */
function openMoreSheet(art) {
  document.querySelectorAll('.m-sheet-bd').forEach(n => n.remove());
  const bd = document.createElement('div');
  bd.className = 'm-sheet-bd';
  const flag = v => (v ? '已开' : '关');
  bd.innerHTML = `
    <div class="m-sheet" role="dialog" aria-label="更多">
      <div class="m-grab"></div>
      <button class="m-rowbtn" data-act="sent"><span>${ic('parse')}句子解析</span><em>${flag(Store.settings.sentenceMode)}</em></button>
      <button class="m-rowbtn" data-act="hl"><span>${ic('eye')}生词标注</span><em>${flag(Store.settings.hlWords)}</em></button>
      <button class="m-rowbtn" data-act="voc"><span>${ic('stack')}本篇词汇表</span><b>${art.words.length}</b></button>
      <button class="m-rowbtn" data-act="topup"><span>${ic('plus')}补四六级词</span><b>→</b></button>
      <a class="m-rowbtn" href="#/teach/${art.id}"><span>${ic('teach')}教学模式</span><b>→</b></a>
      <a class="m-rowbtn" href="#/listen/${art.id}"><span>${ic('headphones')}听力精听</span><b>→</b></a>
      <a class="m-rowbtn" href="#/settings"><span>${ic('gear')}阅读设置</span><b>→</b></a>
    </div>`;
  document.getElementById('layer').appendChild(bd);
  bd.onclick = e => { if (e.target === bd) bd.remove(); };
  bd.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    bd.remove();
    if (act === 'topup') { topupCET(art); return; }
    const target = act === 'sent' ? $('#tbSent') : act === 'hl' ? $('#tbHl') : $('#tbVoc');
    if (target) target.click();
  });
}

/* 段落跳转 */
function openTocSheet(art, onPick) {
  document.querySelectorAll('.m-sheet-bd').forEach(n => n.remove());
  const bd = document.createElement('div');
  bd.className = 'm-sheet-bd';
  bd.innerHTML = `
    <div class="m-sheet" role="dialog" aria-label="段落">
      <div class="m-grab"></div>
      <div style="font-family:var(--sans);font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-3);padding:0 10px 8px">
        本篇 ${art.paragraphs.length} 段
      </div>
      ${art.paragraphs.map((p, i) => `<button class="m-toc-item" data-i="${i}"><b>${String(i + 1).padStart(2, '0')}</b>${esc(p.en.slice(0, 38))}…</button>`).join('')}
    </div>`;
  document.getElementById('layer').appendChild(bd);
  bd.onclick = e => { if (e.target === bd) bd.remove(); };
  bd.querySelectorAll('.m-toc-item').forEach(b => b.onclick = () => {
    const i = +b.dataset.i;
    bd.remove();
    onPick(i);
  });
}

/* 词汇抽屉 */
function openVocDrawer(art, hlMap) {
  document.querySelectorAll('.voc-drawer').forEach(n => n.remove());
  const d = document.createElement('div');
  d.className = 'voc-drawer';
  const item = w => {
    const inBook = !!Store.words[normKey(w.word)];
    return `<div class="voc-item" data-w="${escAttr(w.word)}">
      <div style="min-width:0">
        <span class="voc-word">${esc(w.word)}</span><span class="lv-chip l-${Object.hasOwn(LEVEL_LABEL, w.level) ? w.level : 'x'}" style="margin-left:7px; font-size:10px; padding:0 6px; border-radius:99px; background:var(--c)">${LEVEL_LABEL[w.level] || ''}</span>
        ${w.phonetic ? `<span class="ph">${esc(w.phonetic)}</span>` : ''}
        <div class="mn">${esc(w.meaning_zh)}</div>
      </div>
      <button class="voc-add ${inBook ? 'in' : ''}" title="${inBook ? '已在生词本' : '加入生词本'}" data-add="${escAttr(w.word)}">${ic(inBook ? 'check' : 'plus')}</button>
    </div>`;
  };
  const keyCols = (art.keyCollocations || []).length
    ? `<div style="padding:10px 8px 6px"><span class="kicker" style="font-size:10px">文中地道搭配</span>
       <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px">${art.keyCollocations.map(c => `<span class="chip" title="${escAttr(c.zh)}">${esc(c.en)}</span>`).join('')}</div></div><div class="hr" style="margin:8px 0"></div>` : '';
  d.innerHTML = `
    <div class="voc-head">${ic('stack')} <b>本篇词汇</b><span class="cnt">${art.words.length} 词</span>
      <span style="flex:1"></span>
      <button class="voc-topup" id="vocTopup" title="把本篇里漏掉的 CET-4 / CET-6 词补进来">补四六级</button>
      <button class="iconbtn" id="vocX" style="width:30px;height:30px">${ic('close')}</button></div>
    <div class="voc-body">${keyCols}${art.words.length ? art.words.map(item).join('') : '<p class="muted" style="padding:20px; text-align:center">本篇没有标注生词</p>'}</div>
    <div class="voc-foot"><button class="btn primary" style="width:100%" id="vocAll">${ic('plus')} 全部加入生词本</button></div>`;
  document.getElementById('layer').appendChild(d);
  $('#vocX').onclick = () => d.remove();
  const topBtn = $('#vocTopup');
  if (topBtn) topBtn.onclick = () => { d.remove(); topupCET(art); };
  d.querySelector('.voc-body').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const w = art.words.find(x => x.word === add.dataset.add);
      if (w && !Store.words[normKey(w.word)]) { addWord(w, art.id); add.classList.add('in'); add.innerHTML = ic('check'); toast('已加入生词本'); }
      else if (w) toast('已在生词本中');
      return;
    }
    const it = e.target.closest('.voc-item');
    if (it) {
      const w = art.words.find(x => x.word === it.dataset.w);
      if (w) {
        const r = it.getBoundingClientRect();
        openWordCard({ x: Math.max(60, r.left - 380), y: r.top, word: w.word, entry: w, articleId: art.id, ctx: '' });
      }
    }
  });
  $('#vocAll').onclick = () => {
    let n = 0;
    art.words.forEach(w => { if (!Store.words[normKey(w.word)]) { addWord(w, art.id); n++; } });
    toast(n ? `已加入 ${n} 个生词` : '全部已在生词本中');
    d.querySelectorAll('[data-add]').forEach(b => { b.classList.add('in'); b.innerHTML = ic('check'); });
  };
}

/* 单词弹卡 */
function openWordCard({ x, y, word, entry, articleId, ctx }) {
  document.querySelectorAll('.wcard,.wc-backdrop').forEach(n => n.remove());
  const key = normKey(entry ? entry.word : word);
  const bd = document.createElement('div');
  bd.className = 'wc-backdrop';
  const card = document.createElement('div');
  card.className = 'wcard';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', '单词释义');
  card.tabIndex = -1;
  bd.appendChild(card);
  document.getElementById('layer').appendChild(bd);
  bd.addEventListener('click', () => { bd.remove(); card.remove(); });

  const renderEntry = (e, fromAI) => {
    const inBook = !!Store.words[key];
    card.className = 'wcard l-' + (e.level || 'x');
    card.innerHTML = `
      <button class="wcard-close" title="关闭">${ic('close')}</button>
      <div class="wcard-top"><span class="wcard-word">${esc(e.word || word)}</span>
        ${e.phonetic ? `<span class="wcard-ph">${esc(e.phonetic)}</span>` : ''}
        <span class="lv-chip">${LEVEL_LABEL[e.level] || '超纲'}</span>${e.review ? '<span class="lv-chip rev">复习</span>' : ''}</div>
      ${e.pos ? `<div class="wcard-pos">${esc(e.pos)}</div>` : ''}
      <div class="wcard-mn">${e.meaning_zh ? esc(e.meaning_zh) : '<span class="tr-empty">还没有释义</span>'}</div>
      ${e.example_en ? `<div class="wcard-sec"><div class="sec-label">例句</div>
        <div class="wcard-ex">${esc(e.example_en)}${e.example_zh ? `<span class="zh">${esc(e.example_zh)}</span>` : ''}</div></div>` : ''}
      ${e.collocations && e.collocations.length ? `<div class="wcard-sec"><div class="sec-label">常用搭配</div>
        <ul class="wcard-coll">${e.collocations.map(c => `<li><span class="en">${esc(c.en)}</span><span class="zh">${esc(c.zh)}</span></li>`).join('')}</ul></div>` : ''}
      <div class="wcard-acts">
        <button class="btn sm" id="wcSay">${ic('sound')} 朗读</button>
        ${!e.meaning_zh ? `<button class="btn sm primary" id="wcFill">${ic('refresh')} AI 补全释义</button>` : ''}
        <button class="btn sm ${inBook ? '' : 'primary'}" id="wcAdd">${inBook ? ic('check') + ' 已在生词本 · 移出' : ic('plus') + ' 加入生词本'}</button>
      </div>`;
    card.querySelector('.wcard-close').onclick = ev => { ev.stopPropagation(); bd.remove(); card.remove(); };
    card.addEventListener('click', ev => ev.stopPropagation());
    card.querySelector('#wcSay').onclick = () => TTS.speak(e.word || word, { rate: 0.9 });
    const fill = card.querySelector('#wcFill');
    if (fill) fill.onclick = async () => {
      fill.disabled = true;
      fill.innerHTML = '<span class="mini-spin"></span> 查询中…';
      try {
        const got = await lookupWord(e.word || word, ctx);
        addWord(Object.assign({}, got, { word: e.word || word }), articleId);
        renderEntry(Store.words[key] || got, false);
        toast('释义已补全');
      } catch (err) {
        fill.disabled = false;
        fill.innerHTML = ic('refresh') + ' AI 补全释义';
        toast((err && err.message) || '补全失败');
      }
    };
    card.querySelector('#wcAdd').onclick = () => {
      if (Store.words[key]) { removeWord(key); renderEntry(e, fromAI); toast('已从生词本移出'); }
      else { addWord(e, articleId); renderEntry(e, fromAI); toast('已加入生词本'); }
    };
    positionCard(card, x, y);
  };

  const known = Store.words[key];      // 文章里没标注，但生词本里已经有了（别的文章收过）
  if (entry) renderEntry(entry, false);
  else if (known) renderEntry(known, false);
  else {
    card.className = 'wcard';
    card.innerHTML = `
      <button class="wcard-close" title="关闭">${ic('close')}</button>
      <div class="wcard-top"><span class="wcard-word">${esc(word)}</span><span class="lv-chip" style="background:var(--ink-3)">未标注</span></div>
      <div class="wcard-loading" style="margin-top:6px">未标注词。可以先「直接收录」（释义稍后再补），也可以点「AI 查词」一次补全——后者需要先在<a href="#/settings" style="color:var(--accent-ink); text-decoration:underline">设置</a>里填 API Key。</div>
      <div class="wcard-acts">
        <button class="btn sm" id="wcSay">${ic('sound')} 朗读</button>
        <button class="btn sm primary" id="wcAddRaw">${ic('plus')} 直接收录</button>
        <button class="btn sm" id="wcAI">${ic('refresh')} AI 查词</button>
      </div>`;
    card.addEventListener('click', ev => ev.stopPropagation());
    card.querySelector('.wcard-close').onclick = () => { bd.remove(); card.remove(); };
    card.querySelector('#wcSay').onclick = () => TTS.speak(word, { rate: 0.9 });
    card.querySelector('#wcAddRaw').onclick = () => {
      const e = addWord({ word, meaning_zh: '', level: 'x' }, articleId);
      renderEntry(e, false);
      toast('已收录，可在生词本里补释义');
    };
    card.querySelector('#wcAI').onclick = async function () {
      this.disabled = true;
      card.querySelector('.wcard-loading').innerHTML = `<span class="mini-spin"></span> 正在查询…`;
      try {
        const e = await lookupWord(word, ctx);
        renderEntry(e, true);
      } catch (err) {
        card.querySelector('.wcard-loading').innerHTML = `<span style="color:var(--accent)">查询失败：${esc(err.message || String(err))}</span>`;
        this.disabled = false;
      }
    };
    positionCard(card, x, y);
  }
  // 键盘 / 读屏用户直接落到卡片上（Esc 或点空白处关闭）
  try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
}
function positionCard(card, x, y) {
  const margin = 12;
  // 宽度以实测为准：CSS 里是 360px，这里以前写死 372，右侧会溢出 12px 再被 clamp 回来
  const rect = card.getBoundingClientRect();
  const w = rect.width || Math.min(360, innerWidth - margin * 2);
  // 卡片高度必须实测：释义 + 例句 + 搭配会让它到 350–450px，写死估算会把底部顶出屏幕
  const h = Math.min(card.offsetHeight || 320, innerHeight - margin * 2);
  let left = Math.max(margin, Math.min(innerWidth - w - margin, (x != null ? x : innerWidth / 2) - w / 2));
  let top;
  if (y != null && innerHeight - y < h + 60 && y > h + 40) top = y - h - 12;   // 放不下就翻到词上方
  else top = (y != null ? y : innerHeight / 2) + 16;
  top = Math.max(margin, Math.min(innerHeight - h - margin, top));             // 兜底：整张卡留在视口内
  card.style.left = left + 'px';
  card.style.top = top + 'px';
}

/* ============================================================
   听力精听
   ============================================================ */
let REC = null;            // { mr, stream }
function stopRec() {
  if (!REC) return;
  const r = REC; REC = null;
  try { if (r.mr && r.mr.state !== 'inactive') { r.mr.onstop = null; r.mr.stop(); } } catch (e) {}
  try { r.stream && r.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
}

/* 听写核对用到的 tokenize / diffWords 在 lib.js 里（纯函数，可单测） */

Views.listen = ({ id }) => {
  const art = Store.articles.find(a => a.id === id);
  if (!art) { toast('文章不存在'); Router.go('#/library'); return; }
  const flat = [];
  art.paragraphs.forEach((p, pi) => splitSentences(p.en).forEach(s => flat.push({ pi, text: s })));
  if (!flat.length) { toast('这篇文章没有可朗读的句子'); Router.go('#/reader/' + art.id); return; }

  let cur = -1, playing = false, passNo = 1, seq = 0;
  let rep = [1, 2, 3, 5, 0].includes(Store.settings.ttsRepeat) ? Store.settings.ttsRepeat : 1;
  let blind = false, dict = false, abA = null, abB = null;
  let recOn = false, recUrl = null;
  let rate = Store.settings.ttsRate || 1;

  const tbbar = document.getElementById('tabbar');
  if (tbbar) tbbar.style.display = 'none';

  mount(`
    <div class="listen-shell" id="lshell">
      <div class="listen-head">
        <a href="#/reader/${art.id}" class="backlink">${ic('back')} 返回精读</a>
        <div class="lt">${esc(art.title)}</div>
      </div>

      <div class="listen-mode-row">
        <span class="seg" id="rateSeg">${[0.6, 0.8, 1, 1.2].map(r => `<button data-r="${r}" class="${r === rate ? 'on' : ''}">${r}×</button>`).join('')}</span>
        <span class="seg" id="repSeg" title="每句播放遍数">${[1, 2, 3, 5, 0].map(n => `<button data-rep="${n}" class="${n === rep ? 'on' : ''}">${n ? n + ' 遍' : '∞'}</button>`).join('')}</span>
        <select class="input" id="voiceSel" style="width:auto; padding:4px 8px; font-size:12px; max-width:170px"></select>
      </div>

      <div class="listen-mode-row">
        <button class="tb-btn" id="blindBtn">${ic('eyeoff')} 盲听</button>
        <button class="tb-btn" id="dictBtn">${ic('pen')} 听写</button>
        <button class="tb-btn" id="abBtn">${ic('ab')} A-B 复读</button>
        <button class="tb-btn" id="recBtn">${ic('mic')} 跟读录音</button>
        <span class="ab-box" id="abBox" hidden>
          <span class="ab-lab">A <b id="abAVal">—</b></span>
          <span class="ab-lab">B <b id="abBVal">—</b></span>
          <button class="ab-set" id="abSetA">设 A</button>
          <button class="ab-set" id="abSetB">设 B</button>
          <button class="ab-set" id="abClear">清除</button>
        </span>
      </div>

      <div class="rec-row" id="recRow" hidden>
        <audio id="recAudio" controls preload="metadata"></audio>
        <button class="btn sm ghost" id="recOrig">${ic('sound')} 原句</button>
        <button class="btn sm ghost" id="recClear">${ic('trash')} 清除</button>
      </div>

      <div class="listen-tip muted" id="lTip">点击任意句子，从该句开始播放</div>

      <div id="sents">
        ${art.paragraphs.map((p, pi) => `<div class="lpara">${splitSentences(p.en).map(s => `<div class="sent" data-p="${pi}">${esc(s)}</div>`).join('')}</div>`).join('')}
      </div>
      <p class="muted listen-end">—— 全文完 ——</p>
      <div id="lSpacer"></div>
    </div>

    <div class="dict-panel" id="dictPanel" hidden>
      <div class="dp-head">
        <span>听写 · 第 <b id="dpNo">1</b> 句</span>
        <span class="muted" id="dpHint">听音 → 写出整句 → 回车核对</span>
      </div>
      <textarea class="input dp-input" id="dpInput" rows="2" placeholder="Type the sentence you hear…"></textarea>
      <div class="dp-acts">
        <button class="btn sm" id="dpReplay">${ic('play')} 重听</button>
        <button class="btn sm primary" id="dpCheck">${ic('check')} 核对</button>
        <button class="btn sm ghost" id="dpReveal">看原文</button>
        <button class="btn sm ghost" id="dpNext">下一句 ${ic('next')}</button>
      </div>
      <div class="dp-result" id="dpResult"></div>
    </div>

    <div class="listen-ctrl">
      <div class="listen-ctrl-inner">
        <div class="lc-main">
          <button class="lc-skip" id="lPrev" title="上一句">${ic('prev')}</button>
          <button class="lc-play" id="lPlay" title="播放 / 暂停（空格）">${ic('play')}</button>
          <button class="lc-skip" id="lNext" title="下一句">${ic('next')}</button>
        </div>
        <div class="lc-right">
          <span class="pass-tag" id="lPass"></span>
          <span class="muted" id="lPos">— / ${flat.length}</span>
        </div>
      </div>
    </div>`);

  if (TTS.unsupported) {
    $('#sents').insertAdjacentHTML('beforebegin',
      `<div class="err-panel">当前浏览器不支持语音合成（TTS）。请改用 Chrome / Edge / Safari 等现代浏览器。</div>`);
  }

  /* ---- 音色 ---- */
  const vsel = $('#voiceSel');
  const fillVoices = () => {
    if (!TTS.voices.length) { vsel.innerHTML = '<option>默认音色</option>'; return; }
    vsel.innerHTML = TTS.voices.map(v => `<option value="${escAttr(v.voiceURI)}" ${v.voiceURI === TTS.voiceURI ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('');
  };
  fillVoices();
  setTimeout(fillVoices, 500);
  vsel.onchange = () => TTS.setVoice(vsel.value);

  /* ---- 元素 ---- */
  const sents = $$('#sents .sent');
  const posEl = $('#lPos');
  const passEl = $('#lPass');
  const playBtn = $('#lPlay');
  const tipEl = $('#lTip');
  const dictPanel = $('#dictPanel');
  const dpInput = $('#dpInput');
  const dpResult = $('#dpResult');
  const sh = $('#lshell');

  const inAB = i => abA != null && abB != null && i >= abA && i <= abB;
  const nextIndex = i => {
    if (abA != null && abB != null) return i < abB ? i + 1 : abA;
    return i + 1 < flat.length ? i + 1 : -1;
  };
  function onABChange() {
    const on = abA != null && abB != null;
    $('#abBox').hidden = !on;
    if (on) { $('#abAVal').textContent = abA + 1; $('#abBVal').textContent = abB + 1; }
    mark();
  }
  function tip() {
    if (abA != null && abB != null) tipEl.textContent = `A-B 区间循环：第 ${abA + 1} – ${abB + 1} 句（点「清除」退出）`;
    else if (rep === 0) tipEl.textContent = '单句无限循环：切换「1 遍」可恢复顺序播放';
    else if (rep > 1) tipEl.textContent = `每句连播 ${rep} 遍后自动跳下一句`;
    else tipEl.textContent = '点击任意句子，从该句开始播放';
  }

  const mark = () => {
    sents.forEach((n, i) => {
      n.classList.toggle('playing', playing && i === cur);
      n.classList.toggle('peek', blind && !dict && i === cur);
      n.classList.toggle('inab', inAB(i));
    });
    if (cur >= 0) sents[cur].scrollIntoView({ block: 'center', behavior: 'smooth' });
    posEl.textContent = `${cur < 0 ? '—' : cur + 1} / ${flat.length}`;
    passEl.textContent = playing && rep > 1 ? `第 ${passNo} / ${rep === 0 ? '∞' : rep} 遍` : '';
    playBtn.innerHTML = ic(playing ? 'pause' : 'play');
  };

  async function playFrom(i) {
    if (TTS.unsupported) { toast('浏览器不支持语音合成'); return; }
    seq++; const my = seq;
    playing = true; cur = Math.max(0, Math.min(flat.length - 1, i)); passNo = 1;
    if (dict) { dpInput.value = ''; dpResult.innerHTML = ''; $('#dpNo').textContent = cur + 1; }
    mark();
    while (playing && my === seq) {
      const r = await TTS.speak(flat[cur].text, { rate });
      if (my !== seq || !playing) return;
      /* 只有 'end' 才算「这句读完了」。
         'stopped' 是外部停掉的（路由切走 / 关闭浮层 / 原生 stop），
         以前把它当成读完 → 自动跳到下一句：人已经离开听力页了，朗读还在继续。
         'empty'（空句）同理，不该推进。 */
      if (r !== 'end') {
        playing = false;
        if (r === 'error') toast('朗读中断：可换一个音色再试');
        mark();
        return;
      }
      if (dict) { playing = false; mark(); dpInput.focus(); return; }   // 听写：读完一句即停
      if (rep === 0) { passNo++; mark(); continue; }                    // 单句无限
      if (passNo < rep) { passNo++; mark(); continue; }                 // 连播 N 遍
      passNo = 1;
      const nx = nextIndex(cur);
      if (nx === -1) { playing = false; mark(); toast('全文播放完毕'); return; }
      cur = nx; mark();
    }
  }
  function pause() { seq++; playing = false; TTS.stop(); mark(); }
  const toggle = () => { if (playing) pause(); else playFrom(Math.max(0, cur)); };

  playBtn.onclick = toggle;
  $('#lPrev').onclick = () => { if (dict) dpNext(-1); else playFrom(Math.max(0, cur - 1)); };
  $('#lNext').onclick = () => { if (dict) dpNext(1); else playFrom(Math.min(flat.length - 1, cur + 1)); };
  sents.forEach((n, i) => n.onclick = () => {
    if (dict) { cur = i; $('#dpNo').textContent = i + 1; }
    playFrom(i);
  });

  /* ---- 语速 / 遍数 ---- */
  $$('#rateSeg button').forEach(b => b.onclick = () => {
    rate = +b.dataset.r;
    $$('#rateSeg button').forEach(x => x.classList.toggle('on', x === b));
    Store.settings.ttsRate = rate; save();
  });
  $$('#repSeg button').forEach(b => b.onclick = () => {
    rep = +b.dataset.rep;
    $$('#repSeg button').forEach(x => x.classList.toggle('on', x === b));
    Store.settings.ttsRepeat = rep; save(); tip(); mark();
  });

  /* ---- 盲听 ---- */
  $('#blindBtn').onclick = () => {
    blind = !blind;
    sh.classList.toggle('blind', blind);
    $('#blindBtn').classList.toggle('on', blind);
    mark();
    if (blind) toast('盲听：文字已隐去，正在播放的句子会显示');
  };

  /* ---- A-B 复读 ---- */
  $('#abBtn').onclick = () => {
    if (abA != null) { abA = abB = null; $('#abBtn').classList.remove('on'); }
    else {
      abA = cur >= 0 ? cur : 0;
      abB = Math.min(abA + 4, flat.length - 1);
      $('#abBtn').classList.add('on');
    }
    onABChange(); tip();
  };
  $('#abSetA').onclick = () => {
    abA = cur >= 0 ? cur : 0;
    if (abB == null || abB < abA) abB = Math.min(abA + 4, flat.length - 1);
    onABChange(); tip();
  };
  $('#abSetB').onclick = () => {
    if (cur < 0) return toast('先播放一句，再设为 B');
    abB = Math.max(abA != null ? abA : 0, cur);
    if (abA == null) abA = 0;
    $('#abBtn').classList.add('on');
    onABChange(); tip();
  };
  $('#abClear').onclick = () => { abA = abB = null; $('#abBtn').classList.remove('on'); onABChange(); tip(); };

  /* ---- 听写 ---- */
  function setDict(on) {
    dict = on;
    dictPanel.hidden = !on;
    sh.classList.toggle('dicting', on);
    $('#dictBtn').classList.toggle('on', on);
    sh.classList.toggle('dict', on);
    $('#lSpacer').style.height = on ? '300px' : '120px';
    if (on) {
      if (cur < 0) cur = 0;
      $('#dpNo').textContent = cur + 1;
      dpInput.value = ''; dpResult.innerHTML = '';
      sents.forEach((n, i) => n.classList.remove('revealed'));
      tip();
      playFrom(cur);
      setTimeout(() => dpInput.focus(), 300);
    } else { mark(); tip(); }
  }
  $('#dictBtn').onclick = () => setDict(!dict);

  function dpNext(d = 1) {
    const ni = cur + d;
    if (ni < 0 || ni >= flat.length) { toast(d > 0 ? '已经是最后一句' : '已经是第一句'); return; }
    cur = ni; $('#dpNo').textContent = cur + 1;
    dpInput.value = ''; dpResult.innerHTML = '';
    if (abA != null && !inAB(cur)) { abA = abB = null; $('#abBtn').classList.remove('on'); onABChange(); }
    playFrom(cur);
  }
  $('#dpNext').onclick = () => dpNext(1);
  $('#dpReplay').onclick = () => playFrom(cur);
  $('#dpReveal').onclick = () => { if (cur >= 0) sents[cur].classList.add('revealed'); };
  $('#dpCheck').onclick = () => {
    if (cur < 0) return toast('先播放一句再核对');
    const typed = dpInput.value.trim();
    if (!typed) return toast('还没输入内容');
    const diff = diffWords(typed, flat[cur].text);
    const tot = tokenize(flat[cur].text).length;
    const hit = diff.filter(x => x.t === 'ok').length;
    const acc = tot ? Math.round(hit / tot * 100) : 0;
    const cls = acc >= 90 ? 'ok' : acc >= 65 ? 'mid' : 'bad';
    const words = diff.map(x => `<span class="dw ${x.t}">${esc(x.w)}</span>`).join(' ');
    const extra = diff.filter(x => x.t === 'extra').length;
    dpResult.innerHTML = `<div class="dp-score ${cls}">
        <b>${acc}%</b><span>${hit} / ${tot} 词正确${extra ? ` · 多写 ${extra} 词` : ''}</span>
      </div>
      <div class="dp-diff">${words}</div>
      <div class="dp-legend"><span class="dw ok">正确</span><span class="dw miss">漏写 / 拼错</span><span class="dw extra">多写</span></div>`;
    sents[cur].classList.add('revealed');
  };
  dpInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#dpCheck').click(); }
  });

  /* ---- 跟读录音 ---- */
  const recRow = $('#recRow'), recAudio = $('#recAudio'), recBtn = $('#recBtn');
  function resetRec() {
    if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = null; }
    recAudio.removeAttribute('src'); recAudio.load();
    recRow.hidden = true;
  }
  recBtn.onclick = async () => {
    if (recOn) {                               // 停止
      recOn = false;
      recBtn.classList.remove('on', 'rec');
      recBtn.innerHTML = ic('mic') + ' 跟读录音';
      if (REC && REC.mr.state !== 'inactive') REC.mr.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast(IS_APP
        ? 'Android 版暂不支持跟读录音（系统 WebView 没有麦克风接口）'
        : '此环境不支持录音：请通过 http 访问（可运行 node serve.mjs 后用局域网地址打开）');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        REC = null;
        if (!recOn) {
          if (recUrl) URL.revokeObjectURL(recUrl);
          recUrl = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
          recAudio.src = recUrl;
          recRow.hidden = false;
          recAudio.play().catch(() => {});
        }
      };
      mr.start();
      REC = { mr, stream };
      recOn = true;
      recBtn.classList.add('on', 'rec');
      recBtn.innerHTML = ic('stop') + ' 停止录音';
      toast('录音中：读完再点一次停止');
    } catch (e) {
      toast('无法访问麦克风：' + (e && e.name === 'NotAllowedError' ? '权限被拒绝，请在浏览器地址栏允许麦克风' : (e.message || e.name || '未知错误')));
    }
  };
  $('#recOrig').onclick = () => { if (cur >= 0) TTS.speak(flat[cur].text, { rate }); };
  $('#recClear').onclick = () => { resetRec(); toast('已清除录音'); };
  VIEW_CLEANUPS.push(() => {
    /* 路由切走时先让 playFrom 的循环失效：只调 TTS.stop() 的话，等待中的 speak 会
       resolve 成 'stopped'，循环会把它当成「读完」继续读下一句。 */
    playing = false; seq++;
    recOn = false; stopRec();
    if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = null; }
  });

  /* ---- 快捷键 ---- */
  const onKey = e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); $('#lPrev').click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); $('#lNext').click(); }
  };
  document.addEventListener('keydown', onKey);
  VIEW_CLEANUPS.push(() => document.removeEventListener('keydown', onKey));

  $('#lSpacer').style.height = '120px';
  tip(); mark();
};

/* ============================================================
   生词本
   ============================================================ */
Views.words = () => {
  const list = Object.values(Store.words).sort((a, b) => b.addedAt - a.addedAt);
  const due = dueWords().length;
  const artTitle = id => { const a = Store.articles.find(x => x.id === id); return a ? a.title : '已删除文章'; };

  mount(`
    <div class="wrap">
      <div class="masthead"><span class="kicker">Vocabulary · 生词本</span><span class="date">${list.length} 词</span></div>
      <div class="words-stats">
        <div class="wstat"><b>${list.length}</b><span>累计生词</span></div>
        <div class="wstat"><b style="color:${due ? 'var(--accent)' : 'inherit'}">${due}</b><span>今日待复习</span></div>
        <div class="wstat"><b>${masteredCount()}</b><span>已掌握（复习间隔 ≥ 30 天）</span></div>
        <div class="wstat"><b>${Store.log.reviews || 0}</b><span>累计复习次数</span></div>
      </div>
      ${due ? `<button class="btn primary big" style="margin-bottom:26px" id="goReview">${ic('review')} 开始复习（${due} 个到期）</button>` : ''}
      ${list.length ? `
      <div class="words-tools">
        <div class="wt-search">${ic('search')}<input class="input" id="wq" placeholder="搜单词 / 释义 / 例句…"></div>
        <select class="input wt-sel" id="wlv">
          <option value="">全部等级</option>
          ${[...new Set(list.map(w => w.level))].map(l => `<option value="${l}">${LEVEL_LABEL[l] || '超纲'}</option>`).join('')}
        </select>
        <select class="input wt-sel" id="wsort">
          <option value="added">最近添加</option>
          <option value="az">字母 A → Z</option>
          <option value="due">到期优先</option>
          <option value="weak">最不熟优先</option>
        </select>
        <button class="btn sm" id="wCsv">${ic('csv')} 导出 CSV</button>
      </div>
      <div class="muted w-count" id="wCount"></div>
      <div id="wList">${list.map(w => `
        <div class="word-row" data-k="${escAttr(normKey(w.word))}" data-lv="${escAttr(w.level)}" data-added="${Number(w.addedAt) || 0}" data-due="${Number(w.srs?.due) || Number(w.addedAt) || 0}">
          <div class="top">
            <span class="w-spell" data-open="1">${esc(w.word)}</span>
            <span class="lv-chip l-${Object.hasOwn(LEVEL_LABEL, w.level) ? w.level : 'x'}" style="font-size:10px; padding:0 7px; border-radius:99px; background:var(--c)">${LEVEL_LABEL[w.level] || ''}</span>${w.review ? '<span class="lv-chip rev" style="font-size:10px; padding:0 7px">复习</span>' : ''}
            ${!String(w.meaning_zh || '').trim()
              ? '<span class="due-tag" title="补上释义后才会进入复习队列">待补释义</span>'
              : w.srs
                ? `<span class="due-tag ${w.srs.due <= Date.now() ? '' : 'ok'}">${fmtDue(w.srs.due)}</span>`
                : '<span class="due-tag">未复习过</span>'}
          </div>
          <div class="w-acts">
            <button class="iconbtn" data-say="${escAttr(w.word)}" title="朗读">${ic('sound')}</button>
            <button class="iconbtn danger" data-del="${escAttr(normKey(w.word))}" title="删除">${ic('trash')}</button>
          </div>
          <div class="w-mn">${w.phonetic ? esc(w.phonetic) + '　' : ''}${esc(w.meaning_zh)}</div>
          ${w.articles && w.articles.length ? `<div class="w-src">来源：${w.articles.map(id => esc(artTitle(id))).join('；')}</div>` : ''}
        </div>`).join('')}</div>
      <div class="empty" id="wEmpty" hidden><div class="big">没有匹配的单词</div><p>换个关键词，或把筛选条件改回「全部等级」。</p></div>`
      : `<div class="empty"><div class="big">生词本还是空的</div>
          <p>在精读页面点击文章中的生词，加入生词本；也可以打开「词汇表」一键加入本篇全部标注词。</p>
          <button class="btn primary" onclick="location.hash='#/library'">去读一篇文章</button></div>`}
    </div>`);

  const gr = $('#goReview'); if (gr) gr.onclick = () => Router.go('#/review');
  $$('.word-row').forEach(row => {
    const key = row.dataset.k;
    const w = Store.words[key];
    row.querySelector('[data-open]').onclick = e => openWordCard({ x: e.clientX, y: e.clientY, word: w.word, entry: w, articleId: '', ctx: '' });
    row.querySelector('[data-say]').onclick = () => TTS.speak(w.word, { rate: 0.9 });
    row.querySelector('[data-del]').onclick = async () => {
      const ok = await confirmModal({ title: '删除生词？', body: `「${w.word}」将从生词本与复习计划中移除。`, okText: '删除', danger: true });
      if (ok) { removeWord(key); runViewCleanups(); Views.words(); }
    };
  });

  /* 搜索 / 筛选 / 排序 */
  const listEl = $('#wList');
  if (listEl) {
    const rows = $$('#wList .word-row');
    const qEl = $('#wq'), lvEl = $('#wlv'), sortEl = $('#wsort');
    const visibleWords = () => rows.filter(r => !r.classList.contains('hide')).map(r => Store.words[r.dataset.k]).filter(Boolean);
    const apply = () => {
      const q = qEl.value.trim().toLowerCase();
      const lv = lvEl.value;
      let shown = 0;
      rows.forEach(r => {
        const w = Store.words[r.dataset.k] || {};
        const hay = (w.word + ' ' + (w.meaning_zh || '') + ' ' + (w.example_en || '') + ' ' + (w.pos || '')).toLowerCase();
        const ok = (!q || hay.includes(q)) && (!lv || r.dataset.lv === lv);
        r.classList.toggle('hide', !ok);
        if (ok) shown++;
      });
      const by = sortEl.value;
      const num = v => (v === '' || v == null ? Infinity : +v);
      const arr = [...rows].sort((a, b) => {
        if (by === 'az') return a.dataset.k.localeCompare(b.dataset.k);
        if (by === 'due') return num(a.dataset.due) - num(b.dataset.due);
        if (by === 'weak') {
          const wa = Store.words[a.dataset.k] || {}, wb = Store.words[b.dataset.k] || {};
          const ia = wa.srs ? wa.srs.ivl : -1, ib = wb.srs ? wb.srs.ivl : -1;
          return ia - ib;
        }
        return (+b.dataset.added) - (+a.dataset.added);
      });
      arr.forEach(r => listEl.appendChild(r));
      $('#wCount').textContent = shown === rows.length ? `共 ${rows.length} 个生词` : `匹配 ${shown} / ${rows.length} 个生词`;
      $('#wEmpty').hidden = shown !== 0;
    };
    qEl.addEventListener('input', apply);
    lvEl.addEventListener('change', apply);
    sortEl.addEventListener('change', apply);
    apply();
    $('#wCsv').onclick = () => exportWordsCSV(visibleWords());
  }
};

/* ============================================================
   闪卡复习
   ============================================================ */
/* ============================================================
   教学模式（PPT 式）
   一屏一段，字大到能"讲"：站着、投屏、或者自己过一遍都行。
   ← → 翻页，T 显示译文，Esc 退出，点正文也能翻。
   ============================================================ */
Views.teach = ({ id } = {}) => {
  const art = Store.articles.find(a => a.id === id);
  if (!art) { toast('文章不存在'); Router.go('#/library'); return; }
  const paras = (art.paragraphs || []).filter(p => p && p.en);
  if (!paras.length) { toast('这篇还没有正文'); Router.go('#/reader/' + id); return; }

  document.body.classList.add('t-teach');
  VIEW_CLEANUPS.push(() => document.body.classList.remove('t-teach'));

  let idx = 0;
  let showZh = false;

  mount(`
    <div class="teach">
      <div class="t-bar">
        <a class="t-back" href="#/reader/${art.id}">${ic('back')} 退出</a>
        <span class="t-title">${esc(art.title)}</span>
        <span class="t-count" id="tCount">1 / ${paras.length}</span>
      </div>
      <div class="t-prog"><i id="tProg"></i></div>
      <div class="t-stage" id="tStage"><div class="t-inner" id="tInner"></div></div>
      <div class="t-foot">
        <button class="t-nav" id="tPrev" title="上一段（←）">${ic('back')}</button>
        <button class="t-zh" id="tZh" title="显示 / 隐藏译文（T）">译文</button>
        <button class="t-nav" id="tNext" title="下一段（→ / 空格）">${ic('next')}</button>
        <span class="t-hint">← → 翻页 · 点正文也行 · T 译文 · Esc 退出</span>
      </div>
    </div>`);

  const render = () => {
    const p = paras[idx];
    const words = (art.words || []).filter(w => w.paraIndex === idx);
    const box = $('#tInner');
    if (!box) return;
    box.innerHTML = `
      <div class="t-no">${String(idx + 1).padStart(2, '0')}</div>
      <p class="t-en">${esc(p.en)}</p>
      ${p.zh ? `<p class="t-zh-body${showZh ? ' on' : ''}">${esc(p.zh)}</p>` : ''}
      ${words.length ? `<div class="t-words">${words.map(w => `<button data-w="${escAttr(normKey(w.word))}">${esc(w.word)}</button>`).join('')}</div>` : ''}`;
    $('#tCount').textContent = (idx + 1) + ' / ' + paras.length;
    $('#tProg').style.width = ((idx + 1) / paras.length * 100) + '%';
    $('#tPrev').disabled = idx === 0;
    $('#tNext').disabled = idx === paras.length - 1;
    const zb = $('#tZh');
    zb.classList.toggle('on', showZh);
    zb.disabled = !p.zh;
  };

  const go = d => {
    const t = Math.max(0, Math.min(paras.length - 1, idx + d));
    if (t !== idx) { idx = t; render(); }
  };

  render();
  $('#tPrev').onclick = () => go(-1);
  $('#tNext').onclick = () => go(1);
  $('#tZh').onclick = () => { showZh = !showZh; render(); };
  $('#tStage').addEventListener('click', e => {
    if (e.target.closest('button')) return;   // 词条是按钮，别当成翻页
    go(1);
  });

  /* 词条：点开生词卡，别把整页翻走 */
  $('#tInner').addEventListener('click', e => {
    const b = e.target.closest('button[data-w]');
    if (!b) return;
    e.stopPropagation();
    const w = (art.words || []).find(x => normKey(x.word) === b.dataset.w);
    if (!w) return;
    const r = b.getBoundingClientRect();
    openWordCard({ x: r.left + r.width / 2, y: r.top, word: w.word, entry: w, articleId: art.id, ctx: paras[idx].en });
  });

  const onKey = e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    else if (e.key === 't' || e.key === 'T') { if (paras[idx].zh) { showZh = !showZh; render(); } }
    else if (e.key === 'Escape') { Router.go('#/reader/' + art.id); }
  };
  addEventListener('keydown', onKey);
  VIEW_CLEANUPS.push(() => removeEventListener('keydown', onKey));
};

Views.review = ({ id } = {}) => {
  /* 两种入口：全局复习（按到期）与「复习本篇」（#/review/<articleId>）。
     本篇模式不看是否到期，只练这一篇标注过的词，读完就能立刻巩固。 */
  const srcArt = id ? Store.articles.find(a => a.id === id) : null;
  if (id && !srcArt) { toast('文章不存在'); Router.go('#/review'); return; }
  let queue = srcArt ? collectArticleWords(srcArt) : dueWords();
  if (srcArt && !queue.length) { toast('本篇还没有生词标注'); Router.go('#/reader/' + id); return; }
  let idx = 0, relearn = 0, extra = false;

  /* 加练：不看是否到期，按「最久没复习 / 最不熟」抽一组先练。
     注意：评分照常写入 srs（会真的改排期），所以文案不能说「不影响原安排」。 */
  const startExtra = n => {
    const all = Object.values(Store.words).filter(w => w.word);
    if (!all.length) { toast('生词本还是空的'); return; }
    all.sort((a, b) => {
      const da = a.srs ? a.srs.due : 0, db = b.srs ? b.srs.due : 0;
      if (da !== db) return da - db;
      return (a.srs ? a.srs.ivl : -1) - (b.srs ? b.srs.ivl : -1);
    });
    queue = all.slice(0, Math.min(n, all.length));
    idx = 0; relearn = 0; extra = true;
    render();
  };
  /* 本组再过一遍（把这一篇的词重新排队，不影响其它词） */
  const restartGroup = () => {
    queue = collectArticleWords(srcArt);
    idx = 0; relearn = 0; extra = false;
    render();
  };

  const render = () => {
    if (!queue.length) {
      const total = Object.keys(Store.words).length;
      mount(`
        <div class="wrap-narrow">
          <div class="review-shell">
            <div class="card review-done">
              <div class="big">${total ? '今日到期已清空' : '还没有可复习的单词'}</div>
              <p class="muted" style="margin-bottom:22px">${total
                ? '到期的闪卡都练完了。想多练一组可以提前复习，评分同样按记忆曲线记录。'
                : '先去精读一篇文章，把生词加入生词本吧。'}</p>
              <div class="done-acts">
                ${total ? `<button class="btn primary" id="extra10">${ic('review')} 再练 10 个</button>` : ''}
                <a class="btn" href="#/library">去文章库</a>
                <a class="btn ghost" href="#/words">看生词本</a>
              </div>
            </div>
          </div>
        </div>`);
      const b = $('#extra10'); if (b) b.onclick = () => startExtra(10);
      return;
    }
    const w = queue[idx];
    const forms = wordForms(w);
    const phrPats = [...forms].filter(f => /\s/.test(f));
    let maskEx = '';
    if (w.example_en) {
      const holds = [];
      let txt = esc(w.example_en);
      phrPats.forEach(p => {
        txt = txt.replace(new RegExp('\\b' + rxesc(p) + '\\b', 'gi'), () => {
          holds.push('<b class="mask">______</b>');
          return '\u0002' + (holds.length - 1) + '\u0003';
        });
      });
      txt = txt.replace(/[A-Za-z][A-Za-z'’-]*/g, m => forms.has(m.toLowerCase().replace(/’/g, "'")) ? '<b class="mask">______</b>' : m);
      maskEx = txt.replace(/\u0002(\d+)\u0003/g, (_, i) => holds[+i]);
    }
    const ivl = g => {
      const srs = w.srs || { ivl: 0 };
      let i = IVL_SEQ.findIndex(v => v > srs.ivl); if (i === -1) i = IVL_SEQ.length - 1;
      if (g === 0) return '10 分钟后';
      if (g === 1) return Math.max(1, Math.round((IVL_SEQ[Math.max(0, i - 1)] || 1) * 0.7)) + ' 天后';
      if (g === 2) return IVL_SEQ[Math.min(i, IVL_SEQ.length - 1)] + ' 天后';
      return Math.min(365, Math.round((IVL_SEQ[Math.min(i + 1, IVL_SEQ.length - 1)] || 240) * 1.5)) + ' 天后';
    };
    mount(`
      <div class="wrap-narrow">
        ${srcArt
          ? `<a href="#/reader/${srcArt.id}" class="backlink">${ic('back')} 回原文</a>`
          : `<a href="#/words" class="backlink">${ic('back')} 生词本</a>`}
        <div class="review-shell">
          <div class="review-prog"><span>${idx + 1} / ${queue.length}</span>
            <div class="bar"><i style="width:${Math.round(idx / queue.length * 100)}%"></i></div>
            <span>${relearn ? '重练 ' + relearn : srcArt ? '本篇' : extra ? '加练' : '加油'}</span></div>
          <div class="card flash" id="flashCard">
            <span class="kicker fk">Flashcard · 认识这个词吗？</span>
            <div class="fw">${esc(w.word)}</div>
            ${w.phonetic ? `<div class="fph">${esc(w.phonetic)}</div>` : ''}
            <div class="fbtn-row">
              <button class="btn" id="fcSay">${ic('sound')} 听发音</button>
              <button class="btn primary big" id="fcFlip">显示释义</button>
            </div>
            <div class="fkbd muted">空格 / 回车翻面 · 翻面后按 1–4 评分</div>
          </div>
          <div class="card flash flash-back" id="flashBack" hidden>
            <div class="fback-head">
              <div class="fback-word">${esc(w.word)}</div>
              <div class="fback-meta">${w.phonetic ? esc(w.phonetic) : ''}${w.pos ? (w.phonetic ? ' · ' : '') + esc(w.pos) : ''}</div>
              <span class="fback-lv l-${Object.hasOwn(LEVEL_LABEL, w.level) ? w.level : 'x'}">${LEVEL_LABEL[w.level] || '超纲'}</span>
            </div>
            <div class="fmn">${esc(w.meaning_zh)}</div>
            ${maskEx ? `<div class="fex">${maskEx}${w.example_zh ? `<span class="zh">${esc(w.example_zh)}</span>` : ''}</div>` : ''}
            ${w.collocations && w.collocations.length ? `<div class="fcoll">${w.collocations.map(c => `<div><b>${esc(c.en)}</b> — ${esc(c.zh)}</div>`).join('')}</div>` : ''}
            <div class="grade-row">
              <button class="grade again" data-g="0"><b>忘了</b><span>${ivl(0)}</span></button>
              <button class="grade hard" data-g="1"><b>模糊</b><span>${ivl(1)}</span></button>
              <button class="grade good" data-g="2"><b>记得</b><span>${ivl(2)}</span></button>
              <button class="grade easy" data-g="3"><b>简单</b><span>${ivl(3)}</span></button>
            </div>
          </div>
        </div>
      </div>`);
    $('#fcSay').onclick = () => TTS.speak(w.word, { rate: 0.9 });
    $('#fcFlip').onclick = () => {
      $('#flashCard').hidden = true;
      $('#flashBack').hidden = false;
      TTS.speak(w.word, { rate: 0.9 });
    };
    $$('#flashBack .grade').forEach(b => b.onclick = () => {
      const g = +b.dataset.g;
      scheduleWord(w, g);
      Store.log.reviews = (Store.log.reviews || 0) + 1; save();
      refreshBadges();                 // 评分会改排期，侧栏「待复习」角标要跟着变
      if (g === 0) { queue.push(w); relearn++; }
      idx++;
      if (idx >= queue.length) finish();
      else render();
    });
  };
  const finish = () => {
    queue = [];
    mount(`
      <div class="wrap-narrow"><div class="review-shell">
        <div class="card review-done">
          <div class="big">${srcArt ? '本篇复习完成' : extra ? '本轮加练完成' : '本轮复习完成'} 🎉</div>
          <p class="muted" style="margin-bottom:22px">${srcArt
            ? '这一篇的标注词都过了一遍。遗忘的词已排到本轮队尾，下次到期时间按记忆曲线安排。'
            : '忘记的词已排到本轮队尾（下次到期时间按 10 分钟后计），其余按记忆曲线安排。'}</p>
          <div class="done-acts">
            ${srcArt
              ? `<button class="btn primary" id="againGroup">${ic('review')} 再过一遍本篇</button>
                 <a class="btn" href="#/reader/${srcArt.id}">回原文</a>
                 <a class="btn ghost" href="#/words">回生词本</a>`
              : `<button class="btn primary" id="extra10">${ic('review')} 再练 10 个</button>
                 <a class="btn" href="#/library">去读新一篇</a>
                 <a class="btn ghost" href="#/words">回生词本</a>`}
          </div>
        </div>
      </div></div>`);
    const b = $('#extra10'); if (b) b.onclick = () => startExtra(10);
    const g = $('#againGroup'); if (g) g.onclick = restartGroup;
    refreshBadges();
  };

  /* 键盘：空格 / 回车翻面，1–4 评分 */
  const onKey = e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const back = $('#flashBack');
    if (!back || back.hidden) {
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); const f = $('#fcFlip'); if (f) f.click(); }
      return;
    }
    const g = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (g != null) { e.preventDefault(); const b = $(`#flashBack .grade[data-g="${g}"]`); if (b) b.click(); }
  };
  document.addEventListener('keydown', onKey);
  VIEW_CLEANUPS.push(() => document.removeEventListener('keydown', onKey));

  render();
};

/* ============================================================
   设置
   ============================================================ */
const PRESETS = [
  { name: '智谱 AI（推荐）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '月之暗面 Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' },
];
Views.settings = ({ id } = {}) => {
  const s = Store.settings;
  const TABS = [
    { id: 'ai', name: 'AI 服务', icon: 'refresh' },
    { id: 'read', name: '阅读体验', icon: 'doc' },
    { id: 'look', name: '外观', icon: 'eye' },
    { id: 'net', name: '网络与抓取', icon: 'link' },
    { id: 'voice', name: '朗读', icon: 'headphones' },
    { id: 'data', name: '数据', icon: 'download' },
    { id: 'help', name: '帮助', icon: 'lib' },
  ];
  const tab = TABS.some(t => t.id === id) ? id : 'ai';
  const detail = TABS.some(t => t.id === id);
  /* 旧版本存的是 light / dark，映射到新主题 id */
  const curTheme = s.theme === 'light' ? 'paper' : s.theme === 'dark' ? 'night' : (s.theme || 'auto');
  const curAccent = ACCENTS.some(a => a.id === s.accent) ? s.accent : 'coral';
  const ALL_LAYOUTS = ['classic', 'annotated', 'desk', 'immersive', 'pages', 'big'];
  const rawLayout = s.readerLayout || 'auto';
  /* auto 时高亮按屏宽解出来的那个，用户点任意卡片就变成显式值 */
  const curLayout = ALL_LAYOUTS.includes(rawLayout) ? rawLayout : (innerWidth <= 760 ? 'immersive' : 'annotated');
  const curTr = ['tap', 'always', 'hint'].includes(s.showTr) ? s.showTr : 'tap';
  const curFs = Number.isFinite(+s.fs) ? Math.max(0, Math.min(3, +s.fs)) : 1;

  /* 每个分区在导航里显示「当前值」：不用点进去就知道现在是什么 */
  const lblLayout = v => ({ classic: '经典', desk: '卡片', annotated: '注释本', immersive: '沉浸式', pages: '逐段翻页', big: '大字' }[v] || '注释本');
  const lblFs = v => ['小', '中', '大', '特大'][v] || '中';
  const lblFont = v => (v === 'sans' ? '无衬线' : '衬线');
  const presetOf = () => PRESETS.find(p => p.baseUrl === s.baseUrl && p.model === s.model);
  const aiSub = () => {
    const p = presetOf();
    return `${p ? p.name.replace('（推荐）', '') : '自定义接口'} · ${s.model}${s.apiKey ? '' : ' · 未填 Key'}`;
  };
  const readSub = () => `${lblLayout(s.readerLayout)} · ${lblFs(s.fs)} · ${lblFont(s.fontFamily)}`;
  const lookSub = () => {
    const t = THEMES.find(x => x.id === resolveTheme(s.theme)) || THEMES[0];
    const a = ACCENTS.find(x => x.id === s.accent) || ACCENTS[0];
    return `${t.name} · ${a.name}`;
  };
  const netSub = () => (IS_APP ? '系统网络' : (String(s.crawlProxy || '').replace(/^https?:\/\//, '') || '自动探测'));
  const voiceSub = () => {
    const v = TTS.getVoice();
    return `${v ? v.name.replace(/\s*[（(].*$/, '') : '系统默认'} · ${s.ttsRate || 1}×`;
  };
  const usedBytes = (() => { try { return (localStorage.getItem(LS_KEY) || '').length; } catch (e) { return 0; } })();
  const dataSub = () => `${Math.round(usedBytes / 1024)} KB · ${Store.articles.length} 篇`;
  const SUBS = { ai: aiSub(), read: readSub(), look: lookSub(), net: netSub(), voice: voiceSub(), data: dataSub(), help: '上手四步 · 抓取 · 快捷键' };

  const navItem = t => `<button class="sn-item${tab === t.id ? ' on' : ''}" data-tab="${t.id}">
      ${ic(t.icon)}<span><b>${t.name}</b><i>${esc(SUBS[t.id] || '')}</i></span>
      ${t.id === 'ai' ? `<em class="sn-dot"${s.apiKey ? '' : ' hidden'}></em>` : ''}
    </button>`;
  const phead = (title, desc, badge) => `<div class="phead"><div><h2>${title}</h2><p>${desc}</p></div>${badge || ''}</div>`;
  const layoutCard = (v, name, desc, mini) => `<button class="lay-pick${curLayout === v ? ' on' : ''}" data-layout="${v}">
      <span class="lp-mini${v === 'classic' ? '' : ' annot'}">${mini}</span><b>${name}</b><i>${desc}</i></button>`;

  mount(`
  <div class="set-wrap">
    <div class="set-shell${detail ? ' detail' : ''}">
      <nav class="set-nav">
        <div class="sn-head"><h1>设置</h1><p>一次只显示一个分区</p></div>
        ${TABS.map(navItem).join('')}
        <div class="sn-foot"><a href="#/library">返回应用</a><span>v1.7.1</span></div>
      </nav>

      <main class="set-pane">
        <a class="backlink set-back" id="setBack">${ic('back')} 设置</a>

        <section class="set-panel${tab === 'ai' ? ' on' : ''}" id="pn-ai">
          ${phead('AI 服务', '支持 OpenAI 兼容接口。Key 只会随请求发送给你配置的服务。', `<span class="pbadge" id="aiBadge">${s.apiKey ? '已配置' : '未配置'}</span>`)}
          <div class="preset-row">${PRESETS.map((p, i) => `<button class="level-pick${presetOf() === p ? ' on' : ''}" data-pre="${i}">${p.name}</button>`).join('')}</div>
          <div class="set-grid">
            <div class="field"><label>Base URL</label><input class="input" id="sBaseUrl" value="${escAttr(s.baseUrl)}" placeholder="https://.../v1">
              <div class="hint">完整地址，去掉结尾的 /chat/completions</div></div>
            <div class="field"><label>模型名</label><input class="input" id="sModel" value="${escAttr(s.model)}" placeholder="glm-4.6">
              <div class="hint">写错会返回 400</div></div>
            <div class="field full"><label>API Key</label>
              <div class="withbtn"><input class="input" id="sKey" type="password" value="${escAttr(s.apiKey)}" placeholder="sk-…"><button class="btn" id="sKeyEye" title="显示 / 隐藏">${ic('eye')}</button></div>
              <div class="hint">从服务商控制台复制；换设备时需重新填写。</div></div>
          </div>
          <div class="row-btns">
            <button class="btn" id="sTest">${ic('refresh')} 测试连接</button>
            <button class="btn primary" id="sSaveAI">保存</button>
          </div>
          <div class="test-status" id="sTestOut"></div>
          <div class="set-footnote"><b>关于 Key</b>
            <ul>
              <li>Key 只保存在本机 localStorage，除了直连你填的服务商，不会发给任何第三方。</li>
              <li>导出的备份文件会剥掉 Key，换设备后重新填一次即可。</li>
              <li>如果服务商不允许浏览器直连（CORS），换一家或使用官方允许直连的地址。</li>
            </ul>
          </div>
        </section>

        <section class="set-panel${tab === 'read' ? ' on' : ''}" id="pn-read">
          ${phead('阅读体验', '这些选项会立刻影响精读页，右侧是实时预览。', '<span class="pbadge">实时预览</span>')}
          <div class="read-grid">
            <div class="read-ctrls">
              <div class="set-row"><div class="lb"><b>生词标注基准</b><span id="lvHint">高于「CET-6 / 考研」的词会被标注</span></div>
                <div class="seg">${TARGET_LEVELS.map(o => `<button data-lv="${o.id}" title="${escAttr(o.label)}" class="${s.level === o.id ? 'on' : ''}">${esc(o.label.split(' / ')[0])}</button>`).join('')}</div></div>
              <div class="set-row"><div class="lb"><b>同时标注复习词</b><span>CET-4/6 大纲内、学过但可能忘了的词</span></div>
                <button class="sw${s.reviewWords !== false ? ' on' : ''}" id="sReviewSw" aria-label="同时标注复习词"></button></div>
              <div class="set-row"><div class="lb"><b>译文默认显示</b><span>提示模式只给本段关键词，卡住再看整段</span></div>
                <div class="seg">${[['tap', '点译'], ['always', '全译'], ['hint', '提示']].map(([v, t]) => `<button data-trmode="${v}" class="${curTr === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
              <div class="set-row"><div class="lb"><b>阅读字号</b><span>只影响正文，不影响界面</span></div>
                <div class="seg">${['小', '中', '大', '特大'].map((t, i) => `<button data-fs="${i}" class="${curFs === i ? 'on' : ''}">${t}</button>`).join('')}</div></div>
              <div class="set-row"><div class="lb"><b>正文字体</b><span>衬线接近印刷品，无衬线更清晰</span></div>
                <div class="seg"><button data-ff="serif" class="${s.fontFamily !== 'sans' ? 'on' : ''}">衬线</button><button data-ff="sans" class="${s.fontFamily === 'sans' ? 'on' : ''}">无衬线</button></div></div>
              <div class="set-row"><div class="lb"><b>分页阅读</b><span>每页 2–3 段；仅经典版式生效，← → 也可翻页</span></div>
                <button class="sw${s.paged !== false ? ' on' : ''}" id="sPagedSw" aria-label="分页阅读"></button></div>
              <div class="set-row lay-row"><div class="lb"><b>阅读版式</b><span>版式决定信息怎么排，颜色跟着主题走</span></div>
                <div class="lay-picks">
                  ${layoutCard('immersive', '沉浸式', '无工具栏 · 胶囊', '<i></i><i></i><i class="s"></i><i style="width:46%;margin:7px auto 0;border-radius:99px;background:var(--ink-3)"></i>')}
                  ${layoutCard('pages', '逐段翻页', '一段一屏', '<i style="height:2px;margin-bottom:6px"></i><i></i><i class="s"></i><i style="height:2px;margin-top:6px"></i>')}
                  ${layoutCard('big', '大字', '大字号 + 底部坞', '<i></i><i></i><i style="height:12px;background:var(--ink-3);border-radius:4px;margin-top:7px"></i>')}
                  ${layoutCard('annotated', '注释本', '正文 + 右词注', '<span class="col"><i></i><i></i><i class="s"></i></span><span class="side"></span>')}
                  ${layoutCard('desk', '卡片', '段落卡 + 词汇栏', '<span class="col"><i></i><i></i></span><span class="side"></span>')}
                  ${layoutCard('classic', '经典', '段落后跟译文', '<i></i><i></i><i class="s"></i>')}
                </div>
                <div class="hint" style="margin-top:8px">${rawLayout === 'auto' ? '当前为<b>自动</b>：手机用沉浸式、宽屏用注释本。选任意一张即固定下来。' : '手机三种版式会把工具栏收进底部；宽屏三种保持顶部工具栏。'}</div>
              </div>
            </div>
            <aside class="set-pv" id="setPv" data-pv-layout="${curLayout}" data-pv-tr="${curTr}">
              <div class="pv-cap">预览 · 随左侧选择变化</div>
              <p class="pv-en" id="pvEn">Most of us treat rest as the <em>absence</em> of work — something to be earned after the real business of the day is done.</p>
              <p class="pv-zh">我们大多数人把休息当作工作的对立面——它是忙完正事之后才配得到的东西。</p>
              <div class="pv-hint"><span class="hint-chip"><b>absence</b><i>n. 缺席</i></span><span class="hint-chip"><b>earned</b><i>v. 挣得</i></span></div>
              <div class="pv-marg">本段 2 词 · absence（n. 缺席）/ earned（v. 挣得）</div>
              <div class="pv-meta"><span>字号 <b id="pvFs">${lblFs(curFs)}</b></span><span>版式 <b id="pvLy">${lblLayout(curLayout)}</b></span><span>字体 <b id="pvFf">${lblFont(s.fontFamily)}</b></span></div>
            </aside>
          </div>
        </section>

        <section class="set-panel${tab === 'look' ? ' on' : ''}" id="pn-look">
          ${phead('外观', '主题只管纸张与墨色；主色只管按钮与强调。', `<span class="pbadge">${lookSub()}</span>`)}
          <div class="set-block"><h3>主题</h3>
            <button class="theme-auto${curTheme === 'auto' ? ' on' : ''}" data-th="auto" id="sThemeAuto">${ic('eye')} 跟随系统深浅色</button>
            <div class="theme-picks" id="sThemePicks">
              ${THEMES.map(t => `<button class="theme-pick ${curTheme === t.id ? 'on' : ''}" data-th="${t.id}" title="${t.name}">
                <span class="tp-sw" style="background:${t.paper}; color:${t.ink}">Aa</span><span class="tp-n">${t.name}</span>
              </button>`).join('')}
            </div>
          </div>
          <div class="set-block"><h3>界面主色</h3>
            <div class="accent-picks" id="sAccentPicks">
              ${ACCENTS.map(a => `<button class="accent-pick ${curAccent === a.id ? 'on' : ''}" data-ac="${a.id}" title="${a.name}">
                <span class="ac-dot" style="background:${document.documentElement.dataset.dark ? a.dark : a.light}"></span>
                <span class="ac-n">${a.name}</span>
              </button>`).join('')}
            </div>
            <div class="hint">主色不参与「错误 / 危险」语义——报错永远是红色。</div>
          </div>
        </section>

        <section class="set-panel${tab === 'net' ? ' on' : ''}" id="pn-net">
          ${phead('网络与抓取', IS_APP ? 'Android 版由系统网络直接发起请求。' : '外刊站点被墙或被拦时，让本地服务走代理。', IS_APP ? '' : `<span class="pbadge">${s.crawlProxy ? '已设置' : '自动探测'}</span>`)}
          ${IS_APP ? `
          <p class="hint" style="font-size:12.5px;line-height:1.85;max-width:60ch">境外站点需要代理时，请在系统层面开启 VPN / 全局代理后再抓取。被 Cloudflare 拦住时，用浏览器打开原文、长按复制正文再粘贴进来。</p>`
          : `
          <div class="field"><label>抓取代理</label>
            <div class="withbtn">
              <input class="input" id="sProxy" value="${escAttr(s.crawlProxy || '')}" placeholder="http://127.0.0.1:7890（留空 = 直连，失败时自动探测）" autocomplete="off">
              <button class="btn" id="sProxyCheck">${ic('search')} 检测</button>
            </div>
            <div class="hint" id="sProxyOut">Clash 默认 7890，Clash Verge 7897，v2rayN 10809。只接受本机地址。</div>
          </div>
          <div class="set-footnote"><b>关于抓取</b>
            <ul>
              <li>正文由本机服务代抓，不经过任何第三方；服务不保存内容。</li>
              <li>被 Cloudflare 拦住不是网络问题——用新建页的「取正文」书签在浏览器里取。</li>
            </ul>
          </div>`}
        </section>

        <section class="set-panel${tab === 'voice' ? ' on' : ''}" id="pn-voice">
          ${phead('朗读', '音色来自系统 / 浏览器，数量取决于设备。')}
          <div class="field"><label>音色</label>
            <div class="withbtn"><select class="input" id="sVoice"><option>加载中…</option></select><button class="btn" id="sVoiceTry">${ic('sound')} 试听</button></div>
            <div class="hint">Windows 建议 Edge（有 Natural 自然音色）；Android 版由系统 TTS 提供。</div>
          </div>
          <div class="set-row" style="border-top:1px solid var(--line)"><div class="lb"><b>默认语速</b><span>听力页里也能临时改</span></div>
            <div class="seg">${[0.6, 0.8, 1, 1.2].map(r => `<button data-rate="${r}" class="${s.ttsRate === r ? 'on' : ''}">${r}×</button>`).join('')}</div></div>
        </section>

        <section class="set-panel${tab === 'data' ? ' on' : ''}" id="pn-data">
          ${phead('数据', '全部数据只在本机；换设备时先导出、再导入。')}
          <div class="set-usage"><div class="bar"><i style="width:${Math.min(100, Math.round(usedBytes / (5 * 1024 * 1024) * 100))}%"></i></div><span>${Math.round(usedBytes / 1024)} KB / 5 MB · ${Store.articles.length} 篇文章</span></div>
          <div class="row-btns">
            <button class="btn" id="sExport">${ic('download')} 导出全部数据</button>
            <button class="btn" id="sImportBtn">${ic('upload')} 导入数据</button>
            <input type="file" id="sImport" accept=".json,application/json" hidden>
            <button class="btn danger" id="sClear">${ic('trash')} 清空全部数据</button>
          </div>
          <div class="set-footnote"><b>关于备份</b>
            <ul>
              <li>备份文件不含 API Key；导入会合并文章与生词，同 ID 的文章以导入版本为准。AI 服务和代理设置不会被导入覆盖。</li>
              <li>清空不可撤销，建议先导出。</li>
            </ul>
          </div>
        </section>

        <section class="set-panel${tab === 'help' ? ' on' : ''}" id="pn-help">
          ${phead('帮助', '四步上手；其余按需展开。')}
          <details class="set-help" open><summary>怎么用（四步）</summary>
            <p>① 在「AI 服务」填 Key → ② 「新文章精读」选一个订阅源挑文章，或粘贴链接 / 直接粘正文 → ③ 精读页点生词查义、加入生词本，句子解析拆长难句 → ④ 听力精听逐句跟读，每天到「复习」清空到期闪卡。</p></details>
          <details class="set-help"><summary>抓取与订阅源</summary>
            <p>内置的源都是实测能拿到完整正文的（Aeon / ProPublica / Asterisk / Quanta / 公版评论 / The Marginalian / NPR），只读公开 RSS 的标题与摘要，点哪篇才抓哪篇。大西洋月刊会被 Cloudflare 挡住——那不是网络问题，用新建页的「取正文」书签即可。</p></details>
          <details class="set-help"><summary>快捷键</summary>
            <p>阅读页 <b>← →</b> 翻页；听力页 <b>空格</b> 播放 / 暂停、<b>← →</b> 切句；复习页 <b>空格 / 回车</b> 翻面、<b>1–4</b> 评分；<b>Esc</b> 关闭浮层。</p></details>
          <details class="set-help"><summary>隐私与备份</summary>
            <p>文章、生词、复习进度与设置保存在本机浏览器。使用 AI 功能时，待分析的文字会发给你配置的服务。换设备时可导入 JSON 备份；备份不含 API Key。</p></details>
        </section>
      </main>
    </div>
  </div>`);

  /* ---------- 分区切换：写进 hash，刷新 / 返回都能回到原处 ---------- */
  $$('.sn-item').forEach(b => b.onclick = () => Router.go('#/settings/' + b.dataset.tab));
  const backBtn = $('#setBack');
  if (backBtn) backBtn.onclick = () => Router.go('#/settings');

  /* ---------- AI ---------- */
  const refreshAi = () => {
    const sub = $('.sn-item[data-tab="ai"] i');
    if (sub) sub.textContent = aiSub();
    const dot = $('.sn-dot'); if (dot) dot.hidden = !Store.settings.apiKey;
    const badge = $('#aiBadge'); if (badge) badge.textContent = Store.settings.apiKey ? '已配置' : '未配置';
  };
  $$('[data-pre]').forEach(b => b.onclick = () => {
    const p = PRESETS[+b.dataset.pre];
    $('#sBaseUrl').value = p.baseUrl; $('#sModel').value = p.model;
    $$('[data-pre]').forEach(x => x.classList.toggle('on', x === b));
  });
  let keyShown = false;
  $('#sKeyEye').onclick = () => { keyShown = !keyShown; $('#sKey').type = keyShown ? 'text' : 'password'; };
  const readAI = () => {
    Store.settings.baseUrl = $('#sBaseUrl').value.trim() || DEFAULT_SETTINGS.baseUrl;
    Store.settings.model = $('#sModel').value.trim() || DEFAULT_SETTINGS.model;
    Store.settings.apiKey = $('#sKey').value.trim();
    save();
    $$('[data-pre]').forEach(x => {
      const p = PRESETS[+x.dataset.pre];
      x.classList.toggle('on', p.baseUrl === Store.settings.baseUrl && p.model === Store.settings.model);
    });
    refreshAi();
  };
  $('#sSaveAI').onclick = () => { readAI(); toast('已保存 AI 设置'); };
  $('#sTest').onclick = async function () {
    readAI();
    const out = $('#sTestOut');
    out.innerHTML = `<span class="dot"></span> 正在测试…`;
    this.disabled = true;
    try {
      const r = await testConnection();
      out.innerHTML = `<span class="dot ok"></span> 连接成功 · ${r.ms}ms · 模型回复「${esc(r.reply)}」`;
    } catch (e) {
      out.innerHTML = `<span class="dot err"></span> ${esc(e.message || String(e))}`;
    }
    this.disabled = false;
  };

  /* ---------- 阅读体验 ---------- */
  const syncPv = () => {
    const pv = $('#setPv'); if (!pv) return;
    pv.dataset.pvLayout = Store.settings.readerLayout || 'annotated';
    pv.dataset.pvTr = Store.settings.showTr || 'tap';
    const fsEl = $('#pvFs'); if (fsEl) fsEl.textContent = lblFs(Store.settings.fs);
    const lyEl = $('#pvLy'); if (lyEl) lyEl.textContent = lblLayout(Store.settings.readerLayout);
    const ffEl = $('#pvFf'); if (ffEl) ffEl.textContent = lblFont(Store.settings.fontFamily);
    const pvEn = $('#pvEn');
    if (pvEn) pvEn.style.fontFamily = Store.settings.fontFamily === 'sans' ? 'var(--sans)' : 'var(--serif)';
  };
  const syncReadSub = () => { const el = $('.sn-item[data-tab="read"] i'); if (el) el.textContent = readSub(); };
  const pickSeg = (sel, b) => $$(sel).forEach(x => x.classList.toggle('on', x === b));
  $$('[data-lv]').forEach(b => b.onclick = () => {
    const lv = b.dataset.lv;
    Store.settings.level = lv; save();
    pickSeg('[data-lv]', b);
    const o = TARGET_LEVELS.find(x => x.id === lv) || TARGET_LEVELS[1];
    const hint = $('#lvHint'); if (hint) hint.textContent = '高于「' + o.label + '」的词会被标注';
  });
  const rvSw = $('#sReviewSw');
  if (rvSw) rvSw.onclick = () => {
    const on = !(Store.settings.reviewWords !== false);
    Store.settings.reviewWords = on; save();
    rvSw.classList.toggle('on', on);
    toast(on ? '精读时会同时标注 CET-4/6 复习词' : '只标注新词');
  };
  $$('[data-trmode]').forEach(b => b.onclick = () => {
    Store.settings.showTr = b.dataset.trmode; save();
    pickSeg('[data-trmode]', b); syncPv();
    if (b.dataset.trmode === 'hint') toast('提示模式：先只给关键词，卡住了再看整段译文');
  });
  $$('[data-fs]').forEach(b => b.onclick = () => {
    Store.settings.fs = +b.dataset.fs; save();
    document.documentElement.style.setProperty('--fs', Store.settings.fs);
    pickSeg('[data-fs]', b); syncPv(); syncReadSub();
  });
  $$('[data-ff]').forEach(b => b.onclick = () => {
    Store.settings.fontFamily = b.dataset.ff === 'sans' ? 'sans' : 'serif'; save();
    pickSeg('[data-ff]', b); syncPv(); syncReadSub();
  });
  const pgSw = $('#sPagedSw');
  if (pgSw) pgSw.onclick = () => {
    const on = !(Store.settings.paged !== false);
    Store.settings.paged = on; save();
    pgSw.classList.toggle('on', on);
    toast(on ? '已切换为分页阅读' : '已切换为连续滚动');
  };
  $$('[data-layout]').forEach(b => b.onclick = () => {
    Store.settings.readerLayout = b.dataset.layout; save();
    pickSeg('[data-layout]', b); syncPv(); syncReadSub();
    toast('版式已切换，打开任意一篇文章即可看到');
  });
  syncPv();

  /* ---------- 外观 ---------- */
  const pickTheme = th => {
    applyTheme(th);
    $$('#sThemePicks .theme-pick').forEach(x => x.classList.toggle('on', x.dataset.th === th));
    const autoBtn = $('#sThemeAuto'); if (autoBtn) autoBtn.classList.toggle('on', th === 'auto');
    /* 明暗切换后，主色圆点要换用对应的一组色值 */
    const dark = !!document.documentElement.dataset.dark;
    $$('#sAccentPicks .accent-pick').forEach(btn => {
      const a = ACCENTS.find(x => x.id === btn.dataset.ac);
      const dot = btn.querySelector('.ac-dot');
      if (a && dot) dot.style.background = dark ? a.dark : a.light;
    });
    const el = $('.sn-item[data-tab="look"] i'); if (el) el.textContent = lookSub();
    const badge = $('#pn-look .pbadge'); if (badge) badge.textContent = lookSub();
  };
  $$('#sThemePicks .theme-pick').forEach(b => b.onclick = () => pickTheme(b.dataset.th));
  const autoBtn = $('#sThemeAuto');
  if (autoBtn) autoBtn.onclick = () => pickTheme('auto');
  $$('#sAccentPicks .accent-pick').forEach(b => b.onclick = () => {
    applyAccent(b.dataset.ac);
    $$('#sAccentPicks .accent-pick').forEach(x => x.classList.toggle('on', x === b));
    const el = $('.sn-item[data-tab="look"] i'); if (el) el.textContent = lookSub();
    const badge = $('#pn-look .pbadge'); if (badge) badge.textContent = lookSub();
  });

  /* ---------- 网络 ---------- */
  const pEl = $('#sProxy'), pOut = $('#sProxyOut');
  if (pEl) {
    const saveProxy = () => {
      Store.settings.crawlProxy = pEl.value.trim(); save();
      const el = $('.sn-item[data-tab="net"] i'); if (el) el.textContent = netSub();
    };
    pEl.addEventListener('change', saveProxy);
    pEl.addEventListener('blur', saveProxy);
    $('#sProxyCheck').onclick = async () => {
      saveProxy();
      pOut.innerHTML = '正在检测本机代理…';
      try {
        const v = pEl.value.trim();
        const r = await fetch('/__probe' + (v ? '?proxy=' + encodeURIComponent(v) : ''), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.candidates && j.candidates.length) {
          if (!v) { pEl.value = j.candidates[0]; saveProxy(); }
          pOut.innerHTML = `<span class="ok-text">✓ 检测到 ${j.candidates.length} 个可用代理</span>：${j.candidates.map(esc).join('、')}`;
        } else if (j.static) {
          pOut.innerHTML = `没扫到本机代理，但服务是以 <b>${esc(j.static)}</b> 启动的，仍会通过它抓取。`;
        } else {
          pOut.innerHTML = '<span class="bad-text">没检测到本机代理</span>：7890 / 7897 / 10809 等常用端口都没响应，先把代理软件打开再点检测。';
        }
      } catch (e) {
        pOut.innerHTML = `<span class="bad-text">检测失败：${esc(e.message || String(e))}</span>（需要由 node serve.mjs 提供页面）`;
      }
    };
  }

  /* ---------- 朗读 ---------- */
  const vSel = $('#sVoice');
  const fillV = () => {
    if (!TTS.voices.length) { vSel.innerHTML = '<option value="">（未检测到英语音色）</option>'; return; }
    const cur = TTS.getVoice();
    vSel.innerHTML = TTS.voices.map(v => `<option value="${escAttr(v.voiceURI)}" ${cur && v.voiceURI === cur.voiceURI ? 'selected' : ''}>${esc(v.name)}（${v.lang}${v.localService ? '' : ' · 在线'}）</option>`).join('');
  };
  fillV(); setTimeout(fillV, 600);
  vSel.onchange = () => {
    TTS.setVoice(vSel.value);
    const el = $('.sn-item[data-tab="voice"] i'); if (el) el.textContent = voiceSub();
  };
  $('#sVoiceTry').onclick = () => TTS.speak('Reading the press is the best way to learn English.', { rate: 1 });
  $$('[data-rate]').forEach(b => b.onclick = () => {
    Store.settings.ttsRate = +b.dataset.rate; save();
    pickSeg('[data-rate]', b);
    const el = $('.sn-item[data-tab="voice"] i'); if (el) el.textContent = voiceSub();
  });

  /* ---------- 数据 ---------- */
  $('#sExport').onclick = exportData;
  $('#sImportBtn').onclick = () => $('#sImport').click();
  $('#sImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = importData(await f.text());
      toast(`导入成功：新增 ${r.newArt} 篇文章、${r.newWord} 个生词`);
      Views.settings({ id: 'data' });
    } catch (err) { toast('导入失败：' + (err.message || err)); }
  };
  $('#sClear').onclick = async () => {
    const ok = await confirmModal({ title: '清空全部数据？', body: '所有文章、生词、复习进度与设置都会被删除，且无法恢复。建议先导出备份。', okText: '全部清空', danger: true });
    if (!ok) return;
    const theme = Store.settings.theme;
    localStorage.removeItem(LS_KEY);
    Store.settings = { ...DEFAULT_SETTINGS, theme, apiKey: '' };
    Store.articles = []; Store.words = Object.create(null); Store.log = { reviews: 0 };
    save(); applyTheme(theme); refreshBadges();
    toast('已清空');
    Views.settings({ id: 'data' });
  };
};

/* ============================================================
   启动
   ============================================================ */
function loadSampleArticle() {
  if (Store.articles.some(a => a.id === SAMPLE_ARTICLE.id)) {
    Router.go('#/reader/' + SAMPLE_ARTICLE.id);
    return;
  }
  Store.articles.unshift(JSON.parse(JSON.stringify(SAMPLE_ARTICLE)));
  save();
  toast('示例文章已载入');
  Router.go('#/reader/' + SAMPLE_ARTICLE.id);
}

document.getElementById('themeBtn').addEventListener('click', () => {
  const order = ['paper', 'sepia', 'sage', 'night', 'navy', 'ink'];
  const cur = document.documentElement.dataset.theme || 'paper';
  const i = order.indexOf(cur);
  applyTheme(order[(i + 1) % order.length]);
  /* 设置页开着时同步重绘：分区里的主题名 / 色卡选中态 / 主色圆点都依赖主题 */
  if (Router.current === 'settings') Router.go(location.hash || '#/settings');
});

loadStore();
applyTheme(Store.settings.theme);
applyAccent(Store.settings.accent || 'coral');
TTS.init();
Router.start();
