// src/utils/storage.js
import crypto from "crypto";
import textTemplates, { DOC_VERSIONS } from "./text-templates.js";

const store = new Map(); // userId -> state

function defaultState() {
  return {
    step: "idle",
    plan: null, // free|pro|premium
    paid: false,
    deleted: false,

    consentPd: false,
    consentThird: false,
    consentPdAt: null,
    consentThirdAt: null,
    consentPdVersion: null,
    consentThirdVersion: null,
    consentPdHash: null,
    consentThirdHash: null,

    lastPhotoMeta: null,
  };
}

/**
 * Получить состояние пользователя
 */
export function getState(userId) {
  return store.get(userId) || defaultState();
}

/**
 * Обновить состояние пользователя
 */
export function setState(userId, patch) {
  store.set(userId, { ...getState(userId), ...patch });
}

/**
 * Сбросить данные пользователя в памяти и пометить удалённым
 */
export function resetUserData(userId) {
  store.set(userId, { ...defaultState(), deleted: true });
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Принять все согласия (для обработки фото)
 * storage.js ожидает, что:
 * - DOC_VERSIONS.consent_pd / consent_third существуют
 * - textTemplates.docs.consentPd / consentThird существуют
 */
export function acceptAllConsents(userId) {
  const now = new Date().toISOString();

  // защита от отсутствующих полей (чтобы не падало)
  const consentPdText = textTemplates?.docs?.consentPd || "consentPd";
  const consentThirdText = textTemplates?.docs?.consentThird || "consentThird";

  setState(userId, {
    consentPd: true,
    consentThird: true,
    consentPdAt: now,
    consentThirdAt: now,
    consentPdVersion: DOC_VERSIONS?.consent_pd || DOC_VERSIONS?.current || "unknown",
    consentThirdVersion: DOC_VERSIONS?.consent_third || DOC_VERSIONS?.current || "unknown",
    consentPdHash: sha256(consentPdText),
    consentThirdHash: sha256(consentThirdText),
    step: "awaiting_photo",
    deleted: false,
  });
}

/**
 * Можно ли принимать фото (платный пользователь + согласия + не удалён)
 */
export function canAcceptPhoto(userId) {
  const st = getState(userId);
  return st.paid && st.consentPd && st.consentThird && !st.deleted;
}

/**
 * ===============================
 * АВТО-УДАЛЕНИЕ ДАННЫХ ИЗ БД
 * ===============================
 * pool — это pg.Pool
 * Удаляем user_id из белого списка таблиц.
 * Если таблицы нет — пропускаем.
 */
export async function deleteUserDataFromDB(pool, userId) {
  if (!pool) throw new Error("deleteUserDataFromDB: pool is required");
  if (!userId) throw new Error("deleteUserDataFromDB: userId is required");

  const TABLES_TO_CLEAN = [
    "free_usage",
    "error_reports",
    "user_consents",
    "user_profiles",
    "user_sessions",
    "user_limits",
    "user_photos",
    "pdf_reports",
    "generations",
    "payments",
  ];

  for (const table of TABLES_TO_CLEAN) {
    try {
      await pool.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    } catch (e) {
      const msg = String(e?.message || "");
      if (!msg.includes("does not exist")) {
        console.warn(`⚠️ deleteUserDataFromDB: table=${table} err=${msg}`);
      }
    }
  }
}
