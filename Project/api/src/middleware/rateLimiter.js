import rateLimit from 'express-rate-limit';

const getRetryAfter = (req) => {
  if (!req.rateLimit?.resetTime) return 900;
  return Math.ceil((new Date(req.rateLimit.resetTime).getTime() - Date.now()) / 1000);
};

export const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many attempts. Please try again in 15 minutes.',
      retryAfter: getRetryAfter(req)
    });
  }
});

export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) || 60;
    res.status(429).json({
      error: 'Too many requests. Please slow down.',
      retryAfter
    });
  }
});