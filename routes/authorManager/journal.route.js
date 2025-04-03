import express from 'express';
import { 
  getJournals,
  getJournalById,
  createJournal,
  updateJournal,
  deleteJournal,
  uploadJournalDocument,
  createJournalWithDocument,
  getJournalDocuments,
  updateDocumentMetadata,
  deleteDocument,
  downloadDocument,
  getJournalStats,
  associateArticle,
  disassociateArticle,
  upload
} from '../../controllers/author/journal.controller.js';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { checkRole } from '../../middlewares/isAdmin.js';

const router = express.Router();

// ===== Journal CRUD Routes =====

router.get('/', getJournals);
router.get('/:id', getJournalById);
router.post('/', verifyToken, createJournal);
router.put('/:id', verifyToken, updateJournal);
router.delete('/:id', verifyToken, deleteJournal);

// ===== Journal Document Routes =====
router.post('/document', verifyToken, upload.single('document'), uploadJournalDocument);
router.post('/with-document', verifyToken, upload.single('document'), createJournalWithDocument);
router.get('/:journalId/documents', getJournalDocuments);
router.patch('/document/:fileId', verifyToken, updateDocumentMetadata);
router.delete('/document/:fileId', verifyToken, deleteDocument);
router.get('/document/:fileId/download', verifyToken, downloadDocument);

// ===== Journal Statistics =====
router.get('/stats/overview', verifyToken, getJournalStats);

// ===== Journal-Article Association Routes =====
router.post('/associate-article', verifyToken, associateArticle);
router.delete('/:journalId/article/:articleId', verifyToken, disassociateArticle);

// ===== Admin Routes =====
router.get('/admin/all', verifyToken, checkRole('admin'), getJournals);

export default router;