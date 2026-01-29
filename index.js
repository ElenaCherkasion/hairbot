// index.js
import path from "path";
import { fileURLToPath } from "url";

import { startBot } from "./src/index.js";

const entrypoint = process.argv[1];
const isDirectRun =
  entrypoint && path.resolve(entrypoint) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startBot().catch((e) => {
    console.error("❌ Root index.js: bot start failed:", e);
    process.exit(1);
  });
}
