import { startBot } from "./src/index.js";

const entrypoint = process.argv[1] || "";
const isDirectRun = entrypoint.endsWith("index.js");

if (isDirectRun) {
  startBot().catch((e) => {
    console.error("❌ Root index.js: bot start failed:", e);
    process.exit(1);
  });
}
