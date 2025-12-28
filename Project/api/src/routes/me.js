import { Router } from "express";
import User from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
    try {
        const id = req.user.sub;
        const user = await User.findById(id).select('email createdAt');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Failed to fetch user information' });
    }
});

export default router;