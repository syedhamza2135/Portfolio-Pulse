import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import { createPortfolioSchema, updatePortfolioSchema } from '../validation/portfolio.js';

const getUserId = (req) => {
    const userId = req.user.sub || req.user._id || req.user.id;
    if (!userId) {
        throw new Error('User ID not found in token');
    }
    return userId.toString ? userId.toString() : userId;
};

export async function getPortfolios (req, res){
    try {
        const userId = getUserId(req);
        const portfolios = await Portfolio.find({ userId }).sort({ createdAt: 1 });
        res.json(portfolios);
    } catch (err) {
        console.error('Error fetching portfolios:', err);
        res.status(500).json({ error: 'Failed to fetch portfolios' });
    }
}

export async function getPortfoliobyID(req, res){
    try {
        const userId = getUserId(req);
        const portfolio = await Portfolio.findOne({ 
            _id: req.params.id, 
            userId 
        });

        if (!portfolio) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        // Populate holdings for the portfolio
        const holdings = await Holding.find({ portfolioId: portfolio._id })
            .sort({ createdAt: 1 });
        
        const portfolioWithHoldings = portfolio.toObject();
        portfolioWithHoldings.holdings = holdings;
        
        res.json(portfolioWithHoldings);
    } catch (err) {
        console.error('Error fetching portfolio:', err);
        
        // Handle invalid ObjectId format
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid portfolio ID format' });
        }
        
        res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
}

export async function createPortfolio(req, res){
    try {
        // Validate request body
        const { error, value } = createPortfolioSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.message });
        }

        const userId = getUserId(req);
        const portfolio = await Portfolio.create({ userId, ...value });
        
        res.status(201).json(portfolio);
    } catch (err) {
        console.error('Error creating portfolio:', err);
        
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        
        // Handle duplicate key errors (if you have unique constraints)
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Portfolio with this name already exists' });
        }
        
        res.status(500).json({ error: 'Failed to create portfolio' });
    }
}

export async function updatePortfolio(req, res){
    try {
        // Validate request body
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

export async function deletePortfolio(req, res){
    try {
        const userId = getUserId(req);
        
        const portfolio = await Portfolio.findOne({ 
            _id: req.params.id, 
            userId 
        });

        if (!portfolio) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }

        // Delete associated holdings first
        await Holding.deleteMany({ portfolioId: portfolio._id });
        
        // Then delete the portfolio
        await Portfolio.findByIdAndDelete(portfolio._id);
        
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting portfolio:', err);
        
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid portfolio ID format' });
        }
        
        res.status(500).json({ error: 'Failed to delete portfolio' });
    }
}