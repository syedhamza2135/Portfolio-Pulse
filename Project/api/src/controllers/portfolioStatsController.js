/**
 * Portfolio Statistics Controller
 * 
 * Provides aggregated statistics and analytics for portfolios:
 * - Aggregated stats across all user portfolios
 * - Detailed stats for individual portfolios
 * - Top gainers/losers
 * - Asset type breakdown
 * 
 * @module controllers/portfolioStatsController
 * @requires models/portfolio
 * @requires models/holdings
 */

import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';
import { getUserId } from '../utils/authHelpers.js';

/**
 * Retrieves aggregated statistics for all user portfolios
 * 
 * Calculates:
 * - Total portfolios and holdings count
 * - Total investment vs current value
 * - Overall profit/loss (absolute and percentage)
 * - Number of portfolios with holdings
 * 
 * @async
 * @function getPortfolioStats
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Aggregated statistics
 * @returns {number} res.body.totalPortfolios - Total number of portfolios
 * @returns {number} res.body.totalHoldings - Total number of holdings
 * @returns {number} res.body.totalInvestment - Total initial investment
 * @returns {number} res.body.currentValue - Current total value
 * @returns {number} res.body.totalProfitLoss - Total profit/loss amount
 * @returns {number} res.body.totalProfitLossPercent - Total profit/loss percentage
 * @returns {number} res.body.portfoliosWithHoldings - Number of portfolios with holdings
 * @returns {Date} res.body.lastUpdated - Timestamp of calculation
 * 
 * @throws {500} If calculation fails
 */
export async function getPortfolioStats(req, res) {
    try {
        const userId = getUserId(req);
        
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
        
        const portfolioIds = portfolios.map(p => p._id);
        const allHoldings = await Holding.find({ portfolioId: { $in: portfolioIds } });
        
        let totalInvestment = 0;
        let currentValue = 0;
        let portfoliosWithHoldings = 0;
        
        const portfolioMap = new Map();
        
        allHoldings.forEach(holding => {
            const portfolioId = holding.portfolioId.toString();
            if (!portfolioMap.has(portfolioId)) {
                portfolioMap.set(portfolioId, []);
            }
            portfolioMap.get(portfolioId).push(holding);
        });
        
        portfoliosWithHoldings = portfolioMap.size;
        
        allHoldings.forEach(holding => {
            const cost = holding.quantity * holding.averageCost;
            totalInvestment += cost;
            
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
 * Retrieves detailed statistics for a specific portfolio
 * 
 * Calculates:
 * - Portfolio value metrics (investment, current value, profit/loss)
 * - Top 5 gainers and losers
 * - Asset type breakdown (stocks, crypto, ETF percentages)
 * 
 * Security: Verifies user owns the portfolio before returning stats.
 * 
 * @async
 * @function getPortfolioDetailedStats
 * @param {Object} req - Express request object
 * @param {string} req.params.id - Portfolio ID
 * @param {Object} res - Express response object
 * 
 * @returns {Object} 200 - Detailed portfolio statistics
 * @returns {string} res.body.portfolioId - Portfolio ID
 * @returns {string} res.body.portfolioName - Portfolio name
 * @returns {number} res.body.totalHoldings - Number of holdings
 * @returns {number} res.body.totalInvestment - Total initial investment
 * @returns {number} res.body.currentValue - Current total value
 * @returns {number} res.body.totalProfitLoss - Total profit/loss
 * @returns {number} res.body.totalProfitLossPercent - Profit/loss percentage
 * @returns {Array} res.body.topGainers - Top 5 holdings by profit
 * @returns {Array} res.body.topLosers - Bottom 5 holdings by profit
 * @returns {Object} res.body.assetTypeBreakdown - Breakdown by asset type
 * @returns {Date} res.body.lastUpdated - Timestamp of calculation
 * 
 * @throws {400} If portfolio ID is invalid
 * @throws {404} If portfolio not found or user doesn't own it
 * @throws {500} If calculation fails
 */
export async function getPortfolioDetailedStats(req, res) {
    try {
        const userId = getUserId(req);
        const portfolioId = req.params.id;
        
        const portfolio = await Portfolio.findOne({ _id: portfolioId, userId });
        if (!portfolio) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }
        
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
        
        Object.keys(assetTypeBreakdown).forEach(type => {
            assetTypeBreakdown[type].percentage = currentValue > 0
                ? (assetTypeBreakdown[type].totalValue / currentValue) * 100
                : 0;
            assetTypeBreakdown[type].percentage = Math.round(assetTypeBreakdown[type].percentage * 100) / 100;
            assetTypeBreakdown[type].totalValue = Math.round(assetTypeBreakdown[type].totalValue * 100) / 100;
        });
        
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
        if (err.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid portfolio ID format' });
        }
        console.error('Error fetching portfolio detailed stats:', err);
        return res.status(500).json({ error: 'Failed to fetch portfolio stats' });
    }
}