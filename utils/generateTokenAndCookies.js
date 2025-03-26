import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days
const COOKIE_EXPIRES = 7; // Cookie expires in 7 days

const generateTokenAndCookie = (user, res) => {
  // Create token payload
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  // Generate JWT token
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });

  // Calculate expiration time
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + COOKIE_EXPIRES);

  // Set cookie options
  const cookieOptions = {
    expires: expiresAt,
    httpOnly: true, // Cannot be accessed by client-side JavaScript
    secure: process.env.NODE_ENV, // HTTPS only in production
    sameSite: 'strict'
  };

  // Set cookie
  res.cookie('auth_token', token, cookieOptions);

  return {
    token,
    expiresAt: Math.floor(expiresAt.getTime() / 1000) // Convert to timestamp
  };
};

export default generateTokenAndCookie;