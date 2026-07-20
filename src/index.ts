import express, { Application } from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";

import errorHandler from "./middlewares/errorHnadler.middleware";
import { connectDB } from "./utils/db";
import { config } from "./configs/envConfig";
import { checkPortAvailable } from "./utils/getAvailablePort";
import { AuthRoutes, avatarRoute, callRoutes, chatRoutes, coinsPriceRoutes, frameRoute, hostRoutes, UserRoutes, adminRoutes, paymentRoutes, kycRoutes, withdrawalRoutes, giftRoutes, helpRoutes, UploadRoutes, notificationRoutes, upiRoutes, publicRoutes, emsRoutes, recruitmentRoutes } from "./routes";
import chatSocket from "./sockets";
import path from "path";
// Initialize Firebase Admin before routes are loaded
import "./utils/pushNotification";
import { verifyToken } from "./middlewares/authorize.middleware";
import { getSystemMessages } from "./controllers/notificationController";

const app: Application = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// 4. CORS Configuration - Restrict origins
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5050',

  'https://mithichat.live',
  'https://www.mithichat.live',
  'https://api.mithichat.live',

  'https://admin.mithichat.live',
  'http://admin.mithichat.live',

  'https://agency.meethichat.live',
  'https://operator.meethichat.live',
  'https://adminjoin.meethichat.live',
  'https://support.meethichat.live',
  'https://superadmin.meethichat.live',

  'https://management.mithichat.live',
  'http://management.mithichat.live',

  'https://management.meethichat.com',
  'http://management.meethichat.com',

  'https://danilo-syngamic-unterrifically.ngrok-free.dev',
].filter(Boolean);

const isLocalhostOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname) || url.hostname.endsWith('.meethichat.live') || url.hostname.endsWith('.mithichat.live');
  } catch {
    return false;
  }
};

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or is localhost
    if (allowedOrigins.includes(origin) || isLocalhostOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use((req, res, next) => {
  console.log(`📡 Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Security Middleware
// 1. Helmet - Secure HTTP headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 3. Rate Limiting - Prevent DDoS
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use('/api/', limiter);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/policies", express.static(path.join(__dirname, "../policies")));

// Body parsing with size limits
app.use(express.json({ limit: '10mb' })); // Increased for file uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. NoSQL Injection Prevention (must be after body parsers for Express v5)
// Only sanitize body and params, not query (Express v5 compatibility)
// app.use(
//   mongoSanitize({
//     replaceWith: "_",
//     onSanitize: ({ key }: { key: string }) => {
//       console.warn(`Sanitized input: ${key}`);
//     },
//   } as any)
// );
// Routes
app.use("/api/user", UserRoutes);
app.use("/api/v1/user", UserRoutes);
app.use("/api/auth", AuthRoutes);
app.use("/api/v1/auth", AuthRoutes);
app.use("/api/host", hostRoutes);
app.use("/api/v1/host", hostRoutes);
app.use("/api/coinsPrice", coinsPriceRoutes);
app.use("/api/call", callRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/frames", frameRoute);
app.use("/api/avatar", avatarRoute);
app.use("/api/admin", adminRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/ems", emsRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/withdrawal", withdrawalRoutes);
app.use("/api/gift", giftRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/upload", UploadRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/upi", upiRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/teamleader", publicRoutes);
import { globalSearch } from "./controllers/searchController";
import { getSystemHealth } from "./controllers/monitoringController";
import { getActivityFeed } from "./controllers/activityFeedController";
import { generateCustomReport } from "./controllers/reportBuilderController";
import { getAllPlugins, togglePluginStatus } from "./controllers/pluginController";
import { getTasks, createTask, updateTaskStatus } from "./controllers/taskController";
import { generateAIPlatformInsights } from "./services/aiInsightsService";

app.use("/api/recruitment", recruitmentRoutes);
app.use("/api/v1/recruitment", recruitmentRoutes);
app.get("/api/v1/search", globalSearch);
app.get("/api/v1/monitoring/health", getSystemHealth);
app.get("/api/v1/activity-feed", getActivityFeed);
app.get("/api/v1/reports", generateCustomReport);
app.get("/api/v1/plugins", getAllPlugins);
app.patch("/api/v1/plugins/:pluginId", togglePluginStatus);
app.get("/api/v1/tasks", getTasks);
app.post("/api/v1/tasks", createTask);
app.patch("/api/v1/tasks/:id/status", updateTaskStatus);
import { getBIDrilldownOverview } from "./controllers/biController";
import { analyzeProcessMiningBottlenecks } from "./services/processMiningService";

app.get("/api/v1/bi/overview", getBIDrilldownOverview);
app.get("/api/v1/process-mining/bottlenecks", async (_req, res) => {
    const data = await analyzeProcessMiningBottlenecks();
    res.status(200).json(data);
});
app.get("/api/v1/analytics/ai-insights", async (_req, res) => {
    const data = await generateAIPlatformInsights();
    res.status(200).json(data);
});
app.get("/api/system-messages", verifyToken, getSystemMessages);



// Root Route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "MithiChat API",
    message: "API is running successfully",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// Health Route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API Info
app.get("/api", (req, res) => {
  res.status(200).json({
    success: true,
    service: "MithiChat API",
    version: "1.0.0"
  });
});


// Error handler
app.use(errorHandler);

// Create HTTP server
const httpServer = http.createServer(app);

// Attach socket.io with secure CORS
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 25000,
});

// Init chat socket
chatSocket(io);

const startServer = async () => {
  try {
    const port = Number(config.PORT || 3001);
    const isAvailable = await checkPortAvailable(port);
    if (!isAvailable) {
      console.error(`❌ Port ${port} is already in use. Please check if another instance of MithiChat API is running.`);
      process.exit(1);
    }
    await connectDB(config.MONGO_URI!);
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1);
  }
};

import { startCallCleanupJob, startChatWorker } from "./services/cron.service";

startServer().then(() => {
  // Database-backed workers start only after MongoDB is ready.
  startCallCleanupJob();
  startChatWorker();
});
