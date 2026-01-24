// src/utils/storage.js
const STORE = new Map();
const FREE_USAGE = new Map();
const FREE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const TICKETS = new Map();
const TICKET_MESSAGES = new Map();
const SUPPORT_REPLY_MODES = new Map();

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
      supportMode: false,
      supportWriteEnabled: false,
      supportLastTicketNumber: null,
      supportLastTicketCreatedAtMs: null,
      supportLastSentAt: 0,
      supportTicketSeq: 0,
      restartNoticeSeenId: 0,
      offerAccepted: false,
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
  // обращения в поддержку и их логи не удаляются (для хранения истории обращений)
  // await pool.query("DELETE FROM user_photos WHERE user_id=$1", [userId]);
  // await pool.query("DELETE FROM user_reports WHERE user_id=$1", [userId]);
  return;
}

export function createTicket(ticket) {
  if (!ticket?.ticketNumber) return null;
  TICKETS.set(ticket.ticketNumber, { ...ticket });
  return TICKETS.get(ticket.ticketNumber);
}

export function getTicket(ticketNumber) {
  return TICKETS.get(ticketNumber) || null;
}

export function updateTicket(ticketNumber, patch) {
  if (!ticketNumber || !TICKETS.has(ticketNumber)) return null;
  const next = { ...TICKETS.get(ticketNumber), ...(patch || {}) };
  TICKETS.set(ticketNumber, next);
  return next;
}

export function appendTicketMessage(entry) {
  if (!entry?.ticketNumber) return null;
  const list = TICKET_MESSAGES.get(entry.ticketNumber) || [];
  list.push({ ...entry });
  TICKET_MESSAGES.set(entry.ticketNumber, list);
  return entry;
}

export function getTicketMessages(ticketNumber) {
  const list = TICKET_MESSAGES.get(ticketNumber) || [];
  return [...list].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

export function getTicketsByUser(userId, statuses = []) {
  const list = Array.from(TICKETS.values()).filter((ticket) => String(ticket.userId) === String(userId));
  if (!statuses.length) return list;
  return list.filter((ticket) => statuses.includes(ticket.status));
}

export function getTicketsByStatus(statuses = []) {
  if (!statuses.length) return Array.from(TICKETS.values());
  return Array.from(TICKETS.values()).filter((ticket) => statuses.includes(ticket.status));
}

export function setSupportReplyMode(operatorId, data) {
  if (!operatorId) return null;
  SUPPORT_REPLY_MODES.set(operatorId, { ...(data || {}) });
  return SUPPORT_REPLY_MODES.get(operatorId);
}

export function getSupportReplyMode(operatorId) {
  return SUPPORT_REPLY_MODES.get(operatorId) || null;
}

export function clearSupportReplyMode(operatorId) {
  SUPPORT_REPLY_MODES.delete(operatorId);
}
