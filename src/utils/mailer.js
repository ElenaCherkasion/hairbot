// src/utils/mailer.js
import nodemailer from "nodemailer";

function mustEnv(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

export async function sendSupportEmail({ subject, text }) {
  const host = mustEnv("SMTP_HOST");
  const port = Number(mustEnv("SMTP_PORT"));
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  const user = mustEnv("SMTP_USER");
  const pass = mustEnv("SMTP_PASS");

  const to = (process.env.SUPPORT_TO_EMAIL || "cherkashina720@gmail.com").trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: user,
    to,
    subject,
    text,
  });
}
