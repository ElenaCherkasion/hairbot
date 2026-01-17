// src/handlers/photo.js
import textTemplates from "../utils/text-templates.js";
import { canAcceptPhoto, getState } from "../utils/storage.js";

export default function photoHandler(bot) {
  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const st = getState(userId);

    if (!canAcceptPhoto(userId)) {
      if (st.deleted) {
        await ctx.reply("Ваши данные были удалены. Начните заново через меню и дайте согласия.", {
          reply_markup: { inline_keyboard: [[{ text: "Главное меню", callback_data: "MENU_HOME" }]] },
        });
        return;
      }
      if (!st.plan || st.plan === "free") {
        await ctx.reply("Чтобы отправить фото, выберите тариф PRO или PREMIUM в меню.", {
          reply_markup: { inline_keyboard: [[{ text: "Выбрать тариф", callback_data: "MENU_START" }]] },
        });
        return;
      }
      if (!st.paid) {
        await ctx.reply("Чтобы отправить фото, сначала оплатите тариф. (Тест: /pay_ok)");
        return;
      }
      await ctx.reply(textTemplates.consentScreen, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Принять и продолжить", callback_data: "CONSENT_ACCEPT_ALL" }],
            [{ text: "📄 Политика конфиденциальности", callback_data: "MENU_PRIVACY" }],
            [{ text: "📄 Согласие на обработку ПДн", callback_data: "DOC_CONSENT_PD" }],
            [{ text: "📄 Согласие на передачу третьим лицам", callback_data: "DOC_CONSENT_THIRD" }],
            [{ text: "❌ Отказаться", callback_data: "CONSENT_DECLINE" }],
            [{ text: "⬅️ В главное меню", callback_data: "MENU_HOME" }],
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
    ctx.reply(textTemplates.photoInstructions);
  });
}
