import express from "express";
import {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
} from "../controllers/post.controller.js";
import { verifyToken } from "../middlewares/verifyToken.js";

const router = express.Router();

// Route để lấy danh sách bài viết (có phân trang và lọc)
router.get("/", getPosts);

// Route để lấy chi tiết một bài viết theo ID
router.get("/:id", getPostById);

// Route để tạo bài viết mới
router.post("/", verifyToken, createPost);

// Route để cập nhật bài viết
router.put("/:id", verifyToken, updatePost);

// Route để xóa bài viết
router.delete("/:id", verifyToken, deletePost);

export default router;