// routes/proctoringRoutes.js
const express = require("express");
const proctoringController = require("../controllers/proctoringController");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();

// Log proctoring event (candidates)
router.post("/log", authMiddleware, (req, res) =>
  proctoringController.logEvent(req, res)
);

// Get test proctoring settings (candidates need this)
router.get("/settings/:testId", authMiddleware, (req, res) =>
  proctoringController.getTestSettings(req, res)
);

// Get all events for a test (admin/employer only)
router.get("/test/:testId/events", authMiddleware, (req, res) =>
  proctoringController.getTestEvents(req, res)
);

// Get events for specific candidate (admin/employer only)
router.get("/test/:testId/candidate/:candidateId", authMiddleware, (req, res) =>
  proctoringController.getCandidateEvents(req, res)
);

module.exports = router;