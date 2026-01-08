import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { createServer } from 'http';
import passport from 'passport';
import app from './app.js';
import setupPassport from './config/passport.js';
import { startPriceUpdateJob } from './jobs/priceUpdateJob.js';
import { startRiskCalculationJob } from './jobs/riskCalculationJob.js';
import { startAlertCheckJob } from './jobs/alertCheckJob.js';
import { validateEnvironment } from './utils/validateEnv.js';
import { createApolloServer, createGraphQLMiddleware } from './graphql/server.js';
import emailAlertService from './services/emailAlertService.js';
import sentimentAnalysisService from './services/sentimentAnalysisService.js';

async function start() {
  try {
    const config = validateEnvironment();
    setupPassport(passport);

    // 1. Establish Database Connection first
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ MongoDB connected');

    // 2. Initialize Servers
    const httpServer = createServer(app);
    const apolloServer = await createApolloServer(httpServer);
    
    // 3. Middleware & Routes
    app.use('/graphql', createGraphQLMiddleware(apolloServer));

    // 4. Initialize Email Service
    const emailInitialized = emailAlertService.initialize();
    if (!emailInitialized) {
      console.warn('⚠ Email alerts disabled (SENDGRID_API_KEY not configured)');
    }

    // 5. Check Python Sentiment Service
    const pythonHealthy = await sentimentAnalysisService.checkPythonServiceHealth();
    if (!pythonHealthy) {
      console.warn('⚠ Python sentiment service not available. Sentiment analysis will be limited.');
      console.warn('  Start the Python service with: cd sentiment_service && python main.py');
    } else {
      console.log('✓ Python sentiment service connected');
    }

    // 6. Background Services (Only start after DB is up)
    startPriceUpdateJob();
    console.log('✓ Price update job initialized');

    startRiskCalculationJob();
    console.log('✓ Risk calculation job initialized');

    if (emailInitialized) {
      startAlertCheckJob();
      console.log('✓ Alert monitoring job initialized');
    }

    // 7. Error Handlers
    app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found', path: req.path });
    });

    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      });
    });

    // 8. Start Server
    httpServer.listen(config.port, () => {
      console.log(`
╔═════════════════════════════════════════════════════════════╗
║                                                             ║
║             PortfolioPulse API Server                       ║
║                                                             ║
     REST API:   http://localhost:${config.port}             
     GraphQL:    http://localhost:${config.port}/graphql     
                                                             
     Environment: ${config.nodeEnv.toUpperCase().padEnd(39)} 
║                                                             ║
╚═════════════════════════════════════════════════════════════╝
      `);
      console.log('📊 Services Status:');
      console.log(`   • Database:     ✓ Connected`);
      console.log(`   • Price API:    ${config.hasAlphaVantage ? '✓' : '⚠'} ${config.hasAlphaVantage ? 'Alpha Vantage' : 'Not configured'}`);
      console.log(`   • Sentiment:    ${pythonHealthy ? '✓' : '⚠'} ${pythonHealthy ? 'Python service' : 'Unavailable'}`);
      console.log(`   • Email:        ${emailInitialized ? '✓' : '⚠'} ${emailInitialized ? 'SendGrid' : 'Disabled'}`);
      console.log('');
      console.log('🔧 Background Jobs:');
      console.log('   • Price updates:  Every 15 min (market hours)');
      console.log('   • Risk calc:      Daily at 6:00 PM ET');
      console.log('   • Alert checks:   Every 15 minutes');
      console.log('');
    });

  } catch (error) {
    console.error('Critical failure during startup:', error);
    process.exit(1);
  }
}

// Global Rejection Handler for CS best practice
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

start();