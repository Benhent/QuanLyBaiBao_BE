import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import {
    getInstitutions,
    getInstitutionById,
    createInstitution,
    updateInstitution,
    deleteInstitution
} from '../controllers/institution.controller.js';

const router = express.Router();

// Lấy danh sách tổ chức
router.get('/', getInstitutions);

// Lấy chi tiết tổ chức
router.get('/:id', getInstitutionById);

// Tạo tổ chức mới (yêu cầu xác thực)
router.post('/', verifyToken, createInstitution);

// Cập nhật tổ chức (yêu cầu xác thực)
router.put('/:id', verifyToken, updateInstitution);

// Xóa tổ chức (yêu cầu xác thực)
router.delete('/:id', verifyToken, deleteInstitution);

export default router;