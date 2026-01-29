import fs from "fs";
import path from "path";

const targetFile = path.join(
  process.cwd(),
  "node_modules",
  "openai",
  "src",
  "resources",
  "responses",
  "input-items.ts.orig"
);

if (fs.existsSync(targetFile)) {
  fs.rmSync(targetFile, { force: true });
  console.log("🧹 Removed conflicted OpenAI file:", targetFile);
}
