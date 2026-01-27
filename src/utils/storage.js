// src/utils/storage.js
import fs from "fs";
import path from "path";

const STORE = new Map();
const FREE_USAGE = new Map();
const FREE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const TICKETS = new Map();
const TICKET_MESSAGES = new Map();
const USERS = new Map();
const PAYMENTS = new Map();
const AUDIT_LOG = [];
const SUPPORT_REPLY_MODES = new Map();
const SUPPORT_SEARCH_MODES = new Map();
const STORE_PATH = path.join(process.cwd(), "data", "store.json");

const ensureStoreDir = () => {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const loadStore = () => {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    (parsed.store || []).forEach(([key, value]) => STORE.set(Number(key), value));
    (parsed.freeUsage || []).forEach(([key, value]) => FREE_USAGE.set(Number(key), value));
    (parsed.tickets || []).forEach(([key, value]) => TICKETS.set(key, value));
    (parsed.ticketMessages || []).forEach(([key, value]) => TICKET_MESSAGES.set(key, value));
    (parsed.users || []).forEach(([key, value]) => USERS.set(Number(key), value));
    (parsed.payments || []).forEach(([key, value]) => PAYMENTS.set(String(key), value));
    (parsed.auditLog || []).forEach((entry) => AUDIT_LOG.push(entry));
  } catch (error) {
    console.error("❌ Failed to load store:", error);
  }
};

const saveStore = () => {
  try {
    ensureStoreDir();
    const payload = {
      store: Array.from(STORE.entries()),
      freeUsage: Array.from(FREE_USAGE.entries()),
      tickets: Array.from(TICKETS.entries()),
      ticketMessages: Array.from(TICKET_MESSAGES.entries()),
      users: Array.from(USERS.entries()),
      payments: Array.from(PAYMENTS.entries()),
      auditLog: AUDIT_LOG,
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("❌ Failed to save store:", error);
  }
};

loadStore();

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
  saveStore();
  return st;
}

export function resetUserData(userId) {
  STORE.delete(userId);
  saveStore();
}

export function canUseFreeTariff(userId, now = Date.now()) {
  const lastUsed = FREE_USAGE.get(userId);
  if (!lastUsed) return true;
  return now - lastUsed >= FREE_PERIOD_MS;
}

export function markFreeTariffUsage(userId, now = Date.now()) {
  FREE_USAGE.set(userId, now);
  saveStore();
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
  saveStore();
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
  saveStore();
  return TICKETS.get(ticket.ticketNumber);
}

export function getTicket(ticketNumber) {
  return TICKETS.get(ticketNumber) || null;
}

export function updateTicket(ticketNumber, patch) {
  if (!ticketNumber || !TICKETS.has(ticketNumber)) return null;
  const next = { ...TICKETS.get(ticketNumber), ...(patch || {}) };
  TICKETS.set(ticketNumber, next);
  saveStore();
  return next;
}

export function appendTicketMessage(entry) {
  if (!entry?.ticketNumber) return null;
  const list = TICKET_MESSAGES.get(entry.ticketNumber) || [];
  list.push({ ...entry });
  TICKET_MESSAGES.set(entry.ticketNumber, list);
  saveStore();
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

export function setSupportSearchMode(operatorId, data) {
  if (!operatorId) return null;
  SUPPORT_SEARCH_MODES.set(operatorId, { ...(data || {}) });
  return SUPPORT_SEARCH_MODES.get(operatorId);
}

export function getSupportSearchMode(operatorId) {
  return SUPPORT_SEARCH_MODES.get(operatorId) || null;
}

export function clearSupportSearchMode(operatorId) {
  SUPPORT_SEARCH_MODES.delete(operatorId);
}

export function upsertUser({ internalUserId, username, name }) {
  if (!Number.isFinite(Number(internalUserId))) return null;
  const key = Number(internalUserId);
  const existing = USERS.get(key) || {};
  const now = Date.now();
  const next = {
    internalUserId: key,
    telegramUsername: username ?? existing.telegramUsername ?? null,
    name: name ?? existing.name ?? null,
    createdAt: existing.createdAt || now,
    deletedAt: existing.deletedAt || null,
  };
  USERS.set(key, next);
  saveStore();
  return next;
}

export function appendAuditLog(entry) {
  if (!entry?.action) return null;
  const next = {
    id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    internalUserId: entry.internalUserId ?? null,
    action: entry.action,
    actor: entry.actor || "system",
    entityType: entry.entityType || null,
    entityId: entry.entityId || null,
    meta: entry.meta || null,
    createdAt: entry.createdAt || Date.now(),
  };
  AUDIT_LOG.push(next);
  saveStore();
  return next;
}

export function upsertPayment(payment) {
  if (!payment?.paymentId) return null;
  const next = { ...payment };
  PAYMENTS.set(payment.paymentId, next);
  saveStore();
  return next;
}

export function listPayments() {
  return Array.from(PAYMENTS.values());
}

export function listAuditLog() {
  return [...AUDIT_LOG];
}
