import express from "express";

export async function startBot() {
  console.log("✅ startBot() entered");
  console.log("ENV PORT =", process.env.PORT);

  const app = express();

  app.get("/", (req, res) => res.status(200).send("OK"));
  app.get("/health", (req, res) => res.status(200).json({ ok: true }));

  const PORT = Number(process.env.PORT || 3000);

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("✅ LISTENING", server.address());
  });

  server.on("error", (e) => {
    console.error("❌ SERVER ERROR", e);
    process.exit(1);
  });

  setInterval(() => console.log("tick", new Date().toISOString()), 30000);
}
