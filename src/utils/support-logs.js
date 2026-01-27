// src/utils/support-logs.js
import fsPromises from "fs/promises";
import path from "path";
import os from "os";

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (num) => String(num).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

const formatDirection = (value) => {
  if (value === "user") return "ПОЛЬЗОВАТЕЛЬ";
  if (value === "support") return "ПОДДЕРЖКА";
  if (value === "system") return "СИСТЕМА";
  return "СИСТЕМА";
};

const formatStatus = (value) => {
  if (value === "closed") return "ЗАКРЫТО";
  if (value === "in_progress" || value === "open") return "В РАБОТЕ";
  return "В РАБОТЕ";
};

const formatValue = (value) => (value ? value : "—");

const formatUsername = (value) => {
  if (!value) return "—";
  const username = String(value).replace(/^@/, "");
  return `@${username}`;
};

export const buildTicketLogText = (ticket, messages) => {
  const lines = [
    "SUPPORT TICKET",
    "==================================================",
    "",
    `Тикет: ${ticket.ticketNumber}`,
    `Статус: ${formatStatus(ticket.status)}`,
    `Создан: ${formatDateTime(ticket.createdAt)}`,
    `Закрыт: ${formatDateTime(ticket.closedAt)}`,
    "",
    "",
    "ПОЛЬЗОВАТЕЛЬ",
    "--------------------------------------------------",
    "",
    `ID: ${formatValue(ticket.userId)}`,
    `Username: ${formatUsername(ticket.username)}`,
    `Имя: ${formatValue(ticket.name)}`,
    `Тариф: ${formatValue(ticket.plan)}`,
    `Контакт: ${formatValue(ticket.contact)}`,
    "",
    "",
    "СООБЩЕНИЯ",
    "--------------------------------------------------",
  ];

  for (const msg of messages) {
    const time = formatDateTime(msg.createdAt);
    const direction = formatDirection(msg.from);
    const text = msg.text || "";
    lines.push("");
    lines.push("");
    lines.push(`[${direction}] ${time}`);
    lines.push("");
    lines.push(`***${text}***`);
    lines.push("");
    lines.push("");
  }

  lines.push("");
  lines.push("==================================================");
  lines.push("Конец диалога");
  lines.push(`Сформировано: ${formatDateTime(Date.now())}`);

  return `${lines.join("\n")}\n`;
};

export const writeTicketLogTxt = async (ticket, messages) => {
  const content = buildTicketLogText(ticket, messages);
  const filePath = path.join(os.tmpdir(), `ticket-${ticket.ticketNumber}.txt`);
  await fsPromises.writeFile(filePath, content, "utf8");
  return filePath;
};
