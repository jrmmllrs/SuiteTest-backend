// routes/resultRoutes.js
const express = require("express");
const resultController = require("../controllers/resultController");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();

// IMPORTANT: Specific routes MUST come BEFORE generic routes
// Put /admin/all BEFORE /
router.get(
  "/admin/all",
  authMiddleware,
  requireRole("admin"),
  (req, res) => resultController.getAllResults(req, res)
);

router.get("/", authMiddleware, (req, res) =>
  resultController.getUserResults(req, res)
);

module.exports = router;