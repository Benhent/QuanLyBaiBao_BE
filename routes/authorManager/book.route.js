import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import {
    getBooks,
    getBookById,
    createBook,
    updateBook,
    deleteBook
} from '../controllers/book.controller.js';

const router = express.Router();

// Lấy danh sách sách
router.get('/', getBooks);

// Lấy chi tiết sách
router.get('/:id', getBookById);

// Tạo sách mới (yêu cầu xác thực)
router.post('/', verifyToken, createBook);

// Cập nhật sách (yêu cầu xác thực)
router.put('/:id', verifyToken, updateBook);

// Xóa sách (yêu cầu xác thực)
router.delete('/:id', verifyToken, deleteBook);

export default router;