'use strict';
(function (global) {
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  function isAllowedPhotoType(type) {
    return ALLOWED_PHOTO_TYPES.has(type);
  }

  function sanitizeFilename(name) {
    const base = String(name || 'untitled')
      .replace(/[\/\\?%*:|"<>]/g, '')
      .replace(/[\u0000-\u001f]/g, '')
      .trim() || 'untitled';
    return base.slice(0, 80);
  }

  function computePreviewScale(parentClientWidth, canvasW) {
    if (!parentClientWidth || parentClientWidth < 80) return null;
    const avail = Math.min(parentClientWidth - 4, 460);
    if (avail <= 0) return null;
    return avail / canvasW;
  }

  function contentOverflows(scrollHeight, clientHeight, scrollWidth, clientWidth) {
    const sh = Number(scrollHeight); const ch = Number(clientHeight);
    const sw = Number(scrollWidth); const cw = Number(clientWidth);
    return (Number.isFinite(sh) && Number.isFinite(ch) && sh > ch)
      || (Number.isFinite(sw) && Number.isFinite(cw) && sw > cw);
  }

  function itemNeedsAlcoholBand(item) {
    if (!item) return false;
    if (item.alcohol === true) return true;
    if (item.cat === 'ALCOHOL') return true;
    if (item.note && String(item.note).includes('酒精')) return true;
    return false;
  }

  function alcoholBandHTML(canvasH) {
    const h = Math.ceil(Number(canvasH) * 0.1);
    return `<div class="igp-alcohol" style="height:${h}px;min-height:${h}px;flex:none;display:flex;flex-direction:column;justify-content:center;padding:0 48px;box-sizing:border-box;background:#1B1A17;color:#F4F1EA;font-family:var(--sans);font-size:22px;letter-spacing:.08em;gap:8px;">
    <div>未滿十八歲禁止飲酒</div>
    <div>禁止酒駕</div>
  </div>`;
  }

  function buildDownloadName(title, format) {
    const t = sanitizeFilename(title);
    const f = format === 'square' ? '方形' : '直式';
    return `言文字_IG_${t}_${f}.png`;
  }

  global.IGStudioLib = {
    PHOTO_MAX_BYTES,
    ALLOWED_PHOTO_TYPES,
    isAllowedPhotoType,
    sanitizeFilename,
    computePreviewScale,
    contentOverflows,
    itemNeedsAlcoholBand,
    alcoholBandHTML,
    buildDownloadName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
