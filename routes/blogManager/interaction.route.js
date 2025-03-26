import express from "express";
import {
  toggleFavorite,
  toggleBookmark,
  getBookmarkedPosts,
  getFavoritePosts,
} from "../controllers/interaction.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// Route để thêm/xóa bài viết khỏi danh sách yêu thích
router.post("/favorite/:id", verifyToken, toggleFavorite);

// Route để thêm/xóa bài viết khỏi danh sách đánh dấu
router.post("/bookmark/:id", verifyToken, toggleBookmark);

// Route để lấy danh sách bài viết đã đánh dấu của người dùng
router.get("/bookmarks", verifyToken, getBookmarkedPosts);

// Route để lấy danh sách bài viết yêu thích của người dùng
router.get("/favorites", verifyToken, getFavoritePosts);

export default router;