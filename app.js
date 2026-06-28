var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var authRouter = require("./routes/auth");
var roomsRouter = require("./routes/rooms");
var config = require("./util/config");
var mqttClient = require("./util/mqttClient");

var app = express();

let promMid = null;
try {
  promMid = require("express-prometheus-middleware");
} catch (error) {
  console.warn("[metrics] express-prometheus-middleware is not installed. /metrics is disabled.");
}


// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));

app.use(function corsMiddleware(req, res, next) {
  var origin = req.headers.origin;
  var allowAllOrigins = config.frontendOrigins.includes("*");

  if (origin && (allowAllOrigins || config.frontendOrigins.includes(origin))) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }

  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
if (promMid) {
  app.use(
    promMid({
      metricsPath: "/metrics",
      collectDefaultMetrics: true,
      requestDurationBuckets: [0.1, 0.5, 1, 3, 5, 10],
    }),
  );
}

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/auth", authRouter);
app.use("/rooms", roomsRouter);
app.use("/api/auth", authRouter);
app.use("/api/rooms", roomsRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404, "Route was not found."));
});

// error handler
app.use(function (err, req, res, next) {
  var status = err.status || 500;
  var isProduction = req.app.get("env") === "production";

  if (req.path.startsWith("/api") || req.headers.accept === "application/json" || req.headers.authorization) {
    return res.status(status).json({
      message: err.message || "Internal server error.",
      details: err.details || null,
      stack: isProduction ? undefined : err.stack,
    });
  }

  res.locals.message = err.message;
  res.locals.error = isProduction ? {} : err;
  res.status(status);
  res.render("error");
});

module.exports = app;
