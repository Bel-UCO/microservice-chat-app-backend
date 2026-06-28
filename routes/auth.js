const express = require("express");
const requireAuth = require("../util/authMiddleware");

const router = express.Router();

router.get("/me", requireAuth, function (req, res) {
  res.json({
    data: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      username: req.user.username,
      roles: req.user.roles,
    },
  });
});

module.exports = router;
