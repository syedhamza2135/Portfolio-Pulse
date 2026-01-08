import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import riskScoringService from '../services/riskScoringService.js';
import { getUserId } from '../utils/authHelpers.js';
import Portfolio from '../models/portfolio.js';

const router = Router();

/**
 * GET /api/risk/portfolio/:portfolioId
 * Gets risk metrics for a specific portfolio
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

    // Get risk metrics
    const riskMetrics = await riskScoringService.getPortfolioRiskMetrics(portfolioId);

    if (!riskMetrics) {
      return res.json({
        portfolioId,
        message: 'Risk metrics not yet calculated. They will be available after the next daily update.',
        nextUpdate: 'Daily at 6:00 PM ET'
      });
    }

    res.json(riskMetrics);

  } catch (error) {
    console.error('Error fetching risk metrics:', error);
    res.status(500).json({ error: 'Failed to fetch risk metrics' });
  }
});

/**
 * POST /api/risk/portfolio/:portfolioId/calculate
 * Manually triggers risk calculation for a portfolio
 */
router.post('/portfolio/:portfolioId/calculate', requireAuth, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const userId = getUserId(req);

    // Verify portfolio ownership
    const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Calculate risk
    const riskMetrics = await riskScoringService.calculatePortfolioRisk(portfolioId);

    if (!riskMetrics) {
      return res.json({
        portfolioId,
        message: 'Portfolio has no holdings. Add holdings to calculate risk.',
        overallScore: null
      });
    }

    res.json({
      ...riskMetrics.toObject(),
      message: 'Risk calculation complete'
    });

  } catch (error) {
    console.error('Error calculating risk:', error);
    res.status(500).json({ error: 'Failed to calculate risk' });
  }
});

/**
 * POST /api/risk/portfolio/:portfolioId/simulate
 * Simulates risk impact of adding/removing holdings
 */
router.post('/portfolio/:portfolioId/simulate', requireAuth, async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { holdings } = req.body;
    const userId = getUserId(req);

    // Verify portfolio ownership
    const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return res.status(400).json({ 
        error: 'Request body must contain "holdings" array' 
      });
    }

    // Validate holding structure
    for (const h of holdings) {
      if (!h.ticker || !h.quantity || !h.averageCost || !h.assetType) {
        return res.status(400).json({
          error: 'Each holding must have: ticker, quantity, averageCost, assetType'
        });
      }
    }

    // Simulate risk change
    const simulatedRisk = await riskScoringService.simulateRiskChange(
      portfolioId,
      holdings
    );

    // Get current risk for comparison
    const currentRisk = await riskScoringService.getPortfolioRiskMetrics(portfolioId);

    res.json({
      current: currentRisk ? {
        overallScore: currentRisk.overallScore,
        components: currentRisk.components
      } : null,
      simulated: simulatedRisk,
      change: currentRisk ? {
        overallScore: (simulatedRisk.overallScore - currentRisk.overallScore).toFixed(2),
        volatility: (simulatedRisk.components.volatility - currentRisk.components.volatility).toFixed(2),
        concentration: (simulatedRisk.components.concentration - currentRisk.components.concentration).toFixed(2),
        sectorExposure: (simulatedRisk.components.sectorExposure - currentRisk.components.sectorExposure).toFixed(2)
      } : null
    });

  } catch (error) {
    console.error('Error simulating risk:', error);
    res.status(500).json({ error: 'Risk simulation failed' });
  }
});

export default router;