import { supabase } from '../../db/connectDB.js';

export const getInstitutions = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            type,
            country,
            search,
            sort_by = 'name',
            sort_order = 'asc'
        } = req.query;

        const offset = (page - 1) * limit;

        // Xây dựng truy vấn
        let query = supabase
            .from('institutions')
            .select('*', { count: 'exact' });

        // Áp dụng các bộ lọc
        if (type) {
            query = query.eq('type', type);
        }

        if (country) {
            query = query.eq('country', country);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
        }

        // Thêm sắp xếp
        query = query.order(sort_by, { ascending: sort_order === 'asc' });

        // Thêm phân trang
        query = query.range(offset, offset + limit - 1);

        // Thực thi truy vấn
        const { data: institutions, error: institutionsError, count } = await query;

        if (institutionsError) {
            return res.status(400).json({
                success: false,
                error: institutionsError.message,
                message: 'Lấy thông tin tổ chức thất bại'
            });
        }

        res.status(200).json({
            success: true,
            data: institutions,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Lỗi khi tìm kiếm tổ chức:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tìm kiếm các tổ chức'
        });
    }
};

export const getInstitutionById = async (req, res) => {
    try {
        const { id } = req.params;

        // Lấy chi tiết tổ chức
        const { data: institution, error: institutionError } = await supabase
            .from('institutions')
            .select('*')
            .eq('id', id)
            .single();

        if (institutionError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy tổ chức'
            });
        }

        // Lấy danh sách tác giả thuộc tổ chức này
        const { data: authors } = await supabase
            .from('authors')
            .select('id, first_name, last_name, academic_title')
            .eq('institution_id', id);

        // Lấy danh sách tạp chí thuộc tổ chức này
        const { data: journals } = await supabase
            .from('journals')
            .select('id, name, type, issn')
            .eq('institution_id', id);

        res.status(200).json({
            success: true,
            data: {
                ...institution,
                authors: authors || [],
                journals: journals || []
            }
        });
    } catch (error) {
        console.error('Lỗi khi tìm kiếm tổ chức:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi lấy thông tin tổ chức'
        });
    }
};

export const createInstitution = async (req, res) => {
    try {
        const {
            name,
            type,
            country,
            city,
            address,
            website,
            description,
            logo
        } = req.body;

        // Xác thực các trường bắt buộc
        if (!name || !type || !country) {
            return res.status(400).json({
                success: false,
                error: 'Yêu cầu không hợp lệ',
                message: 'Tên, loại và quốc gia là các trường bắt buộc'
            });
        }

        // Tạo tổ chức mới
        const { data: institution, error: institutionError } = await supabase
            .from('institutions')
            .insert([{
                name,
                type,
                country,
                city,
                address,
                website,
                description,
                logo,
                created_by: req.user.id,
                updated_by: req.user.id
            }])
            .select()
            .single();

        if (institutionError) {
            return res.status(400).json({
                success: false,
                error: institutionError.message,
                message: 'Tạo tổ chức thất bại'
            });
        }

        res.status(201).json({
            success: true,
            message: 'Tạo tổ chức thành công',
            data: institution
        });
    } catch (error) {
        console.error('Lỗi khi tạo tổ chức:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi tạo tổ chức'
        });
    }
};

export const updateInstitution = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            type,
            country,
            city,
            address,
            website,
            description,
            logo
        } = req.body;

        // Kiểm tra xem tổ chức có tồn tại không
        const { data: existingInstitution, error: institutionError } = await supabase
            .from('institutions')
            .select('created_by')
            .eq('id', id)
            .single();

        if (institutionError) {
            return res.status(404).json({
                success: false,
                error: 'Không tìm thấy',
                message: 'Không tìm thấy thông tin tổ chức'
            });
        }

        // Chuẩn bị dữ liệu cập nhật
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (type !== undefined) updateData.type = type;
        if (country !== undefined) updateData.country = country;
        if (city !== undefined) updateData.city = city;
        if (address !== undefined) updateData.address = address;
        if (website !== undefined) updateData.website = website;
        if (description !== undefined) updateData.description = description;
        if (logo !== undefined) updateData.logo = logo;

        // Thêm thông tin cập nhật
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by = req.user.id;

        // Cập nhật tổ chức
        const { data: updatedInstitution, error: updateError } = await supabase
            .from('institutions')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Cập nhật thông tin tổ chức thất bại'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin tổ chức thành công',
            data: updatedInstitution
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật thông tin tổ chức:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi cập nhật thông tin tổ chức'
        });
    }
};

export const deleteInstitution = async (req, res) => {
    try {
        const { id } = req.params;

        // Kiểm tra xem có tác giả hoặc tạp chí nào liên kết với tổ chức này không
        const { count: authorsCount } = await supabase
            .from('authors')
            .select('id', { count: 'exact' })
            .eq('institution_id', id);

        const { count: journalsCount } = await supabase
            .from('journals')
            .select('id', { count: 'exact' })
            .eq('institution_id', id);

        if (authorsCount > 0 || journalsCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Yêu cầu không hợp lệ',
                message: 'Không thể xóa tổ chức có tác giả hoặc tạp chí liên quan'
            });
        }

        // Xóa tổ chức
        const { error: deleteError } = await supabase
            .from('institutions')
            .delete()
            .eq('id', id);

        if (deleteError) {
            return res.status(400).json({
                success: false,
                error: deleteError.message,
                message: 'Xóa thông tin tổ chức thất bại'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Xóa thông tin tổ chức thành công'
        });
    } catch (error) {
        console.error('Lỗi khi xóa thông tin tổ chức:', error);
        res.status(500).json({
            success: false,
            error: 'Lỗi máy chủ',
            message: 'Đã xảy ra lỗi khi xóa thông tin tổ chức'
        });
    }
};