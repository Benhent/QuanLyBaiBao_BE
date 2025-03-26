import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import passport from "passport";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectDB } from "./db/connectDB.js";
import corsConfig from "./utils/cors.config.js"; // Import cấu hình CORS

// Routes
import authRoutes from "./routes/auth.route.js";
import postRoutes from "./routes/post.route.js";
import commentRoutes from "./routes/comment.route.js";
import interactionRoutes from "./routes/interaction.route.js";
import authorRequestRoutes from "./routes/authorRequest.route.js";

// Realtime
import { setupSocketIO, socketMiddleware, setupRealtimeChannel } from "./middlewares/realtime.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Cấu hình CORS
app.use(corsConfig);

// Middleware bảo mật
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", process.env.CLIENT_URL],
      },
    },
  })
);

// Rate limiting để ngăn chặn lạm dụng API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // giới hạn mỗi IP 100 requests mỗi windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// Middleware xử lý request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Cấu hình session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
    },
  })
);

// Khởi tạo Passport
app.use(passport.initialize());
app.use(passport.session());

// Thiết lập Socket.IO
const server = setupSocketIO(app);

// Middleware để truy cập Socket.IO từ các route
app.use(socketMiddleware);

// Middleware để thiết lập kênh realtime
app.use(setupRealtimeChannel);

// Kiểm tra trạng thái API
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", environment: process.env.NODE_ENV });
});

// Route cho đường dẫn gốc
app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the API" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/interaction", interactionRoutes);
app.use('/api/author-requests', authorRequestRoutes);

// Middleware xử lý lỗi 404
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
  });
});

// Middleware xử lý lỗi toàn cục
app.use((err, req, res, next) => {
  console.error("Error:", err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.name || "Internal Server Error",
    message: err.message || "Something went wrong",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Kết nối database và khởi động server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port: ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to database:", err);
    process.exit(1);
  });

// Xử lý tắt server một cách an toàn
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

export default app;