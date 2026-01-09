// models/refreshToken.js
import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  token: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  expiresAt: { 
    type: Date, 
    required: true, 
    index: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 2592000 // Auto-delete after 30 days
  }
});

export default mongoose.model('RefreshToken', refreshTokenSchema);