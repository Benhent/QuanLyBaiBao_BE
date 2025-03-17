import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from 'passport';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { connectDB } from "./db/connectDB.js";
// routes
import authRoutes from './routes/auth.route.js';

// Đọc biến môi trường từ file .env
dotenv.config();

// Khởi tạo ứng dụng Express
const app = express();
const PORT = process.env.PORT;

// Xác định URL dựa trên môi trường
const serverUrl = process.env.NODE_ENV === 'production' 
  ? process.env.VERCEL_URL
  : process.env.CLIENT_URL;

// Thêm protocol nếu VERCEL_URL không có
const fullServerUrl = serverUrl.startsWith('http') 
  ? serverUrl 
  : `https://${serverUrl}`;

// Cấu hình CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.CLIENT_URL, process.env.VERCEL_CLIENT_URL].filter(Boolean)
    : process.env.CLIENT_URL,
  credentials: true
}));

// Middleware bảo mật
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

// Rate limiting để ngăn chặn lạm dụng API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // giới hạn mỗi IP 100 requests mỗi windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Middleware xử lý request
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Cấu hình session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
}));

// Khởi tạo Passport
app.use(passport.initialize());
app.use(passport.session());

// Cấu hình Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Academic Content Management API',
      version: '1.0.0',
      description: 'API for managing academic content and author requests',
      contact: {
        name: 'API Support',
        email: 'bknguyen06062003@gmail.com',
      },
    },
    servers: [
      {
        url: fullServerUrl,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./routes/*.js', './controllers/*.js'], // đường dẫn đến các file chứa route và JSDoc
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Endpoint để tải file swagger.json
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Kiểm tra trạng thái API
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', environment: process.env.NODE_ENV });
});

// Middleware xử lý lỗi 404
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Middleware xử lý lỗi toàn cục
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use('/api/auth', authRoutes);

// Kết nối database và khởi động server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
    console.log(`Swagger documentation available at: ${fullServerUrl}/api-docs`);
  });
}).catch(err => {
  console.error("Failed to connect to database:", err);
  process.exit(1);
});

// Xử lý tắt server một cách an toàn
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  // Đóng kết nối database và các tài nguyên khác nếu cần
  process.exit(0);
});

export default app;