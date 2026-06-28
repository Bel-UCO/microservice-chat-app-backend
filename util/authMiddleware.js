const { verifyToken } = require("./jwt");
const apiError = require("./apiError");

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";

  if (!header) {
    throw apiError(401, "Authorization header is required.");
  }

  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw apiError(401, "Authorization header must use Bearer token.");
  }

  return token;
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    req.user = verifyToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = requireAuth;
