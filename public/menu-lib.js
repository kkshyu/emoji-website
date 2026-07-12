'use strict';
(function (global) {
  const CATS = ['COFFEE', 'BEVERAGE', 'ALCOHOL', 'FOOD', 'SNACK'];
  const uid = () => 'm_' + Math.random().toString(36).slice(2, 10);

  function emptyItems() {
    if (typeof console !== 'undefined' && console.log) {
      try {
        return new (console.log.constructor('return Array')())();
      } catch { /* browser / no vm bridge */ }
    }
    return [];
  }

  function coerceAlcohol(item) {
    if (item.cat === 'ALCOHOL') return true;
    if (item.note && String(item.note).includes('酒精')) return true;
    return !!item.alcohol;
  }

  function normalizeItem(raw) {
    const cat = CATS.includes(raw.cat) ? raw.cat : 'FOOD';
    const price = Number(raw.price); const emo = Number(raw.emo);
    return {
      id: raw.id || uid(),
      cat,
      zh: String(raw.zh || '').trim(),
      en: String(raw.en || '').trim(),
      price: Number.isFinite(price) ? price : 0,
      emo: Number.isFinite(emo) ? emo : 0,
      note: String(raw.note || '').trim(),
      alcohol: coerceAlcohol({ ...raw, cat }),
      published: raw.published === true,
      sort: Number.isFinite(Number(raw.sort)) ? Number(raw.sort) : 0,
    };
  }

  function parseMenuDoc(value) {
    if (!value || !String(value).trim()) return { version: 1, updated_at: null, items: emptyItems() };
    try {
      const j = JSON.parse(value);
      const items = Array.isArray(j.items) ? j.items.map(normalizeItem) : emptyItems();
      return { version: Number(j.version) || 1, updated_at: j.updated_at || null, items };
    } catch {
      return { version: 1, updated_at: null, items: emptyItems() };
    }
  }

  function validateDoc(doc) {
    if (!doc || !Array.isArray(doc.items)) return { ok: false, error: '格式錯誤' };
    if (JSON.stringify(doc).length > 500000) return { ok: false, error: '菜單資料過大' };
    for (const it of doc.items) {
      if (!it.zh) return { ok: false, error: '品名（中）必填' };
      if (!CATS.includes(it.cat)) return { ok: false, error: '分類無效' };
      if (!(it.price >= 0) || !(it.emo >= 0)) return { ok: false, error: '價格無效' };
    }
    return { ok: true };
  }

  function touch(doc) {
    return { ...doc, version: doc.version || 1, updated_at: new Date().toISOString(), items: doc.items.slice() };
  }

  function upsertItem(doc, raw) {
    const item = normalizeItem(raw);
    const next = touch(doc);
    const i = next.items.findIndex(x => x.id === item.id);
    if (i >= 0) next.items[i] = item; else next.items.push(item);
    return next;
  }

  function removeItem(doc, id) {
    const next = touch(doc);
    next.items = next.items.filter(x => x.id !== id);
    return next;
  }

  function publishedOnly(doc) {
    return (doc.items || []).filter(x => x.published);
  }

  function fromSeedRows(rows) {
    const items = (rows || []).map((r, i) => normalizeItem({
      ...r,
      published: false,
      sort: (i + 1) * 10,
      alcohol: r.alcohol === true || r.cat === 'ALCOHOL' || (r.note && String(r.note).includes('酒精')),
    }));
    return touch({ version: 1, items });
  }

  function stringifyDoc(doc) {
    return JSON.stringify(doc);
  }

  function sortItems(items) {
    return items.slice().sort((a, b) => {
      const ca = CATS.indexOf(a.cat) - CATS.indexOf(b.cat);
      if (ca !== 0) return ca;
      return (a.sort - b.sort) || a.zh.localeCompare(b.zh, 'zh-Hant');
    });
  }

  global.MenuLib = {
    CATS, uid, normalizeItem, parseMenuDoc, validateDoc,
    upsertItem, removeItem, publishedOnly, fromSeedRows, stringifyDoc, sortItems, touch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
