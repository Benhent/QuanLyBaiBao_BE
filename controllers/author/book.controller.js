import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { supabase } from '../../db/connectDB.js';
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } from '../../middlewares/cloudinary.config.js';
import mammoth from 'mammoth'; // For extracting text from .docx files

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads/books';
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
    cb(new Error('Only .doc and .docx files are allowed'), false);
  }
};

// Configure upload
export const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter,
});

export const getBooks = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, language } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('books')
      .select('*, author_books(author_id, authors(id, first_name, last_name, academic_title))', { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`title.ilike.%${search}%, isbn.ilike.%${search}%, publisher.ilike.%${search}%`);
    }

    // Add language filter if provided
    if (language) {
      query = query.eq('language', language);
    }

    // Add pagination
    query = query
      .range(offset, offset + limit - 1)
      .order('title', { ascending: true });

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error fetching books: ${error.message}`);
    }

    // Format the response data
    const formattedBooks = data.map(book => {
      // Extract authors from the nested structure
      const authors = book.author_books
        ? book.author_books
            .filter(item => item.authors)
            .map(item => item.authors)
        : [];

      // Remove the nested author_books from the response
      const { author_books, ...bookData } = book;

      return {
        ...bookData,
        authors
      };
    });

    res.status(200).json({
      success: true,
      data: formattedBooks,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all books error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getBookById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get book with authors
    const { data: book, error } = await supabase
      .from('books')
      .select('*, author_books(author_id, authors(id, first_name, last_name, academic_title))')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Book not found'
        });
      }
      throw new Error(`Error fetching book: ${error.message}`);
    }

    // Get associated files
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', 'book')
      .eq('content_id', id)
      .order('created_at', { ascending: false });

    if (filesError) {
      console.error('Error fetching book files:', filesError);
    }

    // Format the response data
    const authors = book.author_books
      ? book.author_books
          .filter(item => item.authors)
          .map(item => item.authors)
      : [];

    // Remove the nested author_books from the response
    const { author_books, ...bookData } = book;

    res.status(200).json({
      success: true,
      data: {
        ...bookData,
        authors,
        files: files || []
      }
    });
  } catch (error) {
    console.error('Get book by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const createBook = async (req, res) => {
  try {
    const { title, isbn, language, publish_date, publisher, authors } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Book title is required'
      });
    }

    // Create book record
    const { data: book, error } = await supabase
      .from('books')
      .insert({
        title,
        isbn,
        language,
        publish_date,
        publisher,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating book: ${error.message}`);
    }

    // If authors are provided, associate them with the book
    if (authors && Array.isArray(authors) && authors.length > 0) {
      const authorBooks = authors.map(authorId => ({
        author_id: authorId,
        book_id: book.id
      }));

      const { error: authorError } = await supabase
        .from('author_books')
        .insert(authorBooks);

      if (authorError) {
        console.error('Error associating authors with book:', authorError);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Book created successfully',
      data: book
    });
  } catch (error) {
    console.error('Create book error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, isbn, language, publish_date, publisher, authors } = req.body;

    // Check if book exists
    const { data: existingBook, error: checkError } = await supabase
      .from('books')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Book not found'
        });
      }
      throw new Error(`Error checking book: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the book can update it)
    if (existingBook.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this book'
      });
    }

    // Update book data
    const updateData = {};
    if (title) updateData.title = title;
    if (isbn !== undefined) updateData.isbn = isbn;
    if (language) updateData.language = language;
    if (publish_date) updateData.publish_date = publish_date;
    if (publisher) updateData.publisher = publisher;
    updateData.updated_by = req.user.id;
    updateData.updated_at = new Date();

    const { data: updatedBook, error: updateError } = await supabase
      .from('books')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Error updating book: ${updateError.message}`);
    }

    // Update authors if provided
    if (authors && Array.isArray(authors)) {
      // First, remove all existing author associations
      const { error: deleteError } = await supabase
        .from('author_books')
        .delete()
        .eq('book_id', id);

      if (deleteError) {
        console.error('Error removing existing author associations:', deleteError);
      }

      // Then, add new author associations
      if (authors.length > 0) {
        const authorBooks = authors.map(authorId => ({
          author_id: authorId,
          book_id: id
        }));

        const { error: insertError } = await supabase
          .from('author_books')
          .insert(authorBooks);

        if (insertError) {
          console.error('Error adding new author associations:', insertError);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Book updated successfully',
      data: updatedBook
    });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if book exists
    const { data: existingBook, error: checkError } = await supabase
      .from('books')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Book not found'
        });
      }
      throw new Error(`Error checking book: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the book can delete it)
    if (existingBook.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this book'
      });
    }

    // Get associated files to delete from Cloudinary
    const { data: files, error: filesError } = await supabase
      .from('files')
      .select('id, file_path')
      .eq('content_type', 'book')
      .eq('content_id', id);

    if (filesError) {
      console.error('Error fetching book files:', filesError);
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
        .eq('content_type', 'book')
        .eq('content_id', id);

      if (deleteFilesError) {
        console.error('Error deleting file records:', deleteFilesError);
      }
    }

    // Delete author associations
    const { error: deleteAuthorsError } = await supabase
      .from('author_books')
      .delete()
      .eq('book_id', id);

    if (deleteAuthorsError) {
      console.error('Error deleting author associations:', deleteAuthorsError);
    }

    // Delete book
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Error deleting book: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Book and associated files deleted successfully'
    });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const uploadBookDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No document file uploaded'
      });
    }

    const { bookId, version = '1.0', isPublic = false } = req.body;

    // Validate required fields
    if (!bookId) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Book ID is required'
      });
    }

    // Check if the book exists
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title, updated_by')
      .eq('id', bookId)
      .single();

    if (bookError) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Book not found'
      });
    }

    // Check permissions (only admin, book creator, or book author can upload documents)
    const isAdmin = req.user.role === 'admin';
    const isCreator = book.updated_by === req.user.id;
    
    // Check if user is an author of this book
    const { data: authorData, error: authorError } = await supabase
      .from('author_books')
      .select(`
        author_id,
        authors:author_id (
          id, user_id
        )
      `)
      .eq('book_id', bookId);

    if (authorError) {
      console.error('Error checking book permission:', authorError);
    }

    // Check if user is one of the book's authors
    let isAuthor = false;
    if (authorData && authorData.length > 0) {
      isAuthor = authorData.some(item => 
        item.authors && item.authors.user_id === req.user.id
      );
    }

    if (!isAdmin && !isCreator && !isAuthor) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to upload documents for this book'
      });
    }

    // Check if a file with the same version already exists
    const { data: existingFile, error: fileError } = await supabase
      .from('files')
      .select('id, file_path')
      .eq('content_type', 'book')
      .eq('content_id', bookId)
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
      const result = await mammoth.extractRawText({ path: req.file.path });
      textContent = result.value.substring(0, 5000); // Limit text preview to 5000 chars
    } catch (error) {
      console.error('Error extracting text from document:', error);
      // Continue even if text extraction fails
    }

    // Upload file to Cloudinary
    const uploadResult = await uploadToCloudinary(
      req.file.path, 
      `books/${bookId}`
    );

    // Create file record in database
    const fileData = {
      file_name: req.file.originalname,
      file_path: uploadResult.url,
      file_type: 'docx',
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      content_type: 'book',
      content_id: bookId,
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
        book: {
          id: book.id,
          title: book.title
        }
      }
    });
  } catch (error) {
    console.error('Upload book document error:', error);
    
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

export const createBookWithDocument = async (req, res) => {
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
      isbn, 
      language, 
      publish_date, 
      publisher,
      authors, // JSON string of author IDs array
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
        message: 'Book title is required'
      });
    }

    // Parse authors array
    let authorIds = [];
    try {
      authorIds = authors ? JSON.parse(authors) : [];
    } catch (error) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid authors format. Expected JSON array'
      });
    }

    // 1. Create the book record
    const { data: book, error: bookError } = await supabase
      .from('books')
      .insert({
        title,
        isbn,
        language,
        publish_date,
        publisher,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (bookError) {
      // Clean up the uploaded file
      fs.unlinkSync(req.file.path);
      
      throw new Error(`Error creating book record: ${bookError.message}`);
    }

    // 2. Associate authors with the book
    if (authorIds.length > 0) {
      const authorBooks = authorIds.map(authorId => ({
        author_id: authorId,
        book_id: book.id
      }));
      
      const { error: authorBooksError } = await supabase
        .from('author_books')
        .insert(authorBooks);
        
      if (authorBooksError) {
        console.error('Error associating authors with book:', authorBooksError);
      }
    }

    // 3. Extract text content from .docx for indexing or preview
    let textContent = '';
    try {
      const result = await mammoth.extractRawText({ path: req.file.path });
      textContent = result.value.substring(0, 5000); // Limit text preview to 5000 chars
    } catch (error) {
      console.error('Error extracting text from document:', error);
    }

    // 4. Upload file to Cloudinary
    const uploadResult = await uploadToCloudinary(
      req.file.path, 
      `books/${book.id}`
    );

    // 5. Create file record in database
    const fileData = {
      file_name: req.file.originalname,
      file_path: uploadResult.url,
      file_type: 'docx',
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      content_type: 'book',
      content_id: book.id,
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

    // Get author details for response
    let authorDetails = [];
    if (authorIds.length > 0) {
      const { data: authors, error: authorsError } = await supabase
        .from('authors')
        .select('id, first_name, last_name, academic_title')
        .in('id', authorIds);
        
      if (!authorsError && authors) {
        authorDetails = authors;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Book created with document successfully',
      data: {
        book: {
          ...book,
          authors: authorDetails
        },
        file: fileRecord
      }
    });
  } catch (error) {
    console.error('Create book with document error:', error);
    
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

export const getBookDocuments = async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Check if the book exists
    const { data: book, error: bookError } = await supabase
      .from('books')
      .select('id, title')
      .eq('id', bookId)
      .single();

    if (bookError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Book not found'
      });
    }

    // Get all documents for the book
    const { data: documents, error: documentsError } = await supabase
      .from('files')
      .select('*')
      .eq('content_type', 'book')
      .eq('content_id', bookId)
      .order('created_at', { ascending: false });

    if (documentsError) {
      throw new Error(`Error fetching book documents: ${documentsError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        book,
        documents: documents || []
      }
    });
  } catch (error) {
    console.error('Get book documents error:', error);
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
          message: `A document with version ${version} already exists for this book`
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
      
      // Check if user is an author of this book
      const { data: authorData, error: authorError } = await supabase
        .from('author_books')
        .select(`
          author_id,
          authors:author_id (
            id, user_id
          )
        `)
        .eq('book_id', file.content_id);

      let isAuthor = false;
      if (!authorError && authorData && authorData.length > 0) {
        isAuthor = authorData.some(item => 
          item.authors && item.authors.user_id === req.user.id
        );
      }
      
      if (!isAdmin && !isUploader && !isAuthor) {
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