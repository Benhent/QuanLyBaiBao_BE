import { supabase } from '../../db/connectDB.js';

export const getPosts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status = 'published',
            visibility = 'public',
            user_id,
            tag,
            search,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Bắt đầu xây dựng truy vấn
        let query = supabase
            .from('user_posts')
            .select(`
                *,
                users:user_id (id, username, avatar_url),
                post_tags (
                    tags:tag_id (id, name, slug)
                )
            `, { count: 'exact' });
        
        // Áp dụng các bộ lọc
        if (status) {
            query = query.eq('status', status);
        }
        
        // Đối với người dùng chưa xác thực, chỉ hiển thị bài viết công khai
        if (!req.user) {
            query = query.eq('visibility', 'public');
        } else if (visibility && visibility !== 'all') {
            query = query.eq('visibility', visibility);
        } else if (req.user && visibility === 'all' && req.user.role !== 'admin') {
            // Nếu không phải admin, chỉ hiển thị bài viết công khai hoặc bài viết của chính người dùng
            query = query.or(`visibility.eq.public,user_id.eq.${req.user.id}`);
        }
        
        if (user_id) {
            query = query.eq('user_id', user_id);
        }
        
        if (tag) {
            // Lấy ID của tag từ slug
            const { data: tagData } = await supabase
                .from('tags')
                .select('id')
                .eq('slug', tag)
                .single();
            
            if (tagData) {
                // Lấy các bài viết có tag này
                const { data: postTags } = await supabase
                    .from('post_tags')
                    .select('post_id')
                    .eq('tag_id', tagData.id);
                
                if (postTags && postTags.length > 0) {
                    const postIds = postTags.map(pt => pt.post_id);
                    query = query.in('id', postIds);
                } else {
                    // Không có bài viết nào có tag này
                    return res.status(200).json({
                        success: true,
                        data: [],
                        pagination: {
                            total: 0,
                            page: parseInt(page),
                            limit: parseInt(limit),
                            pages: 0
                        }
                    });
                }
            }
        }
        
        if (search) {
            query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
        }
        
        // Thêm sắp xếp
        query = query.order(sort_by, { ascending: sort_order === 'asc' });
        
        // Thêm phân trang
        query = query.range(offset, offset + limit - 1);
        
        // Thực thi truy vấn
        const { data: posts, error: postsError, count } = await query;
        
        if (postsError) {
            return res.status(400).json({
                success: false,
                error: postsError.message,
                message: 'Failed to fetch posts'
            });
        }
        
        // Lấy số lượng comments, favorites và bookmarks cho mỗi bài viết
        const postsWithCounts = await Promise.all(posts.map(async (post) => {
            // Đếm comments
            const { count: commentCount } = await supabase
                .from('comments')
                .select('id', { count: 'exact' })
                .eq('post_id', post.id);
            
            // Đếm favorites
            const { count: favoriteCount } = await supabase
                .from('user_favorites')
                .select('id', { count: 'exact' })
                .eq('post_id', post.id);
            
            // Đếm bookmarks
            const { count: bookmarkCount } = await supabase
                .from('user_bookmarks')
                .select('id', { count: 'exact' })
                .eq('post_id', post.id);
            
            return {
                ...post,
                stats: {
                    views: post.view_count || 0,
                    comments: commentCount || 0,
                    favorites: favoriteCount || 0,
                    bookmarks: bookmarkCount || 0
                }
            };
        }));
        
        // Định dạng phản hồi
        const formattedPosts = postsWithCounts.map(post => {
            // Nhóm các thẻ
            const tags = post.post_tags.map(pt => pt.tags);
            
            // Loại bỏ post_tags lồng nhau khỏi phản hồi
            const { post_tags, ...postData } = post;
            
            return {
                ...postData,
                tags
            };
        });
        
        res.status(200).json({
            success: true,
            data: formattedPosts,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching posts'
        });
    }
};

export const getPostById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Thiết lập realtime cho bài viết này nếu middleware có sẵn
        if (req.setupRealtimeFor) {
            req.setupRealtimeFor('user_posts', id);
            req.setupCommentsRealtimeFor(id);
        }
        
        // Kiểm tra xem bài viết có tồn tại không và lấy chi tiết bài viết
        const { data: post, error: postError } = await supabase
            .from('user_posts')
            .select(`
                *,
                users:user_id (id, username, avatar_url),
                post_tags (
                    tags:tag_id (id, name, slug)
                )
            `)
            .eq('id', id)
            .single();
        
        if (postError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Post not found'
            });
        }
        
        // Kiểm tra xem người dùng có thể xem bài viết này không
        if (post.visibility === 'private' && (!req.user || (post.user_id !== req.user.id && req.user.role !== 'admin'))) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to view this post'
            });
        }
        
        // Định dạng phản hồi
        const tags = post.post_tags.map(pt => pt.tags);
        const { post_tags, ...postData } = post;
        
        // Tăng lượt xem cho bài viết
        // Chỉ tăng lượt xem nếu người dùng không phải là tác giả của bài viết
        const isAuthor = req.user && req.user.id === post.user_id;
        
        if (!isAuthor) {
            // Tăng view_count
            const { error: updateError } = await supabase
                .from('user_posts')
                .update({ 
                    view_count: (post.view_count || 0) + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (updateError) {
                console.error('Error updating view count:', updateError);
            }
        }
        
        // Lấy số lượng comments
        const { count: commentCount } = await supabase
            .from('comments')
            .select('id', { count: 'exact' })
            .eq('post_id', id);
        
        // Lấy số lượng favorites
        const { count: favoriteCount } = await supabase
            .from('user_favorites')
            .select('id', { count: 'exact' })
            .eq('post_id', id);
        
        // Lấy số lượng bookmarks
        const { count: bookmarkCount } = await supabase
            .from('user_bookmarks')
            .select('id', { count: 'exact' })
            .eq('post_id', id);
        
        // Lấy bài viết liên quan (cùng tag)
        const postTagIds = post.post_tags.map(pt => pt.tags.id);
        
        let relatedPosts = [];
        
        if (postTagIds.length > 0) {
            // Lấy các bài viết có cùng tag
            const { data: relatedPostTags } = await supabase
                .from('post_tags')
                .select('post_id')
                .in('tag_id', postTagIds)
                .neq('post_id', id)
                .limit(5);
            
            if (relatedPostTags && relatedPostTags.length > 0) {
                const relatedPostIds = [...new Set(relatedPostTags.map(pt => pt.post_id))];
                
                const { data: relatedPostsData } = await supabase
                    .from('user_posts')
                    .select(`
                        id, title, featured_image, created_at,
                        users:user_id (username, avatar_url)
                    `)
                    .in('id', relatedPostIds)
                    .eq('status', 'published')
                    .eq('visibility', 'public')
                    .limit(3);
                
                relatedPosts = relatedPostsData || [];
            }
        }
        
        // Thêm thông tin realtime cho client
        const realtimeInfo = {
            enabled: true,
            channel: `comments-post-${id}`,
            events: ['INSERT', 'UPDATE', 'DELETE']
        };
        
        res.status(200).json({
            success: true,
            data: {
                ...postData,
                tags,
                stats: {
                    views: (post.view_count || 0) + (!isAuthor ? 1 : 0), // Trả về số lượt xem đã cập nhật
                    comments: commentCount || 0,
                    favorites: favoriteCount || 0,
                    bookmarks: bookmarkCount || 0
                },
                auth_required: {
                    comments: true,
                    bookmark: true,
                    favorite: true
                },
                realtime: realtimeInfo,
                related_posts: relatedPosts
            }
        });
    } catch (error) {
        console.error('Error fetching post:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching the post'
        });
    }
};

export const createPost = async (req, res) => {
    try {
        const { 
            title, 
            content, 
            status = 'draft', 
            visibility = 'public', 
            featured_image, 
            tags = [],
            excerpt
        } = req.body;
        
        // Xác thực các trường bắt buộc
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Title and content are required'
            });
        }

        // Tạo bài viết mới
        const { data: post, error: postError } = await supabase
            .from('user_posts')
            .insert([{
                user_id: req.user.id,
                title,
                content,
                status,
                visibility,
                featured_image,
                excerpt: excerpt || content.substring(0, 150) + '...',
                view_count: 0,
                updated_by: req.user.id
            }])
            .select()
            .single();

        if (postError) {
            return res.status(400).json({
                success: false,
                error: postError.message,
                message: 'Failed to create post'
            });
        }

        // Thêm thẻ nếu được cung cấp
        if (tags.length > 0) {
            const tagPromises = tags.map(async (tagName) => {
                // Kiểm tra xem thẻ có tồn tại không
                const { data: existingTag } = await supabase
                    .from('tags')
                    .select('id')
                    .eq('name', tagName)
                    .single();
                
                let tagId;
                
                if (existingTag) {
                    tagId = existingTag.id;
                } else {
                    // Tạo thẻ mới
                    const slug = tagName.toLowerCase().replace(/\s+/g, '-');
                    const { data: newTag, error: tagError } = await supabase
                        .from('tags')
                        .insert([{
                            name: tagName,
                            slug,
                            updated_by: req.user.id
                        }])
                        .select()
                        .single();
                    
                    if (tagError) {
                        console.error('Error creating tag:', tagError);
                        return null;
                    }
                    
                    tagId = newTag.id;
                }
                
                // Liên kết thẻ với bài viết
                if (tagId) {
                    const { error: postTagError } = await supabase
                        .from('post_tags')
                        .insert([{
                            tag_id: tagId,
                            post_id: post.id,
                            updated_by: req.user.id
                        }]);
                    
                    if (postTagError) {
                        console.error('Error associating tag with post:', postTagError);
                    }
                }
                
                return tagId;
            });
            
            await Promise.all(tagPromises);
        }

        // Thiết lập realtime cho bài viết mới nếu middleware có sẵn
        if (req.setupRealtimeFor) {
            req.setupRealtimeFor('user_posts', post.id);
            req.setupCommentsRealtimeFor(post.id);
        }

        // Lấy bài viết đã tạo với thông tin đầy đủ
        const { data: createdPost } = await supabase
            .from('user_posts')
            .select(`
                *,
                users:user_id (id, username, avatar_url),
                post_tags (
                    tags:tag_id (id, name, slug)
                )
            `)
            .eq('id', post.id)
            .single();
        
        // Định dạng phản hồi
        const formattedTags = createdPost.post_tags.map(pt => pt.tags);
        const { post_tags, ...postData } = createdPost;

        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data: {
                ...postData,
                tags: formattedTags
            }
        });
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while creating the post'
        });
    }
};

export const updatePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, 
            content, 
            status, 
            visibility, 
            featured_image, 
            tags,
            excerpt
        } = req.body;
        
        // Kiểm tra xem bài viết có tồn tại không và người dùng có quyền cập nhật không
        const { data: existingPost, error: postError } = await supabase
            .from('user_posts')
            .select('user_id, status')
            .eq('id', id)
            .single();
        
        if (postError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Post not found'
            });
        }
        
        // Kiểm tra quyền sở hữu
        if (existingPost.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to update this post'
            });
        }
        
        // Chuẩn bị dữ liệu cập nhật
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (content !== undefined) updateData.content = content;
        if (status !== undefined) updateData.status = status;
        if (visibility !== undefined) updateData.visibility = visibility;
        if (featured_image !== undefined) updateData.featured_image = featured_image;
        if (excerpt !== undefined) {
            updateData.excerpt = excerpt;
        } else if (content !== undefined) {
            updateData.excerpt = content.substring(0, 150) + '...';
        }
        
        // Thêm timestamp và người dùng cập nhật
        updateData.updated_at = new Date().toISOString();
        updateData.updated_by = req.user.id;
        
        // Cập nhật bài viết
        const { data: updatedPost, error: updateError } = await supabase
            .from('user_posts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        
        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Failed to update post'
            });
        }
        
        // Cập nhật thẻ nếu được cung cấp
        if (tags !== undefined) {
            // Xóa thẻ hiện có
            await supabase
                .from('post_tags')
                .delete()
                .eq('post_id', id);
            
            // Thêm thẻ mới
            if (tags.length > 0) {
                const tagPromises = tags.map(async (tagName) => {
                    // Kiểm tra xem thẻ có tồn tại không
                    const { data: existingTag } = await supabase
                        .from('tags')
                        .select('id')
                        .eq('name', tagName)
                        .single();
                    
                    let tagId;
                    
                    if (existingTag) {
                        tagId = existingTag.id;
                    } else {
                        // Tạo thẻ mới
                        const slug = tagName.toLowerCase().replace(/\s+/g, '-');
                        const { data: newTag, error: tagError } = await supabase
                            .from('tags')
                            .insert([{
                                name: tagName,
                                slug,
                                updated_by: req.user.id
                            }])
                            .select()
                            .single();
                        
                        if (tagError) {
                            console.error('Error creating tag:', tagError);
                            return null;
                        }
                        
                        tagId = newTag.id;
                    }
                    
                    // Liên kết thẻ với bài viết
                    if (tagId) {
                        const { error: postTagError } = await supabase
                            .from('post_tags')
                            .insert([{
                                tag_id: tagId,
                                post_id: id,
                                updated_by: req.user.id
                            }]);
                        
                        if (postTagError) {
                            console.error('Error associating tag with post:', postTagError);
                        }
                    }
                    
                    return tagId;
                });
                
                await Promise.all(tagPromises);
            }
        }
        
        // Lấy bài viết đã cập nhật với thông tin đầy đủ
        const { data: fullUpdatedPost } = await supabase
            .from('user_posts')
            .select(`
                *,
                users:user_id (id, username, avatar_url),
                post_tags (
                    tags:tag_id (id, name, slug)
                )
            `)
            .eq('id', id)
            .single();
        
        // Định dạng phản hồi
        const formattedTags = fullUpdatedPost.post_tags.map(pt => pt.tags);
        const { post_tags, ...postData } = fullUpdatedPost;
        
        res.status(200).json({
            success: true,
            message: 'Post updated successfully',
            data: {
                ...postData,
                tags: formattedTags
            }
        });
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while updating the post'
        });
    }
};

export const deletePost = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra xem bài viết có tồn tại không và người dùng có quyền xóa không
        const { data: existingPost, error: postError } = await supabase
            .from('user_posts')
            .select('user_id')
            .eq('id', id)
            .single();
        
        if (postError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Post not found'
            });
        }
        
        // Kiểm tra quyền sở hữu
        if (existingPost.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to delete this post'
            });
        }
        
        // Xóa các bản ghi liên quan trước (để tránh lỗi khóa ngoại nếu ON DELETE CASCADE không hoạt động)
        // Xóa post_tags
        await supabase
            .from('post_tags')
            .delete()
            .eq('post_id', id);
        
        // Xóa comments
        await supabase
            .from('comments')
            .delete()
            .eq('post_id', id);
        
        // Xóa user_favorites
        await supabase
            .from('user_favorites')
            .delete()
            .eq('post_id', id);
        
        // Xóa user_bookmarks
        await supabase
            .from('user_bookmarks')
            .delete()
            .eq('post_id', id);
        
        // Xóa bài viết
        const { error: deleteError } = await supabase
            .from('user_posts')
            .delete()
            .eq('id', id);
        
        if (deleteError) {
            return res.status(400).json({
                success: false,
                error: deleteError.message,
                message: 'Failed to delete post'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Post deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while deleting the post'
        });
    }
};