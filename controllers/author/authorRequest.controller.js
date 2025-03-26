import { supabase } from '../../db/connectDB.js';
import { sendAuthorApprovalEmail, sendAuthorRejectionEmail } from '../../mail/email.js';

export const submitAuthorRequest = async (req, res) => {
    try {
        const {
            academic_title,
            first_name,
            last_name,
            email,
            bio,
            reason_for_request,
            institution,
            books,
            articles,
            journals
        } = req.body;

        // Kiểm tra các trường bắt buộc
        if (!first_name || !email || !reason_for_request) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'First name, email, and reason for request are required'
            });
        }

        // Kiểm tra xem người dùng đã có yêu cầu đang chờ xử lý chưa
        const { data: existingRequest, error: checkError } = await supabase
            .from('author_requests')
            .select('id, status')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingRequest && existingRequest.length > 0 && existingRequest[0].status === 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'You already have a pending author request'
            });
        }

        // Tạo yêu cầu mới
        const { data: authorRequest, error: requestError } = await supabase
            .from('author_requests')
            .insert([{
                user_id: req.user.id,
                academic_title,
                first_name,
                last_name,
                email,
                bio,
                reason_for_request,
                status: 'pending'
            }])
            .select()
            .single();

        if (requestError) {
            return res.status(400).json({
                success: false,
                error: requestError.message,
                message: 'Failed to submit author request'
            });
        }

        // Thêm thông tin về cơ sở nếu được cung cấp
        if (institution) {
            const { error: institutionError } = await supabase
                .from('author_request_institutions')
                .insert([{
                    author_request_id: authorRequest.id,
                    name: institution.name,
                    type: institution.type,
                    country: institution.country,
                    city: institution.city
                }]);

            if (institutionError) {
                console.error('Error adding institution information:', institutionError);
            }
        }

        // Thêm thông tin về sách nếu được cung cấp
        if (books && books.length > 0) {
            const bookPromises = books.map(book => {
                return supabase
                    .from('author_request_books')
                    .insert([{
                        author_request_id: authorRequest.id,
                        title: book.title,
                        isbn: book.isbn,
                        language: book.language,
                        publish_date: book.publish_date,
                        publisher: book.publisher,
                        description: book.description
                    }]);
            });

            await Promise.all(bookPromises);
        }

        // Thêm thông tin về bài báo nếu được cung cấp
        if (articles && articles.length > 0) {
            const articlePromises = articles.map(article => {
                return supabase
                    .from('author_request_articles')
                    .insert([{
                        author_request_id: authorRequest.id,
                        title: article.title,
                        content: article.content,
                        publish_date: article.publish_date,
                        language: article.language,
                        subject_classification: article.subject_classification
                    }]);
            });

            await Promise.all(articlePromises);
        }

        // Thêm thông tin về tạp chí nếu được cung cấp
        if (journals && journals.length > 0) {
            const journalPromises = journals.map(journal => {
                return supabase
                    .from('author_request_journals')
                    .insert([{
                        author_request_id: authorRequest.id,
                        name: journal.name,
                        type: journal.type,
                        issn: journal.issn,
                        language: journal.language,
                        publish_date: journal.publish_date
                    }]);
            });

            await Promise.all(journalPromises);
        }

        res.status(201).json({
            success: true,
            message: 'Author request submitted successfully',
            data: authorRequest
        });
    } catch (error) {
        console.error('Error submitting author request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while submitting the author request'
        });
    }
};

export const getAuthorRequests = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        // Kiểm tra quyền admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to access this resource'
            });
        }

        // Xây dựng truy vấn
        let query = supabase
            .from('author_requests')
            .select('*, users:user_id (id, username, email, avatar_url)', { count: 'exact' });

        if (status) {
            query = query.eq('status', status);
        }

        // Thêm phân trang
        query = query.range(offset, offset + limit - 1)
            .order('created_at', { ascending: false });

        // Thực thi truy vấn
        const { data: requests, error: requestsError, count } = await query;

        if (requestsError) {
            return res.status(400).json({
                success: false,
                error: requestsError.message,
                message: 'Failed to fetch author requests'
            });
        }

        // Lấy thông tin chi tiết cho mỗi yêu cầu
        const requestsWithDetails = await Promise.all(requests.map(async (request) => {
            // Lấy thông tin về cơ sở
            const { data: institutions } = await supabase
                .from('author_request_institutions')
                .select('*')
                .eq('author_request_id', request.id);

            // Lấy thông tin về sách
            const { data: books } = await supabase
                .from('author_request_books')
                .select('*')
                .eq('author_request_id', request.id);

            // Lấy thông tin về bài báo
            const { data: articles } = await supabase
                .from('author_request_articles')
                .select('*')
                .eq('author_request_id', request.id);

            // Lấy thông tin về tạp chí
            const { data: journals } = await supabase
                .from('author_request_journals')
                .select('*')
                .eq('author_request_id', request.id);

            return {
                ...request,
                institutions: institutions || [],
                books: books || [],
                articles: articles || [],
                journals: journals || []
            };
        }));

        res.status(200).json({
            success: true,
            data: requestsWithDetails,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching author requests:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching author requests'
        });
    }
};

export const getAuthorRequestById = async (req, res) => {
    try {
        const { id } = req.params;

        // Lấy thông tin yêu cầu
        const { data: request, error: requestError } = await supabase
            .from('author_requests')
            .select('*, users:user_id (id, username, email, avatar_url)')
            .eq('id', id)
            .single();

        if (requestError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Author request not found'
            });
        }

        // Kiểm tra quyền truy cập
        if (request.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to access this resource'
            });
        }

        // Lấy thông tin chi tiết
        // Lấy thông tin về cơ sở
        const { data: institutions } = await supabase
            .from('author_request_institutions')
            .select('*')
            .eq('author_request_id', id);

        // Lấy thông tin về sách
        const { data: books } = await supabase
            .from('author_request_books')
            .select('*')
            .eq('author_request_id', id);

        // Lấy thông tin về bài báo
        const { data: articles } = await supabase
            .from('author_request_articles')
            .select('*')
            .eq('author_request_id', id);

        // Lấy thông tin về tạp chí
        const { data: journals } = await supabase
            .from('author_request_journals')
            .select('*')
            .eq('author_request_id', id);

        const requestWithDetails = {
            ...request,
            institutions: institutions || [],
            books: books || [],
            articles: articles || [],
            journals: journals || []
        };

        res.status(200).json({
            success: true,
            data: requestWithDetails
        });
    } catch (error) {
        console.error('Error fetching author request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching the author request'
        });
    }
};

export const getMyAuthorRequests = async (req, res) => {
    try {
        // Lấy yêu cầu của người dùng hiện tại
        const { data: requests, error: requestsError } = await supabase
            .from('author_requests')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (requestsError) {
            return res.status(400).json({
                success: false,
                error: requestsError.message,
                message: 'Failed to fetch your author requests'
            });
        }

        res.status(200).json({
            success: true,
            data: requests
        });
    } catch (error) {
        console.error('Error fetching user author requests:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching your author requests'
        });
    }
};

export const approveAuthorRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes } = req.body;

        // Kiểm tra quyền admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to approve author requests'
            });
        }

        // Lấy thông tin yêu cầu
        const { data: request, error: requestError } = await supabase
            .from('author_requests')
            .select('*, users:user_id (id, username, email, first_name, last_name)')
            .eq('id', id)
            .single();

        if (requestError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Author request not found'
            });
        }

        // Kiểm tra xem yêu cầu có đang ở trạng thái pending không
        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: `This request has already been ${request.status}`
            });
        }

        // Cập nhật trạng thái yêu cầu
        const { data: updatedRequest, error: updateError } = await supabase
            .from('author_requests')
            .update({
                status: 'approved',
                admin_notes: admin_notes || null,
                reviewed_by: req.user.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Failed to approve author request'
            });
        }

        // Tạo bản ghi tác giả mới
        const { data: author, error: authorError } = await supabase
            .from('authors')
            .insert([{
                first_name: request.first_name,
                last_name: request.last_name,
                academic_title: request.academic_title,
                email: request.email,
                user_id: request.user_id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (authorError) {
            console.error('Error creating author record:', authorError);
            // Tiếp tục xử lý ngay cả khi có lỗi tạo bản ghi tác giả
        }

        // Cập nhật vai trò người dùng thành 'author'
        const { error: userUpdateError } = await supabase
            .from('users')
            .update({
                role: 'author',
                updated_at: new Date().toISOString()
            })
            .eq('id', request.user_id);

        if (userUpdateError) {
            console.error('Error updating user role:', userUpdateError);
            // Tiếp tục xử lý ngay cả khi có lỗi cập nhật vai trò người dùng
        }

        // Gửi email thông báo
        try {
            const loginURL = `${process.env.FRONTEND_URL}/login`;
            await sendAuthorApprovalEmail(
                request.users.email,
                request.first_name,
                loginURL
            );
        } catch (emailError) {
            console.error('Error sending approval email:', emailError);
            // Tiếp tục xử lý ngay cả khi có lỗi gửi email
        }

        res.status(200).json({
            success: true,
            message: 'Author request approved successfully',
            data: updatedRequest
        });
    } catch (error) {
        console.error('Error approving author request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while approving the author request'
        });
    }
};

export const rejectAuthorRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_notes, rejection_reason } = req.body;

        // Kiểm tra lý do từ chối
        if (!rejection_reason) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Rejection reason is required'
            });
        }

        // Kiểm tra quyền admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to reject author requests'
            });
        }

        // Lấy thông tin yêu cầu
        const { data: request, error: requestError } = await supabase
            .from('author_requests')
            .select('*, users:user_id (id, username, email, first_name, last_name)')
            .eq('id', id)
            .single();

        if (requestError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Author request not found'
            });
        }

        // Kiểm tra xem yêu cầu có đang ở trạng thái pending không
        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: `This request has already been ${request.status}`
            });
        }

        // Cập nhật trạng thái yêu cầu
        const { data: updatedRequest, error: updateError } = await supabase
            .from('author_requests')
            .update({
                status: 'rejected',
                admin_notes: admin_notes || rejection_reason,
                reviewed_by: req.user.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Failed to reject author request'
            });
        }

        // Gửi email thông báo
        try {
            await sendAuthorRejectionEmail(
                request.users.email,
                request.first_name,
                rejection_reason
            );
        } catch (emailError) {
            console.error('Error sending rejection email:', emailError);
            // Tiếp tục xử lý ngay cả khi có lỗi gửi email
        }

        res.status(200).json({
            success: true,
            message: 'Author request rejected successfully',
            data: updatedRequest
        });
    } catch (error) {
        console.error('Error rejecting author request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while rejecting the author request'
        });
    }
};