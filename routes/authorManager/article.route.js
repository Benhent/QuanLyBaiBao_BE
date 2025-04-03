import express from 'express';
import { 
  getArticles,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  uploadArticleDocument,
  createArticleWithDocument,
  getArticleDocuments,
  updateDocumentMetadata,
  deleteDocument,
  downloadDocument,
  getArticleStats,
  searchArticlesByKeywords,
  getArticlesByAuthor,
  upload
} from '../../controllers/author/article.controller.js';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { checkRole } from '../../middlewares/isAdmin.js';

const router = express.Router();

// ===== Article CRUD Routes =====
router.get('/', getArticles);
router.get('/:id', getArticleById);
router.post('/', verifyToken, createArticle);
router.put('/:id', verifyToken, updateArticle);
router.delete('/:id', verifyToken, deleteArticle);

// ===== Article Document Routes =====
router.post('/document', verifyToken, upload.single('document'), uploadArticleDocument);
router.post('/with-document', verifyToken, upload.single('document'), createArticleWithDocument);
router.get('/:articleId/documents', getArticleDocuments);
router.patch('/document/:fileId', verifyToken, updateDocumentMetadata);
router.delete('/document/:fileId', verifyToken, deleteDocument);
router.get('/document/:fileId/download', verifyToken, downloadDocument);

// ===== Article Search and Filtering Routes =====
router.get('/search/keywords', searchArticlesByKeywords);
router.get('/author/:authorId', getArticlesByAuthor);

// ===== Article Statistics =====
router.get('/stats/overview', verifyToken, getArticleStats);

// ===== Admin Routes =====
router.get('/admin/all', verifyToken, checkRole('admin'), getArticles);

export default router;