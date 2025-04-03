import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { supabase } from '../db/connectDB.js';
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } from '../middlewares/cloudinary.config.js';

// Configure multer for temporary file storage
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

// Limit file types for upload
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
    cb(new Error('Unsupported file type'), false);
  }
};

// Configure upload
export const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter,
});

// Determine file type based on mimetype
const determineFileType = (mimetype) => {
  let file_type = 'other';
  if (mimetype === 'application/pdf') file_type = 'pdf';
  else if (mimetype === 'application/msword' || mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') file_type = 'docx';
  else if (mimetype === 'application/vnd.ms-excel' || mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') file_type = 'excel';
  else if (mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') file_type = 'powerpoint';
  else if (mimetype.startsWith('image/')) file_type = 'image';
  
  return file_type;
};

// Determine folder based on content type
const determineFolderByContentType = (content_type) => {
  let folder = 'uploads';
  if (content_type === 'article') folder = 'articles';
  else if (content_type === 'book') folder = 'books';
  else if (content_type === 'journal') folder = 'journals';
  else if (content_type === 'author_request') folder = 'author_requests';
  
  return folder;
};

// Controller to upload file
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No file uploaded'
      });
    }

    // Get information from request
    const { content_type, content_id } = req.body;
    const { originalname, mimetype, path: filePath, size } = req.file;
    
    // Determine folder based on content_type
    const folder = determineFolderByContentType(content_type);
    
    // Upload file to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(filePath, folder);
    
    // Delete temporary file after upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Determine file_type based on mimetype
    const file_type = determineFileType(mimetype);
    
    // Save file information to database
    const { data: fileData, error: fileError } = await supabase
      .from('files')
      .insert({
        file_name: originalname,
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
      throw new Error(`Error saving file information: ${fileError.message}`);
    }
    
    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: fileData
    });
  } catch (error) {
    console.error('Upload file error:', error);
    
    // Clean up temporary file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Controller to get files by content type and ID
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
      throw new Error(`Error fetching files: ${error.message}`);
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

// Controller to delete file
export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get file information from database
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fileError || !file) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'File not found'
      });
    }
    
    // Check permissions: user must be uploader or admin
    if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this file'
      });
    }
    
    // Delete file from Cloudinary if it has a URL
    if (file.file_path && file.file_path.includes('cloudinary')) {
      try {
        const publicId = extractPublicIdFromUrl(file.file_path);
        if (publicId) {
          await deleteFromCloudinary(publicId);
        }
      } catch (cloudinaryError) {
        console.error('Error deleting file from Cloudinary:', cloudinaryError);
      }
    }
    
    // Delete file record from database
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', id);
    
    if (deleteError) {
      throw new Error(`Error deleting file: ${deleteError.message}`);
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

// Controller to update file information
export const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_public, version } = req.body;
    
    // Get file information from database
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fileError || !file) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'File not found'
      });
    }
    
    // Check permissions: user must be uploader or admin
    if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this file'
      });
    }
    
    // Update file information
    const updateData = {};
    if (is_public !== undefined) updateData.is_public = is_public;
    if (version) updateData.version = version;
    updateData.updated_at = new Date();
    
    const { data: updatedFile, error: updateError } = await supabase
      .from('files')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Error updating file: ${updateError.message}`);
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

// Controller to update file content
export const updateFileContent = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No new file uploaded'
      });
    }
    
    // Get current file information from database
    const { data: existingFile, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fileError || !existingFile) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'File not found'
      });
    }
    
    // Check permissions: user must be uploader or admin
    if (existingFile.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this file'
      });
    }
    
    // Delete old file from Cloudinary if it has a URL
    if (existingFile.file_path && existingFile.file_path.includes('cloudinary')) {
      try {
        const publicId = extractPublicIdFromUrl(existingFile.file_path);
        if (publicId) {
          await deleteFromCloudinary(publicId);
        }
      } catch (cloudinaryError) {
        console.error('Error deleting old file from Cloudinary:', cloudinaryError);
      }
    }
    
    // Get information about the new file
    const { originalname, mimetype, path: filePath, size } = req.file;
    
    // Determine folder based on content_type
    const folder = determineFolderByContentType(existingFile.content_type);
    
    // Upload new file to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(filePath, folder);
    
    // Delete temporary file after upload
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Update file information in database
    const { data: updatedFile, error: updateError } = await supabase
      .from('files')
      .update({
        file_name: originalname,
        file_path: cloudinaryResult.url,
        file_size: size,
        mime_type: mimetype,
        version: (parseFloat(existingFile.version) + 0.1).toFixed(1), // Increment version by 0.1
        updated_at: new Date()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (updateError) {
      throw new Error(`Error updating file information: ${updateError.message}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'File content updated successfully',
      data: updatedFile
    });
  } catch (error) {
    console.error('Update file content error:', error);
    
    // Clean up temporary file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};