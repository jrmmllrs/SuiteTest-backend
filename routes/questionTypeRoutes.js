// routes/questionTypeRoutes.js
const express = require("express");
const questionTypeController = require("../controllers/questionTypeController");
const { authMiddleware, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public route - get all active question types
router.get("/", authMiddleware, (req, res) =>
  questionTypeController.getQuestionTypes(req, res)
);

// Get usage statistics for all question types (admin only)
router.get("/usage-stats", authMiddleware, requireRole("admin"), (req, res) =>
  questionTypeController.getUsageStats(req, res)
);

// Get detailed usage for a specific question type (admin only)
router.get("/:id/usage", authMiddleware, requireRole("admin"), (req, res) =>
  questionTypeController.getTypeUsageDetails(req, res)
);

// Admin routes
router.post("/", authMiddleware, requireRole("admin"), (req, res) =>
  questionTypeController.createQuestionType(req, res)
);

router.put("/:id", authMiddleware, requireRole("admin"), (req, res) =>
  questionTypeController.updateQuestionType(req, res)
);

router.delete("/:id", authMiddleware, requireRole("admin"), (req, res) =>
  questionTypeController.deleteQuestionType(req, res)
);

// Bulk operations (admin only)
router.post("/bulk-update", authMiddleware, requireRole("admin"), (req, res) =>
  questionTypeController.bulkUpdate(req, res)
);

module.exports = router;