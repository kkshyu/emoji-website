### Task 7 Report

完成項目：
- 新增 `public/access-mock.html`，可貼 QR token 先 verify，再以 `ACCESS_DOOR_SECRET` 呼叫 scan。
- 後台 `/api/state` 的 admin users 已補 `access_active`、`access_summary`，來源使用 `memberAccessFor()`。
- `public/admin.html` 會員列表新增 Active、權益摘要欄位，CSV 同步新增欄位。
- 後台快速指引新增 `/access-mock` 連結。
- 側欄維持只有 events badge，無 members count badge。

驗證：
- `node --check server.js`
- `npm test`（15 passed）
