/**
 * Authentication Middleware
 * 
 * Provides JWT-based authentication for protected routes.
 * Validates JWT tokens and attaches user information to the request object.
 * 
 * @module middleware/auth
 * @requires passport
 */

import passport from 'passport';

/**
 * Express middleware to require authentication
 * 
 * This middleware:
 * 1. Extracts JWT token from Authorization header
 * 2. Validates token using Passport JWT strategy
 * 3. Attaches user information to req.user if valid
 * 4. Returns 401 if token is invalid or expired
 * 5. Returns 500 if authentication process fails
 * 
 * Usage:
 *   router.get('/protected', requireAuth, controller.handler);
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @returns {void} Calls next() if authentication succeeds, otherwise sends error response
 */
export function requireAuth(req, res, next) {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    // Handle authentication errors (e.g., token parsing failures)
    if (err) {
      console.error('Passport Auth Error:', err);
      return res.status(500).json({ 
        error: 'Internal server error during authentication' 
      });
    }

    // Handle missing or invalid user
    if (!user) {
      // Provide user-friendly error messages
      const errorMessage = info?.name === 'TokenExpiredError' 
        ? 'Your session has expired. Please log in again.' 
        : 'Access denied. Valid token required.';
        
      return res.status(401).json({ error: errorMessage });
    }

    // Attach user information to request object
    // This makes user data available to subsequent middleware and route handlers
    req.user = {
      sub: user._id.toString(),        // User ID (subject claim)
      email: user.email,                // User email
      preferences: user.preferences || {} // User preferences (alert settings, etc.)
    };

    // Authentication successful - proceed to next middleware/route handler
    next();
  })(req, res, next);
}