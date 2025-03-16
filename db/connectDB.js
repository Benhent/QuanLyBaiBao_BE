import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Lấy thông tin từ biến môi trường
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Kiểm tra biến môi trường
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Lỗi: Thiếu SUPABASE_URL hoặc SUPABASE_KEY trong .env");
    process.exit(1); // Dừng chương trình nếu thiếu config
}

// Tạo client kết nối với Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Kiểm tra kết nối bằng cách thử lấy dữ liệu từ Supabase
const connectDB = async () => {
    try {
        console.log("Supabase_url:", SUPABASE_URL);
    } catch (err) {
        console.error("Lỗi kết nối Supabase:", err.message);
        process.exit(1);
    }
};

export { supabase, connectDB };