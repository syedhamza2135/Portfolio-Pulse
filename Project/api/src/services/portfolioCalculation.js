import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';

/**
 * Recalculate and update portfolio totalValue and dailyChange
 * @param {string} portfolioId - Portfolio ID to recalculate
 * @returns {Promise<Object>} Updated portfolio values
 */
export async function recalculatePortfolioValues(portfolioId) {
    try {
        // Get all holdings for this portfolio
        const holdings = await Holding.find({ portfolioId });
        
        let totalInvestment = 0;
        let currentValue = 0;
        
        // Calculate totals from all holdings
        holdings.forEach(holding => {
            const cost = holding.quantity * holding.averageCost;
            totalInvestment += cost;
            
            // Use current price if available, otherwise use average cost
            const value = holding.currentPrice > 0
                ? holding.quantity * holding.currentPrice
                : cost;
            currentValue += value;
        });
        
        // Calculate daily change (which is really total P/L)
        const dailyChange = currentValue - totalInvestment;
        
        // Update portfolio
        const updatedPortfolio = await Portfolio.findByIdAndUpdate(
            portfolioId,
            {
                totalValue: Math.round(currentValue * 100) / 100,
                dailyChange: Math.round(dailyChange * 100) / 100,
                lastUpdated: new Date()
            },
            { new: true }
        );
        
        if (!updatedPortfolio) {
            throw new Error('Portfolio not found during recalculation');
        }
        
        return {
            totalValue: updatedPortfolio.totalValue,
            dailyChange: updatedPortfolio.dailyChange,
            totalInvestment: Math.round(totalInvestment * 100) / 100,
            holdingCount: holdings.length
        };
        
    } catch (error) {
        console.error('Error recalculating portfolio values:', error);
        throw error;
    }
}

/**
 * Recalculate values for all portfolios belonging to a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of updated portfolio values
 */
export async function recalculateAllUserPortfolios(userId) {
    try {
        const portfolios = await Portfolio.find({ userId });
        
        const results = await Promise.all(
            portfolios.map(portfolio => 
                recalculatePortfolioValues(portfolio._id)
            )
        );
        
        return results;
        
    } catch (error) {
        console.error('Error recalculating all user portfolios:', error);
        throw error;
    }
}

/**
 * Get portfolio value summary without updating database
 * @param {string} portfolioId - Portfolio ID
 * @returns {Promise<Object>} Portfolio value summary
 */
export async function getPortfolioValueSummary(portfolioId) {
    try {
        const holdings = await Holding.find({ portfolioId });
        
        let totalInvestment = 0;
        let currentValue = 0;
        let holdingsWithCurrentPrice = 0;
        
        holdings.forEach(holding => {
            const cost = holding.quantity * holding.averageCost;
            totalInvestment += cost;
            
            if (holding.currentPrice > 0) {
                holdingsWithCurrentPrice++;
                currentValue += holding.quantity * holding.currentPrice;
            } else {
                currentValue += cost;
            }
        });
        
        const profitLoss = currentValue - totalInvestment;
        const profitLossPercent = totalInvestment > 0
            ? (profitLoss / totalInvestment) * 100
            : 0;
        
        return {
            totalInvestment: Math.round(totalInvestment * 100) / 100,
            currentValue: Math.round(currentValue * 100) / 100,
            profitLoss: Math.round(profitLoss * 100) / 100,
            profitLossPercent: Math.round(profitLossPercent * 100) / 100,
            totalHoldings: holdings.length,
            holdingsWithCurrentPrice,
            needsPriceUpdate: holdingsWithCurrentPrice < holdings.length
        };
        
    } catch (error) {
        console.error('Error getting portfolio value summary:', error);
        throw error;
    }
}