import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import passport from "passport";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { connectDB } from "./db/connectDB.js";
import corsConfig from "./utils/cors.config.js"; // Import cấu hình CORS
import swaggerDocs from "./utils/swagger.js"; // Import cấu hình Swagger
import pgSession from 'connect-pg-simple';
import pkg from 'pg';

const { Pool } = pkg;

// Routes
import authRoutes from "./routes/auth.route.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Tạo pool kết nối đến Supabase
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Cấu hình CORS
app.use(corsConfig);

// Middleware bảo mật
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://quan-ly-bai-bao-be.vercel.app"],
        // Thêm các nguồn khác nếu cần
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
    store: new (pgSession(session))({
      pool: pool, // Sử dụng pool kết nối Supabase
      tableName: 'session' // Tên bảng lưu trữ session
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
    },
  })
);

// Khởi tạo Passport
app.use(passport.initialize());
app.use(passport.session());

// Cấu hình Swagger
swaggerDocs(app);

// Kiểm tra trạng thái API
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", environment: process.env.NODE_ENV });
});

// Routes
app.use("/api/auth", authRoutes);

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
      console.log(`📌 Swagger docs: http://localhost:${PORT}/api-docs`);
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