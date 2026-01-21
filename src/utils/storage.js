// src/utils/storage.js
const STORE = new Map();
const FREE_USAGE = new Map();
const FREE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function ensure(userId) {
  if (!STORE.has(userId)) {
    STORE.set(userId, {
      step: "idle",
      plan: null, // free|pro|premium
      paid: false,
      consentPd: false,
      consentThird: false,
      supportContact: null,
      supportContactType: null,
      restartNoticeSeenId: 0,
    });
  }
  return STORE.get(userId);
}

export function getState(userId) {
  return ensure(userId);
}

export function setState(userId, patch) {
  const st = ensure(userId);
  Object.assign(st, patch || {});
  STORE.set(userId, st);
  return st;
}

export function resetUserData(userId) {
  STORE.delete(userId);
}

export function canUseFreeTariff(userId, now = Date.now()) {
  const lastUsed = FREE_USAGE.get(userId);
  if (!lastUsed) return true;
  return now - lastUsed >= FREE_PERIOD_MS;
}

export function markFreeTariffUsage(userId, now = Date.now()) {
  FREE_USAGE.set(userId, now);
}

export function getNextFreeTariffAt(userId, now = Date.now()) {
  const lastUsed = FREE_USAGE.get(userId);
  if (!lastUsed) return null;
  const nextAt = lastUsed + FREE_PERIOD_MS;
  if (nextAt <= now) return null;
  return new Date(nextAt);
}

export function acceptAllConsents(userId) {
  const st = ensure(userId);
  st.consentPd = true;
  st.consentThird = true;
  st.step = "idle";
  STORE.set(userId, st);
  return st;
}

// если нужно блокировать обработку фото до согласий
export function canAcceptPhoto(userId) {
  const st = ensure(userId);
  return !!(st.consentPd && st.consentThird);
}

// DB deletion (optional)
export async function deleteUserDataFromDB(pool, userId) {
  if (!pool) return;
  // здесь только пример — добавишь реальные таблицы по мере появления
  // await pool.query("DELETE FROM user_photos WHERE user_id=$1", [userId]);
  // await pool.query("DELETE FROM user_reports WHERE user_id=$1", [userId]);
  return;
}
