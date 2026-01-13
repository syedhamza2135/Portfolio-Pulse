/**
 * Rate Limiting Middleware
 * 
 * Provides rate limiting to prevent API abuse and brute force attacks.
 * 
 * Two rate limiters are configured:
 * 1. authLimiter: Strict limits for authentication endpoints (prevents brute force)
 * 2. apiLimiter: General limits for API endpoints (prevents abuse)
 * 
 * @module middleware/rateLimiter
 * @requires express-rate-limit
 */

import rateLimit from 'express-rate-limit';

/**
 * Calculates retry-after time in seconds
 * 
 * Returns the number of seconds until the rate limit window resets.
 * Used in error responses to inform clients when they can retry.
 * 
 * @function getRetryAfter
 * @param {Object} req - Express request object
 * @param {Object} req.rateLimit - Rate limit information from express-rate-limit
 * @param {Date} req.rateLimit.resetTime - Time when rate limit resets
 * 
 * @returns {number} Seconds until rate limit resets (defaults to 900 if unavailable)
 */
const getRetryAfter = (req) => {
  if (!req.rateLimit?.resetTime) return 900;
  return Math.ceil((new Date(req.rateLimit.resetTime).getTime() - Date.now()) / 1000);
};

/**
 * Authentication Rate Limiter
 * 
 * Strict rate limiting for authentication endpoints (login, register).
 * Prevents brute force attacks by limiting attempts per IP address.
 * 
 * Configuration:
 * - Window: 15 minutes (configurable via RATE_LIMIT_WINDOW_MS)
 * - Max requests: 5 per window (configurable via RATE_LIMIT_MAX_REQUESTS)
 * - Counts both successful and failed requests
 * 
 * Applied to: /api/auth/login, /api/auth/register
 * 
 * @constant {Object} authLimiter
 */
export const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5, // 5 attempts per window
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,  // Send standard rate limit headers
  legacyHeaders: false,    // Don't send legacy headers
  skipSuccessfulRequests: false,  // Count successful logins
  skipFailedRequests: false,      // Count failed attempts
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many attempts. Please try again in 15 minutes.',
      retryAfter: getRetryAfter(req)
    });
  }
});

/**
 * General API Rate Limiter
 * 
 * Rate limiting for general API endpoints.
 * More lenient than auth limiter to allow normal usage patterns.
 * 
 * Configuration:
 * - Window: 1 minute (configurable via API_RATE_LIMIT_WINDOW_MS)
 * - Max requests: 100 per window (configurable via API_RATE_LIMIT_MAX_REQUESTS)
 * 
 * Applied to: All /api/* endpoints (except auth endpoints)
 * 
 * @constant {Object} apiLimiter
 */
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,  // Send standard rate limit headers
  legacyHeaders: false,    // Don't send legacy headers
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) || 60;
    res.status(429).json({
      error: 'Too many requests. Please slow down.',
      retryAfter
    });
  }
});

export const customRateLimitHandler = (req, res) => {
  res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfter: getRetryAfter(req)
  });
};