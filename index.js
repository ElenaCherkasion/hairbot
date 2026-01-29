// index.js
import { startBot } from "./src/index.js";
import logger from "./src/utils/logger.js";

const entrypoint = process.argv[1] || "";
const isDirectRun = entrypoint.endsWith("index.js");

if (isDirectRun) {
  startBot().catch((e) => {
    logger.error("Root index.js: bot start failed", { error: e });
    process.exit(1);
  });
}
