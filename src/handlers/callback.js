// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import {
  getState,
  setState,
  resetUserData,
  acceptAllConsents,
  deleteUserDataFromDB,
} from "../utils/storage.js";
import { sendSupportEmail } from "../utils/mailer.js";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function isValidTgUsername(u) {
  const s = String(u || "").trim();
  return /^@?[a-zA-Z0-9_]{5,32}$/.test(s);
}
function normTgUsername(u) {
  const s
