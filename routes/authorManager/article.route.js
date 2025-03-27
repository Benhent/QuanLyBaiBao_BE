import express from 'express';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { hasRole, isOwner } from '../../middlewares/isAdmin.js';
import {
    getArticles,
    getArticleById,
    createArticle,
    updateArticle,
    deleteArticle
} from '../../controllers/author/article.controller.js';

const router = express.Router();

// Lấy danh sách bài báo
router.get('/', getArticles);

// Lấy chi tiết bài báo
router.get('/:id', getArticleById);

// Tạo bài báo mới (yêu cầu xác thực và quyền tác giả hoặc admin)
router.post('/', verifyToken, hasRole(['author', 'admin']), createArticle);

// Cập nhật bài báo (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.put('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('articles')
        .select('author_id, authors:author_id (user_id)')
        .eq('id', req.params.id)
        .single();
    return data?.authors?.user_id;
}), updateArticle);

// Xóa bài báo (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.delete('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('articles')
        .select('author_id, authors:author_id (user_id)')
        .eq('id', req.params.id)
        .single();
    return data?.authors?.user_id;
}), deleteArticle);

export default router;