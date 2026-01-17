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

export function resetUserData(userId) {
  store.set(userId, { ...defaultState(), deleted: true });
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function acceptAllConsents(userId) {
  const now = new Date().toISOString();
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
