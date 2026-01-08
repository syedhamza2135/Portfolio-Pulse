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

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({ 
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(passport.initialize());

// Rate Limiting
app.use('/api/auth/login', authLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', meRoutes);
app.use('/api/portfolios', portfolioRoutes);
app.use('/api/holdings', holdingRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/sentiment', sentimentRoutes);
app.use('/api/risk', riskRoutes);

export default app;