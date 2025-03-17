import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const corsOptions = {
  origin: [
    process.env.CLIENT_URL, // Client local
    "http://localhost:5000", // Nếu bạn chạy Swagger trên localhost
    process.env.VERCEL_URL // Nếu Swagger chạy trên Vercel
  ].filter(Boolean), // Lọc bỏ các giá trị falsy
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export default cors(corsOptions);
