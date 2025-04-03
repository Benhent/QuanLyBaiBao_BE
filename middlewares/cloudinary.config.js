import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file to Cloudinary
export const uploadToCloudinary = async (filePath, folder = 'uploads') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'auto',
    });
    
    return {
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
    };
  } catch (error) {
    throw new Error(`Error uploading file to Cloudinary: ${error.message}`);
  }
};

// Delete file from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error(`Error deleting file from Cloudinary: ${error.message}`);
  }
};

// Extract public ID from Cloudinary URL
export const extractPublicIdFromUrl = (url) => {
  if (!url || !url.includes('cloudinary')) {
    return null;
  }
  
  try {
    const urlParts = url.split('/');
    const filenameWithExtension = urlParts[urlParts.length - 1];
    const filename = filenameWithExtension.split('.')[0];
    const folderPath = urlParts[urlParts.length - 2];
    return `${folderPath}/${filename}`;
  } catch (error) {
    console.error('Error extracting public ID from URL:', error);
    return null;
  }
};

export default cloudinary;