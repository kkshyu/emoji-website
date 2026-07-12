/* 言文字菜單資料 — 價格來自封存 legacy menu，尚未經菜單 owner 核定——後台 UI 須標「僅內部預覽」。
   SNACK：legacy PDF 為全影像，無法可靠還原；暫無 SNACK 品項，待補。
   舊產品照非 CIS 風格，故不內建圖片；照片由後台上傳。 */
'use strict';
window.MENU_DATA = [
  // ── COFFEE ──
  { cat:'COFFEE',   zh:'美式咖啡',       en:'AMERICANO',            price:170, emo:150, alcohol:false },
  { cat:'COFFEE',   zh:'拿鐵咖啡',       en:'LATTE',                price:200, emo:180, alcohol:false },
  { cat:'COFFEE',   zh:'卡布奇諾',       en:'CAPPUCCINO',           price:200, emo:180, alcohol:false },
  { cat:'COFFEE',   zh:'西西里咖啡',     en:'ESPRESSO ROMANO',      price:200, emo:180, alcohol:false },
  { cat:'COFFEE',   zh:'手沖咖啡',       en:'POUR OVER COFFEE',     price:220, emo:200, alcohol:false },
  { cat:'COFFEE',   zh:'維也納咖啡',     en:'VIENNESE COFFEE',      price:220, emo:200, alcohol:false },
  { cat:'COFFEE',   zh:'貝里斯拿鐵',     en:'BELIZE LATTE',         price:220, emo:200, note:'含酒精', alcohol:true },
  { cat:'COFFEE',   zh:'愛爾蘭咖啡',     en:'IRISH COFFEE',         price:220, emo:200, note:'含酒精', alcohol:true },
  { cat:'COFFEE',   zh:'風味拿鐵',       en:'FLAVORED LATTE',       price:210, emo:190, note:'黑糖 / 焦糖', alcohol:false },
  // ── BEVERAGE ──
  { cat:'BEVERAGE', zh:'牛奶',           en:'MILK',                 price:170, emo:150, note:'黑糖 / 焦糖 / 芒果 / 荔枝', alcohol:false },
  { cat:'BEVERAGE', zh:'氣泡飲',         en:'SPARKLING',            price:200, emo:180, note:'芒果 / 荔枝 / 莓果 / 蜜桃 / 紅柚 / 鳳梨', alcohol:false },
  { cat:'BEVERAGE', zh:'壺裝茶',         en:'TEA',                  price:220, emo:200, note:'果茶 / 草本茶 / 布蕾紅茶', alcohol:false },
  { cat:'BEVERAGE', zh:'極品可可拿鐵',   en:'COCOA LATTE',          price:240, emo:220, alcohol:false },
  { cat:'BEVERAGE', zh:'玄米抹茶拿鐵',   en:'GENMAICHA LATTE',      price:240, emo:220, alcohol:false },
  // ── ALCOHOL ──
  { cat:'ALCOHOL',  zh:'台灣啤酒',       en:'TAIWAN BEER',          price:200, emo:150, alcohol:true },
  { cat:'ALCOHOL',  zh:'精釀啤酒',       en:'CRAFT BEER',           price:250, emo:200, alcohol:true },
  { cat:'ALCOHOL',  zh:'琴通寧',         en:'GIN TONIC',            price:300, emo:250, alcohol:true },
  { cat:'ALCOHOL',  zh:'高球',           en:'HIGH BALL',            price:300, emo:250, alcohol:true },
  { cat:'ALCOHOL',  zh:'螺絲起子',       en:'SCREWDRIVER',          price:300, emo:250, alcohol:true },
  { cat:'ALCOHOL',  zh:'特調',           en:'SIGNATURE',            price:350, emo:300, alcohol:true },
  // ── FOOD ──
  { cat:'FOOD',     zh:'就是炒泡麵',     en:'FRIED INSTANT NOODLES',price:200, emo:180, alcohol:false },
  { cat:'FOOD',     zh:'實力水餃',       en:'10 DUMPLINGS',         price:200, emo:180, alcohol:false },
  { cat:'FOOD',     zh:'氣炸薯條',       en:'FRENCH FRIES',         price:180, emo:150, alcohol:false },
  { cat:'FOOD',     zh:'萬惡炸雞塊',     en:'FRIED CHICKEN NUGGETS',price:180, emo:150, alcohol:false },
  { cat:'FOOD',     zh:'牛肉/雞肉捲',    en:'BEEF/CHICKEN ROLL',    price:180, emo:150, alcohol:false },
  { cat:'FOOD',     zh:'五吋小披薩',     en:'5" SMALL PIZZA',       price:180, emo:150, note:'燻雞 / 海鮮 / 總匯', alcohol:false },
];
