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

export function getState(userId) {
  return store.get(userId) || defaultState();
}

export function setState(userId, patch) {
  store.set(userId, { ...getState(userId), ...patch });
}

/**
 * Сбрасывает локальные данные в памяти (store) и помечает deleted=true.
 * Это НЕ удаление из БД — только in-memory состояние.
 */
export function resetUserData(userId) {
  store.set(userId, { ...defaultState(), deleted: true });
}

/**
 * Полное удаление локального состояния (если хочешь "как будто пользователь новый").
 * Можно использовать после успешного удаления из БД.
 */
export function purgeLocalState(userId) {
  store.delete(userId);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function acceptAllConsents(userId) {
  const now = new Date().toISOString();

  // ВАЖНО: storage.js ожидает, что в DOC_VERSIONS есть ключи:
  // DOC_VERSIONS.consent_pd и DOC_VERSIONS.consent_third
  // и что в textTemplates есть textTemplates.docs.consentPd / consentThird
  setState(userId, {
    consentPd: true,
    consentThird: true,
    consentPdAt: now,
    consentThirdAt: now,
    consentPdVersion: DOC_VERSIONS.consent_pd,
    consentThirdVersion: DOC_VERSIONS.consent_third,
    consentPdHash: sha256(textTemplates.docs.consentPd),
    consentThirdHash: sha256(textTemplates.docs.consentThird),
    step: "awaiting_photo",
    deleted: false,
  });
}

export function canAcceptPhoto(userId) {
  const st = getState(userId);
  return st.paid && st.consentPd && st.consentThird && !st.deleted;
}

/**
 * ===============================
 * АВТО-УДАЛЕНИЕ ДАННЫХ ИЗ БД
 * ===============================
 *
 * pool — это pg.Pool (PostgreSQL).
 * Удаляем user_id из белого списка таблиц. Если таблицы нет — пропускаем.
 * Таблицы перечислены здесь специально (whitelist), чтобы не было SQL-инъекций.
 */
export async function deleteUserDataFromDB(pool, userId) {
  if (!pool) throw new Error("deleteUserDataFromDB: pool is required");
  if (!userId) throw new Error("deleteUserDataFromDB: userId is required");

  // ⚙️ ВАЖНО: впиши сюда реальные таблицы твоего проекта.
  // Те, которых нет — будут пропущены без падения.
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
      // не спамим логами, если таблицы нет
      if (!msg.includes("does not exist")) {
        console.warn(`⚠️ deleteUserDataFromDB: table=${table} err=${msg}`);
      }
    }
  }
}

/**
 * Удобная обёртка: удаляем из БД + чистим локальное состояние.
 * Используй в handler "Удалить данные".
 */
export async function deleteUserEverywhere(pool, userId) {
  await deleteUserDataFromDB(pool, userId);
  purgeLocalState(userId);
}
