const path = require("path");

function splitCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function bool(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || "3000",

  apiPrefix: process.env.API_PREFIX || "",
  frontendOrigins: splitCsv(process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173"),

  jwtSecret: process.env.JWT_SECRET || "change-this-secret-in-env",
  jwtIssuer: process.env.JWT_ISSUER || "",
  jwtAudience: process.env.JWT_AUDIENCE || "",

  mqttUrl: process.env.MQTT_URL || process.env.MQTT_CLIENT || "mqtt://localhost:1883",
  mqttUsername: process.env.MQTT_USERNAME || "",
  mqttPassword: process.env.MQTT_PASSWORD || "",
  mqttClientIdPrefix: process.env.MQTT_CLIENT_ID_PREFIX || "chat-service",

  dbDialect: process.env.DB_DIALECT || "mysql",
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: Number(process.env.DB_PORT || 3306),
  dbName: process.env.DB_NAME || "chat-app",
  dbUser: process.env.DB_USER || "app_user",
  dbPassword: process.env.DB_PASSWORD || "app_password",
  dbLogging: bool(process.env.DB_LOGGING, false),
  dbSync: bool(process.env.DB_SYNC, true),

  dataFile: process.env.CHAT_DATA_FILE || path.join(__dirname, "..", "data", "chat-store.json"),
};

if (config.env === "production" && config.jwtSecret === "change-this-secret-in-env") {
  throw new Error("JWT_SECRET must be set in production.");
}

module.exports = config;
