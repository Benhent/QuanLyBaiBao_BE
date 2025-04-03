import express from 'express';
import { 
  uploadFile, 
  getFilesByContent, 
  deleteFile, 
  updateFile, 
  updateFileContent, 
  upload 
} from '../controllers/file.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';

const router = express.Router();

// Upload file
router.post('/upload', verifyToken, upload.single('file'), uploadFile);

// Get files by content_type and content_id
router.get('/:content_type/:content_id', verifyToken, getFilesByContent);

// Delete file
router.delete('/:id', verifyToken, deleteFile);

// Update file information
router.patch('/:id', verifyToken, updateFile);

// Update file content (replace old file)
router.put('/content/:id', verifyToken, upload.single('file'), updateFileContent);

export default router;