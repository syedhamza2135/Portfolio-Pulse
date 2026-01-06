import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createServer } from 'http';
import passport from 'passport';

import app from './app.js';
import setupPassport from './config/passport.js';
import { startPriceUpdateJob } from './jobs/priceUpdateJob.js';
import { validateEnvironment } from './utils/validateEnv.js';
import { createApolloServer, createGraphQLMiddleware } from './graphql/server.js';

dotenv.config();

async function start() {
  try {
    const config = validateEnvironment();

    setupPassport(passport);

    await mongoose.connect(process.env.MONGO_URI);

    const httpServer = createServer(app);

    const apolloServer = await createApolloServer(httpServer);
    app.use('/graphql', createGraphQLMiddleware(apolloServer));

    startPriceUpdateJob();

    httpServer.listen(config.port, () => {
      console.log(`✓ Server running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Start failure:', error.message);
    process.exit(1);
  }
}

start();