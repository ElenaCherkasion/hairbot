// scripts/test-smtp.js
import { sendSupportEmail } from "../src/utils/mailer.js";

async function run() {
  const to = (process.env.SUPPORT_TO_EMAIL || process.env.SMTP_USER || "").trim();
  if (!to) {
    console.error("❌ SUPPORT_TO_EMAIL or SMTP_USER must be set for test.");
    process.exit(1);
  }

  try {
    await sendSupportEmail({
      subject: "HAIRbot SMTP test",
      text: "This is a test email from HAIRbot SMTP self-test.",
    });
    console.log(`✅ Test email sent to ${to}`);
  } catch (error) {
    const hint = error?.code === "EAUTH" ? " Gmail требует App Password." : "";
    console.error("❌ SMTP test failed:", {
      message: error?.message,
      code: error?.code,
      response: error?.response,
      stack: error?.stack,
      hint,
    });
    process.exit(1);
  }
}

run();
