import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { supabase } from '../db/connectDB.js';

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cấu hình multer để lưu file tạm thời
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Giới hạn loại file được upload
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Loại file không được hỗ trợ'), false);
  }
};

// Cấu hình upload
export const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn 10MB
  fileFilter: fileFilter,
});

// Hàm upload file lên Cloudinary
const uploadToCloudinary = async (filePath, folder = 'uploads') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'auto',
    });
    
    // Xóa file tạm sau khi upload
    fs.unlinkSync(filePath);
    
    return {
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
    };
  } catch (error) {
    // Xóa file tạm nếu upload thất bại
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw new Error(`Lỗi khi upload file lên Cloudinary: ${error.message}`);
  }
};

// Controller để upload file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Không có file nào được upload'
      });
    }

    // Lấy thông tin từ request
    const { content_type, content_id } = req.body;
    const { originalname, mimetype, path: filePath, size } = req.file;
    
    // Xác định folder dựa trên content_type
    let folder = 'uploads';
    if (content_type === 'article') folder = 'articles';
    else if (content_type === 'book') folder = 'books';
    else if (content_type === 'journal') folder = 'journals';
    else if (content_type === 'author_request') folder = 'author_requests';
    
    // Upload file lên Cloudinary
    const cloudinaryResult = await uploadToCloudinary(filePath, folder);
    
    // Xác định file_type dựa trên mimetype
    let file_type = 'other';
    if (mimetype === 'application/pdf') file_type = 'pdf';
    else if (mimetype === 'application/msword' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') file_type = 'docx';
    else if (mimetype === 'application/vnd.ms-excel' || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') file_type = 'other';
    else if (mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') file_type = 'other';
    else if (mimetype.startsWith('image/')) file_type = 'other';
    
    // Lưu thông tin file vào database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .insert({
        file_name: path.basename(filePath),
        file_path: cloudinaryResult.url,
        file_type,
        file_size: size,
        mime_type: mimetype,
        content_type: content_type || null,
        content_id: content_id || null,
        version: '1.0',
        is_public: false,
        uploaded_by: req.user.id
      })
      .select()
      .single();
    
    if (fileError) {
      throw new Error(`Lỗi khi lưu thông tin file: ${fileError.message}`);
    }
    
    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: fileData
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Controller để lấy danh sách file theo content_type và content_id
export const getFilesByContent = async (req, res) => {
  try {
    const { content_type, content_id } = req.params;
    
    const { data: files, error } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', content_type)
      .eq('content_id', content_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Lỗi khi lấy danh sách file: ${error.message}`);
    }
    
    res.status(200).json({
      success: true,
      data: files
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Controller để xóa file
export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Lấy thông tin file từ database
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fileError || !file) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'File không tồn tại'
      });
    }
    
    // Kiểm tra quyền: người dùng phải là người upload hoặc admin
    if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Bạn không có quyền xóa file này'
      });
    }
    
    // Xóa file từ Cloudinary nếu có public_id
    if (file.file_path && file.file_path.includes('cloudinary')) {
      try {
        // Trích xuất public_id từ URL Cloudinary
        const urlParts = file.file_path.split('/');
        const filenameWithExtension = urlParts[urlParts.length - 1];
        const filename = filenameWithExtension.split('.')[0];
        const folderPath = urlParts[urlParts.length - 2];
        const publicId = `${folderPath}/${filename}`;
        
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Lỗi khi xóa file từ Cloudinary:', cloudinaryError);
      }
    }
    
    // Xóa thông tin file từ database
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      throw new Error(`Lỗi khi xóa file: ${deleteError.message}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
      data: {
        id: file.id,
        file_name: file.file_name,
        content_type: file.content_type,
        content_id: file.content_id
      }
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Controller để cập nhật thông tin file
export const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_public, version } = req.body;
    
    // Lấy thông tin file từ database
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fileError || !file) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'File không tồn tại'
      });
    }
    
    // Kiểm tra quyền: người dùng phải là người upload hoặc admin
    if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Bạn không có quyền cập nhật file này'
      });
    }
    
    // Cập nhật thông tin file
    const updateData = {};
    if (is_public !== undefined) updateData.is_public = is_public;
    if (version) updateData.version = version;
    
    const { data: updatedFile, error: updateError } = await supabase
      .from('files')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Lỗi khi cập nhật file: ${updateError.message}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'File updated successfully',
      data: updatedFile
    });
  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Controller để cập nhật nội dung file
export const updateFileContent = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Không có file mới được upload'
      });
    }
    
    // Lấy thông tin file hiện tại từ database
    const { data: existingFile, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fileError || !existingFile) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'File không tồn tại'
      });
    }
    
    // Kiểm tra quyền: người dùng phải là người upload hoặc admin
    if (existingFile.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Bạn không có quyền cập nhật file này'
      });
    }
    
    // Xóa file cũ từ Cloudinary nếu có public_id
    if (existingFile.file_path && existingFile.file_path.includes('cloudinary')) {
      try {
        // Trích xuất public_id từ URL Cloudinary
        const urlParts = existingFile.file_path.split('/');
        const filenameWithExtension = urlParts[urlParts.length - 1];
        const filename = filenameWithExtension.split('.')[0];
        const folderPath = urlParts[urlParts.length - 2];
        const publicId = `${folderPath}/${filename}`;
        
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Lỗi khi xóa file cũ từ Cloudinary:', cloudinaryError);
      }
    }
    
    // Upload file mới lên Cloudinary
    const { originalname, mimetype, path: filePath, size } = req.file;
    
    // Xác định folder dựa trên content_type
    let folder = 'uploads';
    if (existingFile.content_type === 'article') folder = 'articles';
    else if (existingFile.content_type === 'book') folder = 'books';
    else if (existingFile.content_type === 'journal') folder = 'journals';
    else if (existingFile.content_type === 'author_request') folder = 'author_requests';
    
    // Upload file mới lên Cloudinary
    const cloudinaryResult = await uploadToCloudinary(filePath, folder);
    
    // Cập nhật thông tin file trong database
    const { data: updatedFile, error: updateError } = await supabase
      .from('files')
      .update({
        file_name: path.basename(filePath),
        file_path: cloudinaryResult.url,
        file_size: size,
        mime_type: mimetype,
        version: (parseFloat(existingFile.version) + 0.1).toFixed(1), // Tăng version lên 0.1
        updated_at: new Date()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Lỗi khi cập nhật thông tin file: ${updateError.message}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'Nội dung file đã được cập nhật thành công',
      data: updatedFile
    });
  } catch (error) {
    console.error('Update file content error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};