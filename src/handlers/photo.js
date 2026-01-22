// src/handlers/photo.js
import textTemplates from "../utils/text-templates.js";
import {
  canAcceptPhoto,
  getNextFreeTariffAt,
  canUseFreeTariff,
  markFreeTariffUsage,
  getState,
  setState,
} from "../utils/storage.js";
import { aiService } from "../services/index.js";
import { withTimeout } from "../utils/with-timeout.js";
import logger from "../utils/logger.js";

const FILE_LINK_TIMEOUT_MS = Number(process.env.FILE_LINK_TIMEOUT_MS || 8000);
const ANALYSIS_TIMEOUT_MS = Number(process.env.ANALYSIS_TIMEOUT_MS || 25000);

function formatAnalysisResult(result) {
  if (!result) {
    return "⚠️ Не удалось получить результат анализа. Попробуйте позже.";
  }
  if (typeof result === "string") {
    return `✅ Анализ завершен!\n\n${result}`;
  }

  const faceShape = result.faceShape || "не определен";
  const recommendations = result.recommendations || "рекомендации недоступны";
  const confidence = typeof result.confidence === "number" ? `\nУверенность: ${Math.round(result.confidence * 100)}%` : "";

  return `✅ Анализ завершен!\n\nТип лица: ${faceShape}\nРекомендации:\n${recommendations}${confidence}`;
}

async function processPhoto(ctx) {
  try {
    const photo = ctx.message?.photo?.[ctx.message.photo.length - 1];
    if (!photo?.file_id) {
      await ctx.reply("⚠️ Не удалось получить фото. Пожалуйста, попробуйте еще раз.");
      return;
    }

    const fileLink = await withTimeout(
      ctx.telegram.getFileLink(photo.file_id),
      FILE_LINK_TIMEOUT_MS,
      "Получение ссылки на фото заняло слишком много времени."
    );
    const imageUrl = fileLink?.href || String(fileLink || "");
    if (!imageUrl) {
      await ctx.reply("⚠️ Не удалось получить ссылку на фото. Пожалуйста, попробуйте еще раз.");
      return;
    }

    const analysis = await withTimeout(
      aiService.analyzeFace(imageUrl),
      ANALYSIS_TIMEOUT_MS,
      "Анализ фото занял слишком много времени."
    );

    await ctx.reply(formatAnalysisResult(analysis));
  } catch (error) {
    logger.error(`Ошибка обработки фото: ${error?.message || error}`);
    await ctx.reply("⚠️ Анализ занимает слишком много времени. Попробуйте позже.");
  }
}

export default function photoHandler(bot) {
  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);
    if (st.step !== "support_contact" && st.step !== "support_contact_custom" && !st.supportMode) {
      await ctx.reply(textTemplates.supportOnlyPrompt, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🆘 Поддержка", callback_data: "MENU_SUPPORT" }]] },
      });
      return;
    }

    if (!canAcceptPhoto(userId)) {
      if (!st.plan) {
        await ctx.reply("Чтобы отправить фото, выберите тариф в меню.", {
          reply_markup: { inline_keyboard: [[{ text: "Главное меню", callback_data: "MENU_HOME" }]] },
        });
        return;
      }
      if (st.plan === "free") {
        setState(userId, { step: "consent_flow" });
        await ctx.reply(textTemplates.consentMenu, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔒 Политика конфиденциальности", callback_data: "PRIVACY_IN_FLOW" }],
              [{ text: "Согласие на обработку персональных данных", callback_data: "DOC_CONSENT_PD_IN_FLOW" }],
              [{ text: "Согласие на третьих лиц", callback_data: "DOC_CONSENT_THIRD_IN_FLOW" }],
              [{ text: "Главное меню", callback_data: "MENU_HOME" }],
            ],
          },
        });
        return;
      }
      if (!st.paid) {
        const payCallback = st.plan === "premium" ? "PAY_START_PREMIUM" : "PAY_START_PRO";
        await ctx.reply("Чтобы отправить фото, сначала оплатите тариф. (Тест: /pay_ok)", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💳 Перейти к оплате", callback_data: payCallback }],
              [{ text: "Главное меню", callback_data: "MENU_HOME" }],
            ],
          },
        });
        return;
      }
      setState(userId, { step: "consent_flow" });
      await ctx.reply(textTemplates.consentMenu, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔒 Политика конфиденциальности", callback_data: "PRIVACY_IN_FLOW" }],
            [{ text: "Согласие на обработку персональных данных", callback_data: "DOC_CONSENT_PD_IN_FLOW" }],
            [{ text: "Согласие на третьих лиц", callback_data: "DOC_CONSENT_THIRD_IN_FLOW" }],
            [{ text: "Главное меню", callback_data: "MENU_HOME" }],
          ],
        },
      });
      return;
    }

    if (st.plan === "free" && !canUseFreeTariff(userId)) {
      const nextAt = getNextFreeTariffAt(userId);
      const nextText = nextAt
        ? `Следующая бесплатная попытка будет доступна ${nextAt.toLocaleDateString("ru-RU")}.`
        : "Следующая бесплатная попытка будет доступна позже.";
      await ctx.reply(`⚠️ Бесплатный тариф доступен раз в 30 дней.\n${nextText}`);
      return;
    }

    if (st.plan === "free") {
      markFreeTariffUsage(userId);
    }

    await ctx.reply(
      "Спасибо 🤍\n" +
        "Я получила фотографию и начинаю анализ.\n\n" +
        "Это займет немного времени.\n" +
        "Пока ты можешь просто выдохнуть — здесь не будет неожиданных или резких выводов.\n\n" +
        "Я напишу, когда все будет готово 🌿"
    );
    void processPhoto(ctx);
  });

  bot.command("photo", (ctx) => {
    ctx.reply(textTemplates.photoInstructions, { parse_mode: "HTML" });
  });
}
