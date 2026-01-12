import { Router } from 'express';
import mongoose from 'mongoose';
import sentimentAnalysisService from '../services/sentimentAnalysisService.js';
import newsFetcherService from '../services/newsFetcherService.js';
import priceFetcher from '../services/priceFetcherService.js';

const router = Router();

/**
 * GET /api/health
 * Comprehensive health check for monitoring systems
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    services: {},
    checks: []
  };

  // Check 1: Database Connection
  try {
    const dbState = mongoose.connection.readyState;
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    if (dbState === 1) {
      await mongoose.connection.db.admin().ping();
      health.services.database = { status: 'healthy', state: dbStates[dbState] };
    } else {
      health.services.database = { status: 'unhealthy', state: dbStates[dbState] };
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.database = { status: 'unhealthy', error: error.message };
    health.status = 'unhealthy';
  }

  // Check 2: Python Sentiment Service
  try {
    const sentimentHealthy = await sentimentAnalysisService.checkPythonServiceHealth();
    health.services.sentiment = {
      status: sentimentHealthy ? 'healthy' : 'unavailable',
      url: process.env.PYTHON_SENTIMENT_URL,
      circuitOpen: sentimentAnalysisService.circuitOpen
    };
    
    if (!sentimentHealthy) {
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.sentiment = { status: 'error', error: error.message };
  }

  // Check 3: External APIs Rate Limits
  health.services.externalAPIs = {
    newsAPI: newsFetcherService.getRateLimitStatus(),
    priceAPI: {
      cacheSize: priceFetcher.cache?.size || 0,
      configured: !!process.env.ALPHA_VANTAGE_API_KEY
    }
  };

  // Check 4: Memory Usage
  const memUsage = process.memoryUsage();
  health.system = {
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
    },
    cpu: process.cpuUsage()
  };

  // Response time
  health.responseTime = `${Date.now() - startTime}ms`;

  // Set HTTP status based on health
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
});

/**
 * GET /api/health/readiness
 * Kubernetes readiness probe
 */
router.get('/readiness', async (req, res) => {
  try {
    const dbReady = mongoose.connection.readyState === 1;
    
    if (dbReady) {
      await mongoose.connection.db.admin().ping();
      return res.status(200).json({ ready: true });
    }
    
    res.status(503).json({ ready: false, reason: 'Database not connected' });
  } catch (error) {
    res.status(503).json({ ready: false, reason: error.message });
  }
});

/**
 * GET /api/health/liveness
 * Kubernetes liveness probe
 */
router.get('/liveness', (req, res) => {
  res.status(200).json({ alive: true });
});

export default router;