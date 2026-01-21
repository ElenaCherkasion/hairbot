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
let transporterVerified = false;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = required("SMTP_HOST");
  const port = Number(required("SMTP_PORT"));
  const secure = port === 587 ? false : boolEnv("SMTP_SECURE", port === 465);
  const requireTLS = port === 587 ? true : !secure;
  const user = required("SMTP_USER");
  const pass = required("SMTP_PASS");
  const logger = boolEnv("SMTP_LOGGER", true);
  const debug = boolEnv("SMTP_DEBUG", true);
  const rejectUnauthorized = boolEnv("SMTP_TLS_REJECT_UNAUTHORIZED", true);

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: { user, pass },
    logger,
    debug,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 10000),
    tls: {
      rejectUnauthorized,
      servername: host,
    },
  });

  return cachedTransporter;
}

export async function sendSupportEmail({ subject, text }) {
  const to = (process.env.SUPPORT_TO_EMAIL || process.env.SMTP_USER || "cherkashina720@gmail.com").trim();

  const fromUser =
    (process.env.SUPPORT_FROM_EMAIL || process.env.SMTP_USER || process.env.SUPPORT_TO_EMAIL || "").trim();

  const transporter = getTransporter();
  if (!transporterVerified) {
    try {
      await transporter.verify();
      console.log("✅ SMTP transporter verified");
      transporterVerified = true;
    } catch (error) {
      const hint = error?.code === "EAUTH" ? " Gmail требует App Password." : "";
      console.error("❌ SMTP verify failed:", {
        message: error?.message,
        code: error?.code,
        response: error?.response,
        stack: error?.stack,
        hint,
      });
      throw error;
    }
  }
  return transporter.sendMail({
    from: fromUser ? `HAIRbot <${fromUser}>` : "HAIRbot <no-reply@example.com>",
    to,
    subject,
    text,
  });
}
