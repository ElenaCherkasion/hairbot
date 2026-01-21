import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sendSupportEmail } from "../src/utils/mailer.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = fs.existsSync(path.join(rootDir, ".env"))
  ? path.join(rootDir, ".env")
  : path.join(rootDir, ".env.example");
dotenv.config({ path: envPath });

async function main() {
  const subject = process.env.SUPPORT_TEST_SUBJECT || "HAIRbot Support | test message";
  const text =
    process.env.SUPPORT_TEST_TEXT ||
    "Test support email from HairBot. If you received this, SMTP settings are working.";

  await sendSupportEmail({ subject, text });
  console.log("✅ Support email sent");
}

main().catch((error) => {
  console.error("❌ Support email test failed:", error?.message || error);
  process.exitCode = 1;
});
