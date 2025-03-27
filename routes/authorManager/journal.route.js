import express from 'express';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { hasRole, isOwner } from '../../middlewares/isAdmin.js';
import {
    getJournals,
    getJournalById,
    createJournal,
    updateJournal,
    deleteJournal
} from '../../controllers/author/journal.controller.js';

const router = express.Router();

// Lấy danh sách tạp chí
router.get('/', getJournals);

// Lấy chi tiết tạp chí
router.get('/:id', getJournalById);

// Tạo tạp chí mới (yêu cầu xác thực và quyền tác giả hoặc admin)
router.post('/', verifyToken, hasRole(['author', 'admin']), createJournal);

// Cập nhật tạp chí (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.put('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('journals')
        .select('created_by')
        .eq('id', req.params.id)
        .single();
    return data?.created_by;
}), updateJournal);

// Xóa tạp chí (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.delete('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('journals')
        .select('created_by')
        .eq('id', req.params.id)
        .single();
    return data?.created_by;
}), deleteJournal);

export default router;