const crypto = require("crypto");
const config = require("./config");
const apiError = require("./apiError");

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw apiError(401, `Invalid JWT ${label}.`);
  }
}

function verifyHs256Signature(tokenHeader, tokenPayload, signature) {
  const expectedSignature = base64UrlEncode(
    crypto.createHmac("sha256", config.jwtSecret).update(`${tokenHeader}.${tokenPayload}`).digest(),
  );

  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw apiError(401, "Invalid JWT signature.");
  }
}

function assertClaimTime(payload) {
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && now >= Number(payload.exp)) {
    throw apiError(401, "JWT token has expired.");
  }

  if (payload.nbf && now < Number(payload.nbf)) {
    throw apiError(401, "JWT token is not active yet.");
  }
}

function assertIssuerAudience(payload) {
  if (config.jwtIssuer && payload.iss !== config.jwtIssuer) {
    throw apiError(401, "Invalid JWT issuer.");
  }

  if (config.jwtAudience) {
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audience.includes(config.jwtAudience)) {
      throw apiError(401, "Invalid JWT audience.");
    }
  }
}

function normalizeUser(payload) {
  const id = payload.sub || payload.userId || payload.id;

  if (!id) {
    throw apiError(401, "JWT payload must contain sub, userId, or id.");
  }

  return {
    id: String(id),
    name: payload.name || payload.username || payload.email || "Unknown User",
    email: payload.email || null,
    username: payload.username || null,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    raw: payload,
  };
}

function verifyToken(token) {
  if (!token) {
    throw apiError(401, "Missing JWT token.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw apiError(401, "Invalid JWT format.");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = parseJson(base64UrlDecode(encodedHeader), "header");
  const payload = parseJson(base64UrlDecode(encodedPayload), "payload");

  if (header.alg !== "HS256") {
    throw apiError(401, "Unsupported JWT algorithm. This chat service expects HS256.");
  }

  verifyHs256Signature(encodedHeader, encodedPayload, signature);
  assertClaimTime(payload);
  assertIssuerAudience(payload);

  return normalizeUser(payload);
}

module.exports = {
  verifyToken,
};
