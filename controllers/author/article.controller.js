import { supabase } from '../../db/connectDB.js';

export const getArticles = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            author_id,
            subject,
            language,
            search,
            sort_by = 'publish_date',
            sort_order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;

        // Xây dựng truy vấn
        let query = supabase
            .from('articles')
            .select(`
                *,
                authors:author_id (id, first_name, last_name, academic_title),
                institutions:institution_id (id, name, type, country)
            `, { count: 'exact' });

        // Áp dụng các bộ lọc
        if (author_id) {
            query = query.eq('author_id', author_id);
        }

        if (subject) {
            query = query.eq('subject_classification', subject);
        }

        if (language) {
            query = query.eq('language', language);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
        }

        // Thêm sắp xếp
        query = query.order(sort_by, { ascending: sort_order === 'asc' });

        // Thêm phân trang
        query = query.range(offset, offset + limit - 1);

        // Thực thi truy vấn
        const { data: articles, error: articlesError, count } = await query;

        if (articlesError) {
            return res.status(400).json({
                success: false,
                error: articlesError.message,
                message: 'Không tải được bài viết'
            });
        }

        res.status(200).json({
            success: true,
            data: articles,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Lỗi khi tải bài viết:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tải bài viết'
        });
    }
};

export const getArticleById = async (req, res) => {
    try {
        const { id } = req.params;

        // Lấy chi tiết bài báo
        const { data: article, error: articleError } = await supabase
            .from('articles')
            .select(`
                *,
                authors:author_id (id, first_name, last_name, academic_title, email, bio),
                institutions:institution_id (id, name, type, country, city)
            `)
            .eq('id', id)
            .single();

        if (articleError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy bài viết'
            });
        }

        res.status(200).json({
            success: true,
            data: article
        });
    } catch (error) {
        console.error('Lỗi khi tải bài viết:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tải bài viết'
        });
    }
};

export const createArticle = async (req, res) => {
    try {
        const {
            title,
            content,
            abstract,
            publish_date,
            language,
            subject_classification,
            institution_id,
            author_id
        } = req.body;

        // Xác thực các trường bắt buộc
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                error: 'Yêu cầu không hợp lệ',
                message: 'Tiêu đề và nội dung bài viết là bắt buộc'
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

        // Tạo bài báo mới
        const { data: article, error: articleError } = await supabase
            .from('articles')
            .insert([{
                title,
                content,
                abstract,
                publish_date: publish_date || new Date().toISOString(),
                language,
                subject_classification,
                institution_id,
                author_id: finalAuthorId,
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select()
            .single();

        if (articleError) {
            return res.status(400).json({
                success: false,
                error: articleError.message,
                message: 'Tạo bài viết thất bại'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Bài viết đã được tạo thành công',
            data: article
        });
    } catch (error) {
        console.error('Lỗi khi tạo bài viết:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tạo bài viết'
        });
    }
};

export const updateArticle = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            content,
            abstract,
            publish_date,
            language,
            subject_classification,
            institution_id
        } = req.body;

        // Kiểm tra xem bài báo có tồn tại không
        const { data: existingArticle, error: articleError } = await supabase
            .from('articles')
            .select('author_id, authors:author_id (user_id)')
            .eq('id', id)
            .single();

        if (articleError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy bài viết'
            });
        }

        // Chuẩn bị dữ liệu cập nhật
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (abstract !== undefined) updateData.abstract = abstract;
        if (publish_date !== undefined) updateData.publish_date = publish_date;
        if (language !== undefined) updateData.language = language;
        if (subject_classification !== undefined) updateData.subject_classification = subject_classification;
        if (institution_id !== undefined) updateData.institution_id = institution_id;

        // Thêm thông tin cập nhật
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by = req.user.id;

        // Cập nhật bài báo
        const { data: updatedArticle, error: updateError } = await supabase
            .from('articles')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Cập nhật thất bại'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Bài viết đã được cập nhật thành công',
            data: updatedArticle
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật bài viết:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi cập nhật bài viết'
        });
    }
};

export const deleteArticle = async (req, res) => {
    try {
        const { id } = req.params;

        // Xóa bài báo
        const { error: deleteError } = await supabase
            .from('articles')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(400).json({
                success: false,
                error: deleteError.message,
                message: 'Xóa bài viết thất bại'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Bài viết đã được xóa thành công'
        });
    } catch (error) {
        console.error('Lỗi khi xóa bài viết:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi xóa bài viết'
        });
    }
};