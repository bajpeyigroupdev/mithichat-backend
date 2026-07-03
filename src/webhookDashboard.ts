import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { exec } from "child_process";


const app = express();
const PORT = 5051;

app.use(bodyParser.json());

app.get("/webhook", (req: Request, res: Response) => {
  console.log("📡 GET request received at webhook");
  res.send("Hello from webhook");
});

app.post("/webhook", (req: Request, res: Response) => {
  console.log("🔔 GitHub webhook received");

  // Immediately respond to avoid GitHub timeout
  res.status(200).send("Webhook received, starting update...");

  const projectPath = "/root/umang-dashboard";
  const appName = "umang-dashboard";

  const pullScript = `cd ${projectPath} && git fetch --all && git reset --hard origin/main && git clean -fd && npm install --legacy-peer-deps && npm run build && pm2 reload ${appName}`;
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
