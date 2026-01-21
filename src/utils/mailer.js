// src/utils/mailer.js
import nodemailer from "nodemailer";

function required(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

function boolEnv(name, def = false) {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return def;
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = required("SMTP_HOST");
  const port = Number(required("SMTP_PORT"));
  const secure = boolEnv("SMTP_SECURE", port === 465);
  const user = required("SMTP_USER");
  const pass = required("SMTP_PASS");

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 10000),
    tls: {
      rejectUnauthorized: boolEnv("SMTP_TLS_REJECT_UNAUTHORIZED", false),
    },
  });

  return cachedTransporter;
}

export async function sendSupportEmail({ subject, text }) {
  const to = (process.env.SUPPORT_TO_EMAIL || process.env.SMTP_USER || "cherkashina720@gmail.com").trim();

  const fromUser =
    (process.env.SUPPORT_FROM_EMAIL || process.env.SMTP_USER || process.env.SUPPORT_TO_EMAIL || "").trim();

  const transporter = getTransporter();
  return transporter.sendMail({
    from: fromUser ? `HAIRbot <${fromUser}>` : "HAIRbot",
    to,
    subject,
    text,
  });
}
