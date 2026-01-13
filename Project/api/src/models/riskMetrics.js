/**
 * Risk Metrics Model
 * 
 * Stores calculated risk metrics for portfolios.
 * 
 * Schema Fields:
 * - portfolioId: Reference to portfolio
 * - overallScore: Overall risk score (1-10 scale, where 10 is highest risk)
 * - components: Breakdown of risk components
 *   - volatility: Volatility risk component (1-10)
 *   - concentration: Concentration risk component (1-10)
 *   - sectorExposure: Sector exposure risk component (1-10)
 * - calculatedAt: When risk was calculated
 * 
 * Risk Score Formula:
 * overallScore = (0.4 × volatility) + (0.3 × concentration) + (0.3 × sectorExposure)
 * 
 * Indexes:
 * - portfolioId: For fast portfolio risk lookups
 * - calculatedAt: For querying by calculation date
 * 
 * @module models/riskMetrics
 * @requires mongoose
 */

import mongoose from 'mongoose';

const riskMetricsSchema = new mongoose.Schema({
  // Reference to portfolio
  portfolioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Portfolio', 
    required: true, 
    index: true  // Indexed for fast portfolio risk lookups
  },
  // Overall risk score (1-10 scale)
  // 1 = Low risk, 10 = High risk
  overallScore: { 
    type: Number, 
    min: 1, 
    max: 10 
  },
  // Breakdown of risk components
  // Each component is also on a 1-10 scale
  components: {
    volatility: Number,        // Price volatility risk
    concentration: Number,      // Portfolio concentration risk
    sectorExposure: Number     // Sector concentration risk
  },
  // Timestamp when risk was calculated
  calculatedAt: { 
    type: Date, 
    default: Date.now, 
    index: true  // Indexed for querying by calculation date
  }
}, { 
  timestamps: true  // Automatically adds createdAt and updatedAt
});

export default mongoose.model('RiskMetrics', riskMetricsSchema);