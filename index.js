// index.js
import path from "path";
import { fileURLToPath } from "url";
import { startBot } from "./src/index.js";

const isMain = (() => {
  if (!process.argv[1]) return false;
  const entryPath = path.resolve(process.argv[1]);
  const currentPath = path.resolve(fileURLToPath(import.meta.url));
  return entryPath === currentPath;
})();

if (isMain) {
  startBot().catch((e) => {
    console.error("❌ Root index.js: bot start failed:", e);
    process.exit(1);
  });
}
