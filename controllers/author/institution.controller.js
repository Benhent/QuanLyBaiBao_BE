import { supabase } from '../../db/connectDB.js';

export const getInstitutions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, country, type } = req.query;
    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from('institutions')
      .select('*', { count: 'exact' });

    // Add search filter if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%, city.ilike.%${search}%`);
    }

    // Add country filter if provided
    if (country) {
      query = query.eq('country', country);
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
      throw new Error(`Error fetching institutions: ${error.message}`);
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
    console.error('Get all institutions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getInstitutionById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: institution, error } = await supabase
      .from('institutions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Institution not found'
        });
      }
      throw new Error(`Error fetching institution: ${error.message}`);
    }

    // Get authors associated with this institution
    const { data: authors, error: authorsError } = await supabase
      .from('authors')
      .select('id, first_name, last_name, academic_title')
      .eq('institution_id', id);

    if (authorsError) {
      console.error('Error fetching institution authors:', authorsError);
    }

    res.status(200).json({
      success: true,
      data: {
        ...institution,
        authors: authors || []
      }
    });
  } catch (error) {
    console.error('Get institution by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const createInstitution = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to perform this action'
      });
    }

    const { name, type, country, city } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Institution name is required'
      });
    }

    // Create institution record
    const { data: institution, error } = await supabase
      .from('institutions')
      .insert({
        name,
        type,
        country,
        city,
        updated_by: req.user.id
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error creating institution: ${error.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Institution created successfully',
      data: institution
    });
  } catch (error) {
    console.error('Create institution error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const updateInstitution = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to perform this action'
      });
    }
    const { id } = req.params;
    const { name, type, country, city } = req.body;

    // Check if institution exists
    const { data: existingInstitution, error: checkError } = await supabase
      .from('institutions')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Institution not found'
        });
      }
      throw new Error(`Error checking institution: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the institution can update it)
    if (existingInstitution.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to update this institution'
      });
    }

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Institution name is required'
      });
    }

    // Update institution data
    const updateData = {
      name,
      updated_by: req.user.id,
      updated_at: new Date()
    };

    // Only include optional fields if they are provided
    if (type !== undefined) updateData.type = type;
    if (country !== undefined) updateData.country = country;
    if (city !== undefined) updateData.city = city;

    const { data: updatedInstitution, error: updateError } = await supabase
      .from('institutions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Error updating institution: ${updateError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Institution updated successfully',
      data: updatedInstitution
    });
  } catch (error) {
    console.error('Update institution error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const deleteInstitution = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if institution exists
    const { data: existingInstitution, error: checkError } = await supabase
      .from('institutions')
      .select('id, updated_by')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Institution not found'
        });
      }
      throw new Error(`Error checking institution: ${checkError.message}`);
    }

    // Check permissions (only admin or the user who created the institution can delete it)
    if (existingInstitution.updated_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to delete this institution'
      });
    }

    // Check if institution is referenced by authors
    const { data: authors, error: authorsError } = await supabase
      .from('authors')
      .select('id')
      .eq('institution_id', id)
      .limit(1);

    if (!authorsError && authors && authors.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: 'Cannot delete institution because it is referenced by authors'
      });
    }

    // Delete institution
    const { error: deleteError } = await supabase
      .from('institutions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      throw new Error(`Error deleting institution: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      message: 'Institution deleted successfully'
    });
  } catch (error) {
    console.error('Delete institution error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getInstitutionStats = async (req, res) => {
  try {
    // Get total count of institutions
    const { count: totalCount, error: countError } = await supabase
      .from('institutions')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Error counting institutions: ${countError.message}`);
    }

    // Get count by country
    const { data: countryData, error: countryError } = await supabase
      .from('institutions')
      .select('country, count')
      .not('country', 'is', null)
      .group('country')
      .order('count', { ascending: false });

    if (countryError) {
      throw new Error(`Error counting institutions by country: ${countryError.message}`);
    }

    // Get count by type
    const { data: typeData, error: typeError } = await supabase
      .from('institutions')
      .select('type, count')
      .not('type', 'is', null)
      .group('type')
      .order('count', { ascending: false });

    if (typeError) {
      throw new Error(`Error counting institutions by type: ${typeError.message}`);
    }

    // Get recently added institutions
    const { data: recentData, error: recentError } = await supabase
      .from('institutions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      throw new Error(`Error fetching recent institutions: ${recentError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        totalCount,
        byCountry: countryData || [],
        byType: typeData || [],
        recentlyAdded: recentData || []
      }
    });
  } catch (error) {
    console.error('Get institution stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getInstitutionsByCountry = async (req, res) => {
  try {
    const { country } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Get institutions by country with pagination
    const { data, error, count } = await supabase
      .from('institutions')
      .select('*', { count: 'exact' })
      .eq('country', country)
      .range(offset, offset + limit - 1)
      .order('name', { ascending: true });

    if (error) {
      throw new Error(`Error fetching institutions by country: ${error.message}`);
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
    console.error('Get institutions by country error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getUniqueCountries = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('institutions')
      .select('country')
      .not('country', 'is', null)
      .order('country', { ascending: true });

    if (error) {
      throw new Error(`Error fetching unique countries: ${error.message}`);
    }

    // Extract unique countries
    const uniqueCountries = [...new Set(data.map(item => item.country))];

    res.status(200).json({
      success: true,
      data: uniqueCountries
    });
  } catch (error) {
    console.error('Get unique countries error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

export const getUniqueTypes = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('institutions')
      .select('type')
      .not('type', 'is', null)
      .order('type', { ascending: true });

    if (error) {
      throw new Error(`Error fetching unique types: ${error.message}`);
    }

    // Extract unique types
    const uniqueTypes = [...new Set(data.map(item => item.type))];

    res.status(200).json({
      success: true,
      data: uniqueTypes
    });
  } catch (error) {
    console.error('Get unique types error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message
    });
  }
};