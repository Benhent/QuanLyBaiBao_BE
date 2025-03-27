import express from 'express';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { hasRole, isOwner } from '../../middlewares/isAdmin.js';
import {
    getInstitutions,
    getInstitutionById,
    createInstitution,
    updateInstitution,
    deleteInstitution
} from '../../controllers/author/institution.controller.js';

const router = express.Router();

// Lấy danh sách tổ chức
router.get('/', getInstitutions);

// Lấy chi tiết tổ chức
router.get('/:id', getInstitutionById);

// Tạo tổ chức mới (yêu cầu xác thực và quyền tác giả hoặc admin)
router.post('/', verifyToken, hasRole(['author', 'admin']), createInstitution);

// Cập nhật tổ chức (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.put('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('institutions')
        .select('created_by')
        .eq('id', req.params.id)
        .single();
    return data?.created_by;
}), updateInstitution);

// Xóa tổ chức (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.delete('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('institutions')
        .select('created_by')
        .eq('id', req.params.id)
        .single();
    return data?.created_by;
}), deleteInstitution);

export default router;