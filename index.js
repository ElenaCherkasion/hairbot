// index.js (root)
import { startBot } from "./src/index.js";

startBot().catch((e) => {
  console.error("❌ Root index.js: bot start failed:", e);
  process.exit(1);
});
