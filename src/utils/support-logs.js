// src/utils/support-logs.js
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";
import PDFDocument from "pdfkit";

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
    `Обращение №${ticket.ticketNumber}`,
    "",
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
  lines.push("");
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

export const writeTicketLogPdf = async (ticket, messages) => {
  const filePath = path.join(os.tmpdir(), `ticket-${ticket.ticketNumber}.pdf`);
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  await new Promise((resolve, reject) => {
    const stream = doc.pipe(fs.createWriteStream(filePath));
    stream.on("finish", resolve);
    stream.on("error", reject);

    doc.font("Times-Roman");
    doc.fontSize(18).text("SUPPORT TICKET", { align: "center" });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Ticket: ${ticket.ticketNumber}`);
    doc.text(`User ID: ${ticket.userId}`);
    doc.text(`Username: ${ticket.username || "не указан"}`);
    doc.text(`Имя: ${ticket.name || "не указано"}`);
    doc.text(`Контакт: ${ticket.contact || "не указан"}`);
    doc.text(`Тариф: ${ticket.plan || "не выбран"}`);
    doc.text(`Создан: ${formatDateTime(ticket.createdAt)}`);
    doc.text(`Статус: ${ticket.status || "open"}`);
    if (ticket.telegramPermalink) {
      doc.text(`Permalink: ${ticket.telegramPermalink}`);
    }
    doc.moveDown();
    doc.fontSize(12).text("Сообщения:", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);

    messages.forEach((msg) => {
      const time = formatDateTime(msg.createdAt);
      const direction = formatDirection(msg.from);
      const text = msg.text || "";
      doc.text(`[${time}] ${direction}: ${text}`, { lineGap: 4 });
    });

    doc.moveDown();
    doc.fontSize(9).text(`Сформировано: ${formatDateTime(Date.now())}`, { align: "right" });
    doc.end();
  });

  return filePath;
};
