import 'dotenv/config';
import fetch from "node-fetch";

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error("❌ TELEGRAM_TOKEN не установлен");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const PUBLIC_URL = process.env.PUBLIC_URL; // например: https://hairbot.onrender.com
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/telegram/webhook";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ""; // опционально

const cmd = (process.argv[2] || "set").toLowerCase();

function requirePublicUrl() {
  if (!PUBLIC_URL) {
    console.error(
      "❌ PUBLIC_URL не установлен.\n" +
        "   Пример: PUBLIC_URL=https://hairbot.onrender.com\n" +
        "   (укажи в Render → Environment)"
    );
    process.exit(1);
  }
}

async function tg(method, body) {
  const r = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!data.ok) {
    throw new Error(`${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function tgGet(method) {
  const r = await fetch(`${TELEGRAM_API}/${method}`);
  const data = await r.json();
  if (!data.ok) {
    throw new Error(`${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result;
}

async function setWebhook() {
  requirePublicUrl();
  const url = `${PUBLIC_URL}${WEBHOOK_PATH}`;

  const payload = {
    url,
    drop_pending_updates: true,
  };

  // Telegram поддерживает secret_token (будет приходить в header X-Telegram-Bot-Api-Secret-Token)
  if (WEBHOOK_SECRET) payload.secret_token = WEBHOOK_SECRET;

  const res = await tg("setWebhook", payload);
  console.log("✅ setWebhook:", res);
  console.log("🔗 Webhook URL:", url);
  if (WEBHOOK_SECRET) console.log("🔐 Secret token: установлен");
}

async function deleteWebhook() {
  const res = await tg("deleteWebhook", { drop_pending_updates: true });
  console.log("✅ deleteWebhook:", res);
}

async function webhookInfo() {
  const info = await tgGet("getWebhookInfo");
  console.log("ℹ️ getWebhookInfo:");
  console.log(JSON.stringify(info, null, 2));
}

async function test() {
  // 1) Проверяем, что твой сервис доступен
  if (PUBLIC_URL) {
    try {
      const healthUrl = `${PUBLIC_URL}/health`;
      const r = await fetch(healthUrl, { method: "GET" });
      const text = await r.text();
      console.log("✅ Healthcheck:", r.status, healthUrl);
      console.log("↳ Response:", text.slice(0, 300));
    } catch (e) {
      console.log("⚠️ Не удалось достучаться до PUBLIC_URL/health:", e?.message || e);
    }
  } else {
    console.log("ℹ️ PUBLIC_URL не задан — пропускаю проверку /health");
  }

  // 2) Проверяем Telegram настройки webhook
  await webhookInfo();

  // 3) Проверим, что бот жив (getMe)
  const me = await tgGet("getMe");
  console.log("✅ getMe:", me);
}

(async () => {
  try {
    if (cmd === "set" || cmd === "setup") {
      await setWebhook();
    } else if (cmd === "delete" || cmd === "remove") {
      await deleteWebhook();
    } else if (cmd === "info" || cmd === "status") {
      await webhookInfo();
    } else if (cmd === "test" || cmd === "check") {
      await test();
    } else {
      console.log(
        "Использование:\n" +
          "  node scripts/setup-webhook.js set\n" +
          "  node scripts/setup-webhook.js info\n" +
          "  node scripts/setup-webhook.js delete\n" +
          "  node scripts/setup-webhook.js test\n"
      );
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Ошибка:", err?.message || err);
    process.exit(1);
  }
})();
