import { Router } from "express";
import Joi from 'joi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import User from "../models/user.js";

const router = Router();

const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).pattern(/[A-Z]/).pattern(/\d/).pattern(/\W/).required()
});

router.post('/register', async (req, res) => {
    const { error, value } = registerSchema.validate(req.body);
    if (error){
        return res.status(400).json({error: error.message});
    }

    const exists = await User.findOne({ email: value.email });
    if (exists){
        return res.status(400).json({error: 'Registration Failed' });
    }

    const passwordHash = await bcrypt.hash(value.password, 12);
    const user = await User.create({email: value.email, passwordHash});

    return res.status(201).json({id: user.id, email: user.email});
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

router.post('/login', async (req, res, next) => {
    const {error, value} = loginSchema.validate(req.body);
    if(error){
        return res.status(400).json({ error: error.message });
    }
    
    passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) return res.status(500).json({ error: 'Authentication error' });
        if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
        const token = jwt.sign(
            {sub: user._id.toString(), email: user.email }, 
            process.env.JWT_SECRET,
            { expiresIn: '1d'}
        );
        return res.json({
            token,
            user: {
                id: user._id,
                email: user.email
            }
        });
    })(req, res, next);
});

export default router;