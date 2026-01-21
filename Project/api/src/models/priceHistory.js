/**
 * Price History Model
 * 
 * Stores historical price data for tickers (OHLCV format).
 * Used for:
 * - Price charts and graphs
 * - Historical analysis
 * - Volatility calculations
 * 
 * Schema Fields:
 * - ticker: Asset symbol (e.g., 'AAPL', 'BTC')
 * - assetType: Type of asset (stock, crypto, etf)
 * - date: Date of the price data
 * - open: Opening price
 * - high: Highest price
 * - low: Lowest price
 * - close: Closing price (required)
 * - volume: Trading volume
 * 
 * Indexes:
 * - ticker + date: For efficient historical queries
 * - date: TTL index (auto-deletes after 90 days)
 * 
 * TTL: Documents automatically expire after 90 days to manage storage.
 * 
 * @module models/priceHistory
 * @requires mongoose
 */

import mongoose from 'mongoose';

const priceHistorySchema = new mongoose.Schema({
  // Asset symbol
  ticker: { 
    type: String, 
    required: true, 
    uppercase: true,  // Always store in uppercase
    trim: true
  },
  // Type of asset
  assetType: { 
    type: String, 
    enum: ['stock', 'crypto', 'etf'], 
    required: true 
  },
  // Date of the price data
  date: { 
    type: Date, 
    required: true 
  },
  // OHLCV price data
  open: Number,      // Opening price
  high: Number,      // Highest price
  low: Number,       // Lowest price
  close: {           // Closing price (most important)
    type: Number, 
    required: true 
  },
  volume: Number     // Trading volume
}, { 
  timestamps: true   // Automatically adds createdAt and updatedAt
});

priceHistorySchema.index({ ticker: 1 });
// Compound index for efficient historical price queries
// Queries by ticker and date (sorted descending for latest first)
priceHistorySchema.index({ ticker: 1, date: -1 });

// TTL index: Automatically delete documents after 90 days
// 7776000 seconds = 90 days
// This manages storage while keeping recent data for charts
priceHistorySchema.index({ date: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model('PriceHistory', priceHistorySchema);