import express from 'express';
import { 
  getAuthors,
  getAuthorById,
  createAuthor,
  updateAuthor,
  deleteAuthor,
  getAuthorStats,
  getAuthorsByInstitution,
  getUniqueAcademicTitles,
  searchAuthors,
  associateArticle,
  disassociateArticle
} from '../../controllers/author/author.controller.js';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { checkRole } from '../../middlewares/isAdmin.js';

const router = express.Router();

// ===== Author CRUD Routes =====
router.get('/', getAuthors);
router.get('/:id', getAuthorById);
router.post('/', verifyToken, createAuthor);
router.put('/:id', verifyToken, updateAuthor);
router.delete('/:id', verifyToken, deleteAuthor);

// ===== Author Search and Filtering Routes =====
router.get('/search/query', searchAuthors);
router.get('/institution/:institutionId', getAuthorsByInstitution);
router.get('/unique/academic-titles', getUniqueAcademicTitles);

// ===== Author Statistics =====
router.get('/stats/overview', verifyToken, getAuthorStats);

// ===== Author-Article Association Routes =====
router.post('/associate-article', verifyToken, associateArticle);
router.delete('/:authorId/article/:articleId', verifyToken, disassociateArticle);

// ===== Admin Routes =====
router.get('/admin/all', verifyToken, checkRole('admin'), getAuthors);

export default router;