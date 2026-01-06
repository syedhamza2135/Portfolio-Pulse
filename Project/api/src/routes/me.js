import { Router } from 'express';
import User from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';
import { getUserId } from '../utils/authHelpers.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  try {
    const id = getUserId(req);
    const user = await User.findById(id).select('email createdAt');
    
    if (!user) {
      console.error('JWT valid but user not found:', id);
      return res.status(500).json({ error: 'User account not found. Please re-login.' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

export default router;