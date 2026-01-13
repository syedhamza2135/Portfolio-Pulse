/**
 * Refresh Token Model
 * 
 * Stores refresh tokens for JWT token rotation.
 * 
 * Security Features:
 * - Tokens are cryptographically secure random strings
 * - Tokens are unique (database constraint)
 * - Tokens automatically expire after 30 days (TTL)
 * - Tokens can be revoked by deletion
 * 
 * Schema Fields:
 * - userId: Reference to user who owns the token
 * - token: Refresh token string (unique, indexed)
 * - expiresAt: Token expiration date
 * - createdAt: Token creation date (used for TTL)
 * 
 * Indexes:
 * - userId: For finding all tokens for a user
 * - token: For fast token lookups (unique constraint)
 * - expiresAt: For querying expired tokens
 * 
 * TTL: Documents automatically expire after 30 days via createdAt field.
 * 
 * @module models/refreshToken
 * @requires mongoose
 */

import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  // Reference to user who owns this token
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true  // Indexed for finding all user's tokens
  },
  // Refresh token string (cryptographically secure random bytes)
  token: { 
    type: String, 
    required: true, 
    unique: true,  // Enforces uniqueness at database level
    index: true    // Indexed for fast token lookups
  },
  // Token expiration date
  expiresAt: { 
    type: Date, 
    required: true, 
    index: true  // Indexed for querying expired tokens
  },
  // Token creation date (used for TTL)
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 2592000  // Auto-delete after 30 days (2592000 seconds)
  }
});

export default mongoose.model('RefreshToken', refreshTokenSchema);