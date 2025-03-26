import { supabase } from '../../db/connectDB.js';

export const toggleFavorite = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra xem bài viết có tồn tại không
        const { data: post, error: postError } = await supabase
            .from('user_posts')
            .select('id')
            .eq('id', id)
            .single();
        
        if (postError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Post not found'
            });
        }
        
        // Kiểm tra xem người dùng đã yêu thích bài viết này chưa
        const { data: existingFavorite, error: favoriteError } = await supabase
            .from('user_favorites')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('post_id', id)
            .single();
        
        let action;
        
        if (existingFavorite) {
            // Xóa khỏi danh sách yêu thích
            const { error: removeError } = await supabase
                .from('user_favorites')
                .delete()
                .eq('id', existingFavorite.id);
            
            if (removeError) {
                return res.status(400).json({
                    success: false,
                    error: removeError.message,
                    message: 'Failed to remove from favorites'
                });
            }
            
            action = 'removed from';
        } else {
            // Thêm vào danh sách yêu thích
            const { error: addError } = await supabase
                .from('user_favorites')
                .insert([{
                    user_id: req.user.id,
                    post_id: id,
                    updated_by: req.user.id
                }]);
            
            if (addError) {
                return res.status(400).json({
                    success: false,
                    error: addError.message,
                    message: 'Failed to add to favorites'
                });
            }
            
            action = 'added to';
        }
        
        // Lấy số lượng yêu thích đã cập nhật
        const { data: favorites, error: countError } = await supabase
            .from('user_favorites')
            .select('id', { count: 'exact' })
            .eq('post_id', id);
        
        // Nếu có socket.io, gửi thông báo realtime
        if (req.io) {
            req.io.to(`post-${id}`).emit('favorite-update', {
                type: 'favorite-update',
                data: {
                    post_id: id,
                    favorited: action === 'added to',
                    count: favorites.length,
                    user_id: req.user.id
                }
            });
        }
        
        res.status(200).json({
            success: true,
            message: `Post ${action} favorites successfully`,
            data: {
                favorited: action === 'added to',
                count: favorites.length
            }
        });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while toggling favorite'
        });
    }
};

export const toggleBookmark = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra xem bài viết có tồn tại không
        const { data: post, error: postError } = await supabase
            .from('user_posts')
            .select('id')
            .eq('id', id)
            .single();
        
        if (postError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Post not found'
            });
        }
        
        // Kiểm tra xem người dùng đã đánh dấu bài viết này chưa
        const { data: existingBookmark, error: bookmarkError } = await supabase
            .from('user_bookmarks')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('post_id', id)
            .single();
        
        let action;
        
        if (existingBookmark) {
            // Xóa đánh dấu
            const { error: removeError } = await supabase
                .from('user_bookmarks')
                .delete()
                .eq('id', existingBookmark.id);
            
            if (removeError) {
                return res.status(400).json({
                    success: false,
                    error: removeError.message,
                    message: 'Failed to remove bookmark'
                });
            }
            
            action = 'removed';
        } else {
            // Thêm đánh dấu
            const { error: addError } = await supabase
                .from('user_bookmarks')
                .insert([{
                    user_id: req.user.id,
                    post_id: id,
                    updated_by: req.user.id
                }]);
            
            if (addError) {
                return res.status(400).json({
                    success: false,
                    error: addError.message,
                    message: 'Failed to add bookmark'
                });
            }
            
            action = 'added';
        }
        
        // Nếu có socket.io, gửi thông báo realtime
        if (req.io) {
            req.io.to(`post-${id}`).emit('bookmark-update', {
                type: 'bookmark-update',
                data: {
                    post_id: id,
                    bookmarked: action === 'added',
                    user_id: req.user.id
                }
            });
        }
        
        res.status(200).json({
            success: true,
            message: `Bookmark ${action} successfully`,
            data: {
                bookmarked: action === 'added'
            }
        });
    } catch (error) {
        console.error('Error toggling bookmark:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while toggling bookmark'
        });
    }
};

export const getBookmarkedPosts = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        // Lấy bài viết đã đánh dấu
        const { data: bookmarks, error: bookmarkError, count } = await supabase
            .from('user_bookmarks')
            .select(`
                post_id,
                user_posts!inner (
                    *,
                    users:user_id (username, avatar_url),
                    post_tags (
                        tags:tag_id (id, name, slug)
                    )
                )
            `, { count: 'exact' })
            .eq('user_id', req.user.id)
            .range(offset, offset + limit - 1)
            .order('created_at', { ascending: false });
        
        if (bookmarkError) {
            return res.status(400).json({
                success: false,
                error: bookmarkError.message,
                message: 'Failed to fetch bookmarked posts'
            });
        }
        
        // Định dạng phản hồi
        const formattedPosts = bookmarks.map(bookmark => {
            const post = bookmark.user_posts;
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
        console.error('Error fetching bookmarked posts:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching bookmarked posts'
        });
    }
};

export const getFavoritePosts = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        // Lấy bài viết yêu thích
        const { data: favorites, error: favoriteError, count } = await supabase
            .from('user_favorites')
            .select(`
                post_id,
                user_posts!inner (
                    *,
                    users:user_id (username, avatar_url),
                    post_tags (
                        tags:tag_id (id, name, slug)
                    )
                )
            `, { count: 'exact' })
            .eq('user_id', req.user.id)
            .range(offset, offset + limit - 1)
            .order('created_at', { ascending: false });
        
        if (favoriteError) {
            return res.status(400).json({
                success: false,
                error: favoriteError.message,
                message: 'Failed to fetch favorite posts'
            });
        }
        
        // Định dạng phản hồi
        const formattedPosts = favorites.map(favorite => {
            const post = favorite.user_posts;
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
        console.error('Error fetching favorite posts:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching favorite posts'
        });
    }
};