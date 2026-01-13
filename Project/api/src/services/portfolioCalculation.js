/**
 * Portfolio Calculation Service
 * 
 * Provides utilities for calculating portfolio values and statistics.
 * 
 * Functions:
 * - recalculatePortfolioValues: Updates portfolio total value and daily change
 * - recalculateAllUserPortfolios: Recalculates all portfolios for a user
 * - getPortfolioValueSummary: Gets portfolio value summary without updating
 * 
 * @module services/portfolioCalculation
 * @requires models/portfolio
 * @requires models/holdings
 */

import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';

/**
 * Recalculates and updates portfolio total value and daily change
 * 
 * Process:
 * 1. Fetches all holdings in the portfolio
 * 2. Calculates total investment (sum of quantity × averageCost)
 * 3. Calculates current value (sum of quantity × currentPrice, or cost if price unavailable)
 * 4. Calculates daily change (currentValue - totalInvestment)
 * 5. Updates portfolio document with new values
 * 
 * Supports MongoDB transactions for data consistency.
 * 
 * @async
 * @function recalculatePortfolioValues
 * @param {string} portfolioId - Portfolio ID to recalculate
 * @param {mongoose.ClientSession} [session=null] - Optional MongoDB session for transactions
 * 
 * @returns {Promise<Object>} Recalculation results
 * @returns {number} return.totalValue - Updated total portfolio value
 * @returns {number} return.dailyChange - Updated daily change amount
 * @returns {number} return.totalInvestment - Total initial investment
 * @returns {number} return.holdingCount - Number of holdings in portfolio
 * 
 * @throws {Error} If portfolio not found or calculation fails
 */
export async function recalculatePortfolioValues(portfolioId, session = null) {
  try {
    const queryOptions = session ? { session } : {};
    
    const holdings = await Holding.find({ portfolioId }, null, queryOptions);
    
    let totalInvestment = 0;
    let currentValue = 0;
    
    holdings.forEach(holding => {
      const cost = holding.quantity * holding.averageCost;
      totalInvestment += cost;
      
      const value = holding.currentPrice > 0
        ? holding.quantity * holding.currentPrice
        : cost;
      currentValue += value;
    });
    
    const dailyChange = currentValue - totalInvestment;
    
    const updatedPortfolio = await Portfolio.findByIdAndUpdate(
      portfolioId,
      {
        totalValue: Math.round(currentValue * 100) / 100,
        dailyChange: Math.round(dailyChange * 100) / 100,
        lastUpdated: new Date()
      },
      { new: true, ...queryOptions }
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
 * Recalculates all portfolios for a specific user
 * 
 * Processes all user portfolios in parallel using Promise.allSettled.
 * This ensures that if one portfolio fails, others still get updated.
 * 
 * @async
 * @function recalculateAllUserPortfolios
 * @param {string} userId - User ID whose portfolios should be recalculated
 * 
 * @returns {Promise<Array>} Array of successful recalculation results
 * @throws {Error} If database query fails
 */
export async function recalculateAllUserPortfolios(userId) {
  try {
    const portfolios = await Portfolio.find({ userId });
    
    const results = await Promise.allSettled(
      portfolios.map(portfolio => 
        recalculatePortfolioValues(portfolio._id)
      )
    );
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `Failed to recalculate portfolio ${portfolios[index]._id}:`, 
          result.reason
        );
      }
    });
    
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
  } catch (error) {
    console.error('Error recalculating all user portfolios:', error);
    throw error;
  }
}


/**
 * Gets portfolio value summary without updating the database
 * 
 * This is a read-only operation that calculates current portfolio metrics
 * without modifying the portfolio document. Useful for:
 * - Displaying current values
 * - Checking if price updates are needed
 * - Generating reports
 * 
 * @async
 * @function getPortfolioValueSummary
 * @param {string} portfolioId - Portfolio ID to summarize
 * 
 * @returns {Promise<Object>} Portfolio value summary
 * @returns {number} return.totalInvestment - Total initial investment
 * @returns {number} return.currentValue - Current total value
 * @returns {number} return.profitLoss - Profit/loss amount
 * @returns {number} return.profitLossPercent - Profit/loss percentage
 * @returns {number} return.totalHoldings - Total number of holdings
 * @returns {number} return.holdingsWithCurrentPrice - Holdings with valid prices
 * @returns {boolean} return.needsPriceUpdate - Whether any holdings need price updates
 * 
 * @throws {Error} If calculation fails
 */
export async function getPortfolioValueSummary(portfolioId) {
  try {
    const holdings = await Holding.find({ portfolioId }).lean();
    
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