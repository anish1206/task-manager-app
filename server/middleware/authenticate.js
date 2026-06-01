const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * authenticate middleware
 *
 * Reads the HttpOnly `token` cookie, verifies it, and attaches
 * `req.user = { id, email }` for downstream handlers.
 * Returns 401 if the cookie is absent or the token is invalid/expired.
 */
function authenticate(req, res, next) {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authenticate;
