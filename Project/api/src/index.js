import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { createServer } from "http";
import passport from "passport";
import app from "./app.js";
import setupPassport from "./config/passport.js";
import { startPriceUpdateJob } from "./jobs/priceUpdateJob.js";
import { startRiskCalculationJob } from "./jobs/riskCalculationJob.js";
import { startAlertCheckJob } from "./jobs/alertCheckJob.js";
import { validateEnvironment } from "./utils/validateEnv.js";
import {
  createApolloServer,
  createGraphQLMiddleware,
} from "./graphql/server.js";
import emailAlertService from "./services/emailAlertService.js";
import sentimentAnalysisService from "./services/sentimentAnalysisService.js";
import priceFetcher from "./services/priceFetcherService.js";

let httpServerInstance = null;

async function start() {
  try {
    const config = validateEnvironment();
    setupPassport(passport);

    // 1. Establish Database Connection first
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 50, // Max connections (adjust based on load)
      minPoolSize: 10, // Keep minimum pool size
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000, // Close sockets after 45s
      family: 4, // Force IPv4 (faster DNS on some hosts)

      // Automatic retry logic
      retryWrites: true,
      retryReads: true,

      // Monitoring
      monitorCommands: process.env.NODE_ENV === "development",
    });

    // Monitor pool exhaustion
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠ MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✓ MongoDB reconnected");
    });

    // Pool monitoring (optional)
    if (process.env.NODE_ENV === "production") {
      setInterval(() => {
        const { client } = mongoose.connection;
        if (client) {
          const poolStats = client.topology?.s?.pool?.stats;
          if (poolStats) {
            console.log("[MongoDB] Pool stats:", {
              available: poolStats.availableConnections,
              inUse: poolStats.checkedOutConnections,
              waiting: poolStats.waitQueueSize,
            });
          }
        }
      }, 60000); // Every minute
    }

    // 2. Initialize Servers
    const httpServer = createServer(app);
    const apolloServer = await createApolloServer(httpServer);

    // 3. Middleware & Routes
    app.use("/graphql", createGraphQLMiddleware(apolloServer));

    // 4. Initialize Email Service
    const emailInitialized = emailAlertService.initialize();
    if (!emailInitialized) {
      console.warn("⚠ Email alerts disabled (SENDGRID_API_KEY not configured)");
    }

    // 5. Check Python Sentiment Service
    const pythonHealthy =
      await sentimentAnalysisService.checkPythonServiceHealth();
    if (!pythonHealthy) {
      console.warn(
        "⚠ Python sentiment service not available. Sentiment analysis will be limited."
      );
      console.warn(
        "  Start the Python service with: cd sentiment_service && python main.py"
      );
    } else {
      console.log("✓ Python sentiment service connected");
    }

    // 6. Background Services (Only start after DB is up)
    startPriceUpdateJob();
    console.log("✓ Price update job initialized");

    startRiskCalculationJob();
    console.log("✓ Risk calculation job initialized");

    if (emailInitialized) {
      startAlertCheckJob();
      console.log("✓ Alert monitoring job initialized");
    }

    // 7. Start Server
    httpServerInstance = httpServer.listen(config.port, () => {
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
      console.log("📊 Services Status:");
      console.log(`   • Database:     ✓ Connected`);
      console.log(
        `   • Price API:    ${config.hasAlphaVantage ? "✓" : "⚠"} ${config.hasAlphaVantage ? "Alpha Vantage" : "Not configured"}`
      );
      console.log(
        `   • Sentiment:    ${pythonHealthy ? "✓" : "⚠"} ${pythonHealthy ? "Python service" : "Unavailable"}`
      );
      console.log(
        `   • Email:        ${emailInitialized ? "✓" : "⚠"} ${emailInitialized ? "SendGrid" : "Disabled"}`
      );
      console.log("");
      console.log("🔧 Background Jobs:");
      console.log("   • Price updates:  Every 15 min (market hours)");
      console.log("   • Risk calc:      Daily at 6:00 PM ET");
      console.log("   • Alert checks:   Every 15 minutes");
      console.log("");
    });
  } catch (error) {
    console.error("Critical failure during startup:", error);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // 1. Stop accepting new connections
  if (httpServerInstance) {
    console.log("Closing HTTP server...");
    httpServerInstance.close(() => {
      console.log("✓ HTTP server closed");
    });
  }

  // 2. Stop background jobs
  console.log("Stopping background jobs...");
  // Add cleanup for cron jobs (they don't have built-in stop)

  // 3. Wait for ongoing requests to complete (max 30s)
  const shutdownTimeout = setTimeout(() => {
    console.error("⚠ Forced shutdown after 30s timeout");
    process.exit(1);
  }, 30000);

  // 4. Close database connection
  try {
    await mongoose.connection.close();
    console.log("✓ MongoDB connection closed");
  } catch (error) {
    console.error("Error closing MongoDB:", error);
  }

  // 5. Cleanup services
  priceFetcher.destroy?.();

  clearTimeout(shutdownTimeout);
  console.log("✓ Graceful shutdown complete");
  process.exit(0);
}

// Handle both SIGTERM and SIGINT
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

start();