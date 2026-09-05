'use strict';

const EVENT_STATUSES = ['草稿', '報名中', '已結束'];
const EVENT_VISIBILITIES = ['public', 'private'];

function eventSlug(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function normalizeEventInput(body = {}) {
  const title = String(body.title || '').trim();
  if (!title) return { error: '請輸入活動名稱。' };

  const startsAt = body.starts_at ? new Date(body.starts_at) : null;
  const endsAt = body.ends_at ? new Date(body.ends_at) : null;
  if (startsAt && Number.isNaN(+startsAt)) return { error: '活動開始時間格式不正確。' };
  if (endsAt && Number.isNaN(+endsAt)) return { error: '活動結束時間格式不正確。' };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: '活動結束時間必須晚於開始時間。' };

  const capacity = Number(body.capacity || 0);
  const priceTwd = Number(body.price_twd || 0);
  if (!Number.isInteger(capacity) || capacity < 0) return { error: '活動名額必須是 0 以上的整數。' };
  if (!Number.isInteger(priceTwd) || priceTwd < 0) return { error: '票價必須是 0 以上的整數。' };

  const slug = body.slug == null ? '' : eventSlug(body.slug);
  if (body.slug && slug.length < 3) return { error: '活動網址代稱至少需要 3 個有效字元。' };

  return { value: {
    title,
    description: String(body.description || '').trim(),
    location: String(body.location || '').trim(),
    startsAt,
    endsAt,
    capacity,
    priceTwd,
    slug,
    visibility: EVENT_VISIBILITIES.includes(body.visibility) ? body.visibility : 'public',
    status: EVENT_STATUSES.includes(body.status) ? body.status : '報名中',
  } };
}

module.exports = { EVENT_STATUSES, EVENT_VISIBILITIES, eventSlug, normalizeEventInput };
