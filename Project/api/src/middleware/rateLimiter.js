import rateLimit from 'express-rate-limit';

// Rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false, // Count failed requests
  handler: (req, res) => {
    const retryAfter = req.rateLimit?.resetTime 
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 900; // Default to 15 minutes in seconds
    res.status(429).json({
      error: 'Too many attempts. Please try again in 15 minutes.',
      retryAfter
    });
  }
});

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = req.rateLimit?.resetTime 
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 60; // Default to 1 minute in seconds
    res.status(429).json({
      error: 'Too many requests. Please slow down.',
      retryAfter
    });
  }
});

// Strict limiter for sensitive operations
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 requests per hour
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  handler: (req, res) => {
    const retryAfter = req.rateLimit?.resetTime 
      ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      : 3600; // Default to 1 hour in seconds
    res.status(429).json({
      error: 'Too many failed attempts. Please try again in 1 hour.',
      retryAfter
    });
  }
});