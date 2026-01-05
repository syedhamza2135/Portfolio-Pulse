import mongoose from 'mongoose';

const priceCacheSchema = new mongoose.Schema({
  ticker: { 
    type: String, 
    required: true, 
    unique: true, 
    uppercase: true,
    trim: true,
    index: true
  },
  assetType: { 
    type: String, 
    enum: ['stock', 'crypto', 'etf'], 
    required: true 
  },
  price: { 
    type: Number, 
    required: true,
    min: 0
  },
  source: { 
    type: String, 
    enum: ['api', 'manual', 'scheduled'],
    default: 'api' 
  },
  fetchedAt: { 
    type: Date, 
    default: Date.now
  }
}, { 
  timestamps: true 
});

priceCacheSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 900 });

priceCacheSchema.index({ ticker: 1, assetType: 1 });

export default mongoose.model('PriceCache', priceCacheSchema);