import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema({
    portfolioId: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio',index: true, required: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    averageCost: { type: Number, required: true, min: 0 },
    currentPrice: {type: Number, required: true, min: 0 },
    currentPrice: { type: Number, required: true, min: 0 },
    lastPriceUpdate: { type: Date}
}, {timestamps: true});

export default mongoose.model('Holding', holdingSchema);