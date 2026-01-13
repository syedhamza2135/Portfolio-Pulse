/**
 * Authentication Helper Utilities
 * 
 * Provides utility functions for extracting user information from
 * authenticated requests (both REST and GraphQL).
 * 
 * @module utils/authHelpers
 */

/**
 * Extracts user ID from authenticated request or GraphQL context
 * 
 * Works with both:
 * - Express request objects (REST API)
 * - GraphQL context objects
 * 
 * The user object is attached by the requireAuth middleware.
 * 
 * @function getUserId
 * @param {Object} reqOrContext - Express request or GraphQL context
 * @param {Object} reqOrContext.user - User object attached by auth middleware
 * @param {string} reqOrContext.user.sub - User ID (JWT 'sub' claim)
 * 
 * @returns {string} User ID
 * @throws {Error} If user is not authenticated or user ID is missing
 * 
 * @example
 * const userId = getUserId(req);
 * const portfolio = await Portfolio.findOne({ userId });
 */
export function getUserId(reqOrContext) {
  // Handle both REST requests and GraphQL context
  const user = reqOrContext.user;
  
  if (!user) {
    throw new Error('User not authenticated. Ensure requireAuth middleware is applied.');
  }
  
  // Use 'sub' consistently (JWT standard claim for subject/user ID)
  const userId = user.sub;
  
  if (!userId) {
    throw new Error('User ID not found in token.');
  }
  
  return userId;
}

/**
 * Extracts full user object from authenticated request or GraphQL context
 * 
 * Returns the complete user object including email and preferences.
 * 
 * @function getUser
 * @param {Object} reqOrContext - Express request or GraphQL context
 * @param {Object} reqOrContext.user - User object attached by auth middleware
 * 
 * @returns {Object} User object with sub, email, and preferences
 * @throws {Error} If user is not authenticated
 * 
 * @example
 * const user = getUser(req);
 * const email = user.email;
 */
export function getUser(reqOrContext) {
  const user = reqOrContext.user;
  
  if (!user) {
    throw new Error('User not authenticated. Ensure requireAuth middleware is applied.');
  }
  
  return user;
}