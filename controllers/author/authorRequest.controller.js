import { supabase } from '../../db/connectDB.js';
import { 
  sendAuthorApprovalEmail, 
  sendAuthorRejectionEmail,
  sendAdminAuthorRequestNotification
} from '../../mail/email.js';

export const createAuthorRequest = async (req, res) => {
  try {
    const {
      academic_title,
      first_name,
      last_name,
      bio,
      reason_for_request,
      articles,
      journals,
      books,
      institutions,
      file_ids
    } = req.body;

    // Xác thực các trường bắt buộc
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: 'Yêu cầu không hợp lệ',
        message: 'Họ và tên là bắt buộc'
      });
    }

    // Kiểm tra xem người dùng đã có yêu cầu đang chờ xử lý hay chưa
    const { data: existingRequests, error: checkError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('user_id', req.user.id)
      .or('status.eq.pending,status.eq.approved');

    if (checkError) {
      return res.status(400).json({
        success: false,
        error: checkError.message,
        message: 'Không thể kiểm tra các yêu cầu hiện có'
      });
    }

    if (existingRequests && existingRequests.length > 0) {
      const pendingRequest = existingRequests.find(req => req.status === 'pending');
      const approvedRequest = existingRequests.find(req => req.status === 'approved');

      if (pendingRequest) {
        return res.status(400).json({
          success: false,
          error: 'Yêu cầu không hợp lệ',
          message: 'Bạn đã có yêu cầu tác giả đang chờ xử lý'
        });
      }

      if (approvedRequest) {
        return res.status(400).json({
          success: false,
          error: 'Yêu cầu không hợp lệ',
          message: 'Bạn đã là tác giả'
        });
      }
    }

    // Kiểm tra xem người dùng đã có vai trò tác giả chưa
    if (req.user.role === 'author' || req.user.role === 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Yêu cầu không hợp lệ',
        message: 'Bạn đã có quyền tác giả'
      });
    }

    // Bắt đầu transaction
    const { data: authorRequest, error: createError } = await supabase
      .from('author_requests')
      .insert({
        user_id: req.user.id,
        academic_title,
        first_name,
        last_name,
        bio,
        reason_for_request,
        status: 'pending'
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Lỗi khi tạo yêu cầu: ${createError.message}`);
    }

    // Xử lý thêm bài báo (nếu có)
    if (articles && articles.length > 0) {
      const articlesWithRequestId = articles.map(article => ({
        ...article,
        author_request_id: authorRequest.id
      }));

      const { error: articlesError } = await supabase
        .from('author_request_articles')
        .insert(articlesWithRequestId);

      if (articlesError) {
        throw new Error(`Lỗi khi thêm bài báo: ${articlesError.message}`);
      }
    }

    // Xử lý thêm tạp chí (nếu có)
    if (journals && journals.length > 0) {
      const journalsWithRequestId = journals.map(journal => ({
        ...journal,
        author_request_id: authorRequest.id
      }));

      const { error: journalsError } = await supabase
        .from('author_request_journals')
        .insert(journalsWithRequestId);

      if (journalsError) {
        throw new Error(`Lỗi khi thêm tạp chí: ${journalsError.message}`);
      }
    }

    // Xử lý thêm sách (nếu có)
    if (books && books.length > 0) {
      const booksWithRequestId = books.map(book => ({
        ...book,
        author_request_id: authorRequest.id
      }));

      const { error: booksError } = await supabase
        .from('author_request_books')
        .insert(booksWithRequestId);

      if (booksError) {
        throw new Error(`Lỗi khi thêm sách: ${booksError.message}`);
      }
    }

    // Xử lý thêm tổ chức (nếu có)
    if (institutions && institutions.length > 0) {
      const institutionsWithRequestId = institutions.map(institution => ({
        ...institution,
        author_request_id: authorRequest.id
      }));

      const { error: institutionsError } = await supabase
        .from('author_request_institutions')
        .insert(institutionsWithRequestId);

      if (institutionsError) {
        throw new Error(`Lỗi khi thêm tổ chức: ${institutionsError.message}`);
      }
    }

    // Cập nhật các file liên quan nếu có
    if (file_ids && file_ids.length > 0) {
      const { error: filesError } = await supabase
        .from('files')
        .update({
          content_type: 'author_request',
          content_id: authorRequest.id
        })
        .in('id', file_ids);

      if (filesError) {
        throw new Error(`Lỗi khi cập nhật file: ${filesError.message}`);
      }
    }

    // Lấy thông tin đầy đủ của yêu cầu
    const { data: fullRequest, error: getError } = await supabase
      .from('author_requests')
      .select(`
        *,
        author_request_articles(*),
        author_request_journals(*),
        author_request_books(*),
        author_request_institutions(*),
        files:files(*)
      `)
      .eq('id', authorRequest.id)
      .single();

    if (getError) {
      throw new Error(`Lỗi khi lấy thông tin yêu cầu: ${getError.message}`);
    }

    // Gửi email thông báo cho admin
    try {
      const { data: admins } = await supabase
        .from('users')
        .select('email')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        const adminEmails = admins.map(admin => admin.email);
        const requestURL = `${process.env.CLIENT_URL}/admin/author-requests/${authorRequest.id}`;
        
        // Sử dụng hàm gửi email thông báo cho admin
        await sendAdminAuthorRequestNotification(
          adminEmails,
          authorRequest,
          requestURL
        );
      }
    } catch (emailError) {
      console.error('Lỗi khi gửi email thông báo cho admin:', emailError);
      // Không throw error ở đây để không ảnh hưởng đến việc tạo yêu cầu
    }

    res.status(201).json({
      success: true,
      message: 'Yêu cầu trở thành tác giả đã được gửi thành công',
      data: fullRequest
    });
  } catch (error) {
    console.error('Create author request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getAuthorRequests = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;
    
    const offset = (page - 1) * limit;

    let query = supabase
      .from('author_requests')
      .select(`
        *,
        user:users(id, username, email, avatar_url)
      `, { count: 'exact' });

    // Lọc theo trạng thái nếu có
    if (status) {
      query = query.eq('status', status);
    }

    // Tìm kiếm theo tên hoặc email nếu có
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,user.email.ilike.%${search}%`);
    }

    // Thêm sắp xếp
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    // Thêm phân trang
    query = query.range(offset, offset + limit - 1);

    // Thực thi truy vấn
    const { data: requests, error: requestsError, count } = await query;

    if (requestsError) {
      throw new Error(`Lỗi khi lấy danh sách yêu cầu: ${requestsError.message}`);
    }

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      success: true,
      data: requests,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: totalPages
      }
    });
  } catch (error) {
    console.error('Get author requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getAuthorRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    // Lấy thông tin chi tiết của yêu cầu
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select(`
        *,
        user:users(id, username, email, avatar_url),
        author_request_articles(*),
        author_request_journals(*),
        author_request_books(*),
        author_request_institutions(*),
        files:files(*)
      `)
      .eq('id', id)
      .single();

    if (requestError) {
      if (requestError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Yêu cầu không tồn tại'
        });
      }
      throw new Error(`Lỗi khi lấy chi tiết yêu cầu: ${requestError.message}`);
    }

    // Kiểm tra quyền truy cập: chỉ admin hoặc chủ sở hữu mới có thể xem
    if (req.user.role !== 'admin' && request.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Bạn không có quyền xem yêu cầu này'
      });
    }

    res.status(200).json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Get author request by id error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getCurrentUserRequest = async (req, res) => {
  try {
    const { data: request, error } = await supabase
      .from('author_requests')
      .select(`
        *,
        author_request_articles(*),
        author_request_journals(*),
        author_request_books(*),
        author_request_institutions(*),
        files:files(*)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Lỗi khi lấy yêu cầu: ${error.message}`);
    }

    res.status(200).json({
      success: true,
      data: request || null
    });
  } catch (error) {
    console.error('Get current user request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const approveAuthorRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    // Kiểm tra quyền: chỉ admin mới có thể duyệt
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Bạn không có quyền duyệt yêu cầu này'
      });
    }

    // Kiểm tra xem yêu cầu có tồn tại không
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select(`
        *,
        user:users(id, username, email, first_name, last_name),
        author_request_articles(*),
        author_request_journals(*),
        author_request_books(*),
        author_request_institutions(*)
      `)
      .eq('id', id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại hoặc đã được xử lý'
      });
    }

    // Thử sử dụng stored procedure nếu có
    try {
      const { error: transactionError } = await supabase.rpc('approve_author_request_transaction', {
        request_id: id,
        admin_id: req.user.id,
        admin_notes: admin_notes || ''
      });

      if (!transactionError) {
        // Nếu stored procedure thành công, gửi email và trả về kết quả
        try {
          const loginURL = `${process.env.CLIENT_URL}/login`;
          await sendAuthorApprovalEmail(
            request.user.email,
            request.first_name,
            loginURL
          );
        } catch (emailError) {
          console.error('Lỗi khi gửi email thông báo:', emailError);
        }

        return res.status(200).json({
          success: true,
          message: 'Yêu cầu trở thành tác giả đã được chấp nhận',
          data: {
            request_id: id,
            user_id: request.user_id
          }
        });
      }
    } catch (rpcError) {
      console.error('RPC error:', rpcError);
      // Tiếp tục với cách thực hiện thủ công nếu RPC không thành công
    }

    // Bắt đầu xử lý duyệt yêu cầu thủ công
    // 1. Tạo hoặc cập nhật thông tin tác giả
    const { data: author, error: authorError } = await supabase
      .from('authors')
      .upsert({
        user_id: request.user_id,
        first_name: request.first_name,
        last_name: request.last_name,
        academic_title: request.academic_title,
        email: request.user.email,
        institution_id: null // Sẽ cập nhật sau khi tạo institution
      })
      .select()
      .single();

    if (authorError) {
      throw new Error(`Lỗi khi tạo thông tin tác giả: ${authorError.message}`);
    }

    // 2. Cập nhật vai trò của người dùng thành tác giả
    const { error: userError } = await supabase
      .from('users')
      .update({ role: 'author' })
      .eq('id', request.user_id);

    if (userError) {
      throw new Error(`Lỗi khi cập nhật vai trò người dùng: ${userError.message}`);
    }

    // 3. Xử lý các tổ chức
    if (request.author_request_institutions && request.author_request_institutions.length > 0) {
      for (const institution of request.author_request_institutions) {
        // Kiểm tra xem tổ chức đã tồn tại chưa
        const { data: existingInstitution, error: checkInstitutionError } = await supabase
          .from('institutions')
          .select('*')
          .eq('name', institution.name)
          .eq('country', institution.country)
          .eq('city', institution.city)
          .limit(1);

        if (checkInstitutionError) {
          throw new Error(`Lỗi khi kiểm tra tổ chức: ${checkInstitutionError.message}`);
        }

        let institutionId;
        if (existingInstitution && existingInstitution.length > 0) {
          institutionId = existingInstitution[0].id;
        } else {
          // Tạo tổ chức mới
          const { data: newInstitution, error: createInstitutionError } = await supabase
            .from('institutions')
            .insert({
              name: institution.name,
              type: institution.type,
              country: institution.country,
              city: institution.city,
              updated_by: req.user.id
            })
            .select()
            .single();

          if (createInstitutionError) {
            throw new Error(`Lỗi khi tạo tổ chức: ${createInstitutionError.message}`);
          }

          institutionId = newInstitution.id;
        }

        // Cập nhật institution_id cho tác giả
        const { error: updateAuthorError } = await supabase
          .from('authors')
          .update({ institution_id: institutionId })
          .eq('id', author.id);

        if (updateAuthorError) {
          throw new Error(`Lỗi khi cập nhật tổ chức cho tác giả: ${updateAuthorError.message}`);
        }
      }
    }

    // 4. Xử lý các bài báo
    if (request.author_request_articles && request.author_request_articles.length > 0) {
      for (const article of request.author_request_articles) {
        // Tạo bài báo mới
        const { data: newArticle, error: createArticleError } = await supabase
          .from('articles')
          .insert({
            title: article.title,
            content: article.content,
            publish_date: article.publish_date,
            language: article.language,
            subject_classification: article.subject_classification,
            updated_by: req.user.id
          })
          .select()
          .single();

        if (createArticleError) {
          throw new Error(`Lỗi khi tạo bài báo: ${createArticleError.message}`);
        }

        // Liên kết bài báo với tác giả
        const { error: linkArticleError } = await supabase
          .from('author_articles')
          .insert({
            author_id: author.id,
            article_id: newArticle.id
          });

        if (linkArticleError) {
          throw new Error(`Lỗi khi liên kết bài báo với tác giả: ${linkArticleError.message}`);
        }

        // Cập nhật các file liên quan
        const { error: updateFilesError } = await supabase
          .from('files')
          .update({
            content_type: 'article',
            content_id: newArticle.id
          })
          .eq('content_type', 'author_request')
          .eq('content_id', request.id);

        if (updateFilesError) {
          console.error(`Lỗi khi cập nhật file cho bài báo: ${updateFilesError.message}`);
          // Không throw error ở đây để không ảnh hưởng đến quá trình duyệt
        }
      }
    }

    // 5. Xử lý các tạp chí
    if (request.author_request_journals && request.author_request_journals.length > 0) {
      for (const journal of request.author_request_journals) {
        // Tạo tạp chí mới
        const { data: newJournal, error: createJournalError } = await supabase
          .from('journals')
          .insert({
            name: journal.name,
            type: journal.type,
            issn: journal.issn,
            language: journal.language,
            publish_date: journal.publish_date,
            updated_by: req.user.id
          })
          .select()
          .single();

        if (createJournalError) {
          throw new Error(`Lỗi khi tạo tạp chí: ${createJournalError.message}`);
        }

        // Cập nhật các file liên quan
        const { error: updateFilesError } = await supabase
          .from('files')
          .update({
            content_type: 'journal',
            content_id: newJournal.id
          })
          .eq('content_type', 'author_request')
          .eq('content_id', request.id);

        if (updateFilesError) {
          console.error(`Lỗi khi cập nhật file cho tạp chí: ${updateFilesError.message}`);
        }
      }
    }

    // 6. Xử lý các sách
    if (request.author_request_books && request.author_request_books.length > 0) {
      for (const book of request.author_request_books) {
        // Tạo sách mới
        const { data: newBook, error: createBookError } = await supabase
          .from('books')
          .insert({
            title: book.title,
            isbn: book.isbn,
            language: book.language,
            publish_date: book.publish_date,
            publisher: book.publisher,
            updated_by: req.user.id
          })
          .select()
          .single();

        if (createBookError) {
          throw new Error(`Lỗi khi tạo sách: ${createBookError.message}`);
        }

        // Liên kết sách với tác giả
        const { error: linkBookError } = await supabase
          .from('author_books')
          .insert({
            author_id: author.id,
            book_id: newBook.id
          });

        if (linkBookError) {
          throw new Error(`Lỗi khi liên kết sách với tác giả: ${linkBookError.message}`);
        }

        // Cập nhật các file liên quan
        const { error: updateFilesError } = await supabase
          .from('files')
          .update({
            content_type: 'book',
            content_id: newBook.id
          })
          .eq('content_type', 'author_request')
          .eq('content_id', request.id);

        if (updateFilesError) {
          console.error(`Lỗi khi cập nhật file cho sách: ${updateFilesError.message}`);
        }
      }
    }

    // 7. Cập nhật trạng thái của yêu cầu
    const { error: updateRequestError } = await supabase
      .from('author_requests')
      .update({
        status: 'approved',
        admin_notes: admin_notes,
        reviewed_by: req.user.id,
        updated_at: new Date()
      })
      .eq('id', id);

    if (updateRequestError) {
      throw new Error(`Lỗi khi cập nhật trạng thái yêu cầu: ${updateRequestError.message}`);
    }

    // 8. Gửi email thông báo cho người dùng sử dụng hàm sendAuthorApprovalEmail
    try {
      const loginURL = `${process.env.CLIENT_URL}/login`;
      await sendAuthorApprovalEmail(
        request.user.email,
        request.first_name,
        loginURL
      );
    } catch (emailError) {
      console.error('Lỗi khi gửi email thông báo:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Yêu cầu trở thành tác giả đã được chấp nhận',
      data: {
        request_id: id,
        author_id: author.id,
        user_id: request.user_id
      }
    });
  } catch (error) {
    console.error('Approve author request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const rejectAuthorRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    // Xác thực lý do từ chối
    if (!admin_notes) {
      return res.status(400).json({
        success: false,
        error: 'Yêu cầu không hợp lệ',
        message: 'Lý do từ chối là bắt buộc'
      });
    }

    // Kiểm tra quyền: chỉ admin mới có thể từ chối
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Bạn không có quyền từ chối yêu cầu này'
      });
    }

    // Kiểm tra xem yêu cầu có tồn tại không
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*, user:users(email, first_name, last_name)')
      .eq('id', id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại hoặc đã được xử lý'
      });
    }

    // Cập nhật trạng thái của yêu cầu
    const { error: updateError } = await supabase
      .from('author_requests')
      .update({
        status: 'rejected',
        admin_notes: admin_notes,
        reviewed_by: req.user.id,
        updated_at: new Date()
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Lỗi khi cập nhật trạng thái yêu cầu: ${updateError.message}`);
    }

    // Gửi email thông báo cho người dùng sử dụng hàm sendAuthorRejectionEmail
    try {
      await sendAuthorRejectionEmail(
        request.user.email,
        request.first_name,
        admin_notes || 'Yêu cầu của bạn không đáp ứng đủ tiêu chí để trở thành tác giả.'
      );
    } catch (emailError) {
      console.error('Lỗi khi gửi email thông báo:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Yêu cầu trở thành tác giả đã bị từ chối',
      data: {
        request_id: id
      }
    });
  } catch (error) {
    console.error('Reject author request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateAuthorRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      academic_title,
      first_name,
      last_name,
      bio,
      reason_for_request,
      file_ids
    } = req.body;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Cập nhật thông tin yêu cầu
    const updateData = {};
    if (academic_title !== undefined) updateData.academic_title = academic_title;
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (bio !== undefined) updateData.bio = bio;
    if (reason_for_request !== undefined) updateData.reason_for_request = reason_for_request;
    updateData.updated_at = new Date();

    const { data: updatedRequest, error: updateError } = await supabase
      .from('author_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Lỗi khi cập nhật yêu cầu: ${updateError.message}`);
    }

    // Cập nhật các file liên quan nếu có
    if (file_ids && file_ids.length > 0) {
      const { error: filesError } = await supabase
        .from('files')
        .update({
          content_type: 'author_request',
          content_id: id
        })
        .in('id', file_ids);

      if (filesError) {
        throw new Error(`Lỗi khi cập nhật file: ${filesError.message}`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Yêu cầu đã được cập nhật thành công',
      data: updatedRequest
    });
  } catch (error) {
    console.error('Update author request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteAuthorRequest = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Cập nhật các file liên quan
    const { error: filesError } = await supabase
      .from('files')
      .update({
        content_type: null,
        content_id: null
      })
      .eq('content_type', 'author_request')
      .eq('content_id', id);

    if (filesError) {
      console.error(`Lỗi khi cập nhật file: ${filesError.message}`);
      // Không throw error ở đây để không ảnh hưởng đến việc xóa yêu cầu
    }

    // Xóa yêu cầu
    const { error: deleteError } = await supabase
      .from('author_requests')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Lỗi khi xóa yêu cầu: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Yêu cầu đã được xóa thành công'
    });
  } catch (error) {
    console.error('Delete author request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const addArticleToRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const articleData = req.body;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Thêm bài báo mới
    const { data: article, error: articleError } = await supabase
      .from('author_request_articles')
      .insert({
        ...articleData,
        author_request_id: id
      })
      .select()
      .single();

    if (articleError) {
      throw new Error(`Lỗi khi thêm bài báo: ${articleError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Bài báo đã được thêm vào yêu cầu thành công',
      data: article
    });
  } catch (error) {
    console.error('Add article to request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const addJournalToRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const journalData = req.body;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Thêm tạp chí mới
    const { data: journal, error: journalError } = await supabase
      .from('author_request_journals')
      .insert({
        ...journalData,
        author_request_id: id
      })
      .select()
      .single();

    if (journalError) {
      throw new Error(`Lỗi khi thêm tạp chí: ${journalError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Tạp chí đã được thêm vào yêu cầu thành công',
      data: journal
    });
  } catch (error) {
    console.error('Add journal to request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const addBookToRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const bookData = req.body;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Thêm sách mới
    const { data: book, error: bookError } = await supabase
      .from('author_request_books')
      .insert({
        ...bookData,
        author_request_id: id
      })
      .select()
      .single();

    if (bookError) {
      throw new Error(`Lỗi khi thêm sách: ${bookError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Sách đã được thêm vào yêu cầu thành công',
      data: book
    });
  } catch (error) {
    console.error('Add book to request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const addInstitutionToRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const institutionData = req.body;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Thêm tổ chức mới
    const { data: institution, error: institutionError } = await supabase
      .from('author_request_institutions')
      .insert({
        ...institutionData,
        author_request_id: id
      })
      .select()
      .single();

    if (institutionError) {
      throw new Error(`Lỗi khi thêm tổ chức: ${institutionError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Tổ chức đã được thêm vào yêu cầu thành công',
      data: institution
    });
  } catch (error) {
    console.error('Add institution to request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const removeArticleFromRequest = async (req, res) => {
  try {
    const { requestId, articleId } = req.params;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Xóa bài báo
    const { error: deleteError } = await supabase
      .from('author_request_articles')
      .delete()
      .eq('id', articleId)
      .eq('author_request_id', requestId);

    if (deleteError) {
      throw new Error(`Lỗi khi xóa bài báo: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Bài báo đã được xóa khỏi yêu cầu thành công'
    });
  } catch (error) {
    console.error('Remove article from request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const removeJournalFromRequest = async (req, res) => {
  try {
    const { requestId, journalId } = req.params;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Xóa tạp chí
    const { error: deleteError } = await supabase
      .from('author_request_journals')
      .delete()
      .eq('id', journalId)
      .eq('author_request_id', requestId);

    if (deleteError) {
      throw new Error(`Lỗi khi xóa tạp chí: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Tạp chí đã được xóa khỏi yêu cầu thành công'
    });
  } catch (error) {
    console.error('Remove journal from request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const removeBookFromRequest = async (req, res) => {
  try {
    const { requestId, bookId } = req.params;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Xóa sách
    const { error: deleteError } = await supabase
      .from('author_request_books')
      .delete()
      .eq('id', bookId)
      .eq('author_request_id', requestId);

    if (deleteError) {
      throw new Error(`Lỗi khi xóa sách: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Sách đã được xóa khỏi yêu cầu thành công'
    });
  } catch (error) {
    console.error('Remove book from request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const removeInstitutionFromRequest = async (req, res) => {
  try {
    const { requestId, institutionId } = req.params;

    // Kiểm tra xem yêu cầu có tồn tại không và thuộc về người dùng hiện tại
    const { data: request, error: requestError } = await supabase
      .from('author_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (requestError || !request) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Yêu cầu không tồn tại, không thuộc về bạn hoặc đã được xử lý'
      });
    }

    // Xóa tổ chức
    const { error: deleteError } = await supabase
      .from('author_request_institutions')
      .delete()
      .eq('id', institutionId)
      .eq('author_request_id', requestId);

    if (deleteError) {
      throw new Error(`Lỗi khi xóa tổ chức: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Tổ chức đã được xóa khỏi yêu cầu thành công'
    });
  } catch (error) {
    console.error('Remove institution from request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};