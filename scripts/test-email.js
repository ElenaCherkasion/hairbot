// scripts/test-email.js
import dotenv from "dotenv";
dotenv.config();

import { sendSupportEmail } from "../src/utils/mailer.js";

async function main() {
  console.log("SMTP_HOST:", process.env.SMTP_HOST);
  console.log("SMTP_PORT:", process.env.SMTP_PORT);
  console.log("SMTP_SECURE:", process.env.SMTP_SECURE);
  console.log("SMTP_USER:", process.env.SMTP_USER);
  console.log("SUPPORT_TO_EMAIL:", process.env.SUPPORT_TO_EMAIL);

  await sendSupportEmail({
    subject: "HAIRbot SMTP test",
    text: "Если ты читаешь это письмо — SMTP настроен правильно ✅",
  });

  console.log("✅ Email sent");
}

main().catch((e) => {
  console.error("❌ Email test failed:", e?.message || e);
  process.exit(1);
});
