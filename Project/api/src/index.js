import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { createServer } from "http";
import passport from "passport";
import app, { mountGraphQL, setupErrorHandlers } from "./app.js";
import setupPassport from "./config/passport.js";

// Database Utilities
import { validateDatabase, ensureIndexes } from "./config/database.js";

// Background Jobs
import { startPriceUpdateJob } from "./jobs/priceUpdateJob.js";
import { startRiskCalculationJob } from "./jobs/riskCalculationJob.js";
import { startAlertCheckJob } from "./jobs/alertCheckJob.js";

// Services & Utils
import { validateEnvironment } from "./utils/validateEnv.js";
import { createApolloServer } from "./graphql/server.js";
import emailAlertService from "./services/emailAlertService.js";
import sentimentAnalysisService from "./services/sentimentAnalysisService.js";
import newsFetcherService from "./services/newsFetcherService.js";
import priceFetcher from "./services/priceFetcherService.js";

let httpServerInstance = null;

async function start() {
  try {
    // 1. Validate Environment & Auth
    const config = validateEnvironment();
    setupPassport(passport);

    // 2. Establish Database Connection
    console.log("[System] Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      retryWrites: true,
      retryReads: true,
      monitorCommands: process.env.NODE_ENV === "development",
    });

    // 3. Database Health & Optimization
    const dbValid = await validateDatabase();
    if (!dbValid) {
      console.warn("⚠ Database validation warnings detected. Check collection logs.");
    }
    await ensureIndexes(); 

    // 4. Initialize API Servers
    const httpServer = createServer(app);
    const apolloServer = await createApolloServer(httpServer);

    mountGraphQL(apolloServer);

    setupErrorHandlers();

    // 5. Initialize Core Services
    const emailInitialized = emailAlertService.initialize();
    
    // Check Sentiment Service (Python FastAPI)
    const pythonHealthy = await sentimentAnalysisService.checkPythonServiceHealth();
    
    // 6. Start Background Jobs
    startPriceUpdateJob();
    startRiskCalculationJob();
    if (emailInitialized) {
        startAlertCheckJob();
    }

    // 7. Start Listening
    httpServerInstance = httpServer.listen(config.port, () => {
      printStartupBanner(config, pythonHealthy, emailInitialized);
    });

    setupMongooseMonitoring();

  } catch (error) {
    console.error("Critical failure during startup:", error);
    process.exit(1);
  }
}

/**
 * Helper to keep logs clean
 */
function setupMongooseMonitoring() {
  mongoose.connection.on("error", (err) => console.error("MongoDB error:", err));
  mongoose.connection.on("disconnected", () => console.warn("⚠ MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => console.log("✓ MongoDB reconnected"));

  if (process.env.NODE_ENV === "production") {
    setInterval(() => {
      const stats = mongoose.connection.client?.topology?.s?.pool?.stats;
      if (stats) {
        console.log(`[DB Pool] Available: ${stats.availableConnections} | In-Use: ${stats.checkedOutConnections}`);
      }
    }, 60000);
  }
}

function printStartupBanner(config, pythonHealthy, emailInitialized) {
  console.log(`
╔════════════════════════════════════════════════════════╗
║               PortfolioPulse API Server                ║
╚════════════════════════════════════════════════════════╝
  REST API:    http://localhost:${config.port}
  GraphQL:     http://localhost:${config.port}/graphql
  Environment: ${config.nodeEnv.toUpperCase()}

  STATUS:
  • Database:   ✓ Ready & Indexed
  • Sentiment:  ${pythonHealthy ? "✓ Connected" : "⚠ Offline"}
  • Email:      ${emailInitialized ? "✓ SendGrid" : "⚠ Disabled"}
  
  JOBS:
  • Price Updates, Risk Analytics, and Alerts Active.
  `);
}

/**
 * Graceful Shutdown Handler
 */
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Closing services...`);

  if (httpServerInstance) {
    httpServerInstance.close(() => console.log("✓ HTTP server closed"));
  }

  try {
    await mongoose.connection.close();
    console.log("✓ MongoDB connection closed");
  } catch (err) {
    console.error("Error closing MongoDB:", err);
  }

  priceFetcher.destroy?.();
  newsFetcherService.destroy?.();
  sentimentAnalysisService.destroy?.();

  console.log("✓ Cleanup complete. Goodbye!");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

start();