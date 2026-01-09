import mongoose from 'mongoose';

const priceHistorySchema = new mongoose.Schema({
  ticker: { 
    type: String, 
    required: true, 
    uppercase: true,
    trim: true
  },
  assetType: { 
    type: String, 
    enum: ['stock', 'crypto', 'etf'], 
    required: true 
  },
  date: { 
    type: Date, 
    required: true 
  },
  open: Number,
  high: Number,
  low: Number,
  close: { 
    type: Number, 
    required: true 
  },
  volume: Number
}, { 
  timestamps: true 
});

// Compound index for efficient queries
priceHistorySchema.index({ ticker: 1, date: -1 });

// Keep historical data for 90 days (for charts)
priceHistorySchema.index({ date: 1 }, { expireAfterSeconds: 7776000 });

export default mongoose.model('PriceHistory', priceHistorySchema);