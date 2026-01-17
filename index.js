import dotenv from "dotenv";
dotenv.config();

console.log("🚀 =================================");
console.log("🚀 ЗАПУСК HAIRBOT");
console.log("🚀 =================================");

console.log("📊 Информация о системе:");
console.log("   Время запуска:", new Date().toLocaleString());
console.log("   Node.js:", process.version);
console.log("   Платформа:", process.platform, process.arch);
console.log("   NODE_ENV:", process.env.NODE_ENV || "development");
console.log("   PORT:", process.env.PORT || 3000);
console.log("   Рабочая директория:", process.cwd());

console.log("========================================");
console.log("🎯 ЗАПУСК ОСНОВНОГО ПРИЛОЖЕНИЯ");
console.log("========================================");

try {
  const { startBot } = await import("./src/index.js");

  if (typeof startBot !== "function") {
    throw new Error("startBot не экспортирован или не является функцией");
  }

  await startBot();
} catch (err) {
  console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА:", err);
  process.exit(1);
}
