// index.js
import { startBot } from "./src/index.js";

startBot().catch((e) => {
  console.error("❌ Root index.js: bot start failed:", e);
  process.exit(1);
});
// 🧪 Тест безопасного деплоя от 01/29/2026 16:27:35
const testError = ; // Ошибка синтаксиса
