import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import sentimentAnalysisService from '../services/sentimentAnalysisService.js';
import { getUserId } from '../utils/authHelpers.js';
import Holding from '../models/holdings.js';
import Portfolio from '../models/portfolio.js';

const router = Router();

/**
 * GET /api/sentiment/:ticker
 * Gets sentiment analysis for a specific ticker
 */
router.get('/:ticker', requireAuth, async (req, res) => {
  try {
    const { ticker } = req.params;
    const { forceRefresh } = req.query;

    const sentiment = await sentimentAnalysisService.analyzeTicker(
      ticker,
      forceRefresh === 'true'
    );

    res.json(sentiment);

  } catch (error) {
    console.error('Error fetching sentiment:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sentiment analysis',
      ticker: req.params.ticker
    });
  }
});

/**
 * GET /api/sentiment/portfolio/:portfolioId
 * Gets sentiment analysis for all holdings in a portfolio
 */
router.get('/portfolio/:portfolioId', requireAuth, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = getUserId(req);

    // Verify portfolio ownership
    const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Get all holdings
    const holdings = await Holding.find({ portfolioId })
      .select('ticker')
      .lean();

    if (holdings.length === 0) {
      return res.json({ 
        portfolioId, 
        sentiments: [], 
        message: 'No holdings in portfolio' 
      });
    }

    // Batch analyze sentiment
    const tickers = holdings.map(h => h.ticker);
    const { results } = await sentimentAnalysisService.analyzeBatchTickers(tickers);

    res.json({
      portfolioId,
      sentiments: results,
      count: Object.keys(results).length
    });

  } catch (error) {
    console.error('Error fetching portfolio sentiment:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio sentiment' });
  }
});

/**
 * POST /api/sentiment/analyze
 * Manually trigger sentiment analysis for specific tickers
 */
router.post('/analyze', requireAuth, async (req, res) => {
  try {
    const { tickers } = req.body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ 
        error: 'Request body must contain "tickers" array' 
      });
    }

    if (tickers.length > 20) {
      return res.status(400).json({ 
        error: 'Maximum 20 tickers per request' 
      });
    }

    const { results, processed, failed } = await sentimentAnalysisService.analyzeBatchTickers(tickers);

    res.json({
      results,
      summary: {
        requested: tickers.length,
        processed,
        failed
      }
    });

  } catch (error) {
    console.error('Error in manual sentiment analysis:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

/**
 * GET /api/sentiment/status
 * Gets sentiment service health status
 */
router.get('/service/status', requireAuth, async (req, res) => {
  try {
    const serviceStatus = sentimentAnalysisService.getServiceStatus();
    const pythonHealthy = await sentimentAnalysisService.checkPythonServiceHealth();

    res.json({
      ...serviceStatus,
      pythonServiceHealthy: pythonHealthy,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error checking service status:', error);
    res.status(500).json({ error: 'Failed to check service status' });
  }
});

export default router;