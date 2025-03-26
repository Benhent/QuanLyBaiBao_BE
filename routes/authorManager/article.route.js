import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import {
    getArticles,
    getArticleById,
    createArticle,
    updateArticle,
    deleteArticle
} from '../controllers/article.controller.js';

const router = express.Router();

// Lấy danh sách bài báo
router.get('/', getArticles);

// Lấy chi tiết bài báo
router.get('/:id', getArticleById);

// Tạo bài báo mới (yêu cầu xác thực)
router.post('/', verifyToken, createArticle);

// Cập nhật bài báo (yêu cầu xác thực)
router.put('/:id', verifyToken, updateArticle);

// Xóa bài báo (yêu cầu xác thực)
router.delete('/:id', verifyToken, deleteArticle);

export default router;