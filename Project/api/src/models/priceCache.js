const priceCacheSchema = new mongoose.Schema({
    ticker: { 
        type: String, 
        required: true, 
        unique: true, 
        uppercase: true 
    },
    assetType: { 
        type: String, 
        enum: ['stock', 'crypto', 'etf'], 
        required: true 
    },
    price: { 
        type: Number, 
        required: true 
    },
    source: { 
        type: String, 
        default: 'api' 
    },
    fetchedAt: { 
        type: Date, 
        default: Date.now, 
        expires: 900 
    }
});