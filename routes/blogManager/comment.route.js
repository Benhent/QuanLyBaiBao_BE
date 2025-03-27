import express from "express";
import {
  addComment,
  updateComment,
  deleteComment,
  getComments,
} from "../../controllers/blog/comment.controller.js";
import { verifyToken } from "../../middlewares/verifyToken.js";

const router = express.Router();

// Route để lấy danh sách bình luận của bài viết
router.get("/:id", verifyToken, getComments);

// Route để thêm bình luận vào bài viết
router.post("/:id", verifyToken, addComment);

// Route để cập nhật bình luận
router.put("/:id/:commentId", verifyToken, updateComment);

// Route để xóa bình luận
router.delete("/:id/:commentId", verifyToken, deleteComment);

export default router;