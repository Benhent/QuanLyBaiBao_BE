import { supabase } from '../db/connectDB.js';
import { Server } from 'socket.io';
import http from 'http';

// Khởi tạo Socket.IO server
export const setupSocketIO = (app) => {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Lưu trữ các kênh realtime đã được thiết lập
  global.realtimeChannels = new Map();
  
  // Xử lý kết nối Socket.IO
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    
    // Tham gia vào phòng chat của bài viết
    socket.on('join-post', (postId) => {
      socket.join(`post-${postId}`);
      console.log(`Client ${socket.id} joined post-${postId}`);
    });
    
    // Rời khỏi phòng chat của bài viết
    socket.on('leave-post', (postId) => {
      socket.leave(`post-${postId}`);
      console.log(`Client ${socket.id} left post-${postId}`);
    });
    
    // Xử lý khi client ngắt kết nối
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  // Thiết lập Supabase Realtime để lắng nghe thay đổi trên bảng comments
  const commentsChannel = supabase
    .channel('comments-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'comments'
    }, (payload) => {
      // Khi có thay đổi, gửi thông báo đến phòng chat tương ứng
      const postId = payload.new?.post_id || payload.old?.post_id;
      if (postId) {
        io.to(`post-${postId}`).emit('comment-update', {
          type: payload.eventType, // INSERT, UPDATE, DELETE
          data: payload.new || payload.old
        });
      }
    })
    .subscribe((status) => {
      console.log('Supabase realtime status:', status);
    });
  
  // Gắn io vào app để các route có thể sử dụng
  app.set('io', io);
  app.set('socketServer', server);
  
  return server;
};

// Middleware để truy cập Socket.IO từ các route
export const socketMiddleware = (req, res, next) => {
  req.io = req.app.get('io');
  next();
};

// Middleware để thiết lập kênh realtime cho client
export const setupRealtimeChannel = (req, res, next) => {
  // Phương thức để thiết lập kênh realtime cho một bảng và ID cụ thể
  req.setupRealtimeFor = (table, id, event = '*') => {
    const channelKey = `${table}-${id}`;
    
    // Kiểm tra xem kênh đã tồn tại chưa
    if (global.realtimeChannels.has(channelKey)) {
      return global.realtimeChannels.get(channelKey);
    }
    
    // Tạo kênh mới
    const channel = supabase
      .channel(channelKey)
      .on('postgres_changes', {
        event: event, // 'INSERT', 'UPDATE', 'DELETE' hoặc '*' cho tất cả
        schema: 'public',
        table: table,
        filter: id ? `id=eq.${id}` : undefined
      }, (payload) => {
        console.log(`Realtime event on ${table}:`, payload);
        // Xử lý sự kiện ở đây nếu cần
      })
      .subscribe();
    
    // Lưu kênh vào bộ nhớ
    global.realtimeChannels.set(channelKey, channel);
    
    return channel;
  };
  
  // Phương thức để thiết lập kênh realtime cho comments của một bài viết
  req.setupCommentsRealtimeFor = (postId) => {
    const channelKey = `comments-post-${postId}`;
    
    if (global.realtimeChannels.has(channelKey)) {
      return global.realtimeChannels.get(channelKey);
    }
    
    const channel = supabase
      .channel(channelKey)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`
      }, (payload) => {
        console.log(`Realtime comment event for post ${postId}:`, payload);
        
        // Nếu có Socket.IO, gửi thông báo đến client
        if (req.io) {
          req.io.to(`post-${postId}`).emit('comment-update', {
            type: payload.eventType,
            data: payload.new || payload.old
          });
        }
      })
      .subscribe();
    
    global.realtimeChannels.set(channelKey, channel);
    
    return channel;
  };
  
  next();
};