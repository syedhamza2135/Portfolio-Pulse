/**
 * User Profile Routes
 * 
 * Defines endpoints for authenticated user information:
 * - GET /api/me - Get current user's profile information
 * 
 * All routes require authentication via JWT token.
 * 
 * @module routes/me
 * @requires express
 */

import { Router } from 'express';
import User from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';
import { getUserId } from '../utils/authHelpers.js';

const router = Router();

/**
 * GET /api/me
 * 
 * Returns the current authenticated user's profile information.
 * 
 * Returns:
 * - email: User's email address
 * - createdAt: Account creation timestamp
 * - preferences: User preferences (alert settings, etc.)
 * 
 * Note: Password hash is never returned.
 * 
 * @route GET /api/me
 * @middleware requireAuth
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Get user ID from JWT token
    const id = getUserId(req);
    
    // Fetch user data (excluding password hash)
    const user = await User.findById(id).select('email createdAt preferences');
    
    // Handle edge case: JWT valid but user deleted
    if (!user) {
      console.error('JWT valid but user not found:', id);
      return res.status(404).json({ error: 'User account not found. Please re-login.' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    
    // Handle authentication errors
    if (err.message.includes('not authenticated')) {
      return res.status(401).json({ error: err.message });
    }
    
    // Generic error for other failures
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

export default router;