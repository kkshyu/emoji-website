/* AI agent 管理金鑰比對：等長 + 定時比對，避免以回應時間反推金鑰。 */
'use strict';

const { safeEqual } = require('./security');

// 低於此長度視同未設定：短金鑰可暴力猜解，寧可停用也不給假的安全感。
const ADMIN_API_KEY_MIN = 24;

function isAdminApiKey(presented, configured) {
  if (typeof configured !== 'string' || configured.length < ADMIN_API_KEY_MIN) return false;
  if (typeof presented !== 'string' || presented.length !== configured.length) return false;
  return safeEqual(presented, configured);
}

module.exports = { isAdminApiKey, ADMIN_API_KEY_MIN };
