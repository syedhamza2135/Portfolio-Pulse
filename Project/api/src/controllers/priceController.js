/**
 * Price Controller
 * 
 * Handles price-related operations:
 * - Refreshing individual holding prices
 * - Refreshing all prices in a portfolio
 * - Fetching current market price for a ticker
 * 
 * Security: All portfolio/holding operations verify user ownership.
 * 
 * @module controllers/priceController
 * @requires services/priceUpdateService
 * @requires services/priceFetcherService
 */

import priceUpdateService from '../services/priceUpdateService.js';
import priceFetcher from '../services/priceFetcherService.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import { getUserId } from '../utils/authHelpers.js';

/**
 * Helper Functions
 */

/**
 * Verifies that a portfolio belongs to the specified user
 * 
 * @async
 * @function verifyPortfolioOwnership
 * @param {string} portfolioId - Portfolio ID to verify
 * @param {string} userId - User ID to check ownership against
 * 
 * @returns {Promise<Object>} Portfolio document if ownership is verified
 * @throws {Error} If portfolio not found or user doesn't own it (statusCode: 403)
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
 * Controllers
 */

/**
 * Refreshes the current price for a specific holding
 * 
 * Process:
 * 1. Verifies user owns the holding
 * 2. Fetches latest price from external API
 * 3. Updates holding with new price
 * 4. Recalculates portfolio value
 * 
 * @async
 * @function refreshHoldingPrice
 * @param {Object} req - Express request object
 * @param {string} req.params.id - Holding ID to refresh
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Updated holding price information
 * @throws {403} If user doesn't own the holding
 * @throws {404} If holding not found
 * @throws {500} If price fetch or update fails
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

/**
 * Refreshes prices for all holdings in a portfolio
 * 
 * Process:
 * 1. Verifies user owns the portfolio
 * 2. Fetches latest prices for all holdings (batch operation)
 * 3. Updates all holdings with new prices
 * 4. Recalculates portfolio value
 * 
 * More efficient than refreshing individual holdings one by one.
 * 
 * @async
 * @function refreshPortfolioPrices
 * @param {Object} req - Express request object
 * @param {string} req.params.id - Portfolio ID to refresh
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Update results with counts
 * @throws {403} If user doesn't own the portfolio
 * @throws {500} If price update fails
 */
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

/**
 * Fetches current market price for a ticker symbol
 * 
 * This is a public endpoint (rate-limited but no authentication required).
 * Supports both stocks and cryptocurrencies.
 * 
 * Process:
 * 1. Validates ticker is provided
 * 2. Normalizes ticker (uppercase, trimmed)
 * 3. Fetches price from appropriate API (Alpha Vantage for stocks, CoinGecko for crypto)
 * 4. Returns price with metadata
 * 
 * @async
 * @function getTickerPrice
 * @param {Object} req - Express request object
 * @param {string} req.params.ticker - Ticker symbol (e.g., 'AAPL', 'BTC')
 * @param {string} [req.query.assetType='stock'] - Asset type: 'stock', 'crypto', or 'etf'
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Price information
 * @returns {string} res.body.ticker - Normalized ticker symbol
 * @returns {number} res.body.price - Current market price
 * @returns {string} res.body.assetType - Asset type
 * @returns {Date} res.body.timestamp - When price was fetched
 * 
 * @throws {400} If ticker is missing
 * @throws {404} If ticker price not found
 * @throws {500} If price fetch fails
 */
export async function getTickerPrice(req, res) {
  try {
    const { ticker } = req.params;
    const assetType = req.query.assetType || 'stock';
    
    // Validate ticker is provided
    if (!ticker) return res.status(400).json({ error: 'Ticker is required' });

    // Normalize ticker (uppercase, trimmed)
    const cleanTicker = ticker.trim().toUpperCase();
    
    // Fetch price from appropriate API
    // Uses caching to avoid unnecessary API calls
    const price = await priceFetcher.fetchPrice(cleanTicker, assetType);

    return res.json({
      ticker: cleanTicker,
      price,
      assetType,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error fetching ticker price:', err);

    // Handle price not found errors
    if (err.message.toLowerCase().includes('not found')) {
      return res.status(404).json({ error: `Ticker price not found` });
    }

    // Generic error for other failures
    res.status(500).json({ error: 'Failed to fetch market price' });
  }
}