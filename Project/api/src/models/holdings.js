import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema({
    portfolioId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Portfolio', 
        index: true, 
        required: true
    },
    ticker: { 
        type: String, 
        required: true,
        uppercase: true,
        trim: true 
    },
    assetType: { 
        type: String, 
        enum: ['stock', 'etf', 'crypto'], 
        required: true 
    },
    quantity: { 
        type: Number, 
        required: true, 
        min: 0
    },
    averageCost: {
        type: Number,
        required: true,
        min: 0
    },
    currentPrice: {
        type: Number,
        default: 0,
        min: 0
    },
    lastPriceUpdate: {
        type: Date 
    },
    priceSource: { 
        type: String,
        enum: ['manual', 'api', 'scheduled'],
        default: 'manual' 
    }
}, { timestamps: true });

// Compound index to prevent duplicate holdings (same ticker in same portfolio)
holdingSchema.index({ portfolioId: 1, ticker: 1 }, { unique: true });

export default mongoose.model('Holding', holdingSchema);