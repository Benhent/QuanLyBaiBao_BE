import express from 'express';
import rateLimit from 'express-rate-limit';

// auth route
import authRoutes from '../routes/auth.route.js';
// blog route
import postRoutes from '../routes/blogManager/post.route.js';
import commentRoutes from '../routes/blogManager/comment.route.js';
import interactionRoutes from '../routes/blogManager/interaction.route.js';
// author route
import authorRequestRoutes from '../routes/authorManager/authorRequest.route.js';
import articleRoutes from '../routes/authorManager/article.route.js';
import journalRoutes from '../routes/authorManager/journal.route.js';
import bookRoutes from '../routes/authorManager/book.route.js';
import institutionRoutes from '../routes/authorManager/institution.route.js';
// file route
import fileRoutes from '../routes/file.route.js';

export const setupRoutes = (app) => {
  // Rate limiting để ngăn chặn lạm dụng API
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // giới hạn mỗi IP 100 requests mỗi windowMs
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', apiLimiter);

  // Kiểm tra trạng thái API
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', environment: process.env.NODE_ENV });
  });

  // Route cho đường dẫn gốc
  app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the API' });
  });

  // Thiết lập tất cả các routes
  app.use('/api/auth', authRoutes);

  // Route cho blog manager
  app.use('/api/posts', postRoutes);
  app.use('/api/comments', commentRoutes);
  app.use('/api/interaction', interactionRoutes);

  // Route cho author manager
  app.use('/api/author-requests', authorRequestRoutes);
  app.use('/api/articles', articleRoutes);
  app.use('/api/journals', journalRoutes);
  app.use('/api/books', bookRoutes);
  app.use('/api/institutions', institutionRoutes);
  
  // Route cho file upload
  app.use('/api/files', fileRoutes);

  // Middleware xử lý lỗi 404
  app.use((req, res, next) => {
    res.status(404).json({
      success: false,
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
    });
  });

  // Middleware xử lý lỗi toàn cục
  app.use((err, req, res, next) => {
    console.error('Error:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.name || 'Internal Server Error',
      message: err.message || 'Something went wrong',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });
};

export default setupRoutes;