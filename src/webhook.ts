import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { exec } from "child_process";
import { config } from "./configs/envConfig";

const app = express();
const PORT = config.WEB_HOOK_PORT;

app.use(bodyParser.json());

app.get("/webhook", (req: Request, res: Response) => {
  console.log("📡 GET request received at webhook");
  res.send("Hello from webhook");
});

app.post("/webhook", (req: Request, res: Response) => {
  console.log("🔔 GitHub webhook received");

  // Immediately respond to avoid GitHub timeout
  res.status(200).send("Webhook received, starting update...");

  const projectPath = "/root/serverUmang";
  const appName = "api-server";

  const pullScript = `cd ${projectPath} && git fetch --all && git reset --hard origin/main && git clean -fd && npm install && npm run build && pm2 reload ${appName}`;
  console.log("📂 Running script:", pullScript);

  exec(pullScript, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ Exec error:", err);
      console.error("⚠️ STDERR:", stderr);
      return;
    }

    console.log("✅ STDOUT:", stdout);
    if (stderr) console.warn("⚠️ STDERR:", stderr);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Deploy listener running on port ${PORT}`);
});
