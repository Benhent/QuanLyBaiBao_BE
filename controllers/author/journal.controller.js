import { supabase } from '../../db/connectDB.js';

export const getJournals = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            type,
            language,
            search,
            sort_by = 'publish_date',
            sort_order = 'desc'
        } = req.query;

        const offset = (page - 1) * limit;

        // Xây dựng truy vấn
        let query = supabase
            .from('journals')
            .select(`
                *,
                institutions:institution_id (id, name, type, country)
            `, { count: 'exact' });

        // Áp dụng các bộ lọc
        if (type) {
            query = query.eq('type', type);
        }

        if (language) {
            query = query.eq('language', language);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
        }

        // Thêm sắp xếp
        query = query.order(sort_by, { ascending: sort_order === 'asc' });

        // Thêm phân trang
        query = query.range(offset, offset + limit - 1);

        // Thực thi truy vấn
        const { data: journals, error: journalsError, count } = await query;

        if (journalsError) {
            return res.status(400).json({
                success: false,
                error: journalsError.message,
                message: 'Tải danh sách tạp chí thất bại'
            });
        }

        res.status(200).json({
            success: true,
            data: journals,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Lỗi khi tải tạp chí:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tải danh sách tạp chí'
        });
    }
};

export const getJournalById = async (req, res) => {
    try {
        const { id } = req.params;

        // Lấy chi tiết tạp chí
        const { data: journal, error: journalError } = await supabase
            .from('journals')
            .select(`
                *,
                institutions:institution_id (id, name, type, country, city)
            `)
            .eq('id', id)
            .single();

        if (journalError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy tạp chí'
            });
        }

        // Lấy danh sách bài báo trong tạp chí này
        const { data: articles } = await supabase
            .from('articles')
            .select(`
                id, title, abstract, publish_date,
                authors:author_id (id, first_name, last_name, academic_title)
            `)
            .eq('journal_id', id)
            .order('publish_date', { ascending: false });

        res.status(200).json({
            success: true,
            data: {
                ...journal,
                articles: articles || []
            }
        });
    } catch (error) {
        console.error('Lỗi khi tải tạp chí:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tải tạp chí'
        });
    }
};

export const createJournal = async (req, res) => {
    try {
        const {
            name,
            type,
            issn,
            language,
            publish_date,
            description,
            institution_id
        } = req.body;

        // Xác thực các trường bắt buộc
        if (!name || !type) {
            return res.status(400).json({
                success: false,
                error: 'Yêu cầu không hợp lệ',
                message: 'Tên và loại tạp chí là bắt buộc'
            });
        }

        // Tạo tạp chí mới
        const { data: journal, error: journalError } = await supabase
            .from('journals')
            .insert([{
                name,
                type,
                issn,
                language,
                publish_date: publish_date || new Date().toISOString(),
                description,
                institution_id,
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select()
            .single();

        if (journalError) {
            return res.status(400).json({
                success: false,
                error: journalError.message,
                message: 'Tạo tạp chí thất bại'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tạp chí đã được tạo thành công',
            data: journal
        });
    } catch (error) {
        console.error('Lỗi khi tạo tạp chí:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Dã xảy ra lỗi khi tạo tạp chí'
        });
    }
};

export const updateJournal = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            type,
            issn,
            language,
            publish_date,
            description,
            institution_id
        } = req.body;

        // Kiểm tra xem tạp chí có tồn tại không
        const { data: existingJournal, error: journalError } = await supabase
            .from('journals')
            .select('created_by')
            .eq('id', id)
            .single();

        if (journalError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy tạp chí'
            });
        }

        // Chuẩn bị dữ liệu cập nhật
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (issn !== undefined) updateData.issn = issn;
        if (language !== undefined) updateData.language = language;
        if (publish_date !== undefined) updateData.publish_date = publish_date;
        if (description !== undefined) updateData.description = description;
        if (institution_id !== undefined) updateData.institution_id = institution_id;

        // Thêm thông tin cập nhật
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by = req.user.id;

        // Cập nhật tạp chí
        const { data: updatedJournal, error: updateError } = await supabase
            .from('journals')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Lỗi khi cập nhật tạp chí'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tạp chí đã được cập nhật thành công',
            data: updatedJournal
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật tạp chí:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi cập nhật tạp chí'
        });
    }
};

export const deleteJournal = async (req, res) => {
    try {
        const { id } = req.params;

        // Kiểm tra xem có bài báo nào liên kết với tạp chí này không
        const { count: articlesCount } = await supabase
            .from('articles')
            .select('id', { count: 'exact' })
            .eq('journal_id', id);

        if (articlesCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Yêu cầu không hợp lệ',
                message: 'Không thế xóa tạp chí và bài viết liên quan'
            });
        }

        // Xóa tạp chí
        const { error: deleteError } = await supabase
            .from('journals')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(400).json({
                success: false,
                error: deleteError.message,
                message: 'Xóa tạp chí thất bại'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Tạp chí đã được xóa thành công'
        });
    } catch (error) {
        console.error('Lỗi khi xóa tạp chí:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi xóa tạp chí'
        });
    }
};