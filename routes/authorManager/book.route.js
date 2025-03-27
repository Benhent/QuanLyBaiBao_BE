import express from 'express';
import { verifyToken } from '../../middlewares/verifyToken.js';
import { hasRole, isOwner } from '../../middlewares/isAdmin.js';
import {
    getBooks,
    getBookById,
    createBook,
    updateBook,
    deleteBook
} from '../../controllers/author/book.controller.js';

const router = express.Router();

// Lấy danh sách sách
router.get('/', getBooks);

// Lấy chi tiết sách
router.get('/:id', getBookById);

// Tạo sách mới (yêu cầu xác thực và quyền tác giả hoặc admin)
router.post('/', verifyToken, hasRole(['author', 'admin']), createBook);

// Cập nhật sách (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.put('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('books')
        .select('author_id, authors:author_id (user_id)')
        .eq('id', req.params.id)
        .single();
    return data?.authors?.user_id;
}), updateBook);

// Xóa sách (yêu cầu xác thực và quyền sở hữu hoặc admin)
router.delete('/:id', verifyToken, isOwner(async (req) => {
    const { data } = await supabase
        .from('books')
        .select('author_id, authors:author_id (user_id)')
        .eq('id', req.params.id)
        .single();
    return data?.authors?.user_id;
}), deleteBook);

export default router;