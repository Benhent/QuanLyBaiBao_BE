import express from 'express';
import { 
  getInstitutions,
  getInstitutionById,
  createInstitution,
  updateInstitution,
  deleteInstitution,
  getInstitutionStats,
  getInstitutionsByCountry,
  getUniqueCountries,
  getUniqueTypes
} from '../../controllers/author/institution.controller.js';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { checkRole } from '../../middlewares/isAdmin.js';

const router = express.Router();

// ===== Institution CRUD Routes =====
router.get('/', getInstitutions);
router.get('/:id', getInstitutionById);
router.post('/', verifyToken, createInstitution);
router.put('/:id', verifyToken, updateInstitution);
router.delete('/:id', verifyToken, deleteInstitution);

// ===== Additional Institution Routes =====
router.get('/stats/overview', verifyToken, getInstitutionStats);
router.get('/country/:country', getInstitutionsByCountry);
router.get('/unique/countries', getUniqueCountries);
router.get('/unique/types', getUniqueTypes);

// ===== Admin Routes =====
router.get('/admin/all', verifyToken, checkRole('admin'), getInstitutions);

export default router;