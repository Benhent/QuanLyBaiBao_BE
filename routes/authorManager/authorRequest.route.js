import express from 'express';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { isAdmin } from '../../middlewares/isAdmin.js';
import {
    submitAuthorRequest,
    getAuthorRequests,
    getAuthorRequestById,
    approveAuthorRequest,
    rejectAuthorRequest
} from '../../controllers/author/authorRequest.controller.js';

const router = express.Router();

// Gửi yêu cầu xác nhận làm tác giả
router.post('/', verifyToken, submitAuthorRequest);

// Lấy danh sách yêu cầu làm tác giả (cho Admin)
router.get('/', verifyToken, isAdmin, getAuthorRequests);

// Lấy yêu cầu làm tác giả của người dùng hiện tại
router.get('/me', verifyToken, getMyAuthorRequests);

// Lấy chi tiết yêu cầu làm tác giả
router.get('/:id', verifyToken, getAuthorRequestById);

// Phê duyệt yêu cầu làm tác giả
router.put('/:id/approve', verifyToken, isAdmin, approveAuthorRequest);

// Từ chối yêu cầu làm tác giả
router.put('/:id/reject', verifyToken, isAdmin, rejectAuthorRequest);

export default router;