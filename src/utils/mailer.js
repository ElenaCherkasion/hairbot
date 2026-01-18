// src/utils/mailer.js
import nodemailer from "nodemailer";

const SUPPORT_TO = "cherkashina720@gmail.com";

function hasSMTP() {
  return (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

export async function sendSupportEmail({ subject, text }) {
  if (!hasSMTP()) {
    console.warn("⚠️ SMTP не настроен. Письмо не отправлено. Проверь env SMTP_*");
    console.warn("SUBJECT:", subject);
    console.warn("TEXT:", text);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: SUPPORT_TO,
    subject,
    text,
  });
}
