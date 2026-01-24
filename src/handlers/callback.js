// src/handlers/callback.js
import textTemplates from "../utils/text-templates.js";
import { backToMenuKeyboard, mainMenuKeyboard } from "../keyboards/main.js";
import {
  getState,
  setState,
  resetUserData,
  acceptAllConsents,
  deleteUserDataFromDB,
  canUseFreeTariff,
  getNextFreeTariffAt,
  createTicket,
  updateTicket,
  getTicket,
  getTicketsByStatus,
  getTicketsByUser,
  appendTicketMessage,
  getTicketMessages,
  setSupportReplyMode,
  getSupportReplyMode,
  clearSupportReplyMode,
  setSupportSearchMode,
  getSupportSearchMode,
  clearSupportSearchMode,
} from "../utils/storage.js";
import { withTimeout } from "../utils/with-timeout.js";
import { getSupportConfig } from "../utils/support-config.js";
import { writeTicketLogPdf, writeTicketLogTxt } from "../utils/support-logs.js";

const SUPPORT_SPAM_WINDOW_MS = Number(process.env.SUPPORT_SPAM_WINDOW_MS || 60000);

const getSupportLinkHtml = (supportConfig) =>
  supportConfig.supportTgLink
    ? `<a href="${supportConfig.supportTgLink}">написать в поддержку</a>`
    : "написать в поддержку";

const getSupportMenuLinkHtml = (supportConfig) =>
  supportConfig.supportMenuLink
    ? `<a href="${supportConfig.supportMenuLink}">пункт меню «🆘 Поддержка»</a>`
    : "пункт меню «🆘 Поддержка»";

const buildSupportMessage = ({ ticketNumber, userId, username, name, message, contact, plan, createdAt }) =>
  [
    "🆘 SUPPORT",
    "",
    `Номер обращения: ${ticketNumber}`,
    `Дата: ${createdAt}`,
    "",
    "User:",
    username || "не указан",
    `Имя: ${name || "не указано"}`,
    `ID: ${userId}`,
    "",
    "Message:",
    `<b>${message}</b>`,
    "",
    `Контакт для обратной связи: ${contact || "не указан"}`,
    `Тариф: ${plan || "не выбран"}`,
    `Дата: ${createdAt}`,
  ].join("\n");

const buildSupportReplyKeyboard = (userId, ticketNumber) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "📂 Обращения пользователя", callback_data: `SUP_TU:${ticketNumber}` }],
      [{ text: "✉️ Ответить", callback_data: `SUPPORT_REPLY:${ticketNumber}:${userId}` }],
      [{ text: "✅ Закрыть обращение", callback_data: `SUPPORT_CLOSE:${ticketNumber}:${userId}` }],
      [
        { text: "📄 Лог .txt", callback_data: `SUPPORT_LOG_TXT:${ticketNumber}` },
        { text: "📑 Лог PDF", callback_data: `SUPPORT_LOG_PDF:${ticketNumber}` },
      ],
      [{ text: "⛔️ Выйти из режима ответа", callback_data: "SUPPORT_REPLY_EXIT" }],
    ],
  },
});

const buildUserSupportActionsKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "Мой вопрос закрыт", callback_data: "SUPPORT_USER_CLOSE" }],
      [{ text: "Написать еще сообщение", callback_data: "SUPPORT_USER_WRITE" }],
      [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
    ],
  },
});

const buildSupportCooldownKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "⬅️ Назад в поддержку", callback_data: "MENU_SUPPORT" }],
      [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
    ],
  },
});

const buildSupportContactKeyboard = (username) => [
  ...(username ? [[{ text: `✅ Использовать ${username}`, callback_data: "SUPPORT_USE_USERNAME" }]] : []),
  [{ text: "✍️ Указать другой контакт", callback_data: "SUPPORT_ENTER_CONTACT" }],
  [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
];

const buildUserSupportMenuKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "✍️ Написать в поддержку", callback_data: "SUPPORT_START" }],
      [{ text: "📌 Мои активные обращения", callback_data: "SUPPORT_USER_ACTIVE" }],
      [{ text: "✅ Мои закрытые обращения", callback_data: "SUPPORT_USER_CLOSED" }],
      [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
    ],
  },
});

const buildSupportMenuKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "📚 Все обращения", callback_data: "SUP_GM" }],
      [{ text: "📌 Активные обращения", callback_data: "SUPPORT_LIST_ACTIVE" }],
      [{ text: "✅ Закрытые обращения", callback_data: "SUPPORT_LIST_CLOSED" }],
    ],
  },
});

const buildTicketListKeyboard = (
  tickets,
  prefix,
  backCallback,
  includePdf = false,
  includeOpen = true
) => ({
  reply_markup: {
    inline_keyboard: [
      ...tickets.flatMap((ticket) => {
        const row = [];
        if (includeOpen) {
          row.push({ text: `🔍 Открыть #${ticket.ticketNumber}`, callback_data: `SUP_OPEN:${ticket.ticketNumber}` });
        }
        row.push({ text: "📄 TXT", callback_data: `${prefix}_LOG_TXT:${ticket.ticketNumber}` });
        if (includePdf) {
          row.push({ text: "📑 PDF", callback_data: `${prefix}_LOG_PDF:${ticket.ticketNumber}` });
        }
        return [row];
      }),
      [{ text: "⬅️ Назад", callback_data: backCallback }],
    ],
  },
});

export default function callbackHandler(bot, pool) {
  const supportConfig = getSupportConfig();
  let supportTargetWarned = false;
  const supportTargetHint = () => {
    if (!supportConfig.supportTargetReason) return "";
    if (supportConfig.supportTargetReason === "missing") {
      return "❌ SUPPORT_CHAT_ID is not set. Messages to support will fail until it is configured.";
    }
    if (supportConfig.supportTargetReason === "non_numeric") {
      return `❌ SUPPORT_CHAT_ID must be a numeric id like -100xxxxxxxxxx. Received: "${supportConfig.supportChatIdRaw}".`;
    }
    return `❌ SUPPORT_CHAT_ID must be a supergroup id like -100xxxxxxxxxx. Received: "${supportConfig.supportChatIdRaw}".`;
  };
  if (!supportConfig.supportTarget && supportConfig.supportTargetReason) {
    console.error(supportTargetHint());
  }
  const isSupportAgent = (ctx) => {
    if (supportConfig.supportAgentId && ctx.from?.id === supportConfig.supportAgentId) return true;
    if (supportConfig.supportAgentUsername && ctx.from?.username === supportConfig.supportAgentUsername)
      return true;
    return false;
  };
  const isSupportSender = (ctx) => {
    if (supportConfig.supportChatIdNum && ctx.chat?.id === supportConfig.supportChatIdNum) return true;
    return isSupportAgent(ctx);
  };
  const sendToSupport = async (text, userId, ticketNumber) => {
    if (!supportConfig.supportTarget) {
      if (!supportTargetWarned) {
        supportTargetWarned = true;
        console.error(supportTargetHint() || "❌ SUPPORT_TARGET not configured.");
      }
      return { ok: false, reason: "support_target_missing" };
    }
    try {
      const message = await withTimeout(
        bot.telegram.sendMessage(
          supportConfig.supportTarget,
          text,
          buildSupportReplyKeyboard(userId, ticketNumber)
        ),
        supportConfig.supportMessageTimeoutMs,
        "Support message send timed out"
      );
      return { ok: true, message };
    } catch (error) {
      const code = error?.response?.error_code || error?.code;
      const description = error?.response?.description || error?.message;
      if (code === 403 || code === 400) {
        console.error(
          "❌ sendToSupport failed: bot cannot message this chat/user. " +
            "Ensure the bot is in the support supergroup and has permission to post.",
          { code, description }
        );
      } else {
        console.error("❌ sendToSupport failed:", { code, description, stack: error?.stack });
      }
      return { ok: false, reason: "send_failed", code };
    }
  };
  const notifyUserDelivery = async (userId, message, ctx, extra) => {
    const payload = {
      parse_mode: "HTML",
      ...mainMenuKeyboard(),
      ...(extra || {}),
    };
    try {
      await bot.telegram.sendMessage(userId, message, payload);
      return;
    } catch (error) {
      console.error("❌ notifyUserDelivery failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
      });
    }
    await ctx.reply(message, payload);
  };
  const formatTicketClosed = (ticketNumber, createdAtMs) => {
    const createdAt = new Date(createdAtMs).toLocaleString("ru-RU");
    return textTemplates.supportCaseClosed(ticketNumber, createdAt);
  };
  const formatTicketClosedSupport = (ticketNumber, createdAtMs) => {
    const createdAt = new Date(createdAtMs).toLocaleString("ru-RU");
    return textTemplates.supportTicketClosedNotice(ticketNumber, createdAt);
  };
  const buildTicketSummary = (ticket) => {
    const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
    const usernameLine = ticket.username ? `@${String(ticket.username).replace(/^@/, "")}` : "не указан";
    const permalink = ticket.telegramPermalink
      ? `<a href="${ticket.telegramPermalink}">Открыть сообщение</a>`
      : "не найдено";
    return [
      `<b>Обращение №${ticket.ticketNumber}</b>`,
      `Дата: ${createdAt}`,
      `User ID: ${ticket.userId}`,
      `Username: ${usernameLine}`,
      `Статус: ${ticket.status || "open"}`,
      `Permalink: ${permalink}`,
    ].join("\n");
  };
  const paginateTickets = (tickets, page, pageSize) => {
    const total = tickets.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return {
      items: tickets.slice(start, end),
      page: safePage,
      totalPages,
    };
  };
  const buildPaginationRow = (action, page, totalPages, extra) => {
    const buttons = [];
    if (page > 1) {
      buttons.push({ text: "◀️ Prev", callback_data: `${action}:${page - 1}${extra || ""}` });
    }
    if (page < totalPages) {
      buttons.push({ text: "Next ▶️", callback_data: `${action}:${page + 1}${extra || ""}` });
    }
    return buttons.length ? [buttons] : [];
  };
  const formatTicketList = (tickets) =>
    tickets
      .map((ticket) => {
        const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
        return `• №${ticket.ticketNumber} от ${createdAt}`;
      })
      .join("\n");
  const getTelegramPermalink = (chatId, messageId) => {
    if (!chatId || !messageId) return null;
    const internalId = String(chatId).replace("-100", "");
    if (!internalId || internalId.startsWith("-")) return null;
    return `https://t.me/c/${internalId}/${messageId}`;
  };
  const closeSupportCase = async (ticketNumber, targetUserId, ctx, closedBy) => {
    const ticket = getTicket(ticketNumber);
    if (!ticket) return;
    const closedAt = Date.now();
    updateTicket(ticketNumber, { status: "closed", closedAt, closedBy });
    appendTicketMessage({
      id: `${ticketNumber}-system-${closedAt}`,
      ticketNumber,
      from: "system",
      text: textTemplates.supportTicketArchived(ticketNumber),
      createdAt: closedAt,
    });
    const message = formatTicketClosed(ticketNumber, ticket.createdAt);
    if (supportConfig.supportTarget) {
      try {
        await bot.telegram.sendMessage(supportConfig.supportTarget, textTemplates.supportTicketArchived(ticketNumber));
        await bot.telegram.sendMessage(
          supportConfig.supportTarget,
          formatTicketClosedSupport(ticketNumber, ticket.createdAt)
        );
      } catch (error) {
        console.error("❌ closeSupportCase failed to notify support:", {
          message: error?.message,
          code: error?.code,
          response: error?.response,
          stack: error?.stack,
        });
      }
    }
    await notifyUserDelivery(targetUserId, message, ctx, buildUserSupportActionsKeyboard());
  };
  const sendSupportLog = async (ticketNumber, format, ctx) => {
    const ticket = getTicket(ticketNumber);
    if (!ticket || !supportConfig.supportTarget) return;
    const messages = getTicketMessages(ticketNumber);
    try {
      const filePath =
        format === "pdf"
          ? await writeTicketLogPdf(ticket, messages)
          : await writeTicketLogTxt(ticket, messages);
      const filename = `ticket-${ticketNumber}.${format === "pdf" ? "pdf" : "txt"}`;
      await bot.telegram.sendDocument(supportConfig.supportTarget, { source: filePath, filename });
    } catch (error) {
      console.error("❌ sendSupportLog failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
      });
      try {
        await ctx.reply("⚠️ Не удалось сформировать лог.");
      } catch (replyError) {
        console.error("❌ sendSupportLog reply failed:", {
          message: replyError?.message,
          code: replyError?.code,
          response: replyError?.response,
          stack: replyError?.stack,
        });
      }
    }
  };
  const sendUserLog = async (ticketNumber, format, ctx, userId) => {
    const ticket = getTicket(ticketNumber);
    if (!ticket || String(ticket.userId) !== String(userId)) return;
    const messages = getTicketMessages(ticketNumber);
    try {
      const filePath =
        format === "pdf"
          ? await writeTicketLogPdf(ticket, messages)
          : await writeTicketLogTxt(ticket, messages);
      const filename = `ticket-${ticketNumber}.${format === "pdf" ? "pdf" : "txt"}`;
      await bot.telegram.sendDocument(userId, { source: filePath, filename });
    } catch (error) {
      console.error("❌ sendUserLog failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
      });
      try {
        await ctx.reply("⚠️ Не удалось сформировать лог.", { parse_mode: "HTML" });
      } catch (replyError) {
        console.error("❌ sendUserLog reply failed:", {
          message: replyError?.message,
          code: replyError?.code,
          response: replyError?.response,
          stack: replyError?.stack,
        });
      }
    }
  };
  const PAGE_SIZE = 5;
  const getLatestTicketForUser = (userId) => {
    const tickets = getTicketsByUser(userId, []);
    if (!tickets.length) return null;
    return [...tickets].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
  };
  const buildPerUserMenu = (userId) => {
    const latestTicket = getLatestTicketForUser(userId);
    const username = latestTicket?.username
      ? `@${String(latestTicket.username).replace(/^@/, "")}`
      : "не указан";
    const activeCount = getTicketsByUser(userId, ["open", "in_progress"]).length;
    const closedCount = getTicketsByUser(userId, ["closed"]).length;
    const header = [
      `👤 Пользователь: ${username}`,
      `ID: ${userId}`,
      "",
      `📌 Активные: ${activeCount}`,
      `📁 Закрытые: ${closedCount}`,
    ].join("\n");
    return {
      header,
      keyboard: {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📌 Активные", callback_data: `SUP_LU_A:${userId}:1` }],
            [{ text: "📁 Закрытые", callback_data: `SUP_LU_C:${userId}:1` }],
            [{ text: "◀️ Назад", callback_data: latestTicket ? `SUP_OPEN:${latestTicket.ticketNumber}` : "SUP_GM" }],
          ],
        },
      },
    };
  };
  const buildGlobalMenu = () => {
    const activeCount = getTicketsByStatus(["open", "in_progress"]).length;
    const closedCount = getTicketsByStatus(["closed"]).length;
    const header = [
      "📚 Обращения (все пользователи)",
      "",
      `📌 Активные: ${activeCount}`,
      `📁 Закрытые: ${closedCount}`,
    ].join("\n");
    return {
      header,
      keyboard: {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📌 Активные", callback_data: "SUP_LG_A:1" }],
            [{ text: "📁 Закрытые", callback_data: "SUP_LG_C:1" }],
            [{ text: "🔎 Поиск", callback_data: "SUP_SEARCH" }],
            [{ text: "◀️ Назад", callback_data: "SUPPORT_MENU" }],
          ],
        },
      },
    };
  };
  const buildTicketList = (tickets, page, actionPrefix, backCallback, includePdf) => {
    const sorted = [...tickets].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const { items, totalPages, page: safePage } = paginateTickets(sorted, page, PAGE_SIZE);
    const list = items
      .map((ticket) => {
        const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
        const username = ticket.username ? `@${String(ticket.username).replace(/^@/, "")}` : "не указан";
        return `#${ticket.ticketNumber} • ${createdAt} • ${username} • ${ticket.status || "open"}`;
      })
      .join("\n");
    const paginationRow = buildPaginationRow(`${actionPrefix}`, safePage, totalPages, "");
    const keyboard = buildTicketListKeyboard(items, "SUP", backCallback, includePdf);
    if (paginationRow.length) {
      keyboard.reply_markup.inline_keyboard = [
        ...keyboard.reply_markup.inline_keyboard.slice(0, -1),
        ...paginationRow,
        keyboard.reply_markup.inline_keyboard.at(-1),
      ];
    }
    return { list, keyboard };
  };
  const shouldBlockUserMessage = (ctx, st, msgText) => {
    if (msgText.startsWith("/")) return false;
    if (st.supportMode && st.supportWriteEnabled) return false;
    if (st.step === "support_contact" || st.step === "support_contact_custom") return false;
    if (st.step === "wait_support_message" || st.step === "support_ready_to_message") return false;
    return !isSupportSender(ctx);
  };
  const isSupportSpam = (st, now) =>
    Number.isFinite(st.supportLastSentAt) && st.supportLastSentAt > 0 && now - st.supportLastSentAt < SUPPORT_SPAM_WINDOW_MS;
  const formatSupportCooldown = (st, now) => {
    const remainingMs = Math.max(SUPPORT_SPAM_WINDOW_MS - (now - (st.supportLastSentAt || 0)), 0);
    const seconds = Math.max(Math.ceil(remainingMs / 1000), 1);
    return textTemplates.supportSpamWarning(seconds);
  };
  const notifySupportCooldownEnded = (userId) => {
    setTimeout(async () => {
      try {
        await bot.telegram.sendMessage(userId, textTemplates.supportSpamCooldownEnded, {
          parse_mode: "HTML",
          ...buildSupportCooldownKeyboard(),
        });
      } catch (error) {
        console.error("❌ notifySupportCooldownEnded failed:", {
          message: error?.message,
          code: error?.code,
          response: error?.response,
          stack: error?.stack,
        });
      }
    }, SUPPORT_SPAM_WINDOW_MS);
  };
  const bumpTicketNumber = (st, userId) => {
    const nextSeq = Number(st.supportTicketSeq || 0) + 1;
    setState(userId, { supportTicketSeq: nextSeq, supportLastSentAt: Date.now() });
    return `${userId}-${nextSeq}`;
  };

  // ====== TEXT INPUT HANDLER (support message) ======
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    const msgText = (ctx.message?.text || "").trim();
    const supportSender = isSupportSender(ctx);

    if (supportSender && msgText === "/support_menu") {
      await ctx.reply(textTemplates.supportSupportMenu, {
        parse_mode: "HTML",
        ...buildSupportMenuKeyboard(),
      });
      return;
    }

    if (supportSender && msgText.startsWith("/support_search")) {
      setSupportSearchMode(userId, { mode: "global" });
      await ctx.reply("🔎 Введите запрос для поиска (ticketNumber, userId или username).");
      return;
    }

    if (supportSender && !msgText.startsWith("/")) {
      const searchMode = getSupportSearchMode(userId);
      const replyMode = getSupportReplyMode(userId);
      if (searchMode?.mode && !replyMode?.targetUserId) {
        clearSupportSearchMode(userId);
        const query = msgText.toLowerCase();
        const tickets = getTicketsByStatus([]);
        const results = tickets.filter((ticket) => {
          const ticketNumber = String(ticket.ticketNumber || "");
          const userIdText = String(ticket.userId || "");
          const usernameText = String(ticket.username || "").toLowerCase();
          return (
            ticketNumber.includes(query) ||
            userIdText.includes(query) ||
            (usernameText && usernameText.includes(query))
          );
        });
        if (!results.length) {
          await ctx.reply("🔎 Ничего не найдено.", { parse_mode: "HTML" });
          return;
        }
        const { items, page, totalPages } = paginateTickets(results, 1, 5);
        const header = [
          "🔎 Результаты поиска",
          "",
          `Всего: ${results.length}`,
          `Страница: ${page}/${totalPages}`,
        ].join("\n");
        const list = items
          .map((ticket) => {
            const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
            const username = ticket.username ? `@${String(ticket.username).replace(/^@/, "")}` : "не указан";
            return `#${ticket.ticketNumber} • ${createdAt} • ${username} • ${ticket.status || "open"}`;
          })
          .join("\n");
        await ctx.reply(`${header}\n\n${list}`, {
          parse_mode: "HTML",
          ...buildTicketListKeyboard(items, "SUP", "SUP_GM", true),
        });
        return;
      }
      if (replyMode?.targetUserId && replyMode?.ticketNumber) {
        const createdAt = Date.now();
        try {
          const sent = await bot.telegram.sendMessage(
            replyMode.targetUserId,
            textTemplates.supportReplyFromAgent(msgText),
            {
              parse_mode: "HTML",
              ...buildUserSupportActionsKeyboard(),
            }
          );
          appendTicketMessage({
            id: `${replyMode.ticketNumber}-support-${createdAt}`,
            ticketNumber: replyMode.ticketNumber,
            from: "support",
            text: msgText,
            createdAt,
            telegramMessageId: sent?.message_id || null,
          });
          const ticket = getTicket(replyMode.ticketNumber);
          if (ticket && ticket.status === "open") {
            updateTicket(replyMode.ticketNumber, { status: "in_progress" });
          }
        } catch (error) {
          console.error("❌ support reply mode send failed:", {
            message: error?.message,
            code: error?.code,
            response: error?.response,
            stack: error?.stack,
          });
          await ctx.reply("⚠️ Не удалось отправить ответ пользователю.");
        }
        return;
      }
    }

    if (shouldBlockUserMessage(ctx, st, msgText)) {
      if (st.supportMode && !st.supportWriteEnabled) {
        await ctx.reply(textTemplates.supportWriteOnlyViaButtons, {
          parse_mode: "HTML",
          ...buildUserSupportActionsKeyboard(),
        });
        return;
      }
      await ctx.reply(textTemplates.supportOnlyPrompt, {
        parse_mode: "HTML",
        ...mainMenuKeyboard(),
      });
      return;
    }

    if (supportSender && msgText.startsWith("/")) {
      const match = msgText.match(/^\/(support_reply|reply)\s+(\d+)\s+([\s\S]+)$/);
      if (!match) {
        await ctx.reply("⚠️ Неверный формат. Используйте: /support_reply <user_id> <текст ответа>");
        return;
      }
      const targetUserId = Number(match[2]);
      const replyText = match[3].trim();
      if (!replyText) {
        await ctx.reply("⚠️ Добавьте текст ответа после user_id.");
        return;
      }
      try {
        const sent = await bot.telegram.sendMessage(targetUserId, textTemplates.supportReplyFromAgent(replyText), {
          parse_mode: "HTML",
          ...buildUserSupportActionsKeyboard(),
        });
        const createdAt = Date.now();
        const targetState = getState(targetUserId);
        const ticketNumber = targetState.supportLastTicketNumber;
        if (ticketNumber) {
          appendTicketMessage({
            id: `${ticketNumber}-support-${createdAt}`,
            ticketNumber,
            from: "support",
            text: replyText,
            createdAt,
            telegramMessageId: sent?.message_id || null,
          });
          const ticket = getTicket(ticketNumber);
          if (ticket && ticket.status === "open") {
            updateTicket(ticketNumber, { status: "in_progress" });
          }
        }
      } catch (e) {
        console.error("❌ sendSupportReply failed:", {
          message: e?.message,
          code: e?.code,
          response: e?.response,
          stack: e?.stack,
        });
        await ctx.reply("⚠️ Не удалось отправить ответ пользователю. Проверьте user_id.");
      }
      return;
    }

    // --- SUPPORT: final message to send ---
    if (st.step === "support_contact" || st.step === "support_contact_custom") {
      const contact = msgText || "не указан";
      setState(userId, { step: "wait_support_message", supportContact: contact, supportContactType: "custom" });
      await ctx.reply(textTemplates.supportReadyToMessage, {
        parse_mode: "HTML",
        ...mainMenuKeyboard(),
      });
      return;
    }

    if (st.step === "wait_support_message" || st.step === "support_ready_to_message") {
      setState(userId, { step: "idle" });

      const now = Date.now();
      if (isSupportSpam(st, now)) {
        await ctx.reply(formatSupportCooldown(st, now), {
          parse_mode: "HTML",
          ...buildSupportCooldownKeyboard(),
        });
        notifySupportCooldownEnded(userId);
        return;
      }

      const contact = st.supportContact || "не указан";
      const createdAtMs = Date.now();
      const createdAt = new Date(createdAtMs).toLocaleString("ru-RU");
      const username = ctx.from?.username ? `@${ctx.from.username}` : "не указан";
      const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
      const ticketNumber = bumpTicketNumber(st, userId);
      createTicket({
        ticketNumber,
        userId,
        username,
        name,
        plan: st.plan,
        contact,
        createdAt: createdAtMs,
        status: "open",
        supportChatId: supportConfig.supportTarget,
      });
      appendTicketMessage({
        id: `${ticketNumber}-user-${createdAtMs}`,
        ticketNumber,
        from: "user",
        text: msgText,
        createdAt: createdAtMs,
        telegramMessageId: ctx.message?.message_id || null,
      });
      const text = buildSupportMessage({
        ticketNumber,
        userId,
        username,
        name,
        message: msgText,
        contact,
        plan: st.plan,
        createdAt,
      });

      const supportResult = await sendToSupport(text, userId, ticketNumber);
      if (supportResult.ok) {
        const supportMessageId = supportResult.message?.message_id;
        const permalink = getTelegramPermalink(supportConfig.supportChatIdNum, supportMessageId);
        updateTicket(ticketNumber, {
          supportChatMessageId: supportMessageId || null,
          telegramPermalink: permalink,
        });
        setState(userId, {
          supportMode: true,
          supportWriteEnabled: false,
          supportLastTicketNumber: ticketNumber,
          supportLastTicketCreatedAtMs: createdAtMs,
        });
        await notifyUserDelivery(userId, textTemplates.supportThanks, ctx, buildUserSupportActionsKeyboard());
      } else {
        await notifyUserDelivery(
          userId,
          textTemplates.supportThanksFallback(getSupportLinkHtml(supportConfig)),
          ctx
        );
      }
      return;
    }

    if (st.supportMode) {
      const now = Date.now();
      if (isSupportSpam(st, now)) {
        await ctx.reply(formatSupportCooldown(st, now), {
          parse_mode: "HTML",
          ...buildSupportCooldownKeyboard(),
        });
        notifySupportCooldownEnded(userId);
        return;
      }

      const contact = st.supportContact || "не указан";
      const createdAtMs = Date.now();
      const createdAt = new Date(createdAtMs).toLocaleString("ru-RU");
      const username = ctx.from?.username ? `@${ctx.from.username}` : "не указан";
      const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
      const ticketNumber = bumpTicketNumber(st, userId);
      createTicket({
        ticketNumber,
        userId,
        username,
        name,
        plan: st.plan,
        contact,
        createdAt: createdAtMs,
        status: "open",
        supportChatId: supportConfig.supportTarget,
      });
      appendTicketMessage({
        id: `${ticketNumber}-user-${createdAtMs}`,
        ticketNumber,
        from: "user",
        text: msgText,
        createdAt: createdAtMs,
        telegramMessageId: ctx.message?.message_id || null,
      });
      const text = buildSupportMessage({
        ticketNumber,
        userId,
        username,
        name,
        message: msgText,
        contact,
        plan: st.plan,
        createdAt,
      });
      const supportResult = await sendToSupport(text, userId, ticketNumber);
      if (supportResult.ok) {
        const supportMessageId = supportResult.message?.message_id;
        const permalink = getTelegramPermalink(supportConfig.supportChatIdNum, supportMessageId);
        updateTicket(ticketNumber, {
          supportChatMessageId: supportMessageId || null,
          telegramPermalink: permalink,
        });
        setState(userId, {
          supportWriteEnabled: false,
          supportLastTicketNumber: ticketNumber,
          supportLastTicketCreatedAtMs: createdAtMs,
        });
        await notifyUserDelivery(userId, textTemplates.supportMessageSent, ctx, buildUserSupportActionsKeyboard());
      } else {
        await notifyUserDelivery(
          userId,
          textTemplates.supportThanksFallback(getSupportLinkHtml(supportConfig)),
          ctx
        );
      }
      return;
    }
  });

  // ====== CALLBACK HANDLER ======
  bot.on("callback_query", async (ctx) => {
    try {
      const userId = ctx.from?.id;
      const data = ctx.callbackQuery?.data;
      if (!userId || !data) return;
      const supportLink = getSupportLinkHtml(supportConfig);
      const supportMenuLink = getSupportMenuLinkHtml(supportConfig);
      const offerUrl = (process.env.PUBLIC_OFFER_URL || process.env.OFFER_URL || "").trim();

      try {
        await ctx.answerCbQuery();
      } catch (error) {
        await ctx.reply(textTemplates.stuckInstruction, mainMenuKeyboard());
        return;
      }

      const safeEdit = async (html, extra) => {
        const payload = { parse_mode: "HTML", ...(extra || mainMenuKeyboard()) };
        try {
          await ctx.editMessageText(html, payload);
        } catch {
          try {
            await ctx.reply(html, payload);
          } catch {
            await ctx.reply(textTemplates.stuckInstruction, mainMenuKeyboard());
          }
        }
      };

      const backToMenuKb = {
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]] },
      };

      if (data === "SUPPORT_USER_WRITE") {
        setState(userId, { supportMode: true, supportWriteEnabled: true, step: "support_ready_to_message" });
        await ctx.reply(textTemplates.supportReadyToMessage, {
          parse_mode: "HTML",
          ...backToMenuKeyboard(),
        });
        return;
      }

      if (data === "SUPPORT_USER_CLOSE") {
        const st = getState(userId);
        if (!st.supportLastTicketNumber || !st.supportLastTicketCreatedAtMs) {
          await ctx.answerCbQuery("⚠️ Не удалось найти обращение для закрытия.", { show_alert: true });
          return;
        }
        setState(userId, { supportMode: false, supportWriteEnabled: false, step: "idle" });
        await closeSupportCase(st.supportLastTicketNumber, userId, ctx, "user");
        return;
      }

      if (data === "SUPPORT_REPLY_EXIT") {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        clearSupportReplyMode(userId);
        await ctx.reply(textTemplates.supportReplyModeExited, { parse_mode: "HTML" });
        return;
      }

      if (data.startsWith("SUP_TU:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const token = data.replace("SUP_TU:", "");
        const ticket = getTicket(token);
        const userIdValue = ticket ? ticket.userId : token;
        const ticketsForUser = getTicketsByUser(userIdValue, []);
        if (!ticketsForUser.length) {
          await ctx.answerCbQuery("⚠️ Обращения не найдены.", { show_alert: true });
          return;
        }
        const menu = buildPerUserMenu(userIdValue);
        await ctx.reply(menu.header, { parse_mode: "HTML", ...menu.keyboard });
        return;
      }

      if (data === "SUP_GM") {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const menu = buildGlobalMenu();
        await ctx.reply(menu.header, { parse_mode: "HTML", ...menu.keyboard });
        return;
      }

      if (data === "SUP_SEARCH") {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        setSupportSearchMode(userId, { mode: "global" });
        await ctx.reply("🔎 Введите запрос для поиска (ticketNumber, userId или username).");
        return;
      }

      if (data.startsWith("SUP_LU_A:") || data.startsWith("SUP_LU_C:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const [action, targetUserId, pageStr] = data.split(":");
        const page = Number(pageStr || 1);
        const statuses = action === "SUP_LU_A" ? ["open", "in_progress"] : ["closed"];
        const tickets = getTicketsByUser(targetUserId, statuses);
        const title = action === "SUP_LU_A" ? "📌 Активные обращения" : "📁 Закрытые обращения";
        if (!tickets.length) {
          await ctx.reply(`${title}\n\n${textTemplates.supportTicketsEmpty}`, { parse_mode: "HTML" });
          return;
        }
        const { list, keyboard } = buildTicketList(tickets, page, action, `SUP_TU:${targetUserId}`, true);
        await ctx.reply(`${title}\n\n${list}`, { parse_mode: "HTML", ...keyboard });
        return;
      }

      if (data.startsWith("SUP_LG_A:") || data.startsWith("SUP_LG_C:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const [action, pageStr] = data.split(":");
        const page = Number(pageStr || 1);
        const statuses = action === "SUP_LG_A" ? ["open", "in_progress"] : ["closed"];
        const tickets = getTicketsByStatus(statuses);
        const title = action === "SUP_LG_A" ? "📌 Активные обращения" : "📁 Закрытые обращения";
        if (!tickets.length) {
          await ctx.reply(`${title}\n\n${textTemplates.supportTicketsEmpty}`, { parse_mode: "HTML" });
          return;
        }
        const { list, keyboard } = buildTicketList(tickets, page, action, "SUP_GM", true);
        await ctx.reply(`${title}\n\n${list}`, { parse_mode: "HTML", ...keyboard });
        return;
      }

      if (data.startsWith("SUP_OPEN:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const ticketNumber = data.replace("SUP_OPEN:", "");
        const ticket = getTicket(ticketNumber);
        if (!ticket) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await ctx.reply(buildTicketSummary(ticket), {
          parse_mode: "HTML",
          ...buildSupportReplyKeyboard(ticket.userId, ticket.ticketNumber),
        });
        return;
      }

      if (data.startsWith("SUPPORT_REPLY:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав для ответа.", { show_alert: true });
          return;
        }
        const parts = data.split(":");
        const ticketNumber = parts[1];
        const targetUserId = Number(parts[2]);
        if (!ticketNumber || !Number.isFinite(targetUserId) || targetUserId <= 0) {
          await ctx.answerCbQuery("⚠️ Некорректный user_id.", { show_alert: true });
          return;
        }
        setSupportReplyMode(userId, { ticketNumber, targetUserId });
        const ticket = getTicket(ticketNumber);
        if (ticket && ticket.status === "open") {
          const now = Date.now();
          updateTicket(ticketNumber, { status: "in_progress" });
          appendTicketMessage({
            id: `${ticketNumber}-system-${now}`,
            ticketNumber,
            from: "system",
            text: "Статус: in_progress",
            createdAt: now,
          });
        }
        await ctx.reply(
          `✉️ Режим ответа включен для тикета ${ticketNumber}.\nСледующее сообщение отправится пользователю.`
        );
        return;
      }

      if (data.startsWith("SUPPORT_CLOSE:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав для закрытия.", { show_alert: true });
          return;
        }
        const parts = data.split(":");
        const ticketNumber = parts[1];
        const targetUserId = Number(parts[2]);
        if (!ticketNumber || !Number.isFinite(targetUserId)) {
          await ctx.answerCbQuery("⚠️ Некорректные данные обращения.", { show_alert: true });
          return;
        }
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        setState(targetUserId, { supportMode: false, supportWriteEnabled: false, step: "idle" });
        const closedBy = ctx.from?.username ? `@${ctx.from.username}` : `id:${userId}`;
        await closeSupportCase(ticketNumber, targetUserId, ctx, closedBy);
        return;
      }

      if (data.startsWith("SUPPORT_LOG_TXT:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const ticketNumber = data.replace("SUPPORT_LOG_TXT:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendSupportLog(ticketNumber, "txt", ctx);
        return;
      }

      if (data.startsWith("SUPPORT_LOG_PDF:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const ticketNumber = data.replace("SUPPORT_LOG_PDF:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendSupportLog(ticketNumber, "pdf", ctx);
        return;
      }

      if (data.startsWith("SUP_LOG_TXT:") || data.startsWith("SUP_LOG_PDF:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const isPdf = data.startsWith("SUP_LOG_PDF:");
        const ticketNumber = data.replace(isPdf ? "SUP_LOG_PDF:" : "SUP_LOG_TXT:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendSupportLog(ticketNumber, isPdf ? "pdf" : "txt", ctx);
        return;
      }

      if (data.startsWith("USER_LOG_TXT:")) {
        const ticketNumber = data.replace("USER_LOG_TXT:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendUserLog(ticketNumber, "txt", ctx, userId);
        return;
      }

      if (data.startsWith("USER_LOG_PDF:")) {
        const ticketNumber = data.replace("USER_LOG_PDF:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendUserLog(ticketNumber, "pdf", ctx, userId);
        return;
      }


    // ---------------- MENU_HOME ----------------
    if (data === "MENU_HOME") {
      await safeEdit(textTemplates.mainMenuDescription, mainMenuKeyboard());
      return;
    }

    // ---------------- TARIFFS ----------------
    if (data === "MENU_TARIFF_FREE") {
      setState(userId, { plan: "free", paid: false });
      await safeEdit(textTemplates.tariffFree, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✨ Сделать пробную генерацию", callback_data: "FREE_START" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "MENU_TARIFF_PRO") {
      setState(userId, { plan: "pro", paid: false });
      await safeEdit(textTemplates.tariffPro, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Перейти к оплате", callback_data: "PAY_START_PRO" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "MENU_TARIFF_PREMIUM") {
      setState(userId, { plan: "premium", paid: false });
      await safeEdit(textTemplates.tariffPremium, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💳 Перейти к оплате", callback_data: "PAY_START_PREMIUM" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    // ---------------- COMPARE / EXAMPLES ----------------
    if (data === "MENU_WHATSIN") {
      await safeEdit(textTemplates.tariffsCompare, backToMenuKb);
      return;
    }
    if (data === "MENU_EXAMPLES") {
      await safeEdit(textTemplates.examples, backToMenuKb);
      return;
    }

    // ---------------- STANDALONE PRIVACY / PAYMENTS ----------------
    if (data === "MENU_PRIVACY") {
      await safeEdit(textTemplates.privacyStandalone(supportMenuLink), backToMenuKb);
      return;
    }
    if (data === "MENU_PAYMENTS") {
      await safeEdit(textTemplates.paymentsStandalone(supportMenuLink), backToMenuKb);
      return;
    }
    if (data === "MENU_OFFER") {
      const shouldShowContinue = Boolean(
        (getState(userId).plan === "pro" || getState(userId).plan === "premium") &&
          getState(userId).consentPd &&
          getState(userId).consentThird
      );
      const baseOffer = textTemplates.offer({ supportLink: supportMenuLink, offerUrl });
      const offerHtml = shouldShowContinue
        ? `${baseOffer}\n\nНажимая «Продолжить», вы подтверждаете согласие с условиями публичной оферты.`
        : baseOffer;
      const offerKeyboard = shouldShowContinue
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Продолжить", callback_data: "OFFER_ACCEPT" }],
                [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
              ],
            },
          }
        : backToMenuKb;
      await safeEdit(offerHtml, offerKeyboard);
      return;
    }
    if (data === "MENU_FAQ") {
      await safeEdit(textTemplates.faqIntro, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Насколько обобщенным будет анализ?", callback_data: "FAQ_GENERAL" }],
            [{ text: "У меня обычное фото с телефона, подойдет?", callback_data: "FAQ_PHOTO" }],
            [{ text: "Если у меня сейчас другой цвет волос, это не исказит анализ?", callback_data: "FAQ_HAIR_COLOR" }],
            [{ text: "Если мне не нравится результат анализа?", callback_data: "FAQ_RESULT" }],
            [{ text: "Для чего мне это анализ?", callback_data: "FAQ_PURPOSE" }],
            [{ text: "Мои фото где-то сохраняются?", callback_data: "FAQ_STORAGE" }],
            [{ text: "Что если бот ошибется?", callback_data: "FAQ_ERRORS" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    const faqBackKb = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ Назад к FAQ", callback_data: "MENU_FAQ" }],
          [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
        ],
      },
    };

    if (data === "FAQ_GENERAL") {
      await safeEdit(textTemplates.faqAnswers.general, faqBackKb);
      return;
    }
    if (data === "FAQ_PHOTO") {
      await safeEdit(textTemplates.faqAnswers.photo, faqBackKb);
      return;
    }
    if (data === "FAQ_HAIR_COLOR") {
      await safeEdit(textTemplates.faqAnswers.hairColor, faqBackKb);
      return;
    }
    if (data === "FAQ_RESULT") {
      await safeEdit(textTemplates.faqAnswers.result, faqBackKb);
      return;
    }
    if (data === "FAQ_PURPOSE") {
      await safeEdit(textTemplates.faqAnswers.purpose, faqBackKb);
      return;
    }
    if (data === "FAQ_STORAGE") {
      await safeEdit(textTemplates.faqAnswers.storage, faqBackKb);
      return;
    }
    if (data === "FAQ_ERRORS") {
      await safeEdit(textTemplates.faqAnswers.errors, faqBackKb);
      return;
    }

    // ---------------- SUPPORT ----------------
    if (data === "MENU_SUPPORT") {
      await safeEdit(textTemplates.supportMenu, buildUserSupportMenuKeyboard());
      return;
    }

    if (data === "SUPPORT_START") {
      setState(userId, { step: "support_contact", supportContact: null, supportContactType: null });
      const username = ctx.from?.username ? `@${ctx.from.username}` : null;
      const keyboard = buildSupportContactKeyboard(username);
      await safeEdit(textTemplates.supportContactPrompt(username, ""), {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
      return;
    }

    if (data === "SUPPORT_USER_ACTIVE") {
      const tickets = getTicketsByUser(userId, ["open", "in_progress"]);
      const title = textTemplates.supportTicketsActiveTitle;
      if (!tickets.length) {
        await safeEdit(`${title}\n\n${textTemplates.supportTicketsEmpty}`, buildUserSupportMenuKeyboard());
        return;
      }
      await safeEdit(
        `${title}\n\n${formatTicketList(tickets)}`,
        buildTicketListKeyboard(tickets, "USER", "MENU_SUPPORT", false, false)
      );
      return;
    }

    if (data === "SUPPORT_USER_CLOSED") {
      const tickets = getTicketsByUser(userId, ["closed"]);
      const title = textTemplates.supportTicketsClosedTitle;
      if (!tickets.length) {
        await safeEdit(`${title}\n\n${textTemplates.supportTicketsEmpty}`, buildUserSupportMenuKeyboard());
        return;
      }
      await safeEdit(
        `${title}\n\n${formatTicketList(tickets)}`,
        buildTicketListKeyboard(tickets, "USER", "MENU_SUPPORT", false, false)
      );
      return;
    }

    if (data === "SUPPORT_LIST_ACTIVE") {
      if (!isSupportSender(ctx)) {
        await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
        return;
      }
      const tickets = getTicketsByStatus(["open", "in_progress"]);
      const title = textTemplates.supportSupportActiveTitle;
      if (!tickets.length) {
        await ctx.reply(`${title}\n\n${textTemplates.supportTicketsEmpty}`, { parse_mode: "HTML" });
        return;
      }
      await ctx.reply(`${title}\n\n${formatTicketList(tickets)}`, {
        parse_mode: "HTML",
        ...buildTicketListKeyboard(tickets, "SUPPORT", "SUPPORT_MENU"),
      });
      return;
    }

    if (data === "SUPPORT_LIST_CLOSED") {
      if (!isSupportSender(ctx)) {
        await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
        return;
      }
      const tickets = getTicketsByStatus(["closed"]);
      const title = textTemplates.supportSupportClosedTitle;
      if (!tickets.length) {
        await ctx.reply(`${title}\n\n${textTemplates.supportTicketsEmpty}`, { parse_mode: "HTML" });
        return;
      }
      await ctx.reply(`${title}\n\n${formatTicketList(tickets)}`, {
        parse_mode: "HTML",
        ...buildTicketListKeyboard(tickets, "SUPPORT", "SUPPORT_MENU"),
      });
      return;
    }

    if (data === "SUPPORT_MENU") {
      if (!isSupportSender(ctx)) {
        await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
        return;
      }
      await ctx.reply(textTemplates.supportSupportMenu, {
        parse_mode: "HTML",
        ...buildSupportMenuKeyboard(),
      });
      return;
    }

    if (data === "SUPPORT_USE_USERNAME") {
      const username = ctx.from?.username ? `@${ctx.from.username}` : null;
      if (!username) {
        setState(userId, { step: "support_contact_custom" });
        await safeEdit(textTemplates.supportContactCustomPrompt, {
          reply_markup: {
            inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
          },
        });
        return;
      }
      setState(userId, {
        step: "wait_support_message",
        supportContact: username,
        supportContactType: "username_confirmed",
      });
      await safeEdit(textTemplates.supportReadyToMessage, {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
        },
      });
      return;
    }

    if (data === "SUPPORT_ENTER_CONTACT") {
      setState(userId, { step: "support_contact_custom" });
      const keyboard = buildSupportContactKeyboard(ctx.from?.username ? `@${ctx.from.username}` : null);
      await safeEdit(textTemplates.supportContactCustomPrompt, {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      });
      return;
    }

    // ---------------- CONSENT FLOW HELPERS ----------------
    const showConsentMenu = async () => {
      const st = getState(userId);
      const pdOk = !!st.consentPd;
      const thirdOk = !!st.consentThird;

      const lines = [
        textTemplates.consentMenu,
        "",
        `Статус:`,
        `${pdOk ? "✅" : "⬜️"} Согласие на обработку персональных данных`,
        `${thirdOk ? "✅" : "⬜️"} Согласие на третьих лиц`,
      ].join("\n");

      await safeEdit(lines, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Политика конфиденциальности", callback_data: "PRIVACY_IN_FLOW" }],
            [
              {
                text: `${pdOk ? "✅ " : ""}Согласие на обработку персональных данных`,
                callback_data: "DOC_CONSENT_PD_IN_FLOW",
              },
            ],
            [{ text: `${thirdOk ? "✅ " : ""}Согласие на третьих лиц`, callback_data: "DOC_CONSENT_THIRD_IN_FLOW" }],
            [{ text: "⬅️ Назад", callback_data: "MENU_HOME" }],
          ],
        },
      });
    };

    const goToOfferScreen = async () => {
      const st = getState(userId);
      const plan = st.plan; // "pro" | "premium"
      if (plan !== "pro" && plan !== "premium") {
        await safeEdit("⚠️ Не удалось продолжить оформление. Пожалуйста, начните с выбора тарифа.", {
          reply_markup: {
            inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
          },
        });
        return;
      }
      setState(userId, { offerAccepted: false });
      const baseOffer = textTemplates.offer({ supportLink: supportMenuLink, offerUrl });
      const offerHtml = `${baseOffer}\n\nНажимая «Продолжить», вы подтверждаете согласие с условиями публичной оферты.`;
      await safeEdit(offerHtml, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Продолжить", callback_data: "OFFER_ACCEPT" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
    };

    const showPaymentStub = async () => {
      const st = getState(userId);
      const plan = st.plan;
      if (plan !== "pro" && plan !== "premium") {
        await safeEdit("⚠️ Не удалось продолжить оформление. Пожалуйста, начните с выбора тарифа.", {
          reply_markup: {
            inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
          },
        });
        return;
      }
      const planLabel = plan === "premium" ? "PREMIUM" : "PRO";
      const html = `${textTemplates.paymentStub}\n\n<b>Выбран тариф:</b> ${planLabel}`;
      await safeEdit(html, {
        reply_markup: {
          inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
        },
      });
    };

    // ---------------- FREE START ----------------
    if (data === "FREE_START") {
      if (!canUseFreeTariff(userId)) {
        const nextAt = getNextFreeTariffAt(userId);
        const nextText = nextAt
          ? `Следующая бесплатная попытка будет доступна ${nextAt.toLocaleDateString("ru-RU")}.`
          : "Следующая бесплатная попытка будет доступна позже.";
        await safeEdit(`⚠️ Бесплатный тариф доступен раз в 30 дней.\n${nextText}`, backToMenuKb);
        return;
      }
      setState(userId, { plan: "free", paid: false, step: "consent_flow" });
      await showConsentMenu();
      return;
    }

    // ---------------- PAYMENT START ----------------
    if (data === "PAY_START_PRO" || data === "PAY_START_PREMIUM") {
      setState(userId, { plan: data === "PAY_START_PREMIUM" ? "premium" : "pro", paid: false, offerAccepted: false });

      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        await goToOfferScreen();
      } else {
        setState(userId, { step: "consent_flow" });
        await showConsentMenu();
      }
      return;
    }
    if (data === "OFFER_ACCEPT") {
      setState(userId, { offerAccepted: true });
      await showPaymentStub();
      return;
    }

    // ---------------- PRIVACY IN FLOW ----------------
    if (data === "PRIVACY_IN_FLOW") {
      await safeEdit(textTemplates.privacyInConsentFlow(supportMenuLink), {
        reply_markup: {
          inline_keyboard: [[{ text: "Далее к соглашениям", callback_data: "CONSENT_MENU" }]],
        },
      });
      return;
    }

    if (data === "CONSENT_MENU") {
      await showConsentMenu();
      return;
    }

    // ---------------- DOCS IN FLOW ----------------
    if (data === "DOC_CONSENT_PD_IN_FLOW") {
      await safeEdit(textTemplates.docs.consentPd, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_PD_ACCEPT" }],
            [{ text: "⬅️ Назад к соглашениям", callback_data: "CONSENT_MENU" }],
          ],
        },
      });
      return;
    }

    if (data === "DOC_CONSENT_THIRD_IN_FLOW") {
      await safeEdit(textTemplates.docs.consentThird, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_THIRD_ACCEPT" }],
            [{ text: "⬅️ Назад к соглашениям", callback_data: "CONSENT_MENU" }],
          ],
        },
      });
      return;
    }

    if (data === "CONSENT_PD_ACCEPT") {
      setState(userId, { consentPd: true });
      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        acceptAllConsents(userId);
        if (st.plan === "pro" || st.plan === "premium") {
          await goToOfferScreen();
        } else {
          await safeEdit("✅ Согласия приняты. Теперь отправьте фото сообщением в этот чат.", {
            reply_markup: {
              inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
            },
          });
        }
      } else {
        await showConsentMenu();
      }
      return;
    }

    if (data === "CONSENT_THIRD_ACCEPT") {
      setState(userId, { consentThird: true });
      const st = getState(userId);
      if (st.consentPd && st.consentThird) {
        acceptAllConsents(userId);
        if (st.plan === "pro" || st.plan === "premium") {
          await goToOfferScreen();
        } else {
          await safeEdit("✅ Согласия приняты. Теперь отправьте фото сообщением в этот чат.", {
            reply_markup: {
              inline_keyboard: [[{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }]],
            },
          });
        }
      } else {
        await showConsentMenu();
      }
      return;
    }

    // ---------------- DELETE FLOW ----------------
    if (data === "MENU_DELETE") {
      await safeEdit(textTemplates.deleteIntro, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Удалить", callback_data: "DELETE_CONFIRM" },
              { text: "❌ Не удалять", callback_data: "DELETE_CANCEL" },
            ],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (data === "DELETE_CANCEL") {
      await safeEdit(textTemplates.deleteCancelled, backToMenuKb);
      return;
    }

    if (data === "DELETE_CONFIRM") {
      if (pool) {
        try {
          await deleteUserDataFromDB(pool, userId);
        } catch (e) {
          console.warn("⚠️ deleteUserDataFromDB failed:", e?.message || e);
        }
      }
      resetUserData(userId);
      await safeEdit(textTemplates.deleteDone, backToMenuKb);
      return;
    }

    // fallback
    await safeEdit("Неизвестная команда. Откройте меню:", mainMenuKeyboard());
    return;
    } catch (error) {
      console.error("❌ callback_query handler failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
      });
      try {
        await ctx.reply(textTemplates.stuckInstruction, mainMenuKeyboard());
      } catch {
        // ignore secondary failures
      }
    }
  }); // <-- закрываем bot.on("callback_query"...)
} // <-- закрываем callbackHandler
