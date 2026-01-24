// src/utils/support-logs.js
import fsPromises from "fs/promises";
import path from "path";
import os from "os";

const formatDateTime = (value) => {
  if (!value) return "не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не указано";
  return date.toLocaleString("ru-RU");
};

const formatDirection = (value) => {
  if (value === "user") return "Пользователь";
  if (value === "support") return "Поддержка";
  if (value === "system") return "Система";
  return "Система";
};

export const buildTicketLogText = (ticket, messages) => {
  const lines = [
    "ТИТУЛЬНАЯ СТРАНИЦА",
    "",
    `Обращение №${ticket.ticketNumber}`,
    `Дата создания: ${formatDateTime(ticket.createdAt)}`,
    `Дата закрытия: ${formatDateTime(ticket.closedAt)}`,
    "",
    `Статус: ${ticket.status || "open"}`,
    "",
    "Данные пользователя:",
    `User ID: ${ticket.userId}`,
    `Username: ${ticket.username || "не указан"}`,
    `Имя: ${ticket.name || "не указано"}`,
    `Контакт: ${ticket.contact || "не указан"}`,
    "",
    `Тариф: ${ticket.plan || "не выбран"}`,
    "",
    ticket.telegramPermalink ? `Permalink: ${ticket.telegramPermalink}` : null,
    "",
    "ДИАЛОГ",
  ].filter(Boolean);

  for (const msg of messages) {
    const time = formatDateTime(msg.createdAt);
    const direction = formatDirection(msg.from);
    lines.push(`[${time}] ${direction}: ${msg.text || ""}`.trim());
    lines.push("");
  }

  lines.push("");
  lines.push("Для личного использования");

  return `${lines.join("\n")}\n`;
};

export const writeTicketLogTxt = async (ticket, messages) => {
  const content = buildTicketLogText(ticket, messages);
  const filePath = path.join(os.tmpdir(), `ticket-${ticket.ticketNumber}.txt`);
  await fsPromises.writeFile(filePath, content, "utf8");
  return filePath;
};
