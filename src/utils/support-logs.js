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
    `Дата создания: ${formatDateTime(ticket.createdAt)}`,
    `Дата закрытия: ${formatDateTime(ticket.closedAt)}`,
    `Статус: ${ticket.status || "open"}`,
    "",
    "Данные пользователя:",
    `User ID: ${ticket.userId}`,
    `Username: ${ticket.username || "не указан"}`,
    `Имя: ${ticket.name || "не указано"}`,
    `Контакт: ${ticket.contact || "не указан"}`,
    `Тариф: ${ticket.plan || "не выбран"}`,
    ticket.telegramPermalink ? `Permalink: ${ticket.telegramPermalink}` : null,
    "",
    "ДИАЛОГ",
    "Чёткое разделение «Пользователь / Поддержка»",
    "",
    "Для личного использования",
  ].filter(Boolean);

  for (const msg of messages) {
    const time = formatDateTime(msg.createdAt);
    const direction = formatDirection(msg.from);
    lines.push(`[${time}] ${direction}: ${msg.text || ""}`.trim());
  }

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
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });

  await new Promise((resolve, reject) => {
    const stream = doc.pipe(fs.createWriteStream(filePath));
    stream.on("finish", resolve);
    stream.on("error", reject);

    doc.font("Times-Roman");
    doc.fontSize(18).text("ТИТУЛЬНАЯ СТРАНИЦА", { align: "center" });
    doc.moveDown();
    doc.font("Times-Roman");
    doc.fontSize(12);
    doc.text(`Обращение №${ticket.ticketNumber}`);
    doc.text(`Дата создания: ${formatDateTime(ticket.createdAt)}`);
    doc.text(`Дата закрытия: ${formatDateTime(ticket.closedAt)}`);
    doc.text(`Статус: ${ticket.status || "open"}`);
    doc.moveDown();
    doc.text("Данные пользователя:");
    doc.text(`User ID: ${ticket.userId}`);
    doc.text(`Username: ${ticket.username || "не указан"}`);
    doc.text(`Имя: ${ticket.name || "не указано"}`);
    doc.text(`Контакт: ${ticket.contact || "не указан"}`);
    doc.text(`Тариф: ${ticket.plan || "не выбран"}`);
    if (ticket.telegramPermalink) {
      doc.text(`Permalink: ${ticket.telegramPermalink}`);
    }
    doc.addPage();
    doc.font("Times-Roman");
    doc.fontSize(14).text("Сообщения:", { underline: true });
    doc.text("Чёткое разделение «Пользователь / Поддержка»");
    doc.moveDown(0.5);
    doc.font("Times-Roman");
    doc.fontSize(12);

    messages.forEach((msg) => {
      const time = formatDateTime(msg.createdAt);
      const direction = formatDirection(msg.from);
      const text = msg.text || "";
      doc.text(`[${time}] ${direction}: ${text}`, { lineGap: 4 });
    });

    doc.moveDown();
    doc.font("Times-Roman");
    doc.fontSize(9).text(`Сформировано: ${formatDateTime(Date.now())}`, { align: "right" });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(i);
      doc.font("Times-Roman");
      doc.fontSize(10).text(
        `Для личного использования • Стр. ${i + 1} из ${range.count}`,
        40,
        doc.page.height - 40,
        { align: "center" }
      );
    }
    doc.end();
  });

  return filePath;
};
