import passport from 'passport';

export function requireAuth(req, res, next) {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Passport Auth Error:', err);
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }

    if (!user) {
      const errorMessage = info?.name === 'TokenExpiredError' 
        ? 'Your session has expired. Please log in again.' 
        : 'Access denied. Valid token required.';
        
      return res.status(401).json({ error: errorMessage });
    }

    req.user = user;
    req.user.sub = user._id?.toString() || user.id;

    next();
  })(req, res, next);
}