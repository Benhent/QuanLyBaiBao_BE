import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import {
    getJournals,
    getJournalById,
    createJournal,
    updateJournal,
    deleteJournal
} from '../controllers/journal.controller.js';

const router = express.Router();

// Lấy danh sách tạp chí
router.get('/', getJournals);

// Lấy chi tiết tạp chí
router.get('/:id', getJournalById);

// Tạo tạp chí mới (yêu cầu xác thực)
router.post('/', verifyToken, createJournal);

// Cập nhật tạp chí (yêu cầu xác thực)
router.put('/:id', verifyToken, updateJournal);

// Xóa tạp chí (yêu cầu xác thực)
router.delete('/:id', verifyToken, deleteJournal);

export default router;