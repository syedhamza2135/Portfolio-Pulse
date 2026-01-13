/**
 * Express Application Configuration
 * 
 * Sets up the Express application with:
 * - Security middleware (Helmet, CORS, MongoDB sanitization)
 * - Rate limiting
 * - Request parsing
 * - Authentication (Passport)
 * - API routes
 * - GraphQL endpoint
 * - Error handling
 * 
 * @module app
 * @requires express
 * @requires helmet
 * @requires cors
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import passport from 'passport';
import { authLimiter, apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoute.js';
import meRoutes from './routes/me.js';
import portfolioRoutes from './routes/portfolioRoute.js';
import holdingRoutes from './routes/holdingsRoute.js';
import priceRoutes from './routes/priceRoute.js';
import sentimentRoutes from './routes/sentimentRoute.js';
import riskRoutes from './routes/riskRoute.js';
import healthRoutes from './routes/healthRoute.js';

const app = express();

// ============================================================================
// Security Middleware
// ============================================================================

/**
 * Helmet.js - Security headers
 * Sets various HTTP headers to help protect the app from well-known web vulnerabilities
 * - Disables CSP in development (for GraphQL Playground)
 * - Disables COEP (not needed for this API)
 */
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

/**
 * CORS Configuration
 * 
 * PRODUCTION NOTE: Replace '*' with specific origins for better security
 * Example: origin: process.env.CORS_ORIGIN?.split(',') || ['https://app.portfoliopulse.com']
 * 
 * @todo Implement CORS whitelist in production
 */
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

/**
 * Request Body Parsing
 * - JSON parser with 10MB limit (for large portfolio data)
 * - MongoDB injection prevention (sanitizes $ and . operators)
 */
app.use(express.json({ limit: '10mb' }));
app.use(mongoSanitize({ replaceWith: '_' }));

/**
 * Passport Authentication
 * Initializes Passport middleware for JWT authentication
 */
app.use(passport.initialize());

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Rate Limiting Configuration
 * 
 * - Auth endpoints: Stricter limits (5 requests per 15 minutes)
 *   Prevents brute force attacks on login
 * - API endpoints: General limits (100 requests per minute)
 *   Prevents API abuse while allowing normal usage
 */
app.use('/api/auth/login', authLimiter);
app.use('/api/', apiLimiter);

// ============================================================================
// API Routes
// ============================================================================

/**
 * Route Registration
 * 
 * All routes are prefixed with '/api' for REST endpoints
 * GraphQL endpoint is mounted separately at '/graphql'
 */
app.use('/api', meRoutes);              // User profile endpoints
app.use('/api/health', healthRoutes);   // Health check endpoints
app.use('/api/auth', authRoutes);       // Authentication endpoints
app.use('/api/portfolios', portfolioRoutes);  // Portfolio management
app.use('/api/holdings', holdingRoutes);     // Holdings management
app.use('/api/prices', priceRoutes);         // Price data endpoints
app.use('/api/sentiment', sentimentRoutes);   // Sentiment analysis
app.use('/api/risk', riskRoutes);            // Risk metrics

// ============================================================================
// GraphQL Endpoint
// ============================================================================

/**
 * GraphQL Server Integration
 * 
 * Mounts Apollo GraphQL server at /graphql endpoint
 * Provides flexible query interface for frontend applications
 */
import { createGraphQLMiddleware } from "./graphql/server.js"; 

/**
 * Mounts GraphQL endpoint on Express app
 * 
 * @param {ApolloServer} apolloServer - Configured Apollo Server instance
 */
export const mountGraphQL = (apolloServer) => {
  app.use('/graphql', createGraphQLMiddleware(apolloServer));
  console.log("✓ GraphQL Route Registered");
};

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Sets up global error handlers
 * 
 * - 404 Handler: Returns JSON error for unknown endpoints
 * - Global Error Handler: Catches all unhandled errors
 *   - In development: Shows full error details and stack trace
 *   - In production: Hides internal error details for security
 */
export const setupErrorHandlers = () => {
  // 404 Handler - Unknown endpoints
  app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
  });

  // Global Error Handler - Catches all unhandled errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    // Log error for monitoring/debugging
    console.error('Unhandled error:', err);
    
    // Determine if we're in development mode
    const isDev = process.env.NODE_ENV !== 'production';
    
    // Return appropriate error response
    // In production, never expose internal error details
    res.status(err.status || 500).json({
      error: isDev ? err.message : 'Internal server error',
      ...(isDev && { stack: err.stack })
    });
  });
  console.log("✓ Error Handlers Registered");
};

export default app;