import Portfolio from '../models/portfolio.js';
import Holding from '../models/holdings.js';


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