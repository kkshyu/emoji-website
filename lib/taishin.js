/* 台新手付 MCSSAPI（ECR 串接）簽章與查詢。
 * 規格來源：台新手付測試環境申請單 v2.5（Q1/Q2 端點、Q8 簽章範例）。
 * 目前僅實作「查詢交易」——收款／退款端點台新尚未提供規格，拿到再補。
 */
'use strict';

const crypto = require('crypto');

const API_ROOT = {
  test: 'https://mcss-t.taishinbank.com.tw/MCSSAPI',
  prod: 'https://mcss.taishinbank.com.tw/MCSSAPI',
};

// 交易類型：正掃 / 反掃 / 其它（NFC）
const TRANS_TYPE = { SCAN_OUT: '01', SCAN_IN: '02', OTHER: '03' };

/* Trans_Hmac：欄位依 key 升冪排序後序列化，尾接「解密後」的 token key，取 SHA256 hex。
 * token 必須是解密後的明文（申請單給的 Token Key 是 AES 密文），不可直接用密文。 */
function signPayload(fields, decryptedToken) {
  if (typeof decryptedToken !== 'string' || !decryptedToken) {
    throw new Error('台新 token key 未設定或未解密');
  }
  const sorted = Object.fromEntries(
    Object.keys(fields).sort().map((k) => [k, fields[k]])
  );
  const canonical = JSON.stringify(sorted);
  return crypto.createHash('sha256').update(canonical + decryptedToken, 'utf8').digest('hex');
}

/* 交易時間戳：yyyyMMddHHmmss（台新格式，無分隔符）。 */
function stamp(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
         `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/* 查詢交易（POST /api/query）。回傳台新原始 JSON，欄位定義以台新回應為準。 */
async function queryTransaction({ acct, orderId, transType, token, env = 'test', timestamp }) {
  const root = API_ROOT[env];
  if (!root) throw new Error(`未知的環境：${env}`);
  const fields = {
    Trans_Acct: acct,
    Trans_Type: transType,
    Trans_Orderid: orderId,
    Trans_Timestamp: timestamp || stamp(),
  };
  const body = { ...fields, Trans_Hmac: signPayload(fields, token) };
  const res = await fetch(`${root}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`台新查詢失敗 HTTP ${res.status}`);
  return res.json();
}

module.exports = { API_ROOT, TRANS_TYPE, signPayload, stamp, queryTransaction };
