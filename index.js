<<<<<<< HEAD
п»ї// index.js
import { startBot } from "./src/index.js";

startBot().catch((e) => {
  console.error("вљ пёЏ Root index.js: bot start failed:", e);
  process.exit(1);
});
=======
// index.js
import path from "path";
import { fileURLToPath } from "url";

import { startBot } from "./src/index.js";

const entrypoint = process.argv[1];
const isDirectRun =
  entrypoint && path.resolve(entrypoint) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startBot().catch((e) => {
    console.error("вќЊ Root index.js: bot start failed:", e);
    process.exit(1);
  });
}
>>>>>>> bbb659f5c72e8fdf67e0be7cd31776e27853950d

