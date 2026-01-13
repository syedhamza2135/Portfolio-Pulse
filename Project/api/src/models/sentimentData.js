/**
 * Sentiment Data Model
 * 
 * Stores AI-powered sentiment analysis results for tickers.
 * 
 * Schema Fields:
 * - ticker: Asset symbol
 * - sentimentScore: Aggregate sentiment score (-1 to +1)
 *   - Positive: > 0
 *   - Negative: < 0
 *   - Neutral: ≈ 0
 * - articles: Array of analyzed news articles with individual sentiment
 * - calculatedAt: When sentiment was calculated
 * 
 * Indexes:
 * - ticker + calculatedAt: For efficient sentiment lookups
 * - calculatedAt: TTL index (auto-deletes after 24 hours)
 * 
 * TTL: Documents automatically expire after 24 hours since sentiment
 * changes frequently and old data is less relevant.
 * 
 * @module models/sentimentData
 * @requires mongoose
 */

import mongoose from 'mongoose';

const sentimentDataSchema = new mongoose.Schema({
  // Asset symbol
  ticker: { 
    type: String, 
    required: true, 
    index: true,      // Indexed for fast lookups
    uppercase: true   // Always store in uppercase
  },
  // Aggregate sentiment score (-1 to +1)
  // Calculated from individual article sentiments
  sentimentScore: { 
    type: Number, 
    min: -1,  // Most negative
    max: 1    // Most positive
  },
  // Array of analyzed news articles
  articles: [{
    title: String,        // Article title
    url: String,          // Article URL
    sentiment: Number,    // Individual article sentiment
    publishedAt: Date     // Publication date
  }],
  // Timestamp when sentiment was calculated
  calculatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Compound index for efficient sentiment queries
// Queries by ticker and calculation date (latest first)
sentimentDataSchema.index({ ticker: 1, calculatedAt: -1 });

// TTL index: Automatically delete documents after 24 hours
// 86400 seconds = 24 hours
// Sentiment changes frequently, so old data is less relevant
sentimentDataSchema.index({ calculatedAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('SentimentData', sentimentDataSchema);