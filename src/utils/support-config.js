// src/utils/support-config.js
export const buildSupportConfig = () => {
  const supportMessageTimeoutMs = Number(process.env.SUPPORT_MESSAGE_TIMEOUT_MS || 10000);
  const supportChatIdRaw = process.env.SUPPORT_CHAT_ID ?? "";
  const supportChatId = String(supportChatIdRaw)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[−–—]/g, "-");
  const supportChatIdNum = supportChatId && /^-?\d+$/.test(supportChatId) ? Number(supportChatId) : null;
  const supportTgLink = process.env.SUPPORT_TG_LINK || "";
  const supportMenuLink = (process.env.SUPPORT_MENU_LINK || "").trim();
  const supportAgentUsername = (process.env.SUPPORT_AGENT_USERNAME || "le_cherk").replace(/^@/, "");
  const supportAgentId = Number(process.env.SUPPORT_AGENT_ID || 0) || null;
  const supportTarget =
    Number.isFinite(supportChatIdNum) && supportChatIdNum < 0 && String(supportChatId).startsWith("-100")
      ? supportChatIdNum
      : null;
  const supportTargetReason = (() => {
    if (!supportChatId) return "missing";
    if (!/^-\d+$/.test(supportChatId)) return "non_numeric";
    if (!supportChatId.startsWith("-100")) return "not_supergroup";
    return null;
  })();
  return {
    supportMessageTimeoutMs,
    supportChatIdRaw,
    supportChatId,
    supportChatIdNum,
    supportTgLink,
    supportMenuLink,
    supportAgentUsername,
    supportAgentId,
    supportTarget,
    supportTargetReason,
  };
};

export const getSupportConfig = () => buildSupportConfig();
