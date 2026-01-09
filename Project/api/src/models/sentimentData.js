import mongoose from 'mongoose';

const sentimentDataSchema = new mongoose.Schema({
  ticker: { type: String, required: true, index: true, uppercase: true },
  sentimentScore: { type: Number, min: -1, max: 1 },
  articles: [{
    title: String,
    url: String,
    sentiment: Number,
    publishedAt: Date
  }],
  calculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

sentimentDataSchema.index({ ticker: 1, calculatedAt: -1 });

sentimentDataSchema.index({ calculatedAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('SentimentData', sentimentDataSchema);