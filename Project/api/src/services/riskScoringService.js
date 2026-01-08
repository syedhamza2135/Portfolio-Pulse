import Holding from '../models/holdings.js';
import RiskMetrics from '../models/riskMetrics.js';
import priceFetcher from './priceFetcherService.js';

class RiskScoringService {
  /**
   * Calculates comprehensive risk score for a portfolio
   * Formula: Risk = (0.4 × Volatility) + (0.3 × Concentration) + (0.3 × Sector Exposure)
   */
  async calculatePortfolioRisk(portfolioId) {
    try {
      const holdings = await Holding.find({ portfolioId }).lean();

      if (holdings.length === 0) {
        console.log(`[RiskScore] Portfolio ${portfolioId} has no holdings`);
        return null;
      }

      // Calculate all three risk components
      const volatilityScore = await this.calculateVolatilityScore(holdings);
      const concentrationScore = this.calculateConcentrationScore(holdings);
      const sectorScore = await this.calculateSectorExposureScore(holdings);

      // Weighted overall score (per PRD formula)
      const overallScore = (
        0.4 * volatilityScore +
        0.3 * concentrationScore +
        0.3 * sectorScore
      );

      // Save to database
      const riskMetrics = await RiskMetrics.findOneAndUpdate(
        { portfolioId },
        {
          portfolioId,
          overallScore: Math.round(overallScore * 100) / 100,
          components: {
            volatility: Math.round(volatilityScore * 100) / 100,
            concentration: Math.round(concentrationScore * 100) / 100,
            sectorExposure: Math.round(sectorScore * 100) / 100
          },
          calculatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      console.log(`[RiskScore] Portfolio ${portfolioId}: ${overallScore.toFixed(2)}/10 (V:${volatilityScore.toFixed(1)} C:${concentrationScore.toFixed(1)} S:${sectorScore.toFixed(1)})`);
      
      return riskMetrics;

    } catch (error) {
      console.error(`[RiskScore] Error calculating risk for portfolio ${portfolioId}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculates volatility score (1-10 scale)
   * Based on 30-day standard deviation of returns
   * σ < 10% → 1, σ > 40% → 10
   */
  async calculateVolatilityScore(holdings) {
    try {
      let totalValue = 0;
      let weightedVolatility = 0;

      // Calculate portfolio value and weighted volatility
      for (const holding of holdings) {
        const value = holding.quantity * (holding.currentPrice || holding.averageCost);
        totalValue += value;

        // Estimate volatility based on asset type (simplified for MVP)
        // In production, fetch 30-day historical prices
        let volatility = 0;
        
        if (holding.assetType === 'crypto') {
          volatility = 0.45; // 45% - crypto is highly volatile
        } else if (holding.assetType === 'stock') {
          volatility = 0.25; // 25% - moderate volatility
        } else if (holding.assetType === 'etf') {
          volatility = 0.15; // 15% - lower volatility
        }

        const weight = totalValue > 0 ? value / totalValue : 0;
        weightedVolatility += volatility * weight;
      }

      // Normalize to 1-10 scale
      // σ < 10% → 1, σ > 40% → 10
      const score = this.normalizeVolatility(weightedVolatility);
      return score;

    } catch (error) {
      console.error('[RiskScore] Volatility calculation error:', error.message);
      return 5; // Default to medium risk on error
    }
  }

  /**
   * Normalizes volatility percentage to 1-10 scale
   */
  normalizeVolatility(volatility) {
    if (volatility < 0.10) return 1;
    if (volatility > 0.40) return 10;
    
    // Linear interpolation between 10% and 40%
    return 1 + ((volatility - 0.10) / 0.30) * 9;
  }

  /**
   * Calculates concentration score using Herfindahl Index
   * HHI = Σ(weight²) for each holding
   * HHI < 0.15 (diversified) → 1, HHI > 0.40 (concentrated) → 10
   */
  calculateConcentrationScore(holdings) {
    try {
      let totalValue = 0;
      const values = [];

      // Calculate holding values
      holdings.forEach(holding => {
        const value = holding.quantity * (holding.currentPrice || holding.averageCost);
        values.push(value);
        totalValue += value;
      });

      if (totalValue === 0) return 5;

      // Calculate Herfindahl Index
      let hhi = 0;
      values.forEach(value => {
        const weight = value / totalValue;
        hhi += weight * weight;
      });

      // Normalize to 1-10 scale
      if (hhi < 0.15) return 1;
      if (hhi > 0.40) return 10;

      // Linear interpolation
      return 1 + ((hhi - 0.15) / 0.25) * 9;

    } catch (error) {
      console.error('[RiskScore] Concentration calculation error:', error.message);
      return 5;
    }
  }

  /**
   * Calculates sector exposure score
   * Max sector weight < 25% → 1, > 60% → 10
   * 
   * Note: For MVP, we map tickers to sectors using a simple lookup.
   * In production, use Yahoo Finance API to get GICS sector classification.
   */
  async calculateSectorExposureScore(holdings) {
    try {
      const sectorMap = this.mapHoldingsToSectors(holdings);
      
      let totalValue = 0;
      const sectorValues = {};

      // Calculate sector allocations
      holdings.forEach(holding => {
        const value = holding.quantity * (holding.currentPrice || holding.averageCost);
        totalValue += value;

        const sector = sectorMap[holding.ticker] || 'Unknown';
        sectorValues[sector] = (sectorValues[sector] || 0) + value;
      });

      if (totalValue === 0) return 5;

      // Find maximum sector concentration
      let maxSectorWeight = 0;
      Object.values(sectorValues).forEach(sectorValue => {
        const weight = sectorValue / totalValue;
        if (weight > maxSectorWeight) {
          maxSectorWeight = weight;
        }
      });

      // Normalize to 1-10 scale
      if (maxSectorWeight < 0.25) return 1;
      if (maxSectorWeight > 0.60) return 10;

      // Linear interpolation
      return 1 + ((maxSectorWeight - 0.25) / 0.35) * 9;

    } catch (error) {
      console.error('[RiskScore] Sector exposure calculation error:', error.message);
      return 5;
    }
  }

  /**
   * Maps tickers to sectors (simplified for MVP)
   * In production, fetch from Yahoo Finance API
   */
  mapHoldingsToSectors(holdings) {
    // Simplified sector mapping for common tickers
    const sectorLookup = {
      // Technology
      'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology',
      'GOOG': 'Technology', 'META': 'Technology', 'NVDA': 'Technology',
      'TSLA': 'Technology', 'AMD': 'Technology', 'INTC': 'Technology',
      
      // Finance
      'JPM': 'Finance', 'BAC': 'Finance', 'WFC': 'Finance',
      'GS': 'Finance', 'MS': 'Finance', 'C': 'Finance',
      
      // Healthcare
      'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'UNH': 'Healthcare',
      'ABBV': 'Healthcare', 'TMO': 'Healthcare',
      
      // Energy
      'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy',
      
      // Consumer
      'AMZN': 'Consumer', 'WMT': 'Consumer', 'HD': 'Consumer',
      'DIS': 'Consumer', 'NKE': 'Consumer',
      
      // Crypto (treat as separate sector)
      'BTC': 'Crypto', 'ETH': 'Crypto', 'BNB': 'Crypto',
      'SOL': 'Crypto', 'ADA': 'Crypto', 'DOGE': 'Crypto'
    };

    const result = {};
    holdings.forEach(holding => {
      result[holding.ticker] = sectorLookup[holding.ticker] || 'Other';
    });

    return result;
  }

  /**
   * Calculates risk for all portfolios (used by scheduled job)
   */
  async calculateAllPortfolioRisks() {
    try {
      // Get all unique portfolio IDs from holdings
      const portfolioIds = await Holding.distinct('portfolioId');
      
      console.log(`[RiskScore] Calculating risk for ${portfolioIds.length} portfolios...`);

      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const portfolioId of portfolioIds) {
        try {
          await this.calculatePortfolioRisk(portfolioId);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            portfolioId: portfolioId.toString(),
            error: error.message
          });
          console.error(`[RiskScore] Failed for portfolio ${portfolioId}:`, error.message);
        }

        // Small delay to avoid overwhelming database
        await new Promise(r => setTimeout(r, 100));
      }

      console.log(`[RiskScore] Batch complete: ${results.successful} successful, ${results.failed} failed`);
      return results;

    } catch (error) {
      console.error('[RiskScore] Error in calculateAllPortfolioRisks:', error.message);
      throw error;
    }
  }

  /**
   * Gets current risk metrics for a portfolio
   */
  async getPortfolioRiskMetrics(portfolioId) {
    try {
      const metrics = await RiskMetrics.findOne({ portfolioId })
        .sort({ calculatedAt: -1 })
        .lean();

      return metrics;
    } catch (error) {
      console.error(`[RiskScore] Error fetching metrics for portfolio ${portfolioId}:`, error.message);
      return null;
    }
  }

  /**
   * Simulates risk impact of adding/removing a holding
   * Used for "what-if" analysis
   */
  async simulateRiskChange(portfolioId, simulatedHoldings) {
    try {
      // Create temporary holdings array with simulation
      const currentHoldings = await Holding.find({ portfolioId }).lean();
      const combinedHoldings = [...currentHoldings, ...simulatedHoldings];

      // Calculate risk without saving to database
      const volatilityScore = await this.calculateVolatilityScore(combinedHoldings);
      const concentrationScore = this.calculateConcentrationScore(combinedHoldings);
      const sectorScore = await this.calculateSectorExposureScore(combinedHoldings);

      const overallScore = (
        0.4 * volatilityScore +
        0.3 * concentrationScore +
        0.3 * sectorScore
      );

      return {
        simulated: true,
        overallScore: Math.round(overallScore * 100) / 100,
        components: {
          volatility: Math.round(volatilityScore * 100) / 100,
          concentration: Math.round(concentrationScore * 100) / 100,
          sectorExposure: Math.round(sectorScore * 100) / 100
        }
      };

    } catch (error) {
      console.error('[RiskScore] Simulation error:', error.message);
      throw error;
    }
  }
}

export default new RiskScoringService();