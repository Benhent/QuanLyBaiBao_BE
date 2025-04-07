import { supabase } from '../../db/connectDB.js';

export const getAuthors = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      institution_id,
      academic_title,
      sort_by = 'last_name',
      sort_order = 'asc'
    } = req.query;
    
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('authors')
      .select(`
        *,
        institutions:institution_id (
          id, name, country
        )
      `, { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`first_name.ilike.%${search}%, last_name.ilike.%${search}%, email.ilike.%${search}%`);
    }

    // Add institution filter if provided
    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    // Add academic title filter if provided
    if (academic_title) {
      query = query.eq('academic_title', academic_title);
    }

    // Add sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' });

    // Add pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Error fetching authors: ${error.message}`);
    }

    // Get article counts for each author
    const authorIds = data.map(author => author.id);
    
    // Get article counts
    const { data: articleCounts, error: countError } = await supabase
      .from('article_authors')
      .select('author_id, count:count(*)')
      .in('author_id', authorIds)
      // .group('author_id');
    
    if (countError) {
      console.error('Error fetching article counts:', countError);
    }
    
    // Create a map of author ID to article count
    const countMap = {};
    if (articleCounts) {
      articleCounts.forEach(item => {
        countMap[item.author_id] = parseInt(item.count);
      });
    }
    
    // Add article count to each author
    const authorsWithCounts = data.map(author => ({
      ...author,
      article_count: countMap[author.id] || 0
    }));

    res.status(200).json({
      success: true,
      data: authorsWithCounts,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all authors error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getAuthorById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get author with institution details
    const { data: author, error } = await supabase
      .from('authors')
      .select(`
        *,
        institutions:institution_id (
          id, name, type, country, city
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Author not found'
        });
      }
      throw new Error(`Error fetching author: ${error.message}`);
    }

    // Get associated articles
    const { data: articleAuthors, error: articlesError } = await supabase
      .from('article_authors')
      .select(`
        article_id,
        articles:article_id (
          id, title, publish_date, language
        )
      `)
      .eq('author_id', id)
      .order('created_at', { ascending: false });

    if (articlesError) {
      console.error('Error fetching author articles:', articlesError);
    }

    // Format the response data
    const articles = articleAuthors 
      ? articleAuthors
          .filter(item => item.articles)
          .map(item => item.articles)
      : [];

    // Get article count
    const articleCount = articles.length;

    res.status(200).json({
      success: true,
      data: {
        ...author,
        articles,
        article_count: articleCount
      }
    });
  } catch (error) {
    console.error('Get author by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const createAuthor = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to perform this action'
      });
    }
    
    const { 
      first_name, 
      last_name, 
      academic_title, 
      email, 
      institution_id,
      bio,
      orcid_id,
      research_interests
    } = req.body;
    
    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'First name and last name are required'
      });
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid email format'
      });
    }

    // Validate ORCID format if provided
    if (orcid_id && !validateOrcid(orcid_id)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid ORCID format. It should be in the format: 0000-0000-0000-0000'
      });
    }

    // Check if institution exists if provided
    if (institution_id) {
      const { data: institution, error: institutionError } = await supabase
        .from('institutions')
        .select('id')
        .eq('id', institution_id)
        .single();

      if (institutionError) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid institution ID'
        });
      }
    }

    // Check if email is already in use
    if (email) {
      const { data: existingAuthor, error: emailError } = await supabase
        .from('authors')
        .select('id')
        .eq('email', email)
        .single();

      if (!emailError && existingAuthor) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'An author with this email already exists'
        });
      }
    }

    // Create author record
    const { data: author, error } = await supabase
      .from('authors')
      .insert({
        first_name,
        last_name,
        academic_title,
        email,
        institution_id,
        bio,
        orcid_id,
        research_interests,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating author: ${error.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Author created successfully',
      data: author
    });
  } catch (error) {
    console.error('Create author error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateAuthor = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      first_name, 
      last_name, 
      academic_title, 
      email, 
      institution_id,
      bio,
      orcid_id,
      research_interests
    } = req.body;

    // Check if author exists
    const { data: existingAuthor, error: checkError } = await supabase
      .from('authors')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Author not found'
        });
      }
      throw new Error(`Error checking author: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the author can update it)
    if (existingAuthor.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this author'
      });
    }

    // Validate required fields
    if ((!first_name && !last_name) && Object.keys(req.body).length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'First name and last name are required'
      });
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid email format'
      });
    }

    // Validate ORCID format if provided
    if (orcid_id && !validateOrcid(orcid_id)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid ORCID format. It should be in the format: 0000-0000-0000-0000'
      });
    }

    // Check if institution exists if provided
    if (institution_id) {
      const { data: institution, error: institutionError } = await supabase
        .from('institutions')
        .select('id')
        .eq('id', institution_id)
        .single();

      if (institutionError) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Invalid institution ID'
        });
      }
    }

    // Check if email is already in use by another author
    if (email) {
      const { data: emailAuthor, error: emailError } = await supabase
        .from('authors')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .single();

      if (!emailError && emailAuthor) {
        return res.status(409).json({
          success: false,
          error: 'Conflict',
          message: 'Another author with this email already exists'
        });
      }
    }

    // Update author data
    const updateData = {
      updated_by: req.user.id,
      updated_at: new Date()
    };

    // Only include fields that are provided
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    if (academic_title !== undefined) updateData.academic_title = academic_title;
    if (email !== undefined) updateData.email = email;
    if (institution_id !== undefined) updateData.institution_id = institution_id;
    if (bio !== undefined) updateData.bio = bio;
    if (orcid_id !== undefined) updateData.orcid_id = orcid_id;
    if (research_interests !== undefined) updateData.research_interests = research_interests;

    // Only update if there are changes
    if (Object.keys(updateData).length <= 2) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'No update data provided'
      });
    }

    const { data: updatedAuthor, error: updateError } = await supabase
      .from('authors')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Error updating author: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Author updated successfully',
      data: updatedAuthor
    });
  } catch (error) {
    console.error('Update author error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteAuthor = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if author exists
    const { data: existingAuthor, error: checkError } = await supabase
      .from('authors')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Author not found'
        });
      }
      throw new Error(`Error checking author: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the author can delete it)
    if (existingAuthor.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this author'
      });
    }

    // Check if author is referenced by articles
    const { data: articles, error: articlesError } = await supabase
      .from('article_authors')
      .select('article_id')
      .eq('author_id', id)
      .limit(1);

    if (!articlesError && articles && articles.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Cannot delete author because they are associated with articles'
      });
    }

    // Delete author
    const { error: deleteError } = await supabase
      .from('authors')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Error deleting author: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Author deleted successfully'
    });
  } catch (error) {
    console.error('Delete author error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getAuthorStats = async (req, res) => {
  try {
    // Get total count of authors
    const { count: totalCount, error: countError } = await supabase
      .from('authors')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting authors: ${countError.message}`);
    }

    // Get count by academic title
    const { data: titleData, error: titleError } = await supabase
      .from('authors')
      .select('academic_title, count: count(*)')
      .not('academic_title', 'is', null)
      .group('academic_title')
      .order('count', { ascending: false });

    if (titleError) {
      throw new Error(`Error counting authors by academic title: ${titleError.message}`);
    }

    // Get count by institution
    const { data: institutionData, error: institutionError } = await supabase
      .from('authors')
      .select(`
        institution_id,
        count,
        institutions:institution_id (
          id, name, country
        )
      `)
      .not('institution_id', 'is', null)
      .group('institution_id, institutions:institution_id(id, name, country)')
      .order('count', { ascending: false })
      .limit(10);

    if (institutionError) {
      throw new Error(`Error counting authors by institution: ${institutionError.message}`);
    }

    // Format institution data
    const byInstitution = institutionData
      ? institutionData
          .filter(item => item.institutions)
          .map(item => ({
            institution: item.institutions,
            count: parseInt(item.count)
          }))
      : [];

    // Get top authors by article count
    const { data: topAuthorsData, error: topAuthorsError } = await supabase
      .from('article_authors')
      .select(`
        author_id,
        count,
        authors:author_id (
          id, first_name, last_name, academic_title, email,
          institutions:institution_id (
            id, name, country
          )
        )
      `)
      .group('author_id, authors:author_id(id, first_name, last_name, academic_title, email, institutions:institution_id(id, name, country))')
      .order('count', { ascending: false })
      .limit(10);

    if (topAuthorsError) {
      throw new Error(`Error fetching top authors: ${topAuthorsError.message}`);
    }

    // Format top authors data
    const topAuthors = topAuthorsData
      ? topAuthorsData
          .filter(item => item.authors)
          .map(item => ({
            ...item.authors,
            article_count: parseInt(item.count)
          }))
      : [];

    // Get recently added authors
    const { data: recentData, error: recentError } = await supabase
      .from('authors')
      .select(`
        *,
        institutions:institution_id (
          id, name, country
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      throw new Error(`Error fetching recent authors: ${recentError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        byAcademicTitle: titleData || [],
        byInstitution,
        topAuthors,
        recentlyAdded: recentData || []
      }
    });
  } catch (error) {
    console.error('Get author stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getAuthorsByInstitution = async (req, res) => {
  try {
    const { institutionId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Check if institution exists
    const { data: institution, error: institutionError } = await supabase
      .from('institutions')
      .select('id, name, country, city')
      .eq('id', institutionId)
      .single();

    if (institutionError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Institution not found'
      });
    }

    // Get authors for this institution with pagination
    const { data, error, count } = await supabase
      .from('authors')
      .select('*', { count: 'exact' })
      .eq('institution_id', institutionId)
      .range(offset, offset + limit - 1)
      .order('last_name', { ascending: true });

    if (error) {
      throw new Error(`Error fetching authors by institution: ${error.message}`);
    }

    // Get article counts for each author
    const authorIds = data.map(author => author.id);
    
    // Get article counts
    const { data: articleCounts, error: countError } = await supabase
      .from('article_authors')
      .select('author_id, count:count(*)')
      .in('author_id', authorIds)
      // .group('author_id');
    
    if (countError) {
      console.error('Error fetching article counts:', countError);
    }
    
    // Create a map of author ID to article count
    const countMap = {};
    if (articleCounts) {
      articleCounts.forEach(item => {
        countMap[item.author_id] = parseInt(item.count);
      });
    }
    
    // Add article count to each author
    const authorsWithCounts = data.map(author => ({
      ...author,
      article_count: countMap[author.id] || 0
    }));

    res.status(200).json({
      success: true,
      data: authorsWithCounts,
      institution,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get authors by institution error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getUniqueAcademicTitles = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('authors')
      .select('academic_title')
      .not('academic_title', 'is', null)
      .order('academic_title', { ascending: true });

    if (error) {
      throw new Error(`Error fetching unique academic titles: ${error.message}`);
    }

    // Extract unique academic titles
    const uniqueTitles = [...new Set(data.map(item => item.academic_title))];

    res.status(200).json({
      success: true,
      data: uniqueTitles
    });
  } catch (error) {
    console.error('Get unique academic titles error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const searchAuthors = async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Search query must be at least 2 characters'
      });
    }
    
    // Search authors by name or email
    const { data, error } = await supabase
      .from('authors')
      .select(`
        *,
        institutions:institution_id (
          id, name, country
        )
      `)
      .or(`first_name.ilike.%${query}%, last_name.ilike.%${query}%, email.ilike.%${query}%`)
      .order('last_name', { ascending: true })
      .limit(limit);
    
    if (error) {
      throw new Error(`Error searching authors: ${error.message}`);
    }
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Search authors error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const associateArticle = async (req, res) => {
  try {
    const { authorId, articleId } = req.body;
    
    // Validate required fields
    if (!authorId || !articleId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Author ID and Article ID are required'
      });
    }

    // Check if author exists
    const { data: author, error: authorError } = await supabase
      .from('authors')
      .select('id')
      .eq('id', authorId)
      .single();

    if (authorError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Author not found'
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
      .from('article_authors')
      .select('id')
      .eq('author_id', authorId)
      .eq('article_id', articleId)
      .single();

    if (!checkError && existingAssociation) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Author is already associated with this article'
      });
    }

    // Create association
    const { data: association, error: associationError } = await supabase
      .from('article_authors')
      .insert({
        author_id: authorId,
        article_id: articleId
      })
      .select()
      .single();

    if (associationError) {
      throw new Error(`Error associating author with article: ${associationError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Author associated with article successfully',
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
    const { authorId, articleId } = req.params;
    
    // Check if association exists
    const { data: existingAssociation, error: checkError } = await supabase
      .from('article_authors')
      .select('id')
      .eq('author_id', authorId)
      .eq('article_id', articleId)
      .single();

    if (checkError) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Association between author and article not found'
      });
    }

    // Delete association
    const { error: deleteError } = await supabase
      .from('article_authors')
      .delete()
      .eq('author_id', authorId)
      .eq('article_id', articleId);

    if (deleteError) {
      throw new Error(`Error disassociating author from article: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Author disassociated from article successfully'
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

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function validateOrcid(orcid) {
  const re = /^\d{4}-\d{4}-\d{4}-\d{4}$/;
  return re.test(String(orcid));
}