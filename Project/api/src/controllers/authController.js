/**
 * Authentication Controller
 * 
 * Handles user authentication operations:
 * - User registration with password validation
 * - User login with JWT token generation
 * - Access token refresh using refresh tokens
 * 
 * Security Features:
 * - Password hashing with bcrypt (12 rounds)
 * - JWT token-based authentication
 * - Refresh token rotation for enhanced security
 * - Strong password requirements
 * 
 * @module controllers/authController
 * @requires joi
 * @requires bcrypt
 * @requires jsonwebtoken
 * @requires passport
 */

import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import crypto from 'crypto';
import RefreshToken from '../models/refreshToken.js';
import User from '../models/user.js';

/**
 * Joi validation schema for user registration
 * 
 * Requirements:
 * - Email: Valid email format, trimmed and lowercased
 * - Password: Minimum 6 characters, must contain:
 *   - At least one uppercase letter
 *   - At least one number
 *   - At least one special character
 */
const registerSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string()
    .min(6)
    .pattern(/[A-Z]/)
    .pattern(/\d/)
    .pattern(/\W/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one number, and one special character'
    })
});

/**
 * Registers a new user account
 * 
 * Process:
 * 1. Validates email and password using Joi schema
 * 2. Hashes password with bcrypt (12 rounds for security)
 * 3. Creates user in database
 * 4. Returns user ID and email (password hash is never returned)
 * 
 * @async
 * @function registerUser
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing email and password
 * @param {string} req.body.email - User email address
 * @param {string} req.body.password - User password (must meet strength requirements)
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 201 - User created successfully
 * @returns {string} res.body.id - User ID
 * @returns {string} res.body.email - User email
 * 
 * @throws {400} If validation fails or email already exists
 * @throws {500} If database operation fails
 */
export async function registerUser(req, res) {
  try {
    // Validate request body against schema
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Hash password with bcrypt (12 rounds = good balance of security and performance)
    // Never store plain text passwords
    const passwordHash = await bcrypt.hash(value.password, 12);
    
    // Create user in database
    // Email is automatically lowercased and trimmed by schema
    const user = await User.create({
      email: value.email,
      passwordHash
    });
    
    // Return user data (excluding password hash)
    return res.status(201).json({
      id: user.id,
      email: user.email
    });
    
  } catch (err) {
    console.error('Error registering user:', err);
    
    // Handle duplicate email error (MongoDB unique index violation)
    if (err.code === 11000) {
      // Generic error message to prevent email enumeration attacks
      return res.status(400).json({ error: 'Registration Failed' });
    }
    
    // Handle validation errors from Mongoose
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    // Generic error for all other failures
    res.status(500).json({ error: 'Failed to register user' });
  }
}

/**
 * Joi validation schema for user login
 * 
 * Requirements:
 * - Email: Valid email format, trimmed and lowercased
 * - Password: Required (validation done by Passport)
 */
const loginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().required()
});

/**
 * Authenticates user and issues JWT tokens
 * 
 * Process:
 * 1. Validates email format
 * 2. Authenticates credentials using Passport local strategy
 * 3. Generates JWT access token (7 days expiry)
 * 4. Generates refresh token (30 days expiry, stored in database)
 * 5. Returns tokens and user information
 * 
 * Token Strategy:
 * - Access Token: Short-lived (7 days), used for API authentication
 * - Refresh Token: Long-lived (30 days), used to obtain new access tokens
 * 
 * @async
 * @function loginUser
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing email and password
 * @param {string} req.body.email - User email address
 * @param {string} req.body.password - User password
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns {Object} 200 - Login successful
 * @returns {string} res.body.token - JWT access token
 * @returns {string} res.body.refreshToken - Refresh token for token renewal
 * @returns {Object} res.body.user - User information
 * 
 * @throws {400} If validation fails
 * @throws {401} If credentials are invalid
 * @throws {500} If authentication process fails
 */
export async function loginUser(req, res, next) {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Authenticate using Passport local strategy
    // This compares the provided password with the stored hash
    passport.authenticate('local', { session: false }, async (err, user, info) => {
      if (err) {
        console.error('Passport authentication error:', err);
        return res.status(500).json({ error: 'Authentication error' });
      }
      
      // Check if user was found and password matched
      if (!user) {
        return res.status(401).json({ 
          error: info?.message || 'Invalid credentials' 
        });
      }

      try {
        // Generate JWT access token
        // Expires in 7 days - balance between security and user experience
        // Contains user ID in 'sub' (subject) claim
        const token = jwt.sign(
          { sub: user._id.toString() },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        // Generate refresh token (cryptographically secure random bytes)
        // Stored in database for revocation capability
        const refreshToken = crypto.randomBytes(32).toString('hex');
        await RefreshToken.create({
          userId: user._id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        
        // Return tokens and user information
        return res.json({
          token,
          refreshToken, // Client should store this securely
          user: {
            id: user._id,
            email: user.email
          }
        });
      } catch (jwtError) {
        console.error('JWT signing error:', jwtError);
        return res.status(500).json({ error: 'Authentication error' });
      }
    })(req, res, next);
    
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Refreshes an expired access token using a valid refresh token
 * 
 * Security Features:
 * - Refresh token rotation: Old token is invalidated, new one issued
 * - Token expiration validation
 * - Automatic cleanup of expired tokens
 * 
 * Process:
 * 1. Validates refresh token exists in database
 * 2. Checks token hasn't expired
 * 3. Issues new access token (7 days)
 * 4. Rotates refresh token (new 30-day token, old one invalidated)
 * 
 * @async
 * @function refreshAccessToken
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body containing refresh token
 * @param {string} req.body.refreshToken - Valid refresh token from previous login
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Tokens refreshed successfully
 * @returns {string} res.body.token - New JWT access token
 * @returns {string} res.body.refreshToken - New refresh token (old one is invalidated)
 * 
 * @throws {400} If refresh token is missing
 * @throws {401} If refresh token is invalid or expired
 * @throws {500} If token refresh process fails
 */
export async function refreshAccessToken(req, res) {
  try {
    const { refreshToken } = req.body;
    
    // Validate refresh token is provided
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Find refresh token in database
    // This ensures the token hasn't been revoked
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    
    if (!tokenDoc) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check if token has expired
    if (tokenDoc.expiresAt < new Date()) {
      // Clean up expired token
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Issue new access token with same user ID
    const newAccessToken = jwt.sign(
      { sub: tokenDoc.userId.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Rotate refresh token (security best practice)
    // Old token is invalidated, new one is issued
    // This prevents token reuse if a token is compromised
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    await RefreshToken.findByIdAndUpdate(tokenDoc._id, {
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Reset to 30 days
    });

    // Return new tokens
    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}