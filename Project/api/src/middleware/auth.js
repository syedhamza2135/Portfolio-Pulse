import passport from 'passport';

export function requireAuth(req, res, next) {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    // Ensure req.user.sub exists for consistency (JWT payload uses 'sub', user object has '_id')
    // Convert ObjectId to string if needed
    req.user.sub = req.user._id ? (req.user._id.toString ? req.user._id.toString() : req.user._id) : req.user.id;
    next();
  })(req, res, next);
}