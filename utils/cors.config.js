import cors from "cors";

const corsOptions = {
  origin: "*", // Cho phép tất cả các nguồn
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export default cors(corsOptions);