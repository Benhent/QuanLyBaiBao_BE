import { supabase } from '../../db/connectDB.js';

export const getComments = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        // Kiểm tra xem bài viết có tồn tại không
        const { data: post, error: postError } = await supabase
            .from('user_posts')
            .select('id, visibility')
            .eq('id', id)
            .single();
        
        if (postError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Post not found'
            });
        }
        
        // Thiết lập realtime cho comments của bài viết này
        if (req.setupCommentsRealtimeFor) {
            req.setupCommentsRealtimeFor(id);
        }
        
        // Lấy comments
        const { data: comments, error: commentsError, count } = await supabase
            .from('comments')
            .select(`
                *,
                users:user_id (id, username, avatar_url)
            `, { count: 'exact' })
            .eq('post_id', id)
            .is('parent_id', null) // Chỉ lấy comments cấp cao nhất
            .range(offset, offset + limit - 1)
            .order('created_at', { ascending: false });
        
        if (commentsError) {
            return res.status(400).json({
                success: false,
                error: commentsError.message,
                message: 'Failed to fetch comments'
            });
        }
        
        // Lấy replies cho mỗi comment
        const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
            const { data: replies, error: repliesError } = await supabase
                .from('comments')
                .select(`
                    *,
                    users:user_id (id, username, avatar_url)
                `)
                .eq('post_id', id)
                .eq('parent_id', comment.id)
                .order('created_at', { ascending: true });
            
            return {
                ...comment,
                replies: repliesError ? [] : replies
            };
        }));
        
        // Thêm thông tin realtime cho client
        const realtimeInfo = {
            enabled: true,
            channel: `comments-post-${id}`,
            events: ['INSERT', 'UPDATE', 'DELETE']
        };
        
        res.status(200).json({
            success: true,
            data: commentsWithReplies,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(count / limit)
            },
            realtime: realtimeInfo
        });
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while fetching comments'
        });
    }
};

export const addComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment_text, parent_id } = req.body;
        
        if (!comment_text) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Comment text is required'
            });
        }
        
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
        
        // Nếu parent_id được cung cấp, kiểm tra xem nó có tồn tại không
        if (parent_id) {
            const { data: parentComment, error: parentError } = await supabase
                .from('comments')
                .select('id')
                .eq('id', parent_id)
                .eq('post_id', id)
                .single();
            
            if (parentError) {
                return res.status(404).json({
                    success: false,
                    error: 'Not Found',
                    message: 'Parent comment not found'
                });
            }
        }
        
        // Thêm bình luận
        const { data: comment, error: commentError } = await supabase
            .from('comments')
            .insert([{
                user_id: req.user.id,
                post_id: id,
                parent_id,
                comment_text,
                updated_by: req.user.id
            }])
            .select(`
                *,
                users:user_id (id, username, avatar_url)
            `)
            .single();
        
        if (commentError) {
            return res.status(400).json({
                success: false,
                error: commentError.message,
                message: 'Failed to add comment'
            });
        }
        
        // Nếu có socket.io, gửi thông báo realtime
        if (req.io) {
            req.io.to(`post-${id}`).emit('new-comment', {
                type: 'new-comment',
                data: comment
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            data: comment
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while adding the comment'
        });
    }
};

export const updateComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const { comment_text } = req.body;
        
        if (!comment_text) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Comment text is required'
            });
        }
        
        // Kiểm tra xem bình luận có tồn tại không và thuộc về người dùng
        const { data: existingComment, error: commentError } = await supabase
            .from('comments')
            .select('user_id, post_id')
            .eq('id', commentId)
            .eq('post_id', id)
            .single();
        
        if (commentError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Comment not found'
            });
        }
        
        // Kiểm tra xem người dùng có quyền cập nhật bình luận này không
        if (existingComment.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to update this comment'
            });
        }
        
        // Cập nhật bình luận
        const { data: updatedComment, error: updateError } = await supabase
            .from('comments')
            .update({
                comment_text,
                updated_at: new Date().toISOString(),
                updated_by: req.user.id
            })
            .eq('id', commentId)
            .select(`
                *,
                users:user_id (id, username, avatar_url)
            `)
            .single();
        
        if (updateError) {
            return res.status(400).json({
                success: false,
                error: updateError.message,
                message: 'Failed to update comment'
            });
        }
        
        // Nếu có socket.io, gửi thông báo realtime
        if (req.io) {
            req.io.to(`post-${id}`).emit('update-comment', {
                type: 'update-comment',
                data: updatedComment
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Comment updated successfully',
            data: updatedComment
        });
    } catch (error) {
        console.error('Error updating comment:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while updating the comment'
        });
    }
};

export const deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        
        // Kiểm tra xem bình luận có tồn tại không và thuộc về người dùng
        const { data: existingComment, error: commentError } = await supabase
            .from('comments')
            .select('user_id, post_id')
            .eq('id', commentId)
            .eq('post_id', id)
            .single();
        
        if (commentError) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                message: 'Comment not found'
            });
        }
        
        // Kiểm tra xem người dùng có quyền xóa bình luận này không
        if (existingComment.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to delete this comment'
            });
        }
        
        // Xóa bình luận
        const { error: deleteError } = await supabase
            .from('comments')
            .delete()
            .eq('id', commentId);
        
        if (deleteError) {
            return res.status(400).json({
                success: false,
                error: deleteError.message,
                message: 'Failed to delete comment'
            });
        }
        
        // Nếu có socket.io, gửi thông báo realtime
        if (req.io) {
            req.io.to(`post-${id}`).emit('delete-comment', {
                type: 'delete-comment',
                data: { id: commentId, post_id: id }
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Comment deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'An error occurred while deleting the comment'
        });
    }
};