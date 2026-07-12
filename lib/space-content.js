'use strict';

const FLOORS = [1, 2, 3, 4];
const LANGS = ['zh', 'en', 'ja'];

function spaceBodyKey(floor, lang) {
  return `space_${floor}f_${lang}`;
}

function spaceImageKey(floorOrHero) {
  if (floorOrHero === 'hero') return 'space_hero_image';
  return `space_${floorOrHero}f_image`;
}

function resolveFloorMarkdown(content, floor, lang) {
  const c = content || {};
  const primary = String(c[spaceBodyKey(floor, lang)] || '').trim();
  if (primary) return primary;
  if (lang === 'zh') return String(c[`space_${floor}f`] || '').trim();
  return '';
}

function resolveSpaceImage(content, floorOrHero) {
  const c = content || {};
  return String(c[spaceImageKey(floorOrHero)] || '').trim();
}

/** 顧客向短文；對齊 CIS 語氣；二樓禁用住宿用語。實作時可微調文句，但測試禁止禁用詞。 */
const SPACE_SEED = {
  space_1f_zh: `白天是明亮的日式簡餐與手沖咖啡，設外帶視窗；入夜燈光轉暖，成為深夜食堂與酒吧。

- 約 25 坪；內用約 20–30 席、長吧檯、外帶視窗
- 白日咖啡，入夜為酒
- 不用會員，一杯咖啡就是入場券`,
  space_1f_en: `By day: Japanese set meals and pour-over coffee, with a takeout window. After dark the lights warm — late-night shokudō and bar.

- About 25 ping; 20–30 seats, long counter, takeout window
- Open to everyone — a coffee is your ticket in`,
  space_1f_ja: `昼は明るい日式定食とハンドドリップ。テイクアウト窓口あり。夜は灯りを落とし、深夜食堂とバーへ。

- 約25坪、20〜30席、ロングカウンター
- 会員でなくても、一杯のコーヒーから`,
  space_2f_zh: `會員專屬樓層：人臉辨識進出。膠囊休憩席、淋浴、遊樂室（Switch、桌遊、麻將），也可包場聚會。

- 約 28 坪；休憩與遊樂分區、隔音加強
- 席位掃 QR 自助登記計時；非密閉、不可上鎖
- 僅供會員休憩與活動`,
  space_2f_en: `Members-only floor with face-entry access. Capsule rest berths, showers, and a play room (Switch, board games, mahjong) — also bookable for gatherings.

- About 28 ping; rest and play zones with stronger sound isolation
- QR check-in per berth; open berths, not lockable
- Member rest and recreation — not lodging`,
  space_2f_ja: `会員専用フロア。顔認証で入退室。カプセル休憩席、シャワー、遊戯室（Switch・ボードゲーム・麻雀）。貸切も可。

- 約28坪。休憩と遊戯を分け、遮音を強化
- 席ごとにQRで登記・計時。密閉不可・施錠不可
- 会員の休憩と交流のための空間であり、宿泊ではない`,
  space_3f_zh: `老屋斜屋頂與木樑下的共享辦公與活動場。桌椅可移，白天專心工作，晚上變成講座與社群活動。

- 約 28 坪；大投影、自助點心吧、充足插座與高速網路
- 可切分為小組討論區；包場另議`,
  space_3f_en: `Coworking and events under the old timber roof. Furniture moves for focus work by day and talks or community nights after hours.

- About 28 ping; large projection, snack bar, power and fast wifi
- Subdividable discussion zones; private hire available`,
  space_3f_ja: `古い斜屋根と木梁の下で、シェアオフィスとイベント。家具は動かせ、昼は集中、夜は講座やコミュニティの場に。

- 約28坪。大型投影、スナックバー、電源と高速回線
- 小組に分けられ、貸切も相談可`,
  space_4f_zh: `頂樓附屬支援：洗衣與戶外吸菸區。不計營收，只為全棟動線服務。

- 約 8 坪（含陽台）
- 洗衣機設於四樓，減少穿越三樓社群區
- 非會員至四樓採臨時通行控管`,
  space_4f_en: `Rooftop support: laundry and an outdoor smoking area. Not a revenue floor — it serves the whole building.

- About 8 ping including balcony
- Laundry upstairs to avoid cutting through the 3F community floor
- Non-members use temporary pass codes when needed`,
  space_4f_ja: `屋上の支援機能：洗濯と屋外喫煙スペース。売上計上なし。棟全体の動線のため。

- 約8坪（バルコニー含む）
- 洗濯機は4Fへ。3Fコミュニティを横切らない配置
- 非会員は一時通行で管理`,
};

function missingSpaceSeedKeys(existingContent) {
  const c = existingContent || {};
  const miss = [];
  for (const f of FLOORS) {
    for (const lang of LANGS) {
      const k = spaceBodyKey(f, lang);
      if (!String(c[k] || '').trim()) miss.push(k);
    }
  }
  return miss;
}

module.exports = {
  FLOORS,
  LANGS,
  spaceBodyKey,
  spaceImageKey,
  resolveFloorMarkdown,
  resolveSpaceImage,
  SPACE_SEED,
  missingSpaceSeedKeys,
};
