import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import passport from 'passport';
import setupPassport from './config/passport.js';
import { authLimiter, apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoute.js';
import meRoutes from './routes/me.js';
import portfolioRoutes from './routes/portfolioRoute.js';
import holdingRoutes from './routes/holdingsRoute.js';
import priceRoutes from './routes/priceRoute.js';
import { startPriceUpdateJob } from './jobs/priceUpdateJob.js';
import { validateEnvironment } from './utils/validateEnv.js';

dotenv.config();

const app = express();

// Setup passport strategies
setupPassport(passport);

// Security middleware - Apply early in the chain
app.use(helmet());
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize data to prevent NoSQL injection
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`[Security] Sanitized potentially malicious data in ${req.path} - key: ${key}`);
  }
}));

// Initialize passport
app.use(passport.initialize());

// Apply general API rate limiting to all routes
app.use('/api/', apiLimiter);

// Apply strict rate limiting to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', meRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/holdings', holdingRoutes);
app.use('/api/prices', priceRoutes);

// Health check endpoint (no rate limiting)
app.get('/health', async (req, res) => {
  const health = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  // Check database connection
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      health.database = 'connected';
    } else {
      health.database = 'disconnected';
      health.message = 'Database not connected';
      return res.status(503).json(health);
    }
  } catch (error) {
    health.database = 'error';
    health.message = error.message;
    return res.status(503).json(health);
  }
  
  res.json(health);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const errorResponse = {
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  };
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }
  
  res.status(err.status || 500).json(errorResponse);
});

async function start() {
  try {
    // Validate environment variables first
    console.log('Validating environment variables...');
    const config = validateEnvironment();
    
    const mongoUri = process.env.MONGO_URI;
    const jwtSecret = process.env.JWT_SECRET;

    // Connect to MongoDB with options
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✓ Connected to MongoDB');

    // Start price update cron job
    startPriceUpdateJob();

    const port = Number(config.port);
    app.listen(port, () => {
      console.log('');
      console.log('=================================');
      console.log(`✓ API server running on port ${port}`);
      console.log(`✓ Environment: ${config.nodeEnv}`);
      console.log(`✓ CORS Origin: ${config.corsOrigin}`);
      console.log(`✓ Rate limiting: enabled`);
      console.log(`✓ Input sanitization: enabled`);
      console.log(`✓ Price updates: scheduled`);
      if (config.hasAlphaVantage) {
        console.log('✓ Alpha Vantage API: configured');
      }
      if (config.hasFinnhub) {
        console.log('✓ Finnhub API: configured');
      }
      console.log('=================================');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to exit the process
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

start();