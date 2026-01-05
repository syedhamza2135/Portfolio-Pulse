import mongoose from 'mongoose';
import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import { createPortfolioSchema, updatePortfolioSchema } from '../validation/portfolio.js';
import { getUserId } from '../utils/authHelpers.js';


export async function getPortfolios(req, res) {
  try {
    const userId = getUserId(req);
    const portfolios = await Portfolio.find({ userId })
      .sort({ createdAt: 1 })
      .lean();
    
    res.json(portfolios);
  } catch (err) {
    console.error('Error fetching portfolios:', err);
    res.status(500).json({ error: 'Failed to fetch portfolios' });
  }
}


export async function getPortfoliobyID(req, res) {
  try {
    const userId = getUserId(req);
    
    const portfolio = await Portfolio.findOne({ 
      _id: req.params.id, 
      userId 
    }).lean();

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    const holdings = await Holding.find({ portfolioId: portfolio._id })
      .sort({ createdAt: 1 })
      .lean();
    
    portfolio.holdings = holdings;
    
    res.json(portfolio);
  } catch (err) {
    console.error('Error fetching portfolio:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid portfolio ID format' });
    }
    
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
}


export async function createPortfolio(req, res) {
  try {
    const { error, value } = createPortfolioSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const userId = getUserId(req);
    const portfolio = await Portfolio.create({ 
      userId, 
      ...value 
    });
    
    res.status(201).json(portfolio);
  } catch (err) {
    console.error('Error creating portfolio:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to create portfolio' });
  }
}


export async function updatePortfolio(req, res) {
  try {
    const { error, value } = updatePortfolioSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    const userId = getUserId(req);
    const portfolio = await Portfolio.findOneAndUpdate(
      { _id: req.params.id, userId },
      { ...value, lastUpdated: new Date() },
      { new: true, runValidators: true }
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json(portfolio);
  } catch (err) {
    console.error('Error updating portfolio:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid portfolio ID format' });
    }
    
    res.status(500).json({ error: 'Failed to update portfolio' });
  }
}

export async function deletePortfolio(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const userId = getUserId(req);
    
    const portfolio = await Portfolio.findOneAndDelete(
      { _id: req.params.id, userId },
      { session }
    );

    if (!portfolio) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    await Holding.deleteMany(
      { portfolioId: portfolio._id },
      { session }
    );
    
    await session.commitTransaction();
    res.status(204).send();
    
  } catch (err) {
    await session.abortTransaction();
    console.error('Error deleting portfolio:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid portfolio ID format' });
    }
    
    res.status(500).json({ error: 'Failed to delete portfolio' });
  } finally {
    session.endSession();
  }
}