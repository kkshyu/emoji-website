// scripts/test-taishin.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { signPayload, stamp, TRANS_TYPE, API_ROOT } = require('../lib/taishin.js');

// 台新申請單 v2.5 Q8 的官方範例，簽章算錯就會在這裡爆。
const GOLDEN = {
  fields: {
    Trans_Acct: 'T6014002801',
    Trans_Type: '01',
    Trans_Orderid: '20250324211334349685',
    Trans_Timestamp: '20250408121747',
  },
  token: 'ef7023ee23594b60a9fdb5ac723ddef1d946846c1d6a4cce9c58b7d8b9edc5a8',
  hmac: '7f7a2afeec9f91716b69e6ac1c1025f8f70a991fdf2fe90d099778b1f4322ba0',
};

test('簽章符合台新官方範例', () => {
  assert.equal(signPayload(GOLDEN.fields, GOLDEN.token), GOLDEN.hmac);
});

test('欄位順序不影響簽章——簽章前一律排序', () => {
  const shuffled = {
    Trans_Timestamp: GOLDEN.fields.Trans_Timestamp,
    Trans_Type: GOLDEN.fields.Trans_Type,
    Trans_Acct: GOLDEN.fields.Trans_Acct,
    Trans_Orderid: GOLDEN.fields.Trans_Orderid,
  };
  assert.equal(signPayload(shuffled, GOLDEN.token), GOLDEN.hmac);
});

test('token 未設定時拋錯，不得產出可送出的簽章', () => {
  assert.throws(() => signPayload(GOLDEN.fields, ''), /token/);
  assert.throws(() => signPayload(GOLDEN.fields, undefined), /token/);
});

test('時間戳為 yyyyMMddHHmmss 且補零', () => {
  assert.equal(stamp(new Date(2025, 3, 8, 12, 17, 47)), '20250408121747');
  assert.equal(stamp(new Date(2026, 0, 2, 3, 4, 5)), '20260102030405');
});

test('環境與交易類型常數不被誤改', () => {
  assert.equal(API_ROOT.test, 'https://mcss-t.taishinbank.com.tw/MCSSAPI');
  assert.equal(API_ROOT.prod, 'https://mcss.taishinbank.com.tw/MCSSAPI');
  assert.equal(TRANS_TYPE.SCAN_OUT, '01');
  assert.equal(TRANS_TYPE.SCAN_IN, '02');
});
