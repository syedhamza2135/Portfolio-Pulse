import priceUpdateService from '../services/priceUpdateService.js';
import priceFetcher from '../services/priceFetcherService.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import { getUserId } from '../utils/authHelpers.js';

/**
 * HELPER FUNCTIONS
 */

async function verifyPortfolioOwnership(portfolioId, userId) {
  const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
  if (!portfolio) {
    const error = new Error('Portfolio not found or access denied');
    error.statusCode = 403; 
    throw error;
  }
  return portfolio;
}

async function verifyHoldingOwnership(holdingId, userId) {
  const holding = await Holding.findById(holdingId);
  if (!holding) {
    const error = new Error('Holding not found');
    error.statusCode = 404;
    throw error;
  }

  const portfolio = await Portfolio.findOne({ _id: holding.portfolioId, userId });
  if (!portfolio) {
    const error = new Error('Access denied to this holding');
    error.statusCode = 403;
    throw error;
  }

  return { holding, portfolio };
}

/**
 * CONTROLLERS
 */

export async function refreshHoldingPrice(req, res) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    await verifyHoldingOwnership(id, userId);

    const updated = await priceUpdateService.updateHoldingPrice(id);

    return res.json({
      ticker: updated.ticker,
      currentPrice: updated.currentPrice,
      lastPriceUpdate: updated.lastPriceUpdate,
      message: 'Price updated successfully'
    });
  } catch (err) {
    console.error('Error refreshing price:', err);
    
    const status = err.statusCode || 500;
    const message = err.message.includes('Price not found') 
      ? 'Price data not available for this ticker' 
      : err.message;

    res.status(status).json({ error: message });
  }
}

export async function refreshPortfolioPrices(req, res) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    await verifyPortfolioOwnership(id, userId);

    const result = await priceUpdateService.updatePortfolioPrices(id);

    return res.json({
      message: 'Portfolio prices updated successfully',
      ...result
    });
  } catch (err) {
    console.error('Error refreshing portfolio prices:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to refresh prices' });
  }
}

export async function getTickerPrice(req, res) {
  try {
    const { ticker } = req.params;
    const assetType = req.query.assetType || 'stock';
    
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });

    const cleanTicker = ticker.trim().toUpperCase();
    const price = await priceFetcher.fetchPrice(cleanTicker, assetType);

    return res.json({
      ticker: cleanTicker,
      price,
      assetType,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error fetching ticker price:', err);

    if (err.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: `Ticker price not found` });
    }

    res.status(500).json({ error: 'Failed to fetch market price' });
  }
}