import { supabase } from '../../db/connectDB.js';

export const getBooks = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            author_id,
            language,
            search,
            sort_by = 'publish_date',
            sort_order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;

        // Xây dựng truy vấn
        let query = supabase
            .from('books')
            .select(`
                *,
                authors:author_id (id, first_name, last_name, academic_title)
            `, { count: 'exact' });

        // Áp dụng các bộ lọc
        if (author_id) {
            query = query.eq('author_id', author_id);
        }

        if (language) {
            query = query.eq('language', language);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,publisher.ilike.%${search}%`);
        }

        // Thêm sắp xếp
        query = query.order(sort_by, { ascending: sort_order === 'asc' });

        // Thêm phân trang
        query = query.range(offset, offset + limit - 1);

        // Thực thi truy vấn
        const { data: books, error: booksError, count } = await query;

        if (booksError) {
            return res.status(400).json({
                success: false,
                error: booksError.message,
                message: 'Không thể tải sách'
            });
        }

        res.status(200).json({
            success: true,
            data: books,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Lỗi khi tải sách:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tải sách'
        });
    }
};

export const getBookById = async (req, res) => {
    try {
        const { id } = req.params;

        // Lấy chi tiết sách
        const { data: book, error: bookError } = await supabase
            .from('books')
            .select(`
                *,
                authors:author_id (id, first_name, last_name, academic_title, email, bio)
            `)
            .eq('id', id)
            .single();

        if (bookError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy sách'
            });
        }

        res.status(200).json({
            success: true,
            data: book
        });
    } catch (error) {
        console.error('Lỗi khi tải sách:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tải sách'
        });
    }
};

export const createBook = async (req, res) => {
    try {
        const {
            title,
            isbn,
            language,
            publish_date,
            publisher,
            description,
            cover_image,
            author_id
        } = req.body;

        // Xác thực các trường bắt buộc
        if (!title || !publisher) {
            return res.status(400).json({
                success: false,
                error: 'Yêu cầu không hợp lệ',
                message: 'Tiêu đề và nhà xuất bản là bắt buộc'
            });
        }

        // Nếu không cung cấp author_id, sử dụng ID của tác giả liên kết với người dùng hiện tại
        let finalAuthorId = author_id;
        if (!finalAuthorId) {
            const { data: authorData } = await supabase
                .from('authors')
                .select('id')
                .eq('user_id', req.user.id)
                .single();

            if (authorData) {
                finalAuthorId = authorData.id;
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Yêu cầu không hợp lệ',
                    message: 'ID tác giả là bắt buộc hoặc bạn phải là tác giả'
                });
            }
        }

        // Tạo sách mới
        const { data: book, error: bookError } = await supabase
            .from('books')
            .insert([{
                title,
                isbn,
                language,
                publish_date: publish_date || new Date().toISOString(),
                publisher,
                description,
                cover_image,
                author_id: finalAuthorId,
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select()
            .single();

        if (bookError) {
            return res.status(400).json({
                success: false,
                error: bookError.message,
                message: 'Không tạo được sách'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tạo sách thành công',
            data: book
        });
    } catch (error) {
        console.error('Lỗi khi tạo sách:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tạo sách'
        });
    }
};

export const updateBook = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            isbn,
            language,
            publish_date,
            publisher,
            description,
            cover_image
        } = req.body;

        // Kiểm tra xem sách có tồn tại không
        const { data: existingBook, error: bookError } = await supabase
            .from('books')
            .select('author_id, authors:author_id (user_id)')
            .eq('id', id)
            .single();

        if (bookError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy sách'
            });
        }

        // Chuẩn bị dữ liệu cập nhật
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (isbn !== undefined) updateData.isbn = isbn;
        if (language !== undefined) updateData.language = language;
        if (publish_date !== undefined) updateData.publish_date = publish_date;
        if (publisher !== undefined) updateData.publisher = publisher;
        if (description !== undefined) updateData.description = description;
        if (cover_image !== undefined) updateData.cover_image = cover_image;

        // Thêm thông tin cập nhật
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by = req.user.id;

        // Cập nhật sách
        const { data: updatedBook, error: updateError } = await supabase
            .from('books')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Cập nhật sách không thành công'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Sách được cập nhật thành công',
            data: updatedBook
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật sách:', error);
        res.status(500).json({
            success: false,
            error: 'lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi cập nhật sách'
        });
    }
};

export const deleteBook = async (req, res) => {
    try {
        const { id } = req.params;

        // Xóa sách
        const { error: deleteError } = await supabase
            .from('books')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(400).json({
                success: false,
                error: deleteError.message,
                message: 'Xóa sách thất bại'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Xóa sách thành công'
        });
    } catch (error) {
        console.error('Lỗi khi xóa sách:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi xóa sách'
        });
    }
};