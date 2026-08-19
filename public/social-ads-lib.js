'use strict';
/* 社群廣告建議引擎（純函式，無 DOM 相依；後台社群分頁與 Node 測試共用）。
   規則依《言文字_IG品牌重新上市行銷策略方案_2026》§08 付費媒體策略編碼：
   三層廣告結構、四期釋放節奏、每貼適投評分與 48–72 小時自然觀察原則。 */
(function (global) {
  const TOTAL_BUDGET = 100000;

  // 三層廣告結構（Meta Ads Manager 統一建立；廣告只放大、不拯救沒吸引力的內容）
  // 2026-08-17 策略定版：開幕後轉換權重加大（24k／18k／8k）
  const LAYERS = [
    {
      key: 'awareness', name: '陌生觸及', budget: 24000,
      audience: '24–39 歲；台北與通勤新北；廣泛受眾（不用興趣標籤切細）',
      goal: '形成認知、影片觀看、個人檔案瀏覽',
      creatives: '品牌宣言、受眾痛點、空間故事',
    },
    {
      key: 'retarget', name: '互動再行銷', budget: 18000,
      audience: 'IG 互動者、影片觀看者、網站訪客、既有活動名單',
      goal: '優先通知、會員轉換',
      creatives: '空間揭露、店裡的人、真實體驗',
    },
    {
      key: 'action', name: '具體行動', budget: 8000,
      audience: '高互動者與表單訪客',
      goal: '報名、包場詢問與到店',
      creatives: '節慶檔期、活動、會員與包場',
    },
  ];

  // 五期釋放節奏（合計 $50,000；2026-08-17 策略定版：10 月起投、綁節慶檔期，
  // 依據 10_品牌與對外溝通/IG發文策略_2026Q4.md）
  const RELEASE = [
    { from: '2026-10-01', to: '2026-10-12', budget: 6000, phase: '雙十連假', task: '北車人流圈新址揭露＋開幕預告，導追蹤與會員預告名單' },
    { from: '2026-10-13', to: '2026-10-26', budget: 3000, phase: '試營運（低調）', task: '只投互動再行銷，不衝陌生流量' },
    { from: '2026-10-27', to: '2026-11-09', budget: 16000, phase: '萬聖＋開幕', task: '全年最重注：萬聖夜酒吧內容接開幕衝刺' },
    { from: '2026-11-10', to: '2026-12-14', budget: 10000, phase: '營運轉換＋尾牙季', task: '再行銷轉會員；三樓包場（尾牙）行動型廣告' },
    { from: '2026-12-15', to: '2026-12-31', budget: 15000, phase: '聖誕＋跨年', task: '聖誕特調檔；「跨年後，來坐坐」北車跨年散場人流' },
  ];

  // 內容系列 → 適投基準分與預設層級
  const SERIES_RULES = {
    '25–35 歲的生活難題': { base: 85, layer: 'awareness', why: '受眾痛點題最適合陌生觸及——與你無關也想分享收藏' },
    'KK 的建造日記': { base: 75, layer: 'awareness', why: '品牌宣言與建造故事適合陌生觸及，建立認知與信任' },
    '平常不會遇到的人': { base: 70, layer: 'retarget', why: '人物與真實體驗對已互動受眾最有說服力' },
    '空間逐步解鎖': { base: 65, layer: 'retarget', why: '空間揭露適合再行銷，推進優先通知與試營運登記' },
    '產品與活動': { base: 60, layer: 'action', why: '明確行動入口，投放給高互動者與表單訪客做轉換' },
  };

  function layerOf(key) {
    return LAYERS.find(l => l.key === key) || LAYERS[0];
  }

  // 排程日期落在哪一期（收 'YYYY-MM-DD...' 開頭字串）
  function periodOf(dateStr) {
    const d = String(dateStr || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return RELEASE.find(p => d >= p.from && d <= p.to) || null;
  }

  // 單貼適投建議。post: { platform, post_type, status, series, scheduled_at, metrics }
  // allPosts 供同期預算分攤與成效中位數比較（可省略）。
  function recommendAd(post, allPosts) {
    const p = post || {};
    if (p.platform !== 'ig') {
      return {
        eligible: false, score: 0, suitability: '不適投',
        reason: '本次付費媒體策略只投 Meta（IG）；X 貼文不在投放範圍。',
      };
    }
    const rule = SERIES_RULES[p.series] || { base: 55, layer: 'awareness', why: '未標系列，先以陌生觸及測試' };
    let score = rule.base;
    const rationale = [rule.why];
    if (p.post_type === 'carousel') { score += 5; rationale.push('輪播利於收藏與逐頁停留，適合投放'); }
    const period = periodOf(p.scheduled_at);
    if (!period) rationale.push('排程日期不在 10/1–12/31 釋放期內，建議併入最近一期或不投');
    const layer = layerOf(rule.layer);
    // 開幕後（10/27 起）：轉換權重加大，行動型內容加權
    if (period && period.from >= '2026-10-27' && rule.layer === 'action') { score += 10; rationale.push('開幕後轉換權重加大，行動型內容是預算重心'); }
    score = Math.max(0, Math.min(100, score));
    const suitability = score >= 80 ? '高' : score >= 65 ? '中' : '低';

    // 同期預算分攤提示：期預算 / 同期可投貼數，依適投度加減 50%
    let budgetHint = null;
    if (period) {
      const peers = (allPosts || []).filter(x => x.platform === 'ig' && periodOf(x.scheduled_at) === period);
      const n = Math.max(1, peers.length || 1);
      const base = period.budget / n;
      const mult = suitability === '高' ? 1.5 : suitability === '中' ? 1 : 0.5;
      budgetHint = Math.round(base * mult / 100) * 100;
    }

    return {
      eligible: true, score, suitability,
      layer: layer.name, layerKey: layer.key,
      audience: layer.audience, goal: layer.goal,
      period, budgetHint, rationale,
      checklist: [
        '先自然投放 48–72 小時，依分享/收藏/個人檔案瀏覽決定是否放大',
        '每支廣告只留一個 CTA',
        '同一概念至少測兩種開頭（封面），預算集中到勝出版',
        '導流連結加 UTM，落到「試營運優先通知」單一入口',
      ],
    };
  }

  // 成效判讀：分享率/收藏率 vs 已發布貼文近 10 篇中位數（手動輸入的 metrics）
  // metrics: { reach, shares, saves, nonFollowerPct, profileVisits, follows }
  function rateOf(m, key) {
    const reach = Number(m && m.reach);
    const v = Number(m && m[key]);
    if (!reach || reach <= 0 || !Number.isFinite(v)) return null;
    return v / reach;
  }

  function median(nums) {
    const a = nums.filter(n => Number.isFinite(n)).sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  // 回傳 { flag: '值得放大'|'觀察中'|'不放大'|'缺數據', notes: [...] }
  function amplifyAdvice(post, allPosts) {
    const m = (post && post.metrics) || {};
    const share = rateOf(m, 'shares');
    const save = rateOf(m, 'saves');
    if (share == null && save == null) {
      return { flag: '缺數據', notes: ['發布 48–72 小時後，回填觸及/分享/收藏再判讀'] };
    }
    const published = (allPosts || [])
      .filter(x => x.status === 'published' && x.id !== (post && post.id) && x.platform === 'ig')
      .slice(-10);
    const shareMed = median(published.map(x => rateOf(x.metrics || {}, 'shares')));
    const saveMed = median(published.map(x => rateOf(x.metrics || {}, 'saves')));
    const notes = [];
    let wins = 0, comparisons = 0;
    if (share != null && shareMed != null) { comparisons++; if (share >= shareMed) { wins++; notes.push('分享率高於近 10 篇中位數'); } }
    if (save != null && saveMed != null) { comparisons++; if (save >= saveMed) { wins++; notes.push('收藏率高於近 10 篇中位數'); } }
    const nonFollower = Number(m.nonFollowerPct);
    if (Number.isFinite(nonFollower)) {
      notes.push(nonFollower >= 60 ? '非粉絲觸及 ≥60%，已突破既有圈層' : '非粉絲觸及 <60%，仍在同溫層');
    }
    if (!comparisons) return { flag: '觀察中', notes: ['尚無足夠已發布貼文可比較，累積 3 篇以上再判讀'] };
    const flag = wins === comparisons ? '值得放大' : wins > 0 ? '觀察中' : '不放大';
    if (flag === '值得放大') notes.push('可用機動預算或當期預算放大此素材');
    if (flag === '不放大') notes.push('先修正題目與開頭，不急著追加廣告');
    return { flag, notes };
  }

  // 廣告總覽（預算表 + 目前所在期）
  function budgetPlan(todayStr) {
    const today = String(todayStr || '').slice(0, 10);
    return {
      total: TOTAL_BUDGET,
      adTotal: RELEASE.reduce((s, p) => s + p.budget, 0),
      layers: LAYERS,
      release: RELEASE.map(p => Object.assign({ current: !!today && today >= p.from && today <= p.to }, p)),
      allocation: [
        { item: 'Meta 廣告', amount: 50000, pct: 50 },
        { item: '創作者合作', amount: 20000, pct: 20 },
        { item: '關鍵影像製作', amount: 15000, pct: 15 },
        { item: '試營運 UGC', amount: 10000, pct: 10 },
        { item: '機動預算', amount: 5000, pct: 5 },
      ],
    };
  }

  global.SocialAdsLib = {
    TOTAL_BUDGET, LAYERS, RELEASE, SERIES_RULES,
    periodOf, recommendAd, amplifyAdvice, budgetPlan, median, rateOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
