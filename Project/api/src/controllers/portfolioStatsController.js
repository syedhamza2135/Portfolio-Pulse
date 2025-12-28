import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';

// Helper function for consistent user ID extraction
const getUserId = (req) => {
    const userId = req.user.sub || req.user._id || req.user.id;
    if (!userId) {
        throw new Error('User ID not found in token');
    }
    return userId.toString ? userId.toString() : userId;
};

/**
 * Get comprehensive statistics for all user's portfolios
 * GET /api/portfolios/stats
 */
export async function getPortfolioStats(req, res) {
    try {
        const userId = getUserId(req);
        
        // Get all portfolios for the user
        const portfolios = await Portfolio.find({ userId });
        
        if (portfolios.length === 0) {
            return res.json({
                totalPortfolios: 0,
                totalHoldings: 0,
                totalInvestment: 0,
                currentValue: 0,
                totalProfitLoss: 0,
                totalProfitLossPercent: 0,
                portfoliosWithHoldings: 0,
                lastUpdated: new Date()
            });
        }
        
        // Get all holdings for all portfolios
        const portfolioIds = portfolios.map(p => p._id);
        const allHoldings = await Holding.find({ portfolioId: { $in: portfolioIds } });
        
        // Calculate statistics
        let totalInvestment = 0;
        let currentValue = 0;
        let portfoliosWithHoldings = 0;
        
        const portfolioMap = new Map();
        
        // Group holdings by portfolio
        allHoldings.forEach(holding => {
            const portfolioId = holding.portfolioId.toString();
            if (!portfolioMap.has(portfolioId)) {
                portfolioMap.set(portfolioId, []);
            }
            portfolioMap.get(portfolioId).push(holding);
        });
        
        // Count portfolios with at least one holding
        portfoliosWithHoldings = portfolioMap.size;
        
        // Calculate totals
        allHoldings.forEach(holding => {
            const cost = holding.quantity * holding.averageCost;
            totalInvestment += cost;
            
            // Use current price if available, otherwise use average cost
            const value = holding.currentPrice > 0
                ? holding.quantity * holding.currentPrice
                : cost;
            currentValue += value;
        });
        
        const totalProfitLoss = currentValue - totalInvestment;
        const totalProfitLossPercent = totalInvestment > 0
            ? (totalProfitLoss / totalInvestment) * 100
            : 0;
        
        res.json({
            totalPortfolios: portfolios.length,
            totalHoldings: allHoldings.length,
            totalInvestment: Math.round(totalInvestment * 100) / 100,
            currentValue: Math.round(currentValue * 100) / 100,
            totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
            totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
            portfoliosWithHoldings,
            lastUpdated: new Date()
        });
        
    } catch (err) {
        console.error('Error fetching portfolio stats:', err);
        res.status(500).json({ error: 'Failed to fetch portfolio statistics' });
    }
}

/**
 * Get detailed statistics for a specific portfolio
 * GET /api/portfolios/:id/stats
 */
export async function getPortfolioDetailedStats(req, res) {
    try {
        const userId = getUserId(req);
        const portfolioId = req.params.id;
        
        // Verify portfolio ownership
        const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
        if (!portfolio) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        // Get all holdings for this portfolio
        const holdings = await Holding.find({ portfolioId });
        
        if (holdings.length === 0) {
            return res.json({
                portfolioId,
                portfolioName: portfolio.name,
                totalHoldings: 0,
                totalInvestment: 0,
                currentValue: 0,
                totalProfitLoss: 0,
                totalProfitLossPercent: 0,
                topGainers: [],
                topLosers: [],
                assetTypeBreakdown: {},
                lastUpdated: new Date()
            });
        }
        
        // Calculate statistics
        let totalInvestment = 0;
        let currentValue = 0;
        const holdingStats = [];
        const assetTypeBreakdown = {};
        
        holdings.forEach(holding => {
            const cost = holding.quantity * holding.averageCost;
            const value = holding.currentPrice > 0
                ? holding.quantity * holding.currentPrice
                : cost;
            const profitLoss = value - cost;
            const profitLossPercent = cost > 0 ? (profitLoss / cost) * 100 : 0;
            
            totalInvestment += cost;
            currentValue += value;
            
            holdingStats.push({
                ticker: holding.ticker,
                profitLoss,
                profitLossPercent,
                value
            });
            
            // Asset type breakdown
            const assetType = holding.assetType || 'unknown';
            if (!assetTypeBreakdown[assetType]) {
                assetTypeBreakdown[assetType] = {
                    count: 0,
                    totalValue: 0,
                    percentage: 0
                };
            }
            assetTypeBreakdown[assetType].count++;
            assetTypeBreakdown[assetType].totalValue += value;
        });
        
        // Calculate asset type percentages
        Object.keys(assetTypeBreakdown).forEach(type => {
            assetTypeBreakdown[type].percentage = currentValue > 0
                ? (assetTypeBreakdown[type].totalValue / currentValue) * 100
                : 0;
            assetTypeBreakdown[type].percentage = Math.round(assetTypeBreakdown[type].percentage * 100) / 100;
            assetTypeBreakdown[type].totalValue = Math.round(assetTypeBreakdown[type].totalValue * 100) / 100;
        });
        
        // Sort by profit/loss
        holdingStats.sort((a, b) => b.profitLoss - a.profitLoss);
        
        const totalProfitLoss = currentValue - totalInvestment;
        const totalProfitLossPercent = totalInvestment > 0
            ? (totalProfitLoss / totalInvestment) * 100
            : 0;
        
        res.json({
            portfolioId,
            portfolioName: portfolio.name,
            totalHoldings: holdings.length,
            totalInvestment: Math.round(totalInvestment * 100) / 100,
            currentValue: Math.round(currentValue * 100) / 100,
            totalProfitLoss: Math.round(totalProfitLoss * 100) / 100,
            totalProfitLossPercent: Math.round(totalProfitLossPercent * 100) / 100,
            topGainers: holdingStats.slice(0, 5),
            topLosers: holdingStats.slice(-5).reverse(),
            assetTypeBreakdown,
            lastUpdated: new Date()
        });
        
    } catch (err) {
        console.error('Error fetching portfolio detailed stats:', err);
        
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid portfolio ID format' });
        }
        
        res.status(500).json({ error: 'Failed to fetch portfolio statistics' });
    }
}