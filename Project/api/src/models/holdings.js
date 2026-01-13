/**
 * Holding Model
 * 
 * Represents a single investment holding within a portfolio.
 * A holding is a position in a specific asset (stock, ETF, or crypto).
 * 
 * Schema Fields:
 * - portfolioId: Reference to parent portfolio
 * - ticker: Asset symbol (e.g., 'AAPL', 'BTC')
 * - assetType: Type of asset (stock, etf, crypto)
 * - quantity: Number of shares/units owned
 * - averageCost: Average purchase price per unit
 * - currentPrice: Current market price (updated via API or manually)
 * - lastPriceUpdate: Timestamp of last price update
 * - priceSource: Source of price data (manual, api, scheduled)
 * 
 * Constraints:
 * - Unique combination of portfolioId + ticker (prevents duplicates)
 * - Optimistic concurrency control enabled (prevents write conflicts)
 * 
 * Indexes:
 * - portfolioId + ticker: Unique constraint and fast lookups
 * - ticker: For price update batch operations
 * - assetType: For filtering by asset type
 * - ticker + assetType: For efficient price fetching
 * 
 * @module models/holdings
 * @requires mongoose
 */

import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema({
  // Reference to parent portfolio
  portfolioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Portfolio', 
    index: true, 
    required: true
  },
  // Asset symbol (e.g., 'AAPL', 'BTC', 'ETH')
  ticker: { 
    type: String, 
    required: true,
    uppercase: true,  // Always store in uppercase
    trim: true
  },
  // Type of asset
  assetType: { 
    type: String, 
    enum: ['stock', 'etf', 'crypto'], 
    required: true 
  },
  // Number of shares/units owned
  quantity: { 
    type: Number, 
    required: true, 
    min: 0  // Cannot be negative
  },
  // Average purchase price per unit
  averageCost: {
    type: Number,
    required: true,
    min: 0
  },
  // Current market price (updated via API or manually)
  currentPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  // Timestamp of last price update
  lastPriceUpdate: {
    type: Date 
  },
  // Source of price data
  priceSource: { 
    type: String,
    enum: ['manual', 'api', 'scheduled'],
    default: 'manual'  // Default to manual entry
  }
}, { 
  timestamps: true,  // Automatically adds createdAt and updatedAt
  optimisticConcurrency: true  // Enables version-based conflict detection
});

// Unique constraint: One ticker per portfolio
// Prevents duplicate holdings of the same asset in a portfolio
holdingSchema.index({ portfolioId: 1, ticker: 1 }, { unique: true });

// Index for efficient ticker-based queries (price updates)
holdingSchema.index({ ticker: 1 });

// Index for filtering by asset type
holdingSchema.index({ assetType: 1 });

// Compound index for efficient price fetching by ticker and type
holdingSchema.index({ ticker: 1, assetType: 1 });

export default mongoose.model('Holding', holdingSchema);