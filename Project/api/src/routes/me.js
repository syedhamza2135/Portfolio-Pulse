import { Router } from "express";
import User from "../models/user.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
    const id = req.user.sub;
    const user = await User.findById(id).select('email createdAt');
    res.json(user);
});

export default router;