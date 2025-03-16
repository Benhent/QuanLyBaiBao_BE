import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from 'passport';
import session from 'express-session';
import { connectDB } from "./db/connectDB.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true
}))

app.use(express.json());
app.use(cookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Bật secure nếu chạy production
        httpOnly: true, // Bảo vệ khỏi XSS
        maxAge: 24 * 60 * 60 * 1000 // 24h
    }
}));

app.use(passport.initialize());
app.use(passport.session());

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log("Server is running on port:", PORT);
    });
}).catch(err => {
    console.error("Failed to connect to database:", err);
});