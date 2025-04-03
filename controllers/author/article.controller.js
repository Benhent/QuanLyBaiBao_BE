import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { supabase } from '../../db/connectDB.js';
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } from '../../middlewares/cloudinary.config.js';
import mammoth from 'mammoth'; // For extracting text from .docx files

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads/articles';
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

// Limit file types to only .docx, .doc, and .pdf files
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

export const getArticles = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      language, 
      journal_id,
      author_id,
      start_date,
      end_date,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;
    
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('articles')
      .select('*', { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`title.ilike.%${search}%, abstract.ilike.%${search}%`);
    }

    // Add language filter if provided
    if (language) {
      query = query.eq('language', language);
    }

    // Add date range filters if provided
    if (start_date) {
      query = query.gte('publish_date', start_date);
    }
    
    if (end_date) {
      query = query.lte('publish_date', end_date);
    }

    // Filter by journal if provided
    if (journal_id) {
      // Get article IDs associated with this journal
      const { data: articleJournals, error: journalError } = await supabase
        .from('article_journals')
        .select('article_id')
        .eq('journal_id', journal_id);

      if (journalError) {
        throw new Error(`Error fetching articles by journal: ${journalError.message}`);
      }

      if (articleJournals && articleJournals.length > 0) {
        const articleIds = articleJournals.map(item => item.article_id);
        query = query.in('id', articleIds);
      } else {
        // No articles found for this journal
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

    // Filter by author if provided
    if (author_id) {
      // Get article IDs associated with this author
      const { data: articleAuthors, error: authorError } = await supabase
        .from('article_authors')
        .select('article_id')
        .eq('author_id', author_id);

      if (authorError) {
        throw new Error(`Error fetching articles by author: ${authorError.message}`);
      }

      if (articleAuthors && articleAuthors.length > 0) {
        const articleIds = articleAuthors.map(item => item.article_id);
        query = query.in('id', articleIds);
      } else {
        // No articles found for this author
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

    // Add sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    // Add pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error fetching articles: ${error.message}`);
    }

    // Get document counts for each article
    const articleIds = data.map(article => article.id);
    
    // Get document counts
    const { data: documentCounts, error: countError } = await supabase
      .from('files')
      .select('content_id, count')
      .eq('content_type', 'article')
      .in('content_id', articleIds)
      .group('content_id');
    
    if (countError) {
      console.error('Error fetching document counts:', countError);
    }
    
    // Create a map of article ID to document count
    const countMap = {};
    if (documentCounts) {
      documentCounts.forEach(item => {
        countMap[item.content_id] = parseInt(item.count);
      });
    }
    
    // Add document count to each article
    const articlesWithCounts = data.map(article => ({
      ...article,
      document_count: countMap[article.id] || 0
    }));

    res.status(200).json({
      success: true,
      data: articlesWithCounts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all articles error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getArticleById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get article
    const { data: article, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Article not found'
        });
      }
      throw new Error(`Error fetching article: ${error.message}`);
    }

    // Get associated journals
    const { data: articleJournals, error: journalsError } = await supabase
      .from('article_journals')
      .select(`
        journal_id,
        journals:journal_id (
          id, name, type, issn
        )
      `)
      .eq('article_id', id);

    if (journalsError) {
      console.error('Error fetching article journals:', journalsError);
    }

    // Get associated authors
    const { data: articleAuthors, error: authorsError } = await supabase
      .from('article_authors')
      .select(`
        author_id,
        authors:author_id (
          id, first_name, last_name, academic_title, email,
          institutions:institution_id (
            id, name, country
          )
        )
      `)
      .eq('article_id', id);

    if (authorsError) {
      console.error('Error fetching article authors:', authorsError);
    }

    // Get associated files
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', 'article')
      .eq('content_id', id)
      .order('created_at', { ascending: false });

    if (filesError) {
      console.error('Error fetching article files:', filesError);
    }

    // Format the response data
    const journals = articleJournals 
      ? articleJournals
          .filter(item => item.journals)
          .map(item => item.journals)
      : [];

    const authors = articleAuthors 
      ? articleAuthors
          .filter(item => item.authors)
          .map(item => item.authors)
      : [];

    res.status(200).json({
      success: true,
      data: {
        ...article,
        journals,
        authors,
        files: files || []
      }
    });
  } catch (error) {
    console.error('Get article by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const createArticle = async (req, res) => {
  try {
    const { 
      title, 
      abstract, 
      keywords, 
      language, 
      publish_date,
      journal_id,
      author_ids = []
    } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Article title is required'
      });
    }

    // Process keywords if they're provided as a string
    let processedKeywords = keywords;
    if (typeof keywords === 'string') {
      processedKeywords = keywords.split(',').map(k => k.trim());
    }

    // Create article record
    const { data: article, error } = await supabase
      .from('articles')
      .insert({
        title,
        abstract,
        keywords: processedKeywords,
        language,
        publish_date,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating article: ${error.message}`);
    }

    // Associate with journal if provided
    if (journal_id) {
      const { error: journalError } = await supabase
        .from('article_journals')
        .insert({
          article_id: article.id,
          journal_id
        });

      if (journalError) {
        console.error(`Error associating article with journal: ${journalError.message}`);
      }
    }

    // Associate with authors if provided
    if (author_ids && author_ids.length > 0) {
      // Convert to array if it's a string
      const authorIdsArray = Array.isArray(author_ids) ? author_ids : [author_ids];
      
      const authorAssociations = authorIdsArray.map(author_id => ({
        article_id: article.id,
        author_id
      }));

      const { error: authorsError } = await supabase
        .from('article_authors')
        .insert(authorAssociations);

      if (authorsError) {
        console.error(`Error associating article with authors: ${authorsError.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: article
    });
  } catch (error) {
    console.error('Create article error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, 
      abstract, 
      keywords, 
      language, 
      publish_date,
      journal_id,
      author_ids
    } = req.body;

    // Check if article exists
    const { data: existingArticle, error: checkError } = await supabase
      .from('articles')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Article not found'
        });
      }
      throw new Error(`Error checking article: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the article can update it)
    if (existingArticle.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this article'
      });
    }

    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Article title is required'
      });
    }

    // Process keywords if they're provided as a string
    let processedKeywords = keywords;
    if (typeof keywords === 'string') {
      processedKeywords = keywords.split(',').map(k => k.trim());
    }

    // Update article data
    const updateData = {
      title,
      updated_by: req.user.id,
      updated_at: new Date()
    };

    // Only include optional fields if they are provided
    if (abstract !== undefined) updateData.abstract = abstract;
    if (processedKeywords !== undefined) updateData.keywords = processedKeywords;
    if (language !== undefined) updateData.language = language;
    if (publish_date !== undefined) updateData.publish_date = publish_date;

    const { data: updatedArticle, error: updateError } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Error updating article: ${updateError.message}`);
    }

    // Update journal association if provided
    if (journal_id !== undefined) {
      // First, remove existing journal associations
      await supabase
        .from('article_journals')
        .delete()
        .eq('article_id', id);

      // Then, add the new journal association if journal_id is not null
      if (journal_id) {
        const { error: journalError } = await supabase
          .from('article_journals')
          .insert({
            article_id: id,
            journal_id
          });

        if (journalError) {
          console.error(`Error updating article journal association: ${journalError.message}`);
        }
      }
    }

    // Update author associations if provided
    if (author_ids !== undefined) {
      // First, remove existing author associations
      await supabase
        .from('article_authors')
        .delete()
        .eq('article_id', id);

      // Then, add the new author associations if author_ids is not empty
      if (author_ids && author_ids.length > 0) {
        // Convert to array if it's a string
        const authorIdsArray = Array.isArray(author_ids) ? author_ids : [author_ids];
        
        const authorAssociations = authorIdsArray.map(author_id => ({
          article_id: id,
          author_id
        }));

        const { error: authorsError } = await supabase
          .from('article_authors')
          .insert(authorAssociations);

        if (authorsError) {
          console.error(`Error updating article author associations: ${authorsError.message}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      data: updatedArticle
    });
  } catch (error) {
    console.error('Update article error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if article exists
    const { data: existingArticle, error: checkError } = await supabase
      .from('articles')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Article not found'
        });
      }
      throw new Error(`Error checking article: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the article can delete it)
    if (existingArticle.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this article'
      });
    }

    // Get associated files to delete from Cloudinary
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('id, file_path')
      .eq('content_type', 'article')
      .eq('content_id', id);

    if (filesError) {
      console.error('Error fetching article files:', filesError);
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
        .eq('content_type', 'article')
        .eq('content_id', id);

      if (deleteFilesError) {
        console.error('Error deleting file records:', deleteFilesError);
      }
    }

    // Delete article associations
    await supabase
      .from('article_journals')
      .delete()
      .eq('article_id', id);

    await supabase
      .from('article_authors')
      .delete()
      .eq('article_id', id);

    // Delete article
    const { error: deleteError } = await supabase
      .from('articles')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Error deleting article: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Article and associated files deleted successfully'
    });
  } catch (error) {
    console.error('Delete article error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const uploadArticleDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No document file uploaded'
      });
    }

    const { articleId, version = '1.0', isPublic = false } = req.body;

    // Validate required fields
    if (!articleId) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Article ID is required'
      });
    }

    // Check if the article exists
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id, title, updated_by')
      .eq('id', articleId)
      .single();

    if (articleError) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found'
      });
    }

    // Check permissions (only admin or the user who created the article can upload documents)
    if (article.updated_by !== req.user.id && req.user.role !== 'admin') {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to upload documents for this article'
      });
    }

    // Check if a file with the same version already exists
    const { data: existingFile, error: fileError } = await supabase
      .from('files')
      .select('id, file_path')
      .eq('content_type', 'article')
      .eq('content_id', articleId)
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
      `articles/${articleId}`
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
      content_type: 'article',
      content_id: articleId,
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
        article: {
          id: article.id,
          title: article.title
        }
      }
    });
  } catch (error) {
    console.error('Upload article document error:', error);
    
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

export const createArticleWithDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No document file uploaded'
      });
    }

    const { 
      title, 
      abstract, 
      keywords, 
      language, 
      publish_date,
      journal_id,
      author_ids,
      version = '1.0', 
      isPublic = false 
    } = req.body;
    
    // Validate required fields
    if (!title) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Article title is required'
      });
    }

    // Process keywords if they're provided as a string
    let processedKeywords = keywords;
    if (typeof keywords === 'string') {
      processedKeywords = keywords.split(',').map(k => k.trim());
    }

    // 1. Create the article record
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .insert({
        title,
        abstract,
        keywords: processedKeywords,
        language,
        publish_date,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (articleError) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      throw new Error(`Error creating article record: ${articleError.message}`);
    }

    // 2. Associate with journal if provided
    if (journal_id) {
      const { error: journalError } = await supabase
        .from('article_journals')
        .insert({
          article_id: article.id,
          journal_id
        });

      if (journalError) {
        console.error(`Error associating article with journal: ${journalError.message}`);
      }
    }

    // 3. Associate with authors if provided
    if (author_ids && author_ids.length > 0) {
      // Convert to array if it's a string
      const authorIdsArray = Array.isArray(author_ids) ? author_ids : [author_ids];
      
      const authorAssociations = authorIdsArray.map(author_id => ({
        article_id: article.id,
        author_id
      }));

      const { error: authorsError } = await supabase
        .from('article_authors')
        .insert(authorAssociations);

      if (authorsError) {
        console.error(`Error associating article with authors: ${authorsError.message}`);
      }
    }

    // 4. Extract text content from .docx for indexing or preview
    let textContent = '';
    try {
      if (req.file.mimetype.includes('word')) {
        const result = await mammoth.extractRawText({ path: req.file.path });
        textContent = result.value.substring(0, 5000); // Limit text preview to 5000 chars
      }
    } catch (error) {
      console.error('Error extracting text from document:', error);
    }

    // 5. Upload file to Cloudinary
    const uploadResult = await uploadToCloudinary(
      req.file.path, 
      `articles/${article.id}`
    );

    // Determine file type based on mimetype
    let fileType = 'other';
    if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('word')) {
      fileType = 'docx';
    }

    // 6. Create file record in database
    const fileData = {
      file_name: req.file.originalname,
      file_path: uploadResult.url,
      file_type: fileType,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      content_type: 'article',
      content_id: article.id,
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
      message: 'Article created with document successfully',
      data: {
        article,
        file: fileRecord
      }
    });
  } catch (error) {
    console.error('Create article with document error:', error);
    
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

export const getArticleDocuments = async (req, res) => {
  try {
    const { articleId } = req.params;
    
    // Check if the article exists
    const { data: article, error: articleError } = await supabase
      .from('articles')
      .select('id, title')
      .eq('id', articleId)
      .single();

    if (articleError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Article not found'
      });
    }

    // Get all documents for the article
    const { data: documents, error: documentsError } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', 'article')
      .eq('content_id', articleId)
      .order('created_at', { ascending: false });

    if (documentsError) {
      throw new Error(`Error fetching article documents: ${documentsError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        article,
        documents: documents || []
      }
    });
  } catch (error) {
    console.error('Get article documents error:', error);
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
          message: `A document with version ${version} already exists for this article`
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
      
      // Check if user is associated with this article
      const { data: article, error: articleError } = await supabase
        .from('articles')
        .select('updated_by')
        .eq('id', file.content_id)
        .single();

      const isArticleOwner = !articleError && article && article.updated_by === req.user.id;
      
      if (!isAdmin && !isUploader && !isArticleOwner) {
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

export const getArticleStats = async (req, res) => {
  try {
    // Get total count of articles
    const { count: totalCount, error: countError } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting articles: ${countError.message}`);
    }

    // Get count by language
    const { data: languageData, error: languageError } = await supabase
      .from('articles')
      .select('language, count')
      .not('language', 'is', null)
      .group('language')
      .order('count', { ascending: false });

    if (languageError) {
      throw new Error(`Error counting articles by language: ${languageError.message}`);
    }

    // Get count by month (for the last 12 months)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const { data: monthlyData, error: monthlyError } = await supabase
      .from('articles')
      .select('created_at')
      .gte('created_at', oneYearAgo.toISOString());

    if (monthlyError) {
      throw new Error(`Error fetching monthly article data: ${monthlyError.message}`);
    }

    // Process monthly data
    const monthlyStats = {};
    if (monthlyData) {
      monthlyData.forEach(article => {
        const date = new Date(article.created_at);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyStats[monthYear]) {
          monthlyStats[monthYear] = 0;
        }
        
        monthlyStats[monthYear]++;
      });
    }

    // Convert to array and sort
    const monthlyStatsArray = Object.entries(monthlyStats).map(([month, count]) => ({
      month,
      count
    })).sort((a, b) => a.month.localeCompare(b.month));

    // Get recently added articles
    const { data: recentData, error: recentError } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      throw new Error(`Error fetching recent articles: ${recentError.message}`);
    }

    // Get top authors by article count
    const { data: authorData, error: authorError } = await supabase
      .from('article_authors')
      .select(`
        author_id,
        count,
        authors:author_id (
          id, first_name, last_name, academic_title
        )
      `)
      .group('author_id')
      .order('count', { ascending: false })
      .limit(5);

    if (authorError) {
      throw new Error(`Error fetching top authors: ${authorError.message}`);
    }

    // Format author data
    const topAuthors = authorData
      ? authorData
          .filter(item => item.authors)
          .map(item => ({
            ...item.authors,
            article_count: parseInt(item.count)
          }))
      : [];

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        byLanguage: languageData || [],
        byMonth: monthlyStatsArray,
        recentlyAdded: recentData || [],
        topAuthors
      }
    });
  } catch (error) {
    console.error('Get article stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const searchArticlesByKeywords = async (req, res) => {
  try {
    const { keywords, page = 1, limit = 10 } = req.query;
    
    if (!keywords) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Keywords parameter is required'
      });
    }
    
    const offset = (page - 1) * limit;
    
    // Split keywords into array
    const keywordArray = keywords.split(',').map(k => k.trim().toLowerCase());
    
    // Build query to search in keywords array
    let query = supabase
      .from('articles')
      .select('*', { count: 'exact' });
    
    // Create a filter for each keyword
    const filters = keywordArray.map(keyword => 
      `keywords.cs.{${keyword}}`
    );
    
    // Combine filters with OR
    query = query.or(filters.join(','));
    
    // Add pagination
    query = query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });
    
    // Execute query
    const { data, error, count } = await query;
    
    if (error) {
      throw new Error(`Error searching articles by keywords: ${error.message}`);
    }
    
    res.status(200).json({
      success: true,
      data,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Search articles by keywords error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getArticlesByAuthor = async (req, res) => {
  try {
    const { authorId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Check if author exists
    const { data: author, error: authorError } = await supabase
      .from('authors')
      .select('id, first_name, last_name, academic_title')
      .eq('id', authorId)
      .single();

    if (authorError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Author not found'
      });
    }

    // Get article IDs for this author
    const { data: articleAuthors, error: articlesError } = await supabase
      .from('article_authors')
      .select('article_id')
      .eq('author_id', authorId);

    if (articlesError) {
      throw new Error(`Error fetching articles for author: ${articlesError.message}`);
    }

    if (!articleAuthors || articleAuthors.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        author,
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: 0
        }
      });
    }

    // Get the articles
    const articleIds = articleAuthors.map(item => item.article_id);
    
    const { data: articles, error: fetchError, count } = await supabase
      .from('articles')
      .select('*', { count: 'exact' })
      .in('id', articleIds)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw new Error(`Error fetching articles: ${fetchError.message}`);
    }

    res.status(200).json({
      success: true,
      data: articles,
      author,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get articles by author error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};