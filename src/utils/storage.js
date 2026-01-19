// src/utils/storage.js
const STORE = new Map();

function ensure(userId) {
  if (!STORE.has(userId)) {
    STORE.set(userId, {
      step: "idle",
      plan: null, // free|pro|premium
      consentPd: false,
      consentThird: false,
      supportContact: null,
      supportContactType: null,
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
