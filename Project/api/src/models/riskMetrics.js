import mongoose from 'mongoose';

const riskMetricsSchema = new mongoose.Schema({
  portfolioId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Portfolio', 
    required: true, 
    index: true 
  },
  overallScore: { type: Number, min: 1, max: 10 },
  components: {
    volatility: Number,
    concentration: Number,
    sectorExposure: Number
  },
  calculatedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

export default mongoose.model('RiskMetrics', riskMetricsSchema);