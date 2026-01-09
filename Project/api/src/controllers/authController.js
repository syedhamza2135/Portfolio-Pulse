import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import crypto from 'crypto';
import RefreshToken from '../models/refreshToken.js';
import User from '../models/user.js';

const registerSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string()
    .min(6)
    .pattern(/[A-Z]/)
    .pattern(/\d/)
    .pattern(/\W/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one number, and one special character'
    })
});

export async function registerUser(req, res) {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const passwordHash = await bcrypt.hash(value.password, 12);
    
    const user = await User.create({
      email: value.email,
      passwordHash
    });
    
    return res.status(201).json({
      id: user.id,
      email: user.email
    });
    
  } catch (err) {
    console.error('Error registering user:', err);
    
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Registration Failed' });
    }
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Failed to register user' });
  }
}

const loginSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().required()
});

export async function loginUser(req, res, next) {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    passport.authenticate('local', { session: false }, async (err, user, info) => {
      if (err) {
        console.error('Passport authentication error:', err);
        return res.status(500).json({ error: 'Authentication error' });
      }
      
      if (!user) {
        return res.status(401).json({ 
          error: info?.message || 'Invalid credentials' 
        });
      }

      try {
        // Access token (7 days)
        const token = jwt.sign(
          { sub: user._id.toString() },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        // Refresh token (30 days)
        const refreshToken = crypto.randomBytes(32).toString('hex');
        await RefreshToken.create({
          userId: user._id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        return res.json({
          token,
          refreshToken, // Send to client
          user: {
            id: user._id,
            email: user.email
          }
        });
      } catch (jwtError) {
        console.error('JWT signing error:', jwtError);
        return res.status(500).json({ error: 'Authentication error' });
      }
    })(req, res, next);
    
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

export async function refreshAccessToken(req, res) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Find and validate refresh token
    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    
    if (!tokenDoc) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (tokenDoc.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Issue new access token
    const newAccessToken = jwt.sign(
      { sub: tokenDoc.userId.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Rotate refresh token (security best practice)
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    await RefreshToken.findByIdAndUpdate(tokenDoc._id, {
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}