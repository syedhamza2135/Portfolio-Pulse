import priceUpdateService from '../services/priceUpdateService.js';
import priceFetcher from '../services/priceFetcherService.js';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';

// Helper function to verify portfolio ownership
async function verifyPortfolioOwnership(portfolioId, userId) {
  const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
  if (!portfolio) {
    throw new Error('Portfolio not found or access denied');
  }
  return portfolio;
}

// Helper function to verify holding ownership through portfolio
async function verifyHoldingOwnership(holdingId, userId) {
  const holding = await Holding.findById(holdingId);
  if (!holding) {
    throw new Error('Holding not found');
  }
  
  const portfolio = await Portfolio.findOne({ _id: holding.portfolioId, userId });
  if (!portfolio) {
    throw new Error('Access denied');
  }
  
  return { holding, portfolio };
}

// Helper function for consistent user ID extraction
const getUserId = (req) => {
  const userId = req.user.sub || req.user._id || req.user.id;
  if (!userId) {
    throw new Error('User ID not found in token');
  }
  return userId.toString ? userId.toString() : userId;
};

export async function refreshHoldingPrice(req, res) {
  try {
    const { id } = req.params;
    
    // Verify ownership through holding
    const { holding } = await verifyHoldingOwnership(id, req.user.sub);
    
    // Update price
    const updated = await priceUpdateService.updateHoldingPrice(id);
    
    res.json({
      ticker: updated.ticker,
      currentPrice: updated.currentPrice,
      lastPriceUpdate: updated.lastPriceUpdate,
      message: 'Price updated successfully'
    });
  } catch (err) {
    console.error('Error refreshing price:', err);
    
    if (err.message === 'Holding not found') {
      return res.status(404).json({ error: err.message });
    }
    
    if (err.message.includes('Price not found')) {
      return res.status(404).json({ error: 'Price data not available for this ticker' });
    }
    
    res.status(500).json({ error: 'Failed to refresh price' });
  }
}

export async function refreshPortfolioPrices(req, res) {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    
    // Verify portfolio ownership
    const portfolio = await Portfolio.findOne({ _id: id, userId });
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    // Update all prices
    const result = await priceUpdateService.updatePortfolioPrices(id);
    
    res.json({
      message: 'Prices updated',
      ...result
    });
  } catch (err) {
    console.error('Error refreshing portfolio prices:', err);
    res.status(500).json({ error: 'Failed to refresh prices' });
  }
}

export async function getTickerPrice(req, res) {
  try {
    const { ticker } = req.params;
    const assetType = req.query.assetType || 'stock';
    
    const price = await priceFetcher.fetchPrice(
      ticker.toUpperCase(), 
      assetType
    );
    
    res.json({
      ticker: ticker.toUpperCase(),
      price,
      assetType,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error fetching ticker price:', err);
    
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'Ticker not found' });
    }
    
    res.status(500).json({ error: 'Failed to fetch price' });
  }
}