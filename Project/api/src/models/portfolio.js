import mongoose from "mongoose";
const portfolioSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
    name: { type: String, required: true, trim: true},
    description: { type: String, trim: true, default: ''},
    totalValue: { type: Number, default: 0},
    dailyChange: { type: Number, default: 0},
    lastUpdated: { type: Date, default: Date.now}
}, {timestamps: true});

export default mongoose.model('Portfolio', portfolioSchema);