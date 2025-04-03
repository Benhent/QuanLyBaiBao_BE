import express from 'express';
import { 
  getBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  uploadBookDocument,
  createBookWithDocument,
  getBookDocuments,
  updateDocumentMetadata,
  deleteDocument,
  downloadDocument,
  upload
} from '../../controllers/author/book.controller.js';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { checkRole } from '../../middlewares/isAdmin.js';

const router = express.Router();

// ===== Book CRUD Routes =====
router.get('/', getBooks);
router.get('/:id', getBookById);
router.post('/', verifyToken, createBook);
router.put('/:id', verifyToken, updateBook);
router.delete('/:id', verifyToken, deleteBook);

// ===== Book Document Routes =====
router.post('/document', verifyToken, upload.single('document'), uploadBookDocument);
router.post('/with-document', verifyToken, upload.single('document'), createBookWithDocument);
router.get('/:bookId/documents', getBookDocuments);
router.patch('/document/:fileId', verifyToken, updateDocumentMetadata);
router.delete('/document/:fileId', verifyToken, deleteDocument);
router.get('/document/:fileId/download', verifyToken, downloadDocument);

// ===== Admin Routes =====
router.get('/admin/all', verifyToken, checkRole('admin'), getBooks);

export default router;