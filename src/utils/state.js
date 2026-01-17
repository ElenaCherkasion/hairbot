// src/utils/state.js
const userState = new Map(); // userId -> { step, temp? }

export function setState(userId, patch) {
  userState.set(userId, { ...(userState.get(userId) || {}), ...patch });
}

export function getState(userId) {
  return userState.get(userId) || {};
}

export function clearState(userId) {
  userState.delete(userId);
}
