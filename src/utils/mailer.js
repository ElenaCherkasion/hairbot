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
  });

  return cachedTransporter;
}

export async function sendSupportEmail({ subject, text }) {
  const to = (process.env.SUPPORT_TO_EMAIL || process.env.SMTP_USER || "").trim();
  if (!to) throw new Error("SUPPORT_TO_EMAIL is missing");

  const fromUser = (process.env.SMTP_USER || "").trim();

  const transporter = getTransporter();
  return transporter.sendMail({
    from: `HAIRbot <${fromUser}>`,
    to,
    subject,
    text,
  });
}
