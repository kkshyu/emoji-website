/* 言文字後台 · IG 貼文產生器
   左填右看，即時預覽，純前端匯出 PNG（方形 1080×1080 / 直式 1080×1350）。
   沿用 CIS token（/style.css 的 --ink/--paper/--accent…）與已載入的明體/黑體字型。
   狀態模型為 category／variant（Task 4–5 將擴充為 18 版型 registry）；本版僅接上
   3 個簡化占位版型：01a=單品、02b=活動、03a=金句。 */
'use strict';
(function () {
  if (!window.IGStudioLib) {
    throw new Error('[ig-studio] 需先載入 /ig-studio-lib.js（window.IGStudioLib 未定義）');
  }
  const Lib = window.IGStudioLib;
  const H = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => (window.toast ? window.toast(m) : alert(m));
  const DIMS = { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 } };

  // category/variant → 表單／版型鍵。Task 4–5 會換成真正的 LAYOUTS registry。
  const TYPE_MAP = {
    product: { category: '01', variant: 'a' },
    event: { category: '02', variant: 'b' },
    quote: { category: '03', variant: 'a' },
  };
  function currentTypeKey() {
    for (const k of Object.keys(TYPE_MAP)) {
      const m = TYPE_MAP[k];
      if (m.category === state.category && m.variant === state.variant) return k;
    }
    return 'product';
  }

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
    e_title: '七月社群沙龍', e_when: '', e_place: '言文字三樓',
    e_desc: '一晚，把台灣做事的人聚在一起。自由入場，飲品另計。',
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
    .igp{position:relative;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;
      background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.5;}
    .igp.dark{background:#16150F;color:#EDE9E0;}
    .igp *{box-sizing:border-box;margin:0;}
    .igp-photo{width:100%;flex:none;background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#ECE8DE;}
    .igp.dark .igp-photo{background-color:#22201A;}
    .igp-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:76px 92px 80px;}
    .igp-body--alcohol{padding-top:48px;padding-bottom:40px;}
    .igp-eyebrow{font-size:22px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:16px;}
    .igp.dark .igp-eyebrow{color:#B7B0A2;}
    .igp-eyebrow::before{content:"";width:30px;height:12px;background:var(--accent);transform:rotate(45deg);flex:none;}
    .igp-h2{font-family:var(--serif);font-weight:500;font-size:104px;line-height:1.05;letter-spacing:.02em;margin-top:34px;}
    .igp-h2 .hl{background-image:linear-gradient(var(--accent),var(--accent));background-repeat:no-repeat;background-size:100% .26em;background-position:0 .86em;padding:0 .04em;}
    .igp-en{font-family:"Cormorant Garamond",var(--serif);font-style:italic;font-size:40px;color:var(--muted);margin-top:18px;}
    .igp.dark .igp-en{color:#B7B0A2;}
    .igp-note{font-size:26px;color:var(--muted);margin-top:14px;letter-spacing:.02em;}
    .igp-desc{font-size:30px;line-height:1.7;color:var(--ink-soft);margin-top:30px;max-width:760px;}
    .igp.dark .igp-desc{color:#D6D0C4;}
    .igp-spacer{margin-top:auto;}
    .igp-price-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:44px;}
    .igp-price-label{font-size:22px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);}
    .igp-price{font-family:"Cormorant Garamond",var(--serif);font-size:96px;line-height:.9;font-variant-numeric:tabular-nums;}
    .igp-price sup{font-size:.4em;vertical-align:.9em;color:var(--muted);margin-right:4px;}
    .igp-member{display:flex;align-items:baseline;justify-content:flex-end;gap:14px;margin-top:16px;font-size:28px;color:var(--muted);}
    .igp-member b{color:var(--ink);font-weight:600;}.igp.dark .igp-member b{color:#EDE9E0;}
    .igp-member .tag{font-size:20px;letter-spacing:.14em;background:var(--accent);color:#1B1A17;padding:.1em .6em;border-radius:999px;}
    .igp-foot{display:flex;align-items:baseline;justify-content:space-between;gap:24px;margin-top:42px;padding-top:30px;border-top:1px solid rgba(27,26,23,.14);}
    .igp.dark .igp-foot{border-top-color:rgba(237,233,224,.18);}
    .igp-alcohol{flex:none;display:flex;flex-direction:column;justify-content:center;padding:0 48px;box-sizing:border-box;
      background:#1B1A17;color:#F4F1EA;font-family:var(--sans);font-size:22px;letter-spacing:.08em;gap:8px;text-align:center;}
    .igp.dark .igp-alcohol{background:#0E0D0A;color:#EDE9E0;}
    .igp-brand{font-family:var(--serif);font-size:30px;letter-spacing:.06em;}
    .igp-handle{font-size:20px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);}
    /* 活動 */
    .igp-meta{margin-top:40px;display:flex;flex-direction:column;gap:18px;}
    .igp-meta .r{display:flex;align-items:baseline;gap:22px;font-size:32px;}
    .igp-meta .lbl{font-size:22px;letter-spacing:.2em;color:var(--muted);min-width:100px;}
    /* 金句 */
    .igp-quote{flex:1;display:flex;flex-direction:column;justify-content:center;padding:110px 96px;}
    .igp-quote .mk{font-family:var(--serif);font-size:120px;line-height:.6;color:var(--accent);}
    .igp-quote .tx{font-family:var(--serif);font-weight:500;font-size:96px;line-height:1.28;letter-spacing:.03em;margin-top:20px;}
    .igp-quote .sb{font-family:var(--serif);font-size:56px;color:var(--muted);margin-top:30px;}
    .igp.dark .igp-quote .sb{color:#B7B0A2;}
    .igp-quote .by{font-size:24px;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);margin-top:64px;}
    /* 酒類警語帶（實際尺寸由 IGStudioLib.alcoholBandHTML 內嵌 style 決定，此為保底） */
    .igp-alcohol{flex:none;}
    `;
    const s = document.createElement('style'); s.id = 'ig-studio-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  // ---- 貼文 HTML ----
  const hl = t => state.hl ? `<span class="hl">${H(t)}</span>` : H(t);
  const foot = () => `<div class="igp-foot"><span class="igp-brand">言文字</span><span class="igp-handle">${H(state.place)} · ${H(state.handle)}</span></div>`;
  function renderProduct() {
    const sq = state.format === 'square';
    const needsAlcohol = currentNeedsAlcohol();
    const photoH = needsAlcohol ? (sq ? 160 : 320) : (sq ? 460 : 620);
    const photo = state.photo ? `<div class="igp-photo" style="height:${photoH}px;background-image:url('${state.photo}')"></div>` : '';
    const band = needsAlcohol ? Lib.alcoholBandHTML(DIMS[state.format].h) : '';
    return photo + `<div class="igp-body${needsAlcohol ? ' igp-body--alcohol' : ''}">
        ${state.p_eyebrow ? `<div class="igp-eyebrow">${H(state.p_eyebrow)}</div>` : ''}
        <h2 class="igp-h2">${hl(state.p_zh)}</h2>
        ${state.showEn && state.p_en ? `<div class="igp-en">${H(state.p_en)}</div>` : ''}
        ${state.p_note ? `<div class="igp-note">${H(state.p_note)}</div>` : ''}
        ${state.p_desc ? `<p class="igp-desc">${H(state.p_desc)}</p>` : ''}
        <div class="igp-spacer"></div>
        <div class="igp-price-row">
          <span class="igp-price-label">${H(state.p_unit || '')}</span>
          <span class="igp-price"><sup>$</sup>${H(state.p_price)}</span>
        </div>
        ${state.showMember && state.p_emo ? `<div class="igp-member"><span class="tag">會員</span><span>會員價</span><b><sup style="font-size:.5em">$</sup>${H(state.p_emo)}</b></div>` : ''}
        ${foot()}
      </div>` + band;
  }

  function renderEvent() {
    const sq = state.format === 'square';
    const photoH = sq ? 380 : 520;
    const photo = state.photo ? `<div class="igp-photo" style="height:${photoH}px;background-image:url('${state.photo}')"></div>` : '';
    return `<div class="igp-body" style="${state.photo ? 'padding-top:60px' : ''}">
        <div class="igp-eyebrow">Event · 活動預告</div>
        <h2 class="igp-h2" style="font-size:${sq ? 84 : 96}px">${hl(state.e_title)}</h2>
        <div class="igp-meta">
          <div class="r"><span class="lbl">時間</span><span>${H(state.e_when)}</span></div>
          <div class="r"><span class="lbl">地點</span><span>${H(state.e_place)}</span></div>
        </div>
        ${state.e_desc ? `<p class="igp-desc">${H(state.e_desc)}</p>` : ''}
        ${photo ? `<div style="margin-top:44px">${photo}</div>` : '<div class="igp-spacer"></div>'}
        ${foot()}
      </div>`;
  }

  function renderQuote() {
    const sq = state.format === 'square';
    return `<div class="igp-quote">
        <div class="mk">「</div>
        <div class="tx" style="font-size:${sq ? 80 : 96}px">${H(state.q_text)}</div>
        ${state.q_sub ? `<div class="sb">${H(state.q_sub)}</div>` : ''}
        ${state.q_by ? `<div class="by">${H(state.q_by)}　·　${H(state.handle)}</div>` : ''}
      </div>`;
  }

  function postInner() {
    const k = currentTypeKey();
    if (k === 'product') return renderProduct();
    if (k === 'event') return renderEvent();
    return renderQuote();
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
          .concat(MENU().map(m => `<option value="${H(m.id)}" ${m.id === state.p_menuId ? 'selected' : ''}>${H(m.cat)}｜${H(m.zh)} $${m.price}${m.published ? '' : '（未發布）'}${m.alcohol ? '　🔞' : ''}</option>`)).join('')}</select></label>
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
      <label>時間<input data-k="e_when" value="${H(state.e_when)}" placeholder="例：8/9（日）19:00"></label>
      <label>地點<input data-k="e_place" value="${H(state.e_place)}"></label>
      <label>說明<textarea data-k="e_desc">${H(state.e_desc)}</textarea></label>`,
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
      const overflow = [node, ...node.querySelectorAll('.igp-body,.igp-quote')]
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

  function shell() {
    return `<div class="ig-wrap">
        <div class="ig-form">
        <div class="ig-seg" id="ig-type">
          <button data-type="product" class="${currentTypeKey() === 'product' ? 'on' : ''}">單品／價目</button>
          <button data-type="event" class="${currentTypeKey() === 'event' ? 'on' : ''}">活動預告</button>
          <button data-type="quote" class="${currentTypeKey() === 'quote' ? 'on' : ''}">金句／字</button>
        </div>
        <div class="ig-seg" id="ig-format">
          <button data-fmt="portrait" class="${state.format === 'portrait' ? 'on' : ''}">直式 1080×1350</button>
          <button data-fmt="square" class="${state.format === 'square' ? 'on' : ''}">方形 1080×1080</button>
        </div>
        <div class="ig-toggles">
          <label><input type="checkbox" data-t="dark"${state.dark ? ' checked' : ''}> 暗底</label>
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

    host.querySelectorAll('#ig-type button').forEach(b => b.onclick = () => {
      const map = TYPE_MAP[b.dataset.type];
      state.category = map.category;
      state.variant = map.variant;
      host.querySelectorAll('#ig-type button').forEach(x => x.classList.toggle('on', x === b));
      renderForm(); renderPreview();
    });
    host.querySelectorAll('#ig-format button').forEach(b => b.onclick = () => {
      state.format = b.dataset.fmt;
      host.querySelectorAll('#ig-format button').forEach(x => x.classList.toggle('on', x === b));
      host.querySelector('#ig-cap').textContent = `預覽為縮小顯示，下載為實際 ${DIMS[state.format].w}×${DIMS[state.format].h} 像素。`;
      renderPreview();
    });
    host.querySelectorAll('[data-t]').forEach(c => c.onchange = e => { state[e.target.dataset.t] = e.target.checked; renderPreview(); });
    host.querySelectorAll('[data-k2]').forEach(inp => inp.oninput = e => { state[e.target.dataset.k2] = e.target.value; renderPreview(); });

    const drop = host.querySelector('#ig-drop'), file = host.querySelector('#ig-file');
    drop.onclick = () => file.click();
    file.onchange = e => readPhoto(e.target.files[0]);
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); readPhoto(e.dataTransfer.files[0]); };

    host.querySelector('#ig-dl').onclick = download;

    renderForm(); renderPreview();
    if (!mount._resize) { mount._resize = true; window.addEventListener('resize', () => stage && sizeStage()); }
  }

  window.IGStudio = { mount, resize: sizeStage };
})();
