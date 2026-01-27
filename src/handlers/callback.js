// src/handlers/callback.js
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
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
  upsertUser,
  appendAuditLog,
  listPayments,
  listAuditLog,
  setSupportReplyMode,
  getSupportReplyMode,
  clearSupportReplyMode,
  setSupportSearchMode,
  getSupportSearchMode,
  clearSupportSearchMode,
} from "../utils/storage.js";
import { withTimeout } from "../utils/with-timeout.js";
import { getSupportConfig } from "../utils/support-config.js";
import { writeTicketLogTxt } from "../utils/support-logs.js";

const SUPPORT_SPAM_WINDOW_MS = Number(process.env.SUPPORT_SPAM_WINDOW_MS || 60000);

const getSupportLinkHtml = (supportConfig) =>
  supportConfig.supportTgLink
    ? `<a href="${supportConfig.supportTgLink}">написать в поддержку</a>`
    : "написать в поддержку";

const getSupportMenuLinkHtml = (supportConfig) =>
  supportConfig.supportMenuLink
    ? `<a href="${supportConfig.supportMenuLink}">пункт меню «🆘 Поддержка»</a>`
    : "пункт меню «🆘 Поддержка»";

const buildSupportMessage = ({
  ticketNumber,
  userId,
  username,
  name,
  message,
  contact,
  plan,
  createdAt,
  ticketLink,
  statusLabel,
}) =>
  [
    "🆘 SUPPORT",
    "",
    `Номер обращения: ${ticketLink ? `<a href="${ticketLink}">${ticketNumber}</a>` : ticketNumber}`,
    `Дата: ${ticketLink ? `<a href="${ticketLink}">${createdAt}</a>` : createdAt}`,
    `Статус: ${ticketLink ? `<a href="${ticketLink}">${statusLabel || "открыт"}</a>` : statusLabel || "открыт"}`,
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

const buildSupportTicketInlineKeyboard = (userId, ticketNumber) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: "📂 Обращения пользователя", callback_data: `SUP_TU:${ticketNumber}` }],
      [{ text: "✉️ Ответить", callback_data: `SUP_REPLY:${ticketNumber}:${userId}` }],
      [{ text: "📄 Выгрузить диалог (TXT)", callback_data: `SUP_TXT:${ticketNumber}` }],
      [{ text: "✅ Закрыть", callback_data: `SUP_CLOSE:${ticketNumber}:${userId}` }],
    ],
  },
});

const SUPPORT_MENU_LABELS = {
  all: "📚 Все обращения",
  fresh: "🆕 Новые",
  work: "🟡 В работе",
  closed: "📁 Закрытые",
  search: "🔎 Поиск",
  analytics: "📊 Аналитика",
  hide: "⬅️ Скрыть меню",
};

const formatSupportMenuLabel = (label, count) =>
  Number.isFinite(count) ? `${label} (${count})` : label;

const resolveSupportMenuKey = (text) => {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.all)) return "all";
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.fresh)) return "fresh";
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.work)) return "work";
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.closed)) return "closed";
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.search)) return "search";
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.analytics)) return "analytics";
  if (trimmed.startsWith(SUPPORT_MENU_LABELS.hide)) return "hide";
  return null;
};

const buildSupportBottomMenuKeyboard = ({ freshCount, workCount } = {}) => ({
  reply_markup: {
    keyboard: [
      [SUPPORT_MENU_LABELS.all, formatSupportMenuLabel(SUPPORT_MENU_LABELS.fresh, freshCount)],
      [formatSupportMenuLabel(SUPPORT_MENU_LABELS.work, workCount), SUPPORT_MENU_LABELS.closed],
      [SUPPORT_MENU_LABELS.search],
      [SUPPORT_MENU_LABELS.analytics],
      [SUPPORT_MENU_LABELS.hide],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    is_persistent: true,
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
      [{ text: "✅ Закрыть обращение", callback_data: "SUPPORT_USER_CLOSE" }],
      [{ text: "📌 Мои активные обращения", callback_data: "SUPPORT_USER_ACTIVE" }],
      [{ text: "✅ Мои закрытые обращения", callback_data: "SUPPORT_USER_CLOSED" }],
      [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
    ],
  },
});

const buildTicketListKeyboard = (tickets, listCallback, page, totalPages) => {
  const rows = tickets.map((ticket) => [
    { text: `🔍 Открыть #${ticket.ticketNumber}`, callback_data: `SUP_OPEN:${ticket.ticketNumber}` },
    { text: "📄 TXT", callback_data: `SUP_TXT:${ticket.ticketNumber}` },
  ]);
  const pagination = [];
  if (page > 1) {
    pagination.push({ text: "◀️ Назад", callback_data: `${listCallback}:${page - 1}` });
  }
  if (page < totalPages) {
    pagination.push({ text: "▶️ Далее", callback_data: `${listCallback}:${page + 1}` });
  }
  if (pagination.length) rows.push(pagination);
  return { reply_markup: { inline_keyboard: rows } };
};

const buildUserTicketListKeyboard = (tickets, backCallback) => ({
  reply_markup: {
    inline_keyboard: [
      ...tickets.map((ticket) => [{ text: "📄 TXT", callback_data: `USER_LOG_TXT:${ticket.ticketNumber}` }]),
      [{ text: "⬅️ Назад", callback_data: backCallback }],
    ],
  },
});

const ANALYTICS_PERIOD_LABELS = {
  today: "Сегодня",
  yesterday: "Вчера",
  "7d": "7 дней",
  "30d": "30 дней",
};

const ANALYTICS_SECTION_LABELS = {
  money: "💳 Деньги",
  funnel: "🔻 Воронка",
  support: "🆘 Поддержка",
};

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
          {
            parse_mode: "HTML",
            ...buildSupportTicketInlineKeyboard(userId, ticketNumber),
          }
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
  const formatTicketStatusLabel = (status) => {
    if (status === "closed") return "закрыт";
    if (status === "in_progress" || status === "open") return "в работе";
    return "в работе";
  };
  const formatTicketStatusTitle = (status) => {
    if (status === "closed") return "Закрыто";
    if (status === "in_progress" || status === "open") return "В работе";
    return "В работе";
  };
  const appendTicketStatusMessage = (ticketNumber, status, createdAt = Date.now()) => {
    appendTicketMessage({
      id: `${ticketNumber}-system-status-${createdAt}`,
      ticketNumber,
      from: "system",
      text: `Статус обращения изменен: ${formatTicketStatusTitle(status)}.`,
      createdAt,
    });
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
  const getTelegramPermalink = (chatId, messageId) => {
    if (!chatId || !messageId) return null;
    const internalId = String(chatId).replace("-100", "");
    if (!internalId || internalId.startsWith("-")) return null;
    return `https://t.me/c/${internalId}/${messageId}`;
  };
  const getTicketPermalink = (ticket) =>
    ticket?.telegramPermalink ||
    getTelegramPermalink(supportConfig.supportChatIdNum, ticket?.supportChatMessageId);
  const getUserLink = (ticket) => {
    const username = ticket?.username ? String(ticket.username).replace(/^@/, "") : "";
    if (username) return `https://t.me/${username}`;
    if (ticket?.userId) return `tg://user?id=${ticket.userId}`;
    return null;
  };
  const buildTicketListText = (tickets) =>
    tickets
      .map((ticket, index) => {
        const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
        const username = ticket.username ? `@${String(ticket.username).replace(/^@/, "")}` : "не указан";
        const statusLabel = formatTicketStatusLabel(ticket.status);
        return `${index + 1}) №${ticket.ticketNumber} • ${createdAt} • ${username} • ${statusLabel}`;
      })
      .join("\n");
  const getTimeZoneOffsetMs = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(
      Number(lookup.year),
      Number(lookup.month) - 1,
      Number(lookup.day),
      Number(lookup.hour),
      Number(lookup.minute),
      Number(lookup.second)
    );
    return asUtc - date.getTime();
  };
  const getStartOfDayMs = (date, timeZone) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const utcMidnight = Date.UTC(Number(lookup.year), Number(lookup.month) - 1, Number(lookup.day), 0, 0, 0);
    const offset = getTimeZoneOffsetMs(new Date(utcMidnight), timeZone);
    return utcMidnight - offset;
  };
  const getPeriodBounds = (key) => {
    const tz = "Europe/Amsterdam";
    const now = new Date();
    if (key === "today") {
      return { from: getStartOfDayMs(now, tz), to: now.getTime() };
    }
    if (key === "yesterday") {
      const todayStart = getStartOfDayMs(now, tz);
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      return { from: yesterdayStart, to: todayStart - 1 };
    }
    const days = key === "30d" ? 30 : 7;
    return { from: now.getTime() - days * 24 * 60 * 60 * 1000, to: now.getTime() };
  };
  const formatPeriodRu = (key) => ANALYTICS_PERIOD_LABELS[key] || "7 дней";
  const formatNumberRu = (value) => Number(value || 0).toLocaleString("ru-RU");
  const formatPercent = (value) => (Number.isFinite(value) ? (value * 100).toFixed(1) : "—");
  const formatDurationRu = (ms) => {
    if (!Number.isFinite(ms)) return "—";
    const totalSeconds = Math.max(Math.round(ms / 1000), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}ч ${minutes}м`;
  };
  const buildAnalyticsKeyboard = (period, section) => ({
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Сегодня", callback_data: "AN_P:today" },
          { text: "Вчера", callback_data: "AN_P:yesterday" },
          { text: "7 дней", callback_data: "AN_P:7d" },
          { text: "30 дней", callback_data: "AN_P:30d" },
        ],
        [
          { text: "💳 Деньги", callback_data: "AN_S:money" },
          { text: "🔻 Воронка", callback_data: "AN_S:funnel" },
          { text: "🆘 Поддержка", callback_data: "AN_S:support" },
        ],
        [
          { text: "⬇️ Экспорт CSV", callback_data: "AN_E:menu" },
          { text: "◀️ Назад", callback_data: "AN_BACK:root" },
        ],
      ],
    },
  });
  const buildAnalyticsExportKeyboard = () => ({
    reply_markup: {
      inline_keyboard: [
        [{ text: "CSV: оплаты", callback_data: "AN_E:payments" }],
        [{ text: "CSV: воронка", callback_data: "AN_E:funnel" }],
        [{ text: "CSV: поддержка", callback_data: "AN_E:support" }],
        [{ text: "◀️ Назад", callback_data: "AN_E:back" }],
      ],
    },
  });
  const getMoneyMetrics = (from, to) => {
    const payments = listPayments().filter(
      (payment) =>
        payment &&
        payment.status === "paid" &&
        Number(payment.createdAt || 0) >= from &&
        Number(payment.createdAt || 0) <= to
    );
    const revenueSum = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paymentsCount = payments.length;
    const payingUsers = new Set(payments.map((item) => item.internalUserId)).size;
    const aov = paymentsCount ? revenueSum / paymentsCount : 0;
    const arppu = payingUsers ? revenueSum / payingUsers : 0;
    const byTariff = payments.reduce((acc, item) => {
      const key = item.tariff || "—";
      acc[key] = acc[key] || { sum: 0, count: 0 };
      acc[key].sum += Number(item.amount || 0);
      acc[key].count += 1;
      return acc;
    }, {});
    const byProvider = payments.reduce((acc, item) => {
      const key = item.provider || "—";
      acc[key] = acc[key] || { sum: 0, count: 0 };
      acc[key].sum += Number(item.amount || 0);
      acc[key].count += 1;
      return acc;
    }, {});
    return {
      revenueSum,
      paymentsCount,
      payingUsers,
      aov,
      arppu,
      byTariff,
      byProvider,
    };
  };
  const getFunnelMetrics = (from, to) => {
    const events = listAuditLog().filter(
      (entry) => Number(entry.createdAt || 0) >= from && Number(entry.createdAt || 0) <= to
    );
    const countDistinct = (action) =>
      new Set(events.filter((entry) => entry.action === action).map((entry) => entry.internalUserId)).size;
    const newUsers = countDistinct("user_started");
    const consents = countDistinct("consent_accepted");
    const selectedTariff = countDistinct("tariff_selected");
    const paymentStarted = countDistinct("payment_initiated");
    const paid = countDistinct("payment_succeeded");
    return {
      newUsers,
      consents,
      selectedTariff,
      paymentStarted,
      paid,
    };
  };
  const getSupportMetrics = (from, to) => {
    const ticketsAll = getTicketsByStatus([]);
    const created = ticketsAll.filter(
      (ticket) => Number(ticket.createdAt || 0) >= from && Number(ticket.createdAt || 0) <= to
    );
    const closed = ticketsAll.filter(
      (ticket) => Number(ticket.closedAt || 0) >= from && Number(ticket.closedAt || 0) <= to
    );
    const inWorkNow = ticketsAll.filter((ticket) => ticket.status !== "closed").length;
    const firstResponseTimes = [];
    const closeTimes = [];
    const reasons = {};
    created.forEach((ticket) => {
      const messages = getTicketMessages(ticket.ticketNumber);
      const firstUser = messages.find((msg) => msg.from === "user");
      const firstSupport = messages.find((msg) => msg.from === "support");
      if (firstUser && firstSupport) {
        firstResponseTimes.push(Number(firstSupport.createdAt) - Number(firstUser.createdAt));
      }
      if (ticket.closedAt) {
        closeTimes.push(Number(ticket.closedAt) - Number(ticket.createdAt));
      }
      if (firstUser?.text) {
        const text = firstUser.text.toLowerCase();
        const reason =
          text.includes("оплат") || text.includes("платеж")
            ? "Оплата"
            : text.includes("возврат")
            ? "Возврат"
            : text.includes("не работает") || text.includes("ошибка")
            ? "Ошибка/не работает"
            : text.includes("доступ")
            ? "Доступ"
            : "Другое";
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
    });
    const avgFirstResponse =
      firstResponseTimes.length > 0
        ? firstResponseTimes.reduce((sum, value) => sum + value, 0) / firstResponseTimes.length
        : null;
    const avgClose =
      closeTimes.length > 0 ? closeTimes.reduce((sum, value) => sum + value, 0) / closeTimes.length : null;
    const topReasons = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      ticketsCreated: created.length,
      ticketsClosed: closed.length,
      ticketsInWorkNow: inWorkNow,
      avgFirstResponse,
      avgClose,
      topReasons,
    };
  };
  const renderAnalyticsText = (periodKey, sectionKey) => {
    const { from, to } = getPeriodBounds(periodKey);
    const periodRu = formatPeriodRu(periodKey);
    if (sectionKey === "funnel") {
      const funnel = getFunnelMetrics(from, to);
      const base = funnel.newUsers || 0;
      const percent = (value) => (base ? formatPercent(value / base) : "—");
      return [
        `🔻 Воронка за ${periodRu}`,
        "",
        `Новые пользователи: ${funnel.newUsers || "—"}`,
        `Приняли согласия: ${funnel.consents || "—"} (${percent(funnel.consents)}%)`,
        `Выбрали тариф: ${funnel.selectedTariff || "—"} (${percent(funnel.selectedTariff)}%)`,
        `Перешли к оплате: ${funnel.paymentStarted || "—"} (${percent(funnel.paymentStarted)}%)`,
        `Оплатили: ${funnel.paid || "—"} (${percent(funnel.paid)}%)`,
        "",
        `Конверсия в оплату: ${percent(funnel.paid)}%`,
      ].join("\n");
    }
    if (sectionKey === "support") {
      const support = getSupportMetrics(from, to);
      const reasonsLines = support.topReasons.length
        ? support.topReasons.map(([key, value]) => `• ${key}: ${value}`).join("\n")
        : "—";
      return [
        `🆘 Поддержка за ${periodRu}`,
        "",
        `Новых обращений: ${support.ticketsCreated}`,
        `В работе сейчас: ${support.ticketsInWorkNow}`,
        `Закрыто за период: ${support.ticketsClosed}`,
        `Среднее до первого ответа: ${formatDurationRu(support.avgFirstResponse)}`,
        `Среднее до закрытия: ${formatDurationRu(support.avgClose)}`,
        "",
        "Топ причин:",
        reasonsLines,
      ].join("\n");
    }
    const money = getMoneyMetrics(from, to);
    const byTariffLines = Object.entries(money.byTariff)
      .map(([key, stats]) => `• ${key}: ${formatNumberRu(stats.sum)} ₽ (${stats.count})`)
      .join("\n") || "—";
    const byProviderLines = Object.entries(money.byProvider)
      .map(([key, stats]) => `• ${key}: ${formatNumberRu(stats.sum)} ₽ (${stats.count})`)
      .join("\n") || "—";
    return [
      `📊 Экономика за ${periodRu}`,
      "",
      `Выручка: ${formatNumberRu(money.revenueSum)} ₽`,
      `Оплат: ${money.paymentsCount}`,
      `Платящих пользователей: ${money.payingUsers}`,
      `Средний чек: ${formatNumberRu(money.aov)} ₽`,
      `ARPPU: ${formatNumberRu(money.arppu)} ₽`,
      "",
      "По тарифам:",
      byTariffLines || "—",
      "",
      "По способу оплаты:",
      byProviderLines || "—",
    ].join("\n");
  };
  const renderAnalyticsScreen = async (ctx, periodKey, sectionKey) => {
    const text = ["📊 Аналитика", "Выберите период и раздел", "", renderAnalyticsText(periodKey, sectionKey)].join(
      "\n"
    );
    await ctx.reply(text, { parse_mode: "HTML", ...buildAnalyticsKeyboard(periodKey, sectionKey) });
  };
  const buildCsv = (headers, rows) => {
    const bom = "\uFEFF";
    const escapeCell = (value) => {
      const text = String(value ?? "");
      if (text.includes('"') || text.includes(",") || text.includes("\n")) {
        return `"${text.replace(/\"/g, '""')}"`;
      }
      return text;
    };
    const lines = [
      headers.map(escapeCell).join(","),
      ...rows.map((row) => row.map(escapeCell).join(",")),
    ];
    return `${bom}${lines.join("\n")}\n`;
  };
  const formatAnalyticsStatus = (status) => {
    if (status === "closed") return "ЗАКРЫТО";
    if (status === "in_progress" || status === "open") return "В РАБОТЕ";
    return "В РАБОТЕ";
  };
  const sendAnalyticsCsv = async (ctx, key, periodKey) => {
    if (!["payments", "funnel", "support"].includes(key)) return;
    const { from, to } = getPeriodBounds(periodKey);
    const periodLabel = periodKey;
    const filePath = path.join(os.tmpdir(), `analytics-${key}-${periodKey}.csv`);
    let headers = [];
    let rows = [];
    if (key === "payments") {
      headers = ["Дата", "Сумма", "Валюта", "Тариф", "Провайдер", "Статус", "ID платежа", "ID пользователя"];
      rows = listPayments()
        .filter((payment) => Number(payment.createdAt || 0) >= from && Number(payment.createdAt || 0) <= to)
        .map((payment) => [
          new Date(payment.createdAt || 0).toLocaleString("ru-RU"),
          payment.amount || 0,
          payment.currency || "RUB",
          payment.tariff || "—",
          payment.provider || "—",
          payment.status || "—",
          payment.paymentId || "—",
          payment.internalUserId || "—",
        ]);
    } else if (key === "funnel") {
      headers = ["Шаг", "Пользователей", "Период"];
      const funnel = getFunnelMetrics(from, to);
      rows = [
        ["Новые пользователи", funnel.newUsers || 0, periodLabel],
        ["Приняли согласия", funnel.consents || 0, periodLabel],
        ["Выбрали тариф", funnel.selectedTariff || 0, periodLabel],
        ["Перешли к оплате", funnel.paymentStarted || 0, periodLabel],
        ["Оплатили", funnel.paid || 0, periodLabel],
      ];
    } else {
      headers = ["Тикет", "Статус", "Создан", "Закрыт", "Время до 1-го ответа (сек)", "Время до закрытия (сек)", "ID пользователя"];
      const tickets = getTicketsByStatus([]).filter(
        (ticket) => Number(ticket.createdAt || 0) >= from && Number(ticket.createdAt || 0) <= to
      );
      rows = tickets.map((ticket) => {
        const messages = getTicketMessages(ticket.ticketNumber);
        const firstUser = messages.find((msg) => msg.from === "user");
        const firstSupport = messages.find((msg) => msg.from === "support");
        const frt =
          firstUser && firstSupport ? Math.round((firstSupport.createdAt - firstUser.createdAt) / 1000) : "—";
        const ttr = ticket.closedAt ? Math.round((ticket.closedAt - ticket.createdAt) / 1000) : "—";
        return [
          ticket.ticketNumber,
          formatAnalyticsStatus(ticket.status),
          new Date(ticket.createdAt || 0).toLocaleString("ru-RU"),
          ticket.closedAt ? new Date(ticket.closedAt).toLocaleString("ru-RU") : "—",
          frt,
          ttr,
          ticket.userId,
        ];
      });
    }
    try {
      await fsPromises.writeFile(filePath, buildCsv(headers, rows), "utf8");
      await ctx.replyWithDocument({ source: filePath, filename: `analytics-${key}-${periodKey}.csv` });
      await fsPromises.unlink(filePath).catch(() => {});
    } catch (error) {
      console.error("❌ sendAnalyticsCsv failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
      });
      await ctx.reply("⚠️ Не удалось сформировать CSV.");
    }
  };
  const getLatestConversationText = (ticket, fallbackText) => {
    const messages = getTicketMessages(ticket.ticketNumber);
    const lastNonSystem = [...messages].reverse().find((entry) => entry.from !== "system");
    return fallbackText || lastNonSystem?.text || messages.at(-1)?.text || "—";
  };
  const updateSupportChatMessage = async (ticket, messageText) => {
    if (!ticket?.supportChatMessageId || !supportConfig.supportTarget) return;
    const lastMessageText = getLatestConversationText(ticket, messageText);
    const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
    const ticketLink = getTicketPermalink(ticket);
    const payload = {
      parse_mode: "HTML",
      ...buildSupportTicketInlineKeyboard(ticket.userId, ticket.ticketNumber),
    };
    try {
      await bot.telegram.editMessageText(
        supportConfig.supportTarget,
        ticket.supportChatMessageId,
        undefined,
        buildSupportMessage({
          ticketNumber: ticket.ticketNumber,
          userId: ticket.userId,
          username: ticket.username,
          name: ticket.name,
          message: lastMessageText,
          contact: ticket.contact,
          plan: ticket.plan,
          createdAt,
          ticketLink,
          statusLabel: formatTicketStatusLabel(ticket.status),
        }),
        payload
      );
    } catch (error) {
      console.error("❌ updateSupportChatMessage failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
      });
    }
  };
  const buildTicketDialogText = (ticket) => {
    const createdAt = new Date(ticket.createdAt).toLocaleString("ru-RU");
    const statusLabel = formatTicketStatusLabel(ticket.status);
    const ticketLink = getTicketPermalink(ticket);
    const usernameLabel = ticket.username ? `@${String(ticket.username).replace(/^@/, "")}` : `ID ${ticket.userId}`;
    const userLink = getUserLink(ticket);
    const wrapLink = (text, href) => (href ? `<a href="${href}">${text}</a>` : text);
    const header = [
      "<b>📖 Диалог обращения</b>",
      `Номер: ${wrapLink(`№${ticket.ticketNumber}`, ticketLink)}`,
      `Дата: ${wrapLink(createdAt, ticketLink)}`,
      `Пользователь: ${wrapLink(usernameLabel, userLink)}`,
      `Статус: ${wrapLink(statusLabel, ticketLink)}`,
      "",
      "<b>Последние сообщения</b>",
    ].join("\n");
    const messages = getTicketMessages(ticket.ticketNumber);
    const lines = messages.map((entry) => {
      const fromLabel = entry.from === "support" ? "Поддержка" : entry.from === "system" ? "Система" : "Пользователь";
      const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString("ru-RU") : "";
      const text = entry.text || "";
      return `• [${time}] <b>${fromLabel}:</b> ${text}`;
    });
    let body = lines.join("\n");
    const maxLen = 3500;
    if (`${header}\n\n${body}`.length > maxLen) {
      const trimmed = [];
      let total = header.length + 2;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const next = `${lines[i]}\n` + trimmed.join("\n");
        if (total + next.length > maxLen) break;
        trimmed.unshift(lines[i]);
        total += lines[i].length + 1;
      }
      body = ["…", ...trimmed].join("\n");
    }
    return `${header}\n\n${body}`;
  };
  const sendSupportMenu = async (ctx) => {
    const tickets = getTicketsByStatus([]);
    const freshCount = tickets.filter((ticket) => ticket.status === "open").length;
    const workCount = tickets.filter((ticket) => ticket.status === "in_progress").length;
    await ctx.reply(textTemplates.supportSupportMenu, {
      parse_mode: "HTML",
      ...buildSupportBottomMenuKeyboard({ freshCount, workCount }),
    });
  };
  const sendSupportMenuHidden = async (ctx) => {
    await ctx.reply("Меню скрыто.", {
      reply_markup: { remove_keyboard: true },
    });
  };
  const buildListPayload = (items, page, totalPages, listCallback) => ({
    parse_mode: "HTML",
    ...buildTicketListKeyboard(items, listCallback, page, totalPages),
  });
  const sendTicketList = async (ctx, tickets, title, listCallback, page = 1, pageSize = 10) => {
    if (!tickets.length) {
      await ctx.reply(`${title}\n\n${textTemplates.supportTicketsEmpty}`, { parse_mode: "HTML" });
      return;
    }
    const sorted = [...tickets].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const { items, totalPages, page: safePage } = paginateTickets(sorted, page, pageSize);
    const list = buildTicketListText(items);
    await ctx.reply(`${title}\n\n${list}`, buildListPayload(items, safePage, totalPages, listCallback));
  };
  const sendMessageToExistingTicket = async ({ ctx, st, msgText, ticket, contact, username, name }) => {
    const createdAtMs = Date.now();
    const createdAt = new Date(createdAtMs).toLocaleString("ru-RU");
    upsertUser({
      internalUserId: ticket.userId,
      username: ctx.from?.username || null,
      name: name || null,
    });
    setState(ticket.userId, {
      supportMode: true,
      supportWriteEnabled: false,
      supportLastSentAt: Date.now(),
      supportLastTicketNumber: ticket.ticketNumber,
      supportLastTicketCreatedAtMs: ticket.createdAt,
    });
    appendTicketMessage({
      id: `${ticket.ticketNumber}-user-${createdAtMs}`,
      ticketNumber: ticket.ticketNumber,
      from: "user",
      text: msgText,
      createdAt: createdAtMs,
      telegramMessageId: ctx.message?.message_id || null,
    });
    const text = buildSupportMessage({
      ticketNumber: ticket.ticketNumber,
      userId: ticket.userId,
      username: ticket.username || username,
      name: ticket.name || name,
      message: msgText,
      contact: ticket.contact || contact,
      plan: ticket.plan || st.plan,
      createdAt,
      ticketLink: getTicketPermalink(ticket),
      statusLabel: formatTicketStatusLabel(ticket.status),
    });
    const supportResult = await sendToSupport(text, ticket.userId, ticket.ticketNumber);
    if (supportResult.ok) {
      const supportMessageId = supportResult.message?.message_id;
      const permalink = getTelegramPermalink(supportConfig.supportChatIdNum, supportMessageId);
      if (!ticket.supportChatMessageId && supportMessageId) {
        updateTicket(ticket.ticketNumber, {
          supportChatMessageId: supportMessageId || null,
          telegramPermalink: permalink,
        });
      }
      await updateSupportChatMessage(getTicket(ticket.ticketNumber), msgText);
      await notifyUserDelivery(ticket.userId, textTemplates.supportMessageSent, ctx, buildUserSupportActionsKeyboard());
      return true;
    }
    await notifyUserDelivery(
      ticket.userId,
      textTemplates.supportThanksFallback(getSupportLinkHtml(supportConfig)),
      ctx
    );
    return false;
  };
  const closeSupportCase = async (ticketNumber, targetUserId, ctx, closedBy) => {
    const ticket = getTicket(ticketNumber);
    if (!ticket) return;
    const closedAt = Date.now();
    updateTicket(ticketNumber, { status: "closed", closedAt, closedBy });
    appendAuditLog({
      action: "ticket_closed",
      actor: closedBy === "user" ? "user" : "support",
      entityType: "ticket",
      entityId: ticketNumber,
      internalUserId: targetUserId,
      meta: { closedBy },
    });
    appendTicketStatusMessage(ticketNumber, "closed", closedAt);
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
  const sendSupportLog = async (ticketNumber, ctx) => {
    const ticket = getTicket(ticketNumber);
    if (!ticket) return;
    const messages = getTicketMessages(ticketNumber);
    try {
      const filePath = await writeTicketLogTxt(ticket, messages);
      const filename = `ticket-${ticketNumber}.txt`;
      const targetChatId = ctx.chat?.id || supportConfig.supportTarget;
      if (!targetChatId) return;
      await bot.telegram.sendDocument(targetChatId, { source: filePath, filename });
      await fsPromises.unlink(filePath).catch(() => {});
      appendAuditLog({
        action: "dialog_exported_txt",
        actor: "support",
        entityType: "export",
        entityId: ticketNumber,
        internalUserId: ticket.userId,
      });
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
  const sendUserLog = async (ticketNumber, ctx, userId) => {
    const ticket = getTicket(ticketNumber);
    if (!ticket || String(ticket.userId) !== String(userId)) return;
    const messages = getTicketMessages(ticketNumber);
    try {
      const filePath = await writeTicketLogTxt(ticket, messages);
      const filename = `ticket-${ticketNumber}.txt`;
      await bot.telegram.sendDocument(userId, { source: filePath, filename });
      await fsPromises.unlink(filePath).catch(() => {});
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
  const shouldBlockUserMessage = (ctx, st, msgText) => {
    if (msgText.startsWith("/")) return false;
    if (st.supportMode) return false;
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

    const isSupportChat = supportConfig.supportChatIdNum && ctx.chat?.id === supportConfig.supportChatIdNum;

    if (supportSender && isSupportChat && msgText === "/support_menu") {
      await sendSupportMenu(ctx);
      return;
    }
    if (supportSender && isSupportChat && msgText === "/analytics") {
      const current = getState(userId);
      const nextState = setState(userId, {
        analyticsPeriod: current.analyticsPeriod || "7d",
        analyticsSection: current.analyticsSection || "money",
      });
      await renderAnalyticsScreen(ctx, nextState.analyticsPeriod, nextState.analyticsSection);
      return;
    }

    if (supportSender && isSupportChat) {
      const supportMenuKey = resolveSupportMenuKey(msgText);
      if (supportMenuKey === "all") {
        const tickets = getTicketsByStatus([]);
        await sendTicketList(ctx, tickets, "📚 Все обращения", "SUP_LG_A", 1, 10);
        return;
      }
      if (supportMenuKey === "fresh") {
        const tickets = getTicketsByStatus(["open"]);
        await sendTicketList(ctx, tickets, "🆕 Новые", "SUP_LG_N", 1, 10);
        return;
      }
      if (supportMenuKey === "work") {
        const tickets = getTicketsByStatus(["in_progress"]);
        await sendTicketList(ctx, tickets, "🟡 В работе", "SUP_LG_W", 1, 10);
        return;
      }
      if (supportMenuKey === "closed") {
        const tickets = getTicketsByStatus(["closed"]);
        await sendTicketList(ctx, tickets, "📁 Закрытые", "SUP_LG_C", 1, 10);
        return;
      }
      if (supportMenuKey === "search") {
        setSupportSearchMode(userId, { mode: "global", step: "support_search_query" });
        await ctx.reply("🔎 Введите запрос для поиска (ticketNumber, userId или username).");
        return;
      }
      if (supportMenuKey === "analytics") {
        const current = getState(userId);
        const nextState = setState(userId, {
          analyticsPeriod: current.analyticsPeriod || "7d",
          analyticsSection: current.analyticsSection || "money",
        });
        await renderAnalyticsScreen(ctx, nextState.analyticsPeriod, nextState.analyticsSection);
        return;
      }
      if (supportMenuKey === "hide") {
        await sendSupportMenuHidden(ctx);
        return;
      }
    }

    if (supportSender && isSupportChat && msgText.startsWith("/support_search")) {
      setSupportSearchMode(userId, { mode: "global", step: "support_search_query" });
      await ctx.reply("🔎 Введите запрос для поиска (ticketNumber, userId или username).");
      return;
    }

    if (supportSender && isSupportChat && !msgText.startsWith("/")) {
      const searchMode = getSupportSearchMode(userId);
      const replyMode = getSupportReplyMode(userId);
      if (searchMode?.mode && searchMode?.step === "support_search_query" && !replyMode?.targetUserId) {
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
        const { items } = paginateTickets(results, 1, 10);
        const header = [
          "🔎 Результаты поиска",
          "",
          `Всего: ${results.length}`,
        ].join("\n");
        const list = buildTicketListText(items);
        await ctx.reply(`${header}\n\n${list}`, buildListPayload(items, 1, 1, "SUP_LG_A"));
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
          appendAuditLog({
            action: "support_reply_sent",
            actor: "support",
            entityType: "ticket",
            entityId: replyMode.ticketNumber,
            internalUserId: replyMode.targetUserId,
            meta: { via: "reply_mode" },
          });
          const ticket = getTicket(replyMode.ticketNumber);
          if (ticket && ticket.status === "open") {
            updateTicket(replyMode.ticketNumber, { status: "in_progress" });
            appendTicketStatusMessage(replyMode.ticketNumber, "in_progress");
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
          appendAuditLog({
            action: "support_reply_sent",
            actor: "support",
            entityType: "ticket",
            entityId: ticketNumber,
            internalUserId: targetUserId,
            meta: { via: "command" },
          });
          const ticket = getTicket(ticketNumber);
          if (ticket && ticket.status === "open") {
            updateTicket(ticketNumber, { status: "in_progress" });
            appendTicketStatusMessage(ticketNumber, "in_progress");
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
      upsertUser({
        internalUserId: userId,
        username: ctx.from?.username || null,
        name: name || null,
      });
      const existingTicketNumber = st.supportLastTicketNumber;
      const existingTicket = existingTicketNumber ? getTicket(existingTicketNumber) : null;
      if (existingTicket && existingTicket.status !== "closed") {
        await sendMessageToExistingTicket({
          ctx,
          st,
          msgText,
          ticket: existingTicket,
          contact,
          username,
          name,
        });
        return;
      }

      const ticketNumber = bumpTicketNumber(st, userId);
      createTicket({
        ticketNumber,
        userId,
        internalUserId: userId,
        username,
        name,
        plan: st.plan,
        contact,
        createdAt: createdAtMs,
        status: "open",
        supportChatId: supportConfig.supportTarget,
      });
      appendAuditLog({
        action: "ticket_created",
        actor: "user",
        entityType: "ticket",
        entityId: ticketNumber,
        internalUserId: userId,
        meta: { source: "support_message" },
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
        const updatedTicket = getTicket(ticketNumber);
        await updateSupportChatMessage(updatedTicket, msgText);
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

      const createdAtMs = Date.now();
      const createdAt = new Date(createdAtMs).toLocaleString("ru-RU");
      const contact = st.supportContact || "не указан";
      const username = ctx.from?.username ? `@${ctx.from.username}` : "не указан";
      const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ");
      const existingTicketNumber = st.supportLastTicketNumber;
      const existingTicket = existingTicketNumber ? getTicket(existingTicketNumber) : null;
      if (existingTicket && existingTicket.status !== "closed") {
        await sendMessageToExistingTicket({
          ctx,
          st,
          msgText,
          ticket: existingTicket,
          contact,
          username,
          name,
        });
        return;
      }

      const ticketNumber = bumpTicketNumber(st, userId);
      upsertUser({
        internalUserId: userId,
        username: ctx.from?.username || null,
        name: name || null,
      });
      createTicket({
        ticketNumber,
        userId,
        internalUserId: userId,
        username,
        name,
        plan: st.plan,
        contact,
        createdAt: createdAtMs,
        status: "open",
        supportChatId: supportConfig.supportTarget,
      });
      appendAuditLog({
        action: "ticket_created",
        actor: "user",
        entityType: "ticket",
        entityId: ticketNumber,
        internalUserId: userId,
        meta: { source: "support_followup" },
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
        const updatedTicket = getTicket(ticketNumber);
        await updateSupportChatMessage(updatedTicket, msgText);
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

      if (data.startsWith("AN_")) {
        if (!isSupportSender(ctx) || !(supportConfig.supportChatIdNum && ctx.chat?.id === supportConfig.supportChatIdNum)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const current = getState(userId);
        const period = current.analyticsPeriod || "7d";
        const section = current.analyticsSection || "money";
        const editAnalytics = async (nextPeriod, nextSection) => {
          const text = ["📊 Аналитика", "Выберите период и раздел", "", renderAnalyticsText(nextPeriod, nextSection)].join(
            "\n"
          );
          try {
            await ctx.editMessageText(text, { parse_mode: "HTML", ...buildAnalyticsKeyboard(nextPeriod, nextSection) });
          } catch {
            await ctx.reply(text, { parse_mode: "HTML", ...buildAnalyticsKeyboard(nextPeriod, nextSection) });
          }
        };
        if (data === "AN_BACK:root") {
          await sendSupportMenu(ctx);
          return;
        }
        if (data.startsWith("AN_P:")) {
          const nextPeriod = data.split(":")[1] || "7d";
          setState(userId, { analyticsPeriod: nextPeriod });
          await editAnalytics(nextPeriod, section);
          return;
        }
        if (data.startsWith("AN_S:")) {
          const nextSection = data.split(":")[1] || "money";
          setState(userId, { analyticsSection: nextSection });
          await editAnalytics(period, nextSection);
          return;
        }
        if (data === "AN_E:menu") {
          try {
            await ctx.editMessageText("⬇️ Экспорт CSV", { parse_mode: "HTML", ...buildAnalyticsExportKeyboard() });
          } catch {
            await ctx.reply("⬇️ Экспорт CSV", { parse_mode: "HTML", ...buildAnalyticsExportKeyboard() });
          }
          return;
        }
        if (data === "AN_E:back") {
          await editAnalytics(period, section);
          return;
        }
        if (data.startsWith("AN_E:")) {
          const key = data.split(":")[1];
          await sendAnalyticsCsv(ctx, key, period);
          return;
        }
      }

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

      if (data.startsWith("SUP_TU:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const token = data.replace("SUP_TU:", "");
        const ticket = getTicket(token);
        const userIdValue = ticket ? ticket.userId : token;
        const ticketsForUser = getTicketsByUser(userIdValue, []);
        const activeCount = ticketsForUser.filter((item) => item.status !== "closed").length;
        const closedCount = ticketsForUser.filter((item) => item.status === "closed").length;
        const header = [
          "👤 Обращения пользователя",
          "",
          `Активные: ${activeCount}`,
          `Закрытые: ${closedCount}`,
        ].join("\n");
        await ctx.reply(header, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🟡 В работе", callback_data: `SUP_LU_W:${userIdValue}:1` }],
              [{ text: "📁 Закрытые", callback_data: `SUP_LU_C:${userIdValue}:1` }],
              [{ text: "⬅️ Назад", callback_data: "SUP_LG_A:1" }],
            ],
          },
        });
        return;
      }

      if (data.startsWith("SUP_LU_W:") || data.startsWith("SUP_LU_C:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const [action, targetUserId, pageStr] = data.split(":");
        const page = Number(pageStr || 1);
        const statuses = action === "SUP_LU_W" ? ["open", "in_progress"] : ["closed"];
        const tickets = getTicketsByUser(targetUserId, statuses);
        const title = action === "SUP_LU_W" ? "🟡 В работе" : "📁 Закрытые";
        await sendTicketList(ctx, tickets, title, `${action}:${targetUserId}`, page, 10);
        return;
      }

      if (
        data.startsWith("SUP_LG_A:") ||
        data.startsWith("SUP_LG_N:") ||
        data.startsWith("SUP_LG_W:") ||
        data.startsWith("SUP_LG_C:")
      ) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const [action, pageStr] = data.split(":");
        const page = Number(pageStr || 1);
        const statuses =
          action === "SUP_LG_C"
            ? ["closed"]
            : action === "SUP_LG_W"
            ? ["in_progress"]
            : action === "SUP_LG_N"
            ? ["open"]
            : [];
        const tickets = getTicketsByStatus(statuses);
        const title =
          action === "SUP_LG_C"
            ? "📁 Закрытые"
            : action === "SUP_LG_W"
            ? "🟡 В работе"
            : action === "SUP_LG_N"
            ? "🆕 Новые"
            : "📚 Все обращения";
        await sendTicketList(ctx, tickets, title, action, page, 10);
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
        await ctx.reply(buildTicketDialogText(ticket), {
          parse_mode: "HTML",
          ...buildSupportTicketInlineKeyboard(ticket.userId, ticket.ticketNumber),
        });
        return;
      }

      if (data.startsWith("SUP_REPLY:") || data.startsWith("SUPPORT_REPLY:")) {
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
          updateTicket(ticketNumber, { status: "in_progress" });
          appendTicketStatusMessage(ticketNumber, "in_progress");
        }
        await ctx.reply(
          `✉️ Режим ответа включен для тикета ${ticketNumber}.\nСледующее сообщение отправится пользователю.`
        );
        return;
      }

      if (data.startsWith("SUP_CLOSE:") || data.startsWith("SUPPORT_CLOSE:")) {
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

      if (data.startsWith("SUP_TXT:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const ticketNumber = data.replace("SUP_TXT:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendSupportLog(ticketNumber, ctx);
        return;
      }

      if (data.startsWith("SUPPORT_LOG_TXT:") || data.startsWith("SUP_LOG_TXT:")) {
        if (!isSupportSender(ctx)) {
          await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
          return;
        }
        const ticketNumber = data.includes("SUPPORT_LOG_TXT:")
          ? data.replace("SUPPORT_LOG_TXT:", "")
          : data.replace("SUP_LOG_TXT:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendSupportLog(ticketNumber, ctx);
        return;
      }

      if (data.startsWith("USER_LOG_TXT:")) {
        const ticketNumber = data.replace("USER_LOG_TXT:", "");
        if (!getTicket(ticketNumber)) {
          await ctx.answerCbQuery("⚠️ Тикет не найден.", { show_alert: true });
          return;
        }
        await sendUserLog(ticketNumber, ctx, userId);
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
        `${title}\n\n${buildTicketListText(tickets)}`,
        buildUserTicketListKeyboard(tickets, "MENU_SUPPORT")
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
        `${title}\n\n${buildTicketListText(tickets)}`,
        buildUserTicketListKeyboard(tickets, "MENU_SUPPORT")
      );
      return;
    }

    if (data === "SUPPORT_LIST_ACTIVE") {
      if (!isSupportSender(ctx)) {
        await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
        return;
      }
      const tickets = getTicketsByStatus(["open", "in_progress"]);
      await sendTicketList(ctx, tickets, "🟡 В работе", "SUP_LG_W", 1, 10);
      return;
    }

    if (data === "SUPPORT_LIST_CLOSED") {
      if (!isSupportSender(ctx)) {
        await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
        return;
      }
      const tickets = getTicketsByStatus(["closed"]);
      await sendTicketList(ctx, tickets, "📁 Закрытые", "SUP_LG_C", 1, 10);
      return;
    }

    if (data === "SUPPORT_MENU") {
      if (!isSupportSender(ctx)) {
        await ctx.answerCbQuery("⚠️ Недостаточно прав.", { show_alert: true });
        return;
      }
      await sendSupportMenu(ctx);
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
      appendAuditLog({
        action: "user_data_deleted",
        actor: "user",
        entityType: "user",
        entityId: String(userId),
        internalUserId: userId,
      });
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
