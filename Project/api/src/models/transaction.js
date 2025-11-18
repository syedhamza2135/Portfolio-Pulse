import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    portfolio: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true, index: true },
    holding: { type: mongoose.Schema.Types.ObjectId, ref: 'Holding' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['buy', 'sell', 'transfer'], required: true },
    ticker: { type: String, trim: true, uppercase: true },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    executedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
