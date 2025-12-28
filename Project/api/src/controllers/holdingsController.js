import { createHoldingSchema, updateHoldingSchema } from '../validation/holding.js';
import Holding from '../models/holdings.js';
import Portfolio from '../models/portfolio.js';
import { recalculatePortfolioValues } from '../services/portfolioCalculation.js';

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

export async function getHoldings(req, res) {
  try {
    const { portfolioId } = req.query;
    
    if (!portfolioId) {
      return res.status(400).json({ error: 'portfolioId query parameter is required' });
    }

    // Verify portfolio ownership
    await verifyPortfolioOwnership(portfolioId, req.user.sub);

    // Fetch holdings
    const holdings = await Holding.find({ portfolioId }).sort({ createdAt: 1 });
    
    res.json(holdings);
  } catch (err) {
    console.error('Error fetching holdings:', err);
    
    if (err.message === 'Portfolio not found or access denied') {
      return res.status(404).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
}

export async function getHoldingbyID(req, res) {
  try {
    const { holding } = await verifyHoldingOwnership(req.params.id, req.user.sub);
    res.json(holding);
  } catch (err) {
    console.error('Error fetching holding:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid holding ID format' });
    }
    
    if (err.message === 'Holding not found') {
      return res.status(404).json({ error: err.message });
    }
    
    if (err.message === 'Access denied') {
      return res.status(403).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to fetch holding' });
  }
}

export async function createHolding(req, res) {
  try {
    // Validate request body
    const { error, value } = createHoldingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Verify portfolio ownership
    await verifyPortfolioOwnership(value.portfolioId, req.user.sub);

    // Check if holding already exists
    const existingHolding = await Holding.findOne({
      portfolioId: value.portfolioId,
      ticker: value.ticker.toUpperCase()
    });

    if (existingHolding) {
      return res.status(409).json({ 
        error: 'A holding with this ticker already exists in this portfolio' 
      });
    }

    // Create holding
    const holding = await Holding.create(value);
    
    // Recalculate portfolio values
    try {
      await recalculatePortfolioValues(value.portfolioId);
    } catch (calcError) {
      console.error('Error recalculating portfolio after creating holding:', calcError);
      // Don't fail the request, just log the error
    }
    
    res.status(201).json(holding);
  } catch (err) {
    console.error('Error creating holding:', err);
    
    if (err.message === 'Portfolio not found or access denied') {
      return res.status(404).json({ error: err.message });
    }
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to create holding' });
  }
}

export async function updateHolding(req, res) {
  try {
    // Validate request body
    const { error, value } = updateHoldingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Verify ownership
    const { holding } = await verifyHoldingOwnership(req.params.id, req.user.sub);

    // Update holding
    Object.assign(holding, value);
    holding.updatedAt = new Date();
    
    // If currentPrice was updated, update lastPriceUpdate
    if (value.currentPrice !== undefined) {
      holding.lastPriceUpdate = new Date();
    }
    
    await holding.save();
    
    // Recalculate portfolio values
    try {
      await recalculatePortfolioValues(holding.portfolioId);
    } catch (calcError) {
      console.error('Error recalculating portfolio after updating holding:', calcError);
      // Don't fail the request, just log the error
    }
    
    res.json(holding);
  } catch (err) {
    console.error('Error updating holding:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid holding ID format' });
    }
    
    if (err.message === 'Holding not found') {
      return res.status(404).json({ error: err.message });
    }
    
    if (err.message === 'Access denied') {
      return res.status(403).json({ error: err.message });
    }
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to update holding' });
  }
}

export async function deleteHolding(req, res) {
  try {
    // Verify ownership
    const { holding } = await verifyHoldingOwnership(req.params.id, req.user.sub);
    
    const portfolioId = holding.portfolioId;

    // Delete holding
    await holding.deleteOne();
    
    // Recalculate portfolio values
    try {
      await recalculatePortfolioValues(portfolioId);
    } catch (calcError) {
      console.error('Error recalculating portfolio after deleting holding:', calcError);
      // Don't fail the request, just log the error
    }
    
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting holding:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid holding ID format' });
    }
    
    if (err.message === 'Holding not found') {
      return res.status(404).json({ error: err.message });
    }
    
    if (err.message === 'Access denied') {
      return res.status(403).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to delete holding' });
  }
}