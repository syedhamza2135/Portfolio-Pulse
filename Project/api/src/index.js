import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { createServer } from 'http';
import passport from 'passport';
import app from './app.js';
import setupPassport from './config/passport.js';
import { startPriceUpdateJob } from './jobs/priceUpdateJob.js';
import { validateEnvironment } from './utils/validateEnv.js';
import { createApolloServer, createGraphQLMiddleware } from './graphql/server.js';

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

    // 4. Background Services (Only start after DB is up)
    startPriceUpdateJob();
    console.log('✓ Background price sync service initialized');

    // 5. Error Handlers
    app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found', path: req.path });
    });

    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      });
    });

    // 6. Start Server
    httpServer.listen(config.port, () => {
      console.log(`✓ Server running on port http://localhost:${config.port}`);
      console.log(`GraphQL ready at http://localhost:${config.port}/graphql`);
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

start();