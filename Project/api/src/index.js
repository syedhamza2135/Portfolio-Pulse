/**
 * Portfolio Pulse API Server - Main Entry Point
 * 
 * This is the primary entry point for the Portfolio Pulse backend API.
 * It handles:
 * - Environment validation
 * - Database connection and initialization
 * - Service initialization (email, sentiment, news)
 * - Background job scheduling
 * - Graceful shutdown handling
 * 
 * @module index
 * @requires dotenv
 * @requires mongoose
 * @requires express
 */

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

/**
 * HTTP server instance for graceful shutdown
 * @type {import('http').Server|null}
 */
let httpServerInstance = null;

/**
 * Main server startup function
 * 
 * Orchestrates the complete application initialization:
 * 1. Validates environment variables
 * 2. Sets up authentication (Passport)
 * 3. Connects to MongoDB with connection pooling
 * 4. Validates database and creates indexes
 * 5. Initializes GraphQL and REST API servers
 * 6. Initializes external services (email, sentiment)
 * 7. Starts background jobs (price updates, risk calculations, alerts)
 * 8. Starts HTTP server
 * 
 * @async
 * @function start
 * @throws {Error} Exits process with code 1 if critical initialization fails
 */
async function start() {
  try {
    // Step 1: Validate Environment & Setup Authentication
    // Ensures all required environment variables are present and valid
    const config = validateEnvironment();
    setupPassport(passport);

    // Step 2: Establish Database Connection
    // Uses connection pooling for optimal performance
    // - maxPoolSize: Maximum number of connections (50)
    // - minPoolSize: Minimum connections to maintain (10)
    // - serverSelectionTimeoutMS: Time to wait for server selection (5s)
    // - socketTimeoutMS: Time before socket times out (45s)
    // - family: 4 = IPv4 only
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

    // Step 3: Database Health & Optimization
    // Validates database connection and ensures all indexes exist
    // Indexes are critical for query performance
    const dbValid = await validateDatabase();
    if (!dbValid) {
      console.warn("⚠ Database validation warnings detected. Check collection logs.");
    }
    await ensureIndexes(); 

    // Step 4: Initialize API Servers
    // Creates HTTP server and GraphQL Apollo server
    const httpServer = createServer(app);
    const apolloServer = await createApolloServer(httpServer);

    // Mount GraphQL endpoint and error handlers
    mountGraphQL(apolloServer);
    setupErrorHandlers();

    // Step 5: Initialize Core Services
    // Email service requires SENDGRID_API_KEY
    // Sentiment service is a separate Python FastAPI service
    const emailInitialized = emailAlertService.initialize();
    
    // Check Sentiment Service (Python FastAPI) health
    // This service provides AI-powered sentiment analysis
    const pythonHealthy = await sentimentAnalysisService.checkPythonServiceHealth();
    
    // Step 6: Start Background Jobs
    // These run on cron schedules:
    // - Price updates: Every 15 minutes during market hours
    // - Risk calculations: Daily at midnight
    // - Alert checks: Every 15 minutes (if email enabled)
    startPriceUpdateJob();
    startRiskCalculationJob();
    if (emailInitialized) {
        startAlertCheckJob();
    }

    // Step 7: Start Listening
    // Server is now ready to accept connections
    httpServerInstance = httpServer.listen(config.port, () => {
      printStartupBanner(config, pythonHealthy, emailInitialized);
    });

    // Set up MongoDB connection monitoring
    setupMongooseMonitoring();

  } catch (error) {
    console.error("Critical failure during startup:", error);
    // Exit with error code 1 to signal failure to process manager
    process.exit(1);
  }
}

/**
 * Sets up MongoDB connection event monitoring
 * 
 * Monitors connection state changes and logs pool statistics in production.
 * This helps identify connection issues and pool exhaustion problems.
 * 
 * @function setupMongooseMonitoring
 */
function setupMongooseMonitoring() {
  // Log connection errors
  mongoose.connection.on("error", (err) => console.error("MongoDB error:", err));
  
  // Log disconnection events
  mongoose.connection.on("disconnected", () => console.warn("⚠ MongoDB disconnected"));
  
  // Log successful reconnections
  mongoose.connection.on("reconnected", () => console.log("✓ MongoDB reconnected"));

  // In production, log connection pool stats every minute
  // This helps monitor pool health and identify connection leaks
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
 * Graceful shutdown handler
 * 
 * Ensures all resources are properly closed when the process receives
 * termination signals (SIGTERM, SIGINT). This is critical for:
 * - Preventing data corruption
 * - Closing database connections cleanly
 * - Stopping background timers/intervals
 * - Allowing load balancers to drain connections
 * 
 * @async
 * @function gracefulShutdown
 * @param {string} signal - The termination signal received (SIGTERM, SIGINT)
 */
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Closing services...`);

  // Close HTTP server (stops accepting new connections)
  // Existing connections are allowed to complete
  if (httpServerInstance) {
    await new Promise((resolve) => {
      httpServerInstance.close(() => {
        console.log("✓ HTTP server closed");
        resolve();
      });
    });
  }

  // Close MongoDB connection
  // Ensures all pending operations complete
  try {
    await mongoose.connection.close();
    console.log("✓ MongoDB connection closed");
  } catch (err) {
    console.error("Error closing MongoDB:", err);
  }

  // Cleanup service resources
  // Destroys timers, intervals, and clears caches
  priceFetcher.destroy?.();
  newsFetcherService.destroy?.();
  sentimentAnalysisService.destroy?.();
  emailAlertService.destroy?.();

  console.log("✓ Cleanup complete. Goodbye!");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

start();