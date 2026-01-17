// src/utils/storage.js
import crypto from "crypto";
import textTemplates from "./text-templates.js";

const paidUsers = new Set();
const deletedUsers = new Set();

const consents = new Map(); 
// userId -> { pd: {version, hash, acceptedAt}, third: {version, hash, acceptedAt} }

export function markPaid(userId) {
  paidUsers.add(userId);
}

export function isPaid(userId) {
  return paidUsers.has(userId);
}

export function markDeleted(userId) {
  deletedUsers.add(userId);
  // при удалении: снимаем оплату/согласия
  paidUsers.delete(userId);
  consents.delete(userId);
}

export function isDeleted(userId) {
  return deletedUsers.has(userId);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function acceptAllConsents(userId) {
  const acceptedAt = new Date().toISOString();

  const pdHash = sha256(textTemplates.docs.consentPd.fullText);
  const thirdHash = sha256(textTemplates.docs.consentThird.fullText);

  consents.set(userId, {
    pd: { version: textTemplates.docs.consentPd.version, hash: pdHash, acceptedAt },
    third: { version: textTemplates.docs.consentThird.version, hash: thirdHash, acceptedAt },
  });
}

export function getConsents(userId) {
  return consents.get(userId) || null;
}

export function hasRequiredConsents(userId) {
  const c = consents.get(userId);
  return Boolean(c?.pd?.acceptedAt && c?.third?.acceptedAt);
}
