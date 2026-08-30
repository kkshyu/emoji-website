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
  space_1f_zh: `白天是在咖啡（at cafe）明亮的日式簡餐與手沖咖啡，設外帶視窗；入夜燈光轉暖，切換為三點水（3AM）深夜食堂與餐酒館。這裡是聚落的入口，很多相遇從這一杯開始。

- 約 25.2 坪；內用約 20–30 席、長吧檯、外帶視窗
- 白天在咖啡，入夜三點水
- 不用會員，一杯咖啡就是入場券`,
  space_1f_en: `By day: Japanese set meals and pour-over coffee, with a takeout window. By day it is 在咖啡 (at cafe); after dark the lights warm into 三點水 (3AM), a late-night eatery and bistro. This is the doorway to the hub, where the meetings begin.

- About 25.2 ping; 20–30 seats, long counter, takeout window
- Open to everyone: a coffee is your ticket in`,
  space_1f_ja: `昼は明るい日本式の定食とハンドドリップ。テイクアウト窓口あり。昼は在咖啡（at cafe）、夜は灯りを落として三點水（3AM）の深夜食堂・ビストロへ。ここはタレントハブの入口。出会いは一杯から始まります。

- 約25.2坪、20〜30席、ロングカウンター
- 会員でなくても、一杯のコーヒーから`,
  space_2f_zh: `等等空間（Stay Square）會員專屬樓層：人臉辨識進出。24 小時看書休憩席（含獨立膠囊空間）、淋浴、電動漫畫娛樂室（Switch、漫畫、桌遊、麻將），也可包場聚會。

- 約 29.5 坪；休憩與娛樂分區、隔音加強
- 席位掃 QR 自助登記計時；非密閉、不可上鎖
- 僅供會員休憩與活動`,
  space_2f_en: `等等空間 (Stay Square): members-only floor with face-entry access. 24-hour reading and rest seats (with private capsule pods), showers, and a game and manga room (Switch, manga, board games, mahjong). Also bookable for gatherings.

- About 29.5 ping; rest and play zones with stronger sound isolation
- QR check-in per seat; open pods, not lockable
- Member rest and recreation only`,
  space_2f_ja: `等等空間（Stay Square）会員専用フロア。顔認証で入退室。24時間の読書・休憩席（個室カプセルスペース付き）、シャワー、ゲーム・マンガルーム（Switch・マンガ・ボードゲーム・麻雀）。貸切も可。

- 約29.5坪。休憩と娯楽を分け、遮音を強化
- 席ごとにQRでチェックインし、時間を記録。密閉不可・施錠不可
- 会員の休憩と交流のための空間`,
  space_3f_zh: `等等空間（Stay Square）三樓：老屋斜屋頂、挑高六米的木樑下，是共享辦公與活動場。桌椅可移，白天專心工作，晚上變成講座與社群活動。

- 約 29.9 坪；大投影、自助點心吧、充足插座與高速網路
- 可切分為小組討論區；包場另議`,
  space_3f_en: `Coworking and events under the old timber roof, with a six-meter ceiling. Furniture moves for focus work by day and talks or community nights after hours.

- About 29.9 ping; large projection, self-serve snack counter, power and fast wifi
- Subdividable discussion zones; private hire available`,
  space_3f_ja: `古い斜屋根、天井高6メートルの木梁の下で、シェアオフィスとイベント。家具は動かせ、昼は集中、夜は講座やコミュニティの場に。

- 約29.9坪。大型投影、セルフの軽食コーナー、電源と高速回線
- 小さなグループ席に区切り可。貸切も相談可`,
  space_4f_zh: `頂樓附屬支援：洗衣與戶外吸菸區。不計營收，只為全棟動線服務。

- 約 7.5 坪
- 洗衣機設於附屬設施（頂樓），減少穿越三樓社群區
- 非會員至附屬設施採臨時通行控管`,
  space_4f_en: `Rooftop support: laundry and an outdoor smoking area. Not a revenue floor; it serves the whole building.

- About 7.5 ping
- Laundry upstairs to avoid cutting through the 3F community floor
- Non-members use temporary pass codes when needed`,
  space_4f_ja: `屋上の支援機能：洗濯と屋外喫煙スペース。売上計上なし。棟全体の動線のため。

- 約7.5坪
- 洗濯機は附属施設（屋上）へ。3Fコミュニティを横切らない配置
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
