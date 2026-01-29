import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";

export async function startBot() {
  const token = process.env.TELEGRAM_TOKEN || "";
  if (!token) {
    console.error("No token");
    return null;
  }

  const isTestEnv = process.env.NODE_ENV === "test" || token === "test_token_123";

  const { default: express } = await import("express");

  const isTestEnv = process.env.NODE_ENV === "test" || token === "test_token_123";

  const { default: express } = await import("express");

  const isTestEnv = process.env.NODE_ENV === "test" || token === "test_token_123";

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // healthcheck
  app.get("/health", (_req, res) => res.status(200).send("ok"));

  const pool = createPoolIfConfigured();

  const bot = new Telegraf(token);

  // handlers
  startHandler(bot);
  bot.on("callback_query", (ctx) => callbackHandler(ctx, { pool }));

  const wh = getWebhookConfig();
  const port = Number(process.env.PORT || 3000);

  if (wh) {
    console.log("✅ Using WEBHOOK mode:", wh.url);

    // ✅ без double-path
    app.use(wh.path, bot.webhookCallback());

    if (!isTestEnv) {
      await bot.telegram.setWebhook(wh.url);
      console.log("✅ Telegram webhook set:", wh.url);
    } else {
      console.log("⚠️ NODE_ENV=test — skipping Telegram webhook setup");
    }
  } else {
    console.log("ℹ️ WEBHOOK_BASE_URL not set — using POLLING mode");
    if (!isTestEnv) {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
      await bot.launch();
    } else {
      console.log("⚠️ NODE_ENV=test — skipping bot.launch()");
    }
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`✅ Healthcheck+Webhook server on :${port}`);
  });

  const shutdown = async () => {
    try {
      await bot.stop();
    } catch {}
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
