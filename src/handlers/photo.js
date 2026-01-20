// src/handlers/photo.js
import textTemplates from "../utils/text-templates.js";
import { canAcceptPhoto, getState, setState } from "../utils/storage.js";

export default function photoHandler(bot) {
  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

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

    await ctx.reply("🔄 Анализирую ваше фото...\nЭто займет несколько секунд.");

    setTimeout(async () => {
      await ctx.reply(
        "✅ Анализ завершен!\n\nТип лица: Овальное\nРекомендации:\n• Стрижки с объемом на макушке\n• Асимметричные стрижки\n• Каре с челкой"
      );
    }, 1200);
  });

  bot.command("photo", (ctx) => {
    ctx.reply(textTemplates.photoInstructions, { parse_mode: "HTML" });
  });
}
