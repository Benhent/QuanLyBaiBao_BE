import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { supabase } from '../../db/connectDB.js';
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } from '../../middlewares/cloudinary.config.js';
import mammoth from 'mammoth';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads/journals';
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

// Limit file types to only .docx files
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only .doc, .docx, and .pdf files are allowed'), false);
  }
};

// Configure upload
export const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: fileFilter,
});

export const getJournals = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, language, type } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('journals')
      .select('*', { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%, issn.ilike.%${search}%`);
    }

    // Add language filter if provided
    if (language) {
      query = query.eq('language', language);
    }

    // Add type filter if provided
    if (type) {
      query = query.eq('type', type);
    }

    // Add pagination
    query = query
      .range(offset, offset + limit - 1)
      .order('name', { ascending: true });

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error fetching journals: ${error.message}`);
    }

    // Get document counts for each journal
    const journalIds = data.map(journal => journal.id);
    
    // Get document counts
    const { data: documentCounts, error: countError } = await supabase
      .from('files')
      .select('content_id, count')
      .eq('content_type', 'journal')
      .in('content_id', journalIds)
      .group('content_id');
    
    if (countError) {
      console.error('Error fetching document counts:', countError);
    }
    
    // Create a map of journal ID to document count
    const countMap = {};
    if (documentCounts) {
      documentCounts.forEach(item => {
        countMap[item.content_id] = parseInt(item.count);
      });
    }
    
    // Add document count to each journal
    const journalsWithCounts = data.map(journal => ({
      ...journal,
      document_count: countMap[journal.id] || 0
    }));

    res.status(200).json({
      success: true,
      data: journalsWithCounts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all journals error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getJournalById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get journal
    const { data: journal, error } = await supabase
      .from('journals')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Journal not found'
        });
      }
      throw new Error(`Error fetching journal: ${error.message}`);
    }

    // Get associated articles
    const { data: articleJournals, error: articlesError } = await supabase
      .from('article_journals')
      .select(`
        article_id,
        articles:article_id (
          id, title, publish_date, language
        )
      `)
      .eq('journal_id', id);

    if (articlesError) {
      console.error('Error fetching journal articles:', articlesError);
    }

    // Get associated files
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', 'journal')
      .eq('content_id', id)
      .order('created_at', { ascending: false });

    if (filesError) {
      console.error('Error fetching journal files:', filesError);
    }

    // Format the response data
    const articles = articleJournals 
      ? articleJournals
          .filter(item => item.articles)
          .map(item => item.articles)
      : [];

    res.status(200).json({
      success: true,
      data: {
        ...journal,
        articles,
        files: files || []
      }
    });
  } catch (error) {
    console.error('Get journal by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const createJournal = async (req, res) => {
  try {
    const { name, type, issn, language, publish_date } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Journal name is required'
      });
    }

    // Create journal record
    const { data: journal, error } = await supabase
      .from('journals')
      .insert({
        name,
        type,
        issn,
        language,
        publish_date,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating journal: ${error.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Journal created successfully',
      data: journal
    });
  } catch (error) {
    console.error('Create journal error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateJournal = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, issn, language, publish_date } = req.body;

    // Check if journal exists
    const { data: existingJournal, error: checkError } = await supabase
      .from('journals')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Journal not found'
        });
      }
      throw new Error(`Error checking journal: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the journal can update it)
    if (existingJournal.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this journal'
      });
    }

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Journal name is required'
      });
    }

    // Update journal data
    const updateData = {
      name,
      updated_by: req.user.id,
      updated_at: new Date()
    };

    // Only include optional fields if they are provided
    if (type !== undefined) updateData.type = type;
    if (issn !== undefined) updateData.issn = issn;
    if (language !== undefined) updateData.language = language;
    if (publish_date !== undefined) updateData.publish_date = publish_date;

    const { data: updatedJournal, error: updateError } = await supabase
      .from('journals')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Error updating journal: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Journal updated successfully',
      data: updatedJournal
    });
  } catch (error) {
    console.error('Update journal error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteJournal = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if journal exists
    const { data: existingJournal, error: checkError } = await supabase
      .from('journals')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Journal not found'
        });
      }
      throw new Error(`Error checking journal: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the journal can delete it)
    if (existingJournal.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this journal'
      });
    }

    // Check if journal is referenced by articles
    const { data: articles, error: articlesError } = await supabase
      .from('article_journals')
      .select('article_id')
      .eq('journal_id', id)
      .limit(1);

    if (!articlesError && articles && articles.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Cannot delete journal because it is referenced by articles'
      });
    }

    // Get associated files to delete from Cloudinary
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('id, file_path')
      .eq('content_type', 'journal')
      .eq('content_id', id);

    if (filesError) {
      console.error('Error fetching journal files:', filesError);
    } else if (files && files.length > 0) {
      // Delete files from Cloudinary
      for (const file of files) {
        if (file.file_path && file.file_path.includes('cloudinary')) {
          try {
            const publicId = extractPublicIdFromUrl(file.file_path);
            if (publicId) {
              await deleteFromCloudinary(publicId);
            }
          } catch (cloudinaryError) {
            console.error(`Error deleting file from Cloudinary: ${cloudinaryError.message}`);
          }
        }
      }

      // Delete file records from database
      const { error: deleteFilesError } = await supabase
        .from('files')
        .delete()
        .eq('content_type', 'journal')
        .eq('content_id', id);

      if (deleteFilesError) {
        console.error('Error deleting file records:', deleteFilesError);
      }
    }

    // Delete journal
    const { error: deleteError } = await supabase
      .from('journals')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Error deleting journal: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Journal and associated files deleted successfully'
    });
  } catch (error) {
    console.error('Delete journal error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const uploadJournalDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No document file uploaded'
      });
    }

    const { journalId, version = '1.0', isPublic = false } = req.body;

    // Validate required fields
    if (!journalId) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Journal ID is required'
      });
    }

    // Check if the journal exists
    const { data: journal, error: journalError } = await supabase
      .from('journals')
      .select('id, name, updated_by')
      .eq('id', journalId)
      .single();

    if (journalError) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Journal not found'
      });
    }

    // Check permissions (only admin or the user who created the journal can upload documents)
    if (journal.updated_by !== req.user.id && req.user.role !== 'admin') {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to upload documents for this journal'
      });
    }

    // Check if a file with the same version already exists
    const { data: existingFile, error: fileError } = await supabase
      .from('files')
      .select('id, file_path')
      .eq('content_type', 'journal')
      .eq('content_id', journalId)
      .eq('version', version)
      .single();

    // If file exists with same version, delete the old file from Cloudinary
    if (existingFile && !fileError) {
      const publicId = extractPublicIdFromUrl(existingFile.file_path);
      if (publicId) {
        await deleteFromCloudinary(publicId);
      }
    }

    // Extract text content from .docx for indexing or preview
    let textContent = '';
    try {
      if (req.file.mimetype.includes('word')) {
        const result = await mammoth.extractRawText({ path: req.file.path });
        textContent = result.value.substring(0, 5000); // Limit text preview to 5000 chars
      }
    } catch (error) {
      console.error('Error extracting text from document:', error);
      // Continue even if text extraction fails
    }

    // Upload file to Cloudinary
    const uploadResult = await uploadToCloudinary(
      req.file.path, 
      `journals/${journalId}`
    );

    // Determine file type based on mimetype
    let fileType = 'other';
    if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('word')) {
      fileType = 'docx';
    }

    // Create file record in database
    const fileData = {
      file_name: req.file.originalname,
      file_path: uploadResult.url,
      file_type: fileType,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      content_type: 'journal',
      content_id: journalId,
      version: version,
      is_public: isPublic === 'true' || isPublic === true,
      uploaded_by: req.user.id,
      text_preview: textContent
    };

    let fileRecord;
    
    if (existingFile && !fileError) {
      // Update existing file record
      const { data: updatedFile, error: updateError } = await supabase
        .from('files')
        .update(fileData)
        .eq('id', existingFile.id)
        .select()
        .single();
        
      if (updateError) {
        throw new Error(`Error updating file record: ${updateError.message}`);
      }
      
      fileRecord = updatedFile;
    } else {
      // Insert new file record
      const { data: newFile, error: insertError } = await supabase
        .from('files')
        .insert(fileData)
        .select()
        .single();
        
      if (insertError) {
        throw new Error(`Error creating file record: ${insertError.message}`);
      }
      
      fileRecord = newFile;
    }

    // Clean up the temporary file
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        file: fileRecord,
        journal: {
          id: journal.id,
          name: journal.name
        }
      }
    });
  } catch (error) {
    console.error('Upload journal document error:', error);
    
    // Clean up the temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const createJournalWithDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No document file uploaded'
      });
    }

    const { 
      name, 
      type, 
      issn, 
      language, 
      publish_date,
      version = '1.0', 
      isPublic = false 
    } = req.body;
    
    // Validate required fields
    if (!name) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Journal name is required'
      });
    }

    // 1. Create the journal record
    const { data: journal, error: journalError } = await supabase
      .from('journals')
      .insert({
        name,
        type,
        issn,
        language,
        publish_date,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (journalError) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      throw new Error(`Error creating journal record: ${journalError.message}`);
    }

    // 2. Extract text content from .docx for indexing or preview
    let textContent = '';
    try {
      if (req.file.mimetype.includes('word')) {
        const result = await mammoth.extractRawText({ path: req.file.path });
        textContent = result.value.substring(0, 5000); // Limit text preview to 5000 chars
      }
    } catch (error) {
      console.error('Error extracting text from document:', error);
    }

    // 3. Upload file to Cloudinary
    const uploadResult = await uploadToCloudinary(
      req.file.path, 
      `journals/${journal.id}`
    );

    // Determine file type based on mimetype
    let fileType = 'other';
    if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('word')) {
      fileType = 'docx';
    }

    // 4. Create file record in database
    const fileData = {
      file_name: req.file.originalname,
      file_path: uploadResult.url,
      file_type: fileType,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      content_type: 'journal',
      content_id: journal.id,
      version: version,
      is_public: isPublic === 'true' || isPublic === true,
      uploaded_by: req.user.id,
      text_preview: textContent
    };

    const { data: fileRecord, error: fileError } = await supabase
      .from('files')
      .insert(fileData)
      .select()
      .single();
      
    if (fileError) {
      throw new Error(`Error creating file record: ${fileError.message}`);
    }

    // Clean up the temporary file
    fs.unlinkSync(req.file.path);

    res.status(201).json({
      success: true,
      message: 'Journal created with document successfully',
      data: {
        journal,
        file: fileRecord
      }
    });
  } catch (error) {
    console.error('Create journal with document error:', error);
    
    // Clean up the temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getJournalDocuments = async (req, res) => {
  try {
    const { journalId } = req.params;
    
    // Check if the journal exists
    const { data: journal, error: journalError } = await supabase
      .from('journals')
      .select('id, name')
      .eq('id', journalId)
      .single();

    if (journalError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Journal not found'
      });
    }

    // Get all documents for the journal
    const { data: documents, error: documentsError } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', 'journal')
      .eq('content_id', journalId)
      .order('created_at', { ascending: false });

    if (documentsError) {
      throw new Error(`Error fetching journal documents: ${documentsError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        journal,
        documents: documents || []
      }
    });
  } catch (error) {
    console.error('Get journal documents error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateDocumentMetadata = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { version, isPublic } = req.body;
    
    // Get file details
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document not found'
      });
    }

    // Check permissions
    if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this document'
      });
    }

    // Prepare update data
    const updateData = {};
    
    if (version !== undefined) {
      updateData.version = version;
    }
    
    if (isPublic !== undefined) {
      updateData.is_public = isPublic === 'true' || isPublic === true;
    }
    
    // Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No update data provided'
      });
    }
    
    // If version is changing, check if a file with the new version already exists
    if (version && version !== file.version) {
      const { data: existingFile, error: versionError } = await supabase
        .from('files')
        .select('id')
        .eq('content_type', file.content_type)
        .eq('content_id', file.content_id)
        .eq('version', version)
        .not('id', 'eq', fileId)
        .single();

      if (existingFile && !versionError) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: `A document with version ${version} already exists for this journal`
        });
      }
    }

    // Update file record
    const { data: updatedFile, error: updateError } = await supabase
      .from('files')
      .update({
        ...updateData,
        updated_at: new Date()
      })
      .eq('id', fileId)
      .select()
      .single();
      
    if (updateError) {
      throw new Error(`Error updating document metadata: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Document metadata updated successfully',
      data: updatedFile
    });
  } catch (error) {
    console.error('Update document metadata error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file details
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document not found'
      });
    }

    // Check permissions
    if (file.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this document'
      });
    }

    // Delete file from Cloudinary
    if (file.file_path) {
      const publicId = extractPublicIdFromUrl(file.file_path);
      if (publicId) {
        await deleteFromCloudinary(publicId);
      }
    }

    // Delete file record from database
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);
      
    if (deleteError) {
      throw new Error(`Error deleting document record: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const downloadDocument = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // Get file details
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fileError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document not found'
      });
    }

    // Check permissions if file is not public
    if (!file.is_public) {
      const isAdmin = req.user.role === 'admin';
      const isUploader = file.uploaded_by === req.user.id;
      
      // Check if user is associated with this journal
      const { data: journal, error: journalError } = await supabase
        .from('journals')
        .select('updated_by')
        .eq('id', file.content_id)
        .single();

      const isJournalOwner = !journalError && journal && journal.updated_by === req.user.id;
      
      if (!isAdmin && !isUploader && !isJournalOwner) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'You do not have permission to download this document'
        });
      }
    }

    // Redirect to the file URL for download
    res.redirect(file.file_path);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getJournalStats = async (req, res) => {
  try {
    // Get total count of journals
    const { count: totalCount, error: countError } = await supabase
      .from('journals')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting journals: ${countError.message}`);
    }

    // Get count by language
    const { data: languageData, error: languageError } = await supabase
      .from('journals')
      .select('language, count')
      .not('language', 'is', null)
      .group('language')
      .order('count', { ascending: false });

    if (languageError) {
      throw new Error(`Error counting journals by language: ${languageError.message}`);
    }

    // Get count by type
    const { data: typeData, error: typeError } = await supabase
      .from('journals')
      .select('type, count')
      .not('type', 'is', null)
      .group('type')
      .order('count', { ascending: false });

    if (typeError) {
      throw new Error(`Error counting journals by type: ${typeError.message}`);
    }

    // Get recently added journals
    const { data: recentData, error: recentError } = await supabase
      .from('journals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      throw new Error(`Error fetching recent journals: ${recentError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        byLanguage: languageData || [],
        byType: typeData || [],
        recentlyAdded: recentData || []
      }
    });
  } catch (error) {
    console.error('Get journal stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const associateArticle = async (req, res) => {
  try {
    const { journalId, articleId } = req.body;
    
    // Validate required fields
    if (!journalId || !articleId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Journal ID and Article ID are required'
      });
    }

    // Check if journal exists
    const { data: journal, error: journalError } = await supabase
      .from('journals')
      .select('id')
      .eq('id', journalId)
      .single();

    if (journalError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Journal not found'
      });
    }

    // Check if article exists
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id')
      .eq('id', articleId)
      .single();

    if (articleError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found'
      });
    }

    // Check if association already exists
    const { data: existingAssociation, error: checkError } = await supabase
      .from('article_journals')
      .select('id')
      .eq('article_id', articleId)
      .eq('journal_id', journalId)
      .single();

    if (!checkError && existingAssociation) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Article is already associated with this journal'
      });
    }

    // Create association
    const { data: association, error: associationError } = await supabase
      .from('article_journals')
      .insert({
        article_id: articleId,
        journal_id: journalId
      })
      .select()
      .single();

    if (associationError) {
      throw new Error(`Error associating article with journal: ${associationError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Article associated with journal successfully',
      data: association
    });
  } catch (error) {
    console.error('Associate article error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const disassociateArticle = async (req, res) => {
  try {
    const { journalId, articleId } = req.params;
    
    // Check if association exists
    const { data: existingAssociation, error: checkError } = await supabase
      .from('article_journals')
      .select('id')
      .eq('article_id', articleId)
      .eq('journal_id', journalId)
      .single();

    if (checkError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Association between article and journal not found'
      });
    }

    // Delete association
    const { error: deleteError } = await supabase
      .from('article_journals')
      .delete()
      .eq('article_id', articleId)
      .eq('journal_id', journalId);

    if (deleteError) {
      throw new Error(`Error disassociating article from journal: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Article disassociated from journal successfully'
    });
  } catch (error) {
    console.error('Disassociate article error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};