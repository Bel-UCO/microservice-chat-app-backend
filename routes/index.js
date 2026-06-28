var express = require("express");
var router = express.Router();
var mqttClient = require("../util/mqttClient");

router.get("/", function (req, res) {
  res.json({
    service: "chat-service",
    status: "ok",
    endpoints: {
      me: "/auth/me",
      rooms: "/rooms",
      metrics: "/metrics",
    },
  });
});

router.get("/health", function (req, res) {
  res.json({
    status: "ok",
    mqtt: mqttClient.mqttStatus(),
  });
});

module.exports = router;
