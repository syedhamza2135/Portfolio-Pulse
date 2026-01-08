import mongoose from 'mongoose';
const portfolioSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: { 
        type: String, 
        required: true, 
        trim: true
    },
    description: { 
        type: String, 
        trim: true, 
        default: ''
    },
    totalValue: { 
        type: Number, 
        default: 0
    },
    dailyChange: { 
        type: Number, 
        default: 0
    },
    lastUpdated: { 
        type: Date, 
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

portfolioSchema.virtual('returnPercent').get(function() {
    if (this.totalValue === 0) return 0;
    const investment = this.totalValue - this.dailyChange;
    return investment > 0 ? (this.dailyChange / investment) * 100 : 0;
});

portfolioSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Portfolio', portfolioSchema);