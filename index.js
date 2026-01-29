import { startBot } from "./src/index.js";

startBot().then(bot => {
  if (bot) {
    console.log("✅ Bot started");
  }
}).catch(e => {
  console.log("Bot error (expected with test token):", e.message);
});
