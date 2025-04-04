import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import passport from "passport";
// import session from "express-session";
import helmet from "helmet";
import { connectDB } from "./db/connectDB.js";
import corsConfig from "./utils/cors.config.js"; // Import cấu hình CORS
import { setupRoutes } from "./utils/route.config.js"; // Import cấu hình routes

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

// Thiết lập tất cả các routes
setupRoutes(app);

// Kết nối database và khởi động server
connectDB()
  .then(() => {
    server.listen(PORT, () => {
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