/* 言文字後台 · IG 貼文產生器
   左填右看，即時預覽，純前端匯出 PNG（方形 1080×1080 / 直式 1080×1350）。
   沿用 CIS token（/style.css 的 --ink/--paper/--accent…）與已載入的明體/黑體字型。
   狀態模型為 category／variant；本版提供 01–03 共九個版型。 */
'use strict';
(function () {
  if (!window.IGStudioLib) {
    throw new Error('[ig-studio] 需先載入 /ig-studio-lib.js（window.IGStudioLib 未定義）');
  }
  const Lib = window.IGStudioLib;
  const H = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => (window.toast ? window.toast(m) : alert(m));
  const DIMS = { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 } };

  const TYPE_KEYS = { '01': 'product', '02': 'event', '03': 'quote' };
  const currentTypeKey = () => TYPE_KEYS[state.category] || 'product';

  // ---- 狀態（預設帶示範內容，避免空白預覽） ----
  const state = {
    category: '01', variant: 'a', format: 'portrait',
    dark: false, showEn: true, showMember: true, hl: true,
    photo: '',                 // dataURL
    handle: '@yanwenzi.tw', place: '重慶南路',
    // product
    p_eyebrow: '本週精選',
    p_zh: '美式咖啡', p_en: 'AMERICANO', p_note: '', p_desc: '深烘豆現萃，醇厚回甘。',
    p_unit: '單杯', p_price: 170, p_emo: 150,
    p_menuId: '', p_alcohol: false,
    // event
    e_title: '七月社群沙龍', e_dateBig: '07.19', e_weekday: 'SAT · 週六',
    e_when: '19:30 – 21:00', e_place: '言文字三樓',
    e_desc: '一晚，把台灣做事的人聚在一起。自由入場，飲品另計。',
    e_capacity: '20 位', e_signup: '需報名',
    // quote
    q_text: '把日常，留一點空。', q_sub: '來坐坐。', q_by: '言文字',
  };

  const MENU = () => (window.MENU_DATA || []);

  function currentNeedsAlcohol() {
    return state.category === '01' && !!state.p_alcohol;
  }

  // ---- 樣式（後台工具鏡 + 貼文本體 .igp） ----
  function injectCSS() {
    if (document.getElementById('ig-studio-css')) return;
    const css = `
    .ig-wrap{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:24px;align-items:start}
    @media(max-width:900px){.ig-wrap{grid-template-columns:minmax(0,1fr)}}
    .ig-form{min-width:0}
    .ig-form label{font-size:.82rem;color:var(--muted);display:flex;flex-direction:column;gap:.3em;margin-bottom:12px}
    .ig-form input,.ig-form select,.ig-form textarea{font:inherit;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)}
    .ig-form textarea{min-height:60px;resize:vertical}
    .ig-seg{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
    .ig-seg button{all:unset;cursor:pointer;padding:.5em .9em;border:1px solid var(--line);border-radius:8px;font-size:.85rem;color:var(--ink-soft)}
    .ig-seg button.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
    .ig-toggles{display:flex;flex-wrap:wrap;gap:10px 16px;margin:6px 0 14px}
    .ig-toggles label{flex-direction:row;align-items:center;gap:.4em;color:var(--ink-soft);margin:0}
    .ig-drop{border:1px dashed var(--line);border-radius:10px;padding:14px;text-align:center;color:var(--muted);font-size:.85rem;cursor:pointer;background:var(--paper)}
    .ig-drop.over{outline:2px dashed var(--accent);outline-offset:-6px}
    .ig-drop.has{color:var(--ink-soft);border-style:solid}
    .ig-hint{font-size:.78rem;color:var(--muted);background:var(--paper-deep);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin-bottom:12px;line-height:1.5}
    .ig-hint--warn{border-color:var(--accent);color:var(--ink-soft)}
    .ig-previewbox{min-width:0;max-width:100%;overflow:hidden;background:var(--paper-deep);border:1px solid var(--line);border-radius:var(--radius);padding:22px;display:flex;flex-direction:column;align-items:center;gap:16px}
    .ig-stage-wrap{width:100%;max-width:460px;min-width:0;overflow:hidden;display:flex;justify-content:center}
    .ig-stage{overflow:hidden;box-shadow:var(--shadow);background:#fff;max-width:100%}
    .ig-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}

    /* ===== 貼文本體 — 以 1080 畫布為單位 ===== */
    .igp{--ig-yellow:#FFDE34;position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;
      background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;}
    .igp.dark{background:#16150F;color:#F4F1EA;}
    .igp *{box-sizing:border-box;margin:0;}
    .igp-layout{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;}
    .igp-photo{width:100%;flex:none;background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#E7E1D5;}
    .igp.dark .igp-photo{background-color:#26231D;}
    .igp-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:76px 92px 80px;}
    .igp-body--alcohol{padding-top:48px;padding-bottom:40px;}
    .igp-eyebrow{font-size:22px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:16px;}
    .igp.dark .igp-eyebrow{color:#B7B0A2;}
    .igp-eyebrow::before{content:"";width:14px;height:14px;background:var(--ig-yellow);transform:rotate(45deg);flex:none;}
    .igp-eyebrow--plain::before{display:none;}
    .igp-h2{font-family:var(--serif);font-weight:500;line-height:1.06;letter-spacing:.02em;margin-top:32px;}
    .igp .hl{background-image:linear-gradient(var(--ig-yellow),var(--ig-yellow));background-repeat:no-repeat;background-size:100% .24em;background-position:0 .9em;padding:0 .04em;}
    .igp-en{font-family:"Cormorant Garamond",var(--serif);font-style:italic;font-size:36px;color:var(--muted);margin-top:14px;}
    .igp.dark .igp-en{color:#B7B0A2;}
    .igp-note{font-size:24px;color:var(--muted);margin-top:12px;letter-spacing:.02em;}
    .igp-desc{font-size:28px;line-height:1.68;color:var(--ink-soft);margin-top:26px;max-width:760px;}
    .igp.dark .igp-desc{color:#D6D0C4;}
    .igp-spacer{margin-top:auto;}
    .igp-price-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:34px;}
    .igp-price-label{font-size:20px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);}
    .igp-price{font-family:"Cormorant Garamond",var(--serif);font-size:74px;line-height:.9;font-variant-numeric:tabular-nums;}
    .igp-price sup{font-size:.4em;vertical-align:.8em;color:var(--muted);margin-right:4px;}
    .igp-member{display:flex;align-items:baseline;justify-content:flex-end;gap:12px;margin-top:14px;font-size:24px;color:var(--muted);}
    .igp-member b{color:var(--ink);font-weight:600;}.igp.dark .igp-member b{color:#F4F1EA;}
    .igp-member .tag{font-size:18px;letter-spacing:.14em;background:var(--ig-yellow);color:#1B1A17;padding:.1em .6em;border-radius:999px;}
    .igp-foot{display:flex;align-items:baseline;justify-content:space-between;gap:24px;margin-top:34px;padding-top:26px;border-top:1px solid rgba(27,26,23,.14);}
    .igp.dark .igp-foot{border-top-color:rgba(244,241,234,.18);}
    .igp-brand{font-family:var(--serif);font-size:28px;letter-spacing:.06em;}
    .igp-handle{font-size:18px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);text-align:right;}
    .igp-photo-square{align-self:flex-start;}
    .igp-photo-frame{border:1px solid rgba(244,241,234,.34);padding:16px;margin-top:34px;}
    .igp-photo-frame .igp-photo{height:100%;}
    .igp-event-date{font-family:"Cormorant Garamond",var(--serif);font-size:196px;line-height:.86;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin-top:40px;}
    .igp-event-weekday{font-size:24px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);margin-top:16px;}
    .igp-meta{margin-top:auto;display:flex;flex-direction:column;}
    .igp-meta .r,.igp-info-row{display:flex;align-items:baseline;gap:20px;padding:15px 0;border-top:1px solid rgba(27,26,23,.14);font-size:30px;}
    .igp.dark .igp-meta .r,.igp.dark .igp-info-row{border-top-color:rgba(244,241,234,.18);}
    .igp-meta .lbl,.igp-info-row .lbl{font-size:18px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);min-width:104px;}
    .igp-meta .val,.igp-info-row .val{margin-left:auto;text-align:right;}
    .igp-info-frame{border:1px solid rgba(27,26,23,.24);padding:6px 34px;margin-top:38px;}
    .igp.dark .igp-info-frame{border-color:rgba(244,241,234,.32);}
    .igp-info-frame .igp-info-row:first-child{border-top:0;}
    .igp-quote{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:96px;}
    .igp-quote .mk{font-family:var(--serif);font-size:150px;line-height:.6;color:var(--ig-yellow);}
    .igp-quote .tx{font-family:var(--serif);font-weight:500;line-height:1.36;letter-spacing:.03em;}
    .igp-quote .sb{font-family:var(--serif);font-size:48px;color:var(--muted);margin-top:26px;}
    .igp.dark .igp-quote .sb{color:#B7B0A2;}
    .igp-quote .by{font-size:22px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-top:40px;}
    .igp-quote-photo{position:relative;background-color:#E7E1D5;background-size:cover;background-position:center;}
    .igp.dark .igp-quote-photo{background-color:#26231D;}
    .igp-photo-scrim{position:absolute;inset:0;background:rgba(14,13,10,.62);}
    .igp-overlay-copy{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;padding:96px;color:#F4F1EA;}
    .igp-overlay-copy .igp-desc,.igp-overlay-copy .igp-handle{color:#E2DCD0;}
    .igp-overlay-copy .igp-foot{margin-top:auto;border-top-color:rgba(244,241,234,.3);}
    .igp-alcohol{flex:none;display:flex;flex-direction:column;justify-content:center;padding:0 48px;box-sizing:border-box;
      background:#1B1A17;color:#F4F1EA;font-family:var(--sans);font-size:22px;letter-spacing:.08em;gap:8px;text-align:center;}
    .igp.dark .igp-alcohol{background:#0E0D0A;}
    `;
    const s = document.createElement('style'); s.id = 'ig-studio-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- 貼文 HTML ----
  const hl = t => state.hl ? `<span class="hl">${H(t)}</span>` : H(t);
  const foot = () => `<div class="igp-foot"><span class="igp-brand">言文字</span><span class="igp-handle">${H(state.place)} · ${H(state.handle)}</span></div>`;
  const photo = (height, className = '', extraStyle = '') => `<div class="igp-photo${className ? ` ${className}` : ''}" style='height:${height}px;${extraStyle}${state.photo ? `background-image:url("${state.photo}")` : ''}'></div>`;
  const productCopy = () => `
    ${state.showEn && state.p_en ? `<div class="igp-en">${H(state.p_en)}</div>` : ''}
    ${state.p_note ? `<div class="igp-note">${H(state.p_note)}</div>` : ''}
    ${state.p_desc ? `<p class="igp-desc">${H(state.p_desc)}</p>` : ''}`;
  const productPrice = () => `<div class="igp-price-row">
      <span class="igp-price-label">${H(state.p_unit)}</span>
      <span class="igp-price"><sup>$</sup>${H(state.p_price)}</span>
    </div>
    ${state.showMember && state.p_emo ? `<div class="igp-member"><span class="tag">會員</span><span>會員價</span><b><sup style="font-size:.5em">$</sup>${H(state.p_emo)}</b></div>` : ''}`;

  function render01a() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 160 : 320) : (sq ? 350 : 620);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="01a">
      ${photo(photoH)}
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2" style="font-size:${sq ? 76 : 88}px">${hl(state.p_zh)}</h2>
        ${productCopy()}
        <div class="igp-spacer"></div>
        ${productPrice()}
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render01b() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 150 : 240) : (sq ? 300 : 420);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="01b">
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2" style="font-size:${sq ? 78 : 96}px">${H(state.p_zh)}</h2>
        ${productCopy()}
        ${photo(photoH, 'igp-photo-square', `width:${photoH}px;margin-top:${needsAlcohol ? 24 : 42}px;`)}
        <div class="igp-spacer"></div>
        ${productPrice()}
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render01c() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 140 : 230) : (sq ? 280 : 440);
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return `<div class="igp-layout" data-layout="01c">
      <div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 84}px">${H(state.p_zh)}</h2>
        ${state.showEn && state.p_en ? `<div class="igp-en">${H(state.p_en)}</div>` : ''}
        ${state.p_note ? `<div class="igp-note">${H(state.p_note)}</div>` : ''}
        <div class="igp-photo-frame" style="width:${sq ? 420 : 540}px;height:${photoH + 32}px">${photo(photoH)}</div>
        ${state.p_desc ? `<p class="igp-desc">${H(state.p_desc)}</p>` : ''}
        <div class="igp-spacer"></div>
        ${productPrice()}
        ${foot()}
      </div>
    </div>${band}`;
  }

  function render02a() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="02a">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Event · 活動預告</div>
        <div class="igp-event-date" style="font-size:${sq ? 160 : 196}px">${H(state.e_dateBig)}</div>
        <div class="igp-event-weekday">${hl(state.e_weekday)}</div>
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 82}px">${H(state.e_title)}</h2>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        <div class="igp-meta">
          <div class="r"><span class="lbl">時間</span><span class="val">${H(state.e_when)}</span></div>
          <div class="r"><span class="lbl">地點</span><span class="val">${H(state.e_place)}</span></div>
          <div class="r"><span class="lbl">名額</span><span class="val">${H(state.e_capacity)} · ${H(state.e_signup)}</span></div>
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render02b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="02b">
      <div class="igp-body">
        <div class="igp-eyebrow">Weekend · 週末</div>
        <h2 class="igp-h2" style="font-size:${sq ? 72 : 92}px">${H(state.e_title)}</h2>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        <div class="igp-info-frame">
          <div class="igp-info-row"><span class="lbl">日期</span><span class="val">${H(state.e_dateBig)}　${H(state.e_weekday)}</span></div>
          <div class="igp-info-row"><span class="lbl">時間</span><span class="val">${H(state.e_when)}</span></div>
          <div class="igp-info-row"><span class="lbl">地點</span><span class="val">${H(state.e_place)}</span></div>
          <div class="igp-info-row"><span class="lbl">報名</span><span class="val">${H(state.e_capacity)} · ${H(state.e_signup)}</span></div>
        </div>
        ${photo(sq ? 160 : 250, '', 'margin-top:34px;')}
        <div class="igp-spacer"></div>
        ${foot()}
      </div>
    </div>`;
  }

  function render02c() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="02c">
      <div class="igp-body">
        <div class="igp-eyebrow igp-eyebrow--plain">Live · 週末現場</div>
        <h2 class="igp-h2" style="font-size:${sq ? 68 : 82}px">${H(state.e_title)}</h2>
        <div class="igp-event-date" style="font-size:${sq ? 104 : 128}px">${hl(state.e_dateBig)}</div>
        <div class="igp-event-weekday">${H(state.e_weekday)}</div>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        ${photo(sq ? 170 : 280, '', 'margin-top:32px;')}
        <div class="igp-meta">
          <div class="r"><span class="lbl">時間</span><span class="val">${H(state.e_when)}</span></div>
          <div class="r"><span class="lbl">地點</span><span class="val">${H(state.e_place)}</span></div>
          <div class="r"><span class="lbl">名額</span><span class="val">${H(state.e_capacity)} · ${H(state.e_signup)}</span></div>
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render03a() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="03a">
      <div class="igp-quote">
        <div class="igp-eyebrow">Words · 今日一句</div>
        <div style="margin:auto 0"><div class="mk">“</div>
          <div class="tx" style="font-size:${sq ? 72 : 84}px">${H(state.q_text)}</div>
          ${state.q_sub ? `<div class="sb">${H(state.q_sub)}</div>` : ''}
          ${state.q_by ? `<div class="by">${H(state.q_by)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render03b() {
    const sq = state.format === 'square';
    return `<div class="igp-layout" data-layout="03b">
      <div class="igp-quote">
        <div class="igp-eyebrow igp-eyebrow--plain">A Note · 夜的字</div>
        <div style="margin:auto 0">
          <div class="mk">「</div>
          <div class="tx" style="font-size:${sq ? 62 : 74}px">${H(state.q_text)}</div>
          ${state.q_sub ? `<div class="sb">— ${H(state.q_sub)} —</div>` : ''}
          ${state.q_by ? `<div class="by">${H(state.q_by)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  function render03c() {
    const sq = state.format === 'square';
    const bg = state.photo ? `background-image:url("${state.photo}")` : '';
    return `<div class="igp-layout igp-quote-photo" data-layout="03c" style='${bg}'>
      <div class="igp-photo-scrim"></div>
      <div class="igp-overlay-copy">
        <div class="igp-eyebrow igp-eyebrow--plain">Words · 留下片刻</div>
        <div style="margin:auto 0">
          <h2 class="igp-h2" style="font-size:${sq ? 68 : 80}px">${H(state.q_text)}</h2>
          ${state.q_sub ? `<p class="igp-desc">${H(state.q_sub)}</p>` : ''}
          ${state.q_by ? `<div class="by" style="margin-top:32px;font-size:22px;letter-spacing:.22em">${H(state.q_by)}</div>` : ''}
        </div>
        ${foot()}
      </div>
    </div>`;
  }

  const LAYOUTS = {
    '01': {
      a: { label: '全幅照片 · 底部資訊', forceDark: false, render: render01a },
      b: { label: '文字主體 · 方形照片', forceDark: false, render: render01b },
      c: { label: '深色 · 框線照片', forceDark: true, render: render01c },
    },
    '02': {
      a: { label: '大日期 · 編排', forceDark: false, render: render02a },
      b: { label: '海報式 · 框線資訊', forceDark: false, render: render02b },
      c: { label: '深色海報 · 反白', forceDark: true, render: render02c },
    },
    '03': {
      a: { label: '留白 · 大字金句', forceDark: false, render: render03a },
      b: { label: '深色 · 引號金句', forceDark: true, render: render03b },
      c: { label: '照片 · 金句疊字', forceDark: false, render: render03c },
    },
  };
  const currentLayout = () => LAYOUTS[state.category][state.variant];

  function postInner() {
    return currentLayout().render();
  }

  function postNode() {
    const { w, h } = DIMS[state.format];
    const root = document.createElement('div');
    root.className = 'igp' + (state.dark ? ' dark' : '');
    root.style.width = w + 'px'; root.style.height = h + 'px';
    root.innerHTML = postInner();
    return root;
  }

  // ---- 表單 ----
  const F = {
    product: () => `
      <p class="ig-hint">菜單價格尚未核定，僅供內部預覽，勿直接對外發布。</p>
      <label>從菜單帶入
        <select data-menu>${['<option value="">— 手動輸入 —</option>']
          .concat(MENU().map(m => `<option value="${H(m.id)}" ${m.id === state.p_menuId ? 'selected' : ''}>${H(m.cat)}｜${H(m.zh)} $${H(m.price)}${m.published ? '' : '（未發布）'}${m.alcohol ? '　🔞' : ''}</option>`)).join('')}</select></label>
      <label>小標<input data-k="p_eyebrow" value="${H(state.p_eyebrow)}"></label>
      <label>品名（中）<input data-k="p_zh" value="${H(state.p_zh)}"></label>
      <label>品名（英）<input data-k="p_en" value="${H(state.p_en)}"></label>
      <label>備註 / 口味<input data-k="p_note" value="${H(state.p_note)}" placeholder="例：黑糖 / 焦糖"></label>
      <label>說明<textarea data-k="p_desc">${H(state.p_desc)}</textarea></label>
      <div class="ig-seg" style="gap:12px">
        <label style="flex:1">單位<input data-k="p_unit" value="${H(state.p_unit)}"></label>
        <label style="flex:1">原價<input data-k="p_price" type="number" value="${H(state.p_price)}"></label>
        <label style="flex:1">會員價<input data-k="p_emo" type="number" value="${H(state.p_emo)}"></label>
      </div>
      <label style="flex-direction:row;align-items:center;gap:.4em"><input type="checkbox" data-k="p_alcohol" ${state.p_alcohol ? 'checked' : ''}> 含酒精（人工標記，匯出將自動附加警語）</label>
      ${state.p_alcohol ? '<p class="ig-hint ig-hint--warn">已標記酒精飲品：匯出將自動附加法定警語，且無法在缺少警語時匯出。</p>' : ''}`,
    event: () => `
      <label>活動標題<input data-k="e_title" value="${H(state.e_title)}"></label>
      <div class="ig-seg" style="gap:12px">
        <label style="flex:1">大日期<input data-k="e_dateBig" value="${H(state.e_dateBig)}" placeholder="例：08.09"></label>
        <label style="flex:1">星期<input data-k="e_weekday" value="${H(state.e_weekday)}" placeholder="例：SAT · 週六"></label>
      </div>
      <label>時間<input data-k="e_when" value="${H(state.e_when)}" placeholder="例：19:00 – 21:30"></label>
      <label>地點<input data-k="e_place" value="${H(state.e_place)}"></label>
      <label>說明<textarea data-k="e_desc">${H(state.e_desc)}</textarea></label>
      <div class="ig-seg" style="gap:12px">
        <label style="flex:1">名額<input data-k="e_capacity" value="${H(state.e_capacity)}"></label>
        <label style="flex:1">報名<input data-k="e_signup" value="${H(state.e_signup)}"></label>
      </div>`,
    quote: () => `
      <label>主文（金句）<textarea data-k="q_text">${H(state.q_text)}</textarea></label>
      <label>副題<input data-k="q_sub" value="${H(state.q_sub)}"></label>
      <label>署名<input data-k="q_by" value="${H(state.q_by)}"></label>`,
  };

  let root, stage, downloading = false;

  function loadMenuItem(id) {
    const m = MENU().find(m => m.id === id);
    state.p_menuId = m ? m.id : '';
    state.p_alcohol = Lib.itemNeedsAlcoholBand(m);
    if (m) Object.assign(state, { p_zh: m.zh, p_en: m.en, p_note: m.note || '', p_price: m.price, p_emo: m.emo });
  }

  function refreshMenu() {
    if (state.p_menuId) loadMenuItem(state.p_menuId);
    if (!root || currentTypeKey() !== 'product') return;
    renderForm(); renderPreview();
  }
  window.addEventListener('tth:menu-data', refreshMenu);

  function renderForm() {
    const box = root.querySelector('#ig-fields');
    box.innerHTML = F[currentTypeKey()]();
    // 值變更 → 只更新預覽（不重繪表單，保留游標）
    box.querySelectorAll('input[data-k]:not([type="checkbox"]), textarea[data-k]').forEach(inp => inp.addEventListener('input', e => {
      const k = e.target.dataset.k;
      state[k] = e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
      renderPreview();
    }));
    box.querySelectorAll('input[data-k][type="checkbox"]').forEach(cb => cb.addEventListener('change', e => {
      state[e.target.dataset.k] = e.target.checked;
      renderForm(); renderPreview();
    }));
    const menu = box.querySelector('[data-menu]');
    if (menu) menu.addEventListener('change', e => {
      loadMenuItem(e.target.value);
      renderForm(); renderPreview();
    });
  }

  function sizeStage() {
    if (!stage) return;
    const parent = stage.parentElement;
    const { w, h } = DIMS[state.format];
    const scale = Lib.computePreviewScale(parent ? parent.clientWidth : 0, w);
    if (scale == null) return;
    if (!(scale > 0) || !isFinite(scale)) return;
    stage.style.width = w * scale + 'px';
    stage.style.height = h * scale + 'px';
    const node = stage.firstElementChild;
    if (node) {
      node.style.width = w + 'px';
      node.style.height = h + 'px';
      node.style.transformOrigin = 'top left';
      node.style.transform = `scale(${scale})`;
    }
  }

  function renderPreview() {
    stage.innerHTML = '';
    stage.appendChild(postNode());
    sizeStage();
  }

  async function download() {
    const btn = root.querySelector('#ig-dl');
    if (!btn || btn.disabled || downloading) return;
    if (typeof htmlToImage === 'undefined') return toast('匯出元件未載入');

    const needsAlcohol = currentNeedsAlcohol();
    const { w, h } = DIMS[state.format];
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;';
    const node = postNode();
    holder.appendChild(node);
    document.body.appendChild(holder);

    if (needsAlcohol) {
      const band = node.querySelector('.igp-alcohol');
      const minH = h * 0.1;
      if (!band || band.getBoundingClientRect().height + 0.5 < minH) {
        holder.remove();
        toast('酒精飲品缺少法定警語，已阻止匯出');
        return;
      }
    }

    const typeKey = currentTypeKey();
    const title = typeKey === 'product' ? state.p_zh : typeKey === 'event' ? state.e_title : '金句';
    const prevText = btn.textContent;
    downloading = true;
    btn.disabled = true;
    btn.textContent = '匯出中…';
    try {
      await document.fonts.ready;
      const overflow = [node, ...node.querySelectorAll('.igp-body,.igp-quote,.igp-overlay-copy,.igp-layout')]
        .some(el => Lib.contentOverflows(el.scrollHeight, el.clientHeight));
      if (overflow) {
        toast('內容超出版面，請縮短文字或移除照片');
        return;
      }
      // ponytail: skipFonts —— 不內嵌 CJK 字型（Noto Serif/Sans TC 各數 MB，內嵌會掛住 45s+）。
      // 匯出時瀏覽器以已載入／系統字型繪製；升級路徑：要保證跨機明體保真，改自架 woff2 subset 傳入 fontEmbedCSS。
      const url = await htmlToImage.toPng(node, { width: w, height: h, pixelRatio: 1, skipFonts: true });
      const a = document.createElement('a');
      a.href = url; a.download = Lib.buildDownloadName(title, state.format); a.click();
      toast('已下載 PNG');
    } catch (e) { toast('匯出失敗：' + e.message); }
    finally {
      downloading = false;
      btn.disabled = false;
      btn.textContent = prevText;
      holder.remove();
    }
  }

  function readPhoto(file) {
    if (!file) return;
    if (!Lib.isAllowedPhotoType(file.type)) return toast('僅支援 JPEG／PNG／WebP 格式');
    if (file.size > Lib.PHOTO_MAX_BYTES) return toast('照片請小於 5MB');
    const r = new FileReader();
    r.onerror = r.onabort = () => toast('照片讀取失敗');
    r.onload = () => { state.photo = r.result; root.querySelector('#ig-drop').classList.add('has'); root.querySelector('#ig-drop-t').textContent = '已選照片 · 點此更換'; renderPreview(); };
    r.readAsDataURL(file);
  }

  function syncLayoutControls() {
    if (currentLayout().forceDark) state.dark = true;
    root.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('on', b.dataset.category === state.category));
    root.querySelectorAll('[data-variant]').forEach(b => {
      b.classList.toggle('on', b.dataset.variant === state.variant);
      b.textContent = `${b.dataset.variant.toUpperCase()} · ${LAYOUTS[state.category][b.dataset.variant].label}`;
    });
    const dark = root.querySelector('[data-t="dark"]');
    dark.checked = state.dark;
    dark.disabled = currentLayout().forceDark;
  }

  function shell() {
    return `<div class="ig-wrap">
        <div class="ig-form">
        <div class="ig-seg" id="ig-type">
          <button data-category="01" class="${currentTypeKey() === 'product' ? 'on' : ''}">01 單品／價目</button>
          <button data-category="02" class="${currentTypeKey() === 'event' ? 'on' : ''}">02 活動預告</button>
          <button data-category="03" class="${currentTypeKey() === 'quote' ? 'on' : ''}">03 金句／字</button>
        </div>
        <div class="ig-seg" id="ig-variant">
          <button data-variant="a" class="${state.variant === 'a' ? 'on' : ''}">A · ${H(LAYOUTS[state.category].a.label)}</button>
          <button data-variant="b" class="${state.variant === 'b' ? 'on' : ''}">B · ${H(LAYOUTS[state.category].b.label)}</button>
          <button data-variant="c" class="${state.variant === 'c' ? 'on' : ''}">C · ${H(LAYOUTS[state.category].c.label)}</button>
        </div>
        <div class="ig-seg" id="ig-format">
          <button data-fmt="portrait" class="${state.format === 'portrait' ? 'on' : ''}">直式 1080×1350</button>
          <button data-fmt="square" class="${state.format === 'square' ? 'on' : ''}">方形 1080×1080</button>
        </div>
        <div class="ig-toggles">
          <label><input type="checkbox" data-t="dark"${state.dark ? ' checked' : ''}${currentLayout().forceDark ? ' disabled' : ''}> 暗底</label>
          <label><input type="checkbox" data-t="showEn"${state.showEn ? ' checked' : ''}> 顯示英文</label>
          <label><input type="checkbox" data-t="showMember"${state.showMember ? ' checked' : ''}> 顯示會員價</label>
          <label><input type="checkbox" data-t="hl"${state.hl ? ' checked' : ''}> 標題重點</label>
        </div>
        <div id="ig-fields"></div>
        <div class="ig-drop" id="ig-drop"><span id="ig-drop-t">上傳照片 · 點此或拖曳</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" id="ig-file" hidden></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <label style="flex:1;margin:0">IG 帳號<input data-k2="handle" value="${H(state.handle)}"></label>
          <label style="flex:1;margin:0">地點<input data-k2="place" value="${H(state.place)}"></label>
        </div>
      </div>
      <div class="ig-previewbox">
        <div class="ig-stage-wrap"><div class="ig-stage" id="ig-stage"></div></div>
        <div class="ig-actions">
          <button class="btn btn--solid btn-sm" id="ig-dl">下載 PNG</button>
        </div>
        <p id="ig-cap" style="color:var(--muted);font-size:.8rem;margin:0">預覽為縮小顯示，下載為實際 ${DIMS[state.format].w}×${DIMS[state.format].h} 像素。</p>
      </div>
    </div>`;
  }

  function mount(host) {
    injectCSS();
    root = host;
    host.innerHTML = shell();
    stage = host.querySelector('#ig-stage');

    host.querySelectorAll('[data-category]').forEach(b => b.onclick = () => {
      state.category = b.dataset.category;
      syncLayoutControls();
      renderForm(); renderPreview();
    });
    host.querySelectorAll('[data-variant]').forEach(b => b.onclick = () => {
      state.variant = b.dataset.variant;
      syncLayoutControls();
      renderForm(); renderPreview();
    });
    host.querySelectorAll('#ig-format button').forEach(b => b.onclick = () => {
      state.format = b.dataset.fmt;
      host.querySelectorAll('#ig-format button').forEach(x => x.classList.toggle('on', x === b));
      host.querySelector('#ig-cap').textContent = `預覽為縮小顯示，下載為實際 ${DIMS[state.format].w}×${DIMS[state.format].h} 像素。`;
      renderPreview();
    });
    host.querySelectorAll('[data-t]').forEach(c => c.onchange = e => {
      state[e.target.dataset.t] = e.target.checked;
      renderPreview();
    });
    host.querySelectorAll('[data-k2]').forEach(inp => inp.oninput = e => { state[e.target.dataset.k2] = e.target.value; renderPreview(); });

    const drop = host.querySelector('#ig-drop'), file = host.querySelector('#ig-file');
    drop.onclick = () => file.click();
    file.onchange = e => readPhoto(e.target.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); readPhoto(e.dataTransfer.files[0]); };

    host.querySelector('#ig-dl').onclick = download;

    syncLayoutControls(); renderForm(); renderPreview();
    if (!mount._resize) { mount._resize = true; window.addEventListener('resize', () => stage && sizeStage()); }
  }

  window.IGStudio = { mount, resize: sizeStage };
})();
