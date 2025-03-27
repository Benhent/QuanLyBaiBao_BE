import express from 'express';
import { uploadFile, getFilesByContent, deleteFile, updateFile, upload } from '../controllers/file.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { hasRole } from '../middlewares/isAdmin.js';

const router = express.Router();

// Route để upload file
router.post('/upload', verifyToken, upload.single('file'), uploadFile);

// Route để lấy danh sách file theo content_type và content_id
router.get('/:content_type/:content_id', verifyToken, getFilesByContent);

// Route để xóa file
router.delete('/:id', verifyToken, deleteFile);

// Route để cập nhật thông tin file
router.put('/:id', verifyToken, updateFile);

// Route để cập nhật nội dung file
router.put('/content/:id', verifyToken, upload.single('file'), updateFileContent);

export default router;