// routes/testRoutes.js
const express = require("express");
const testController = require("../controllers/testController");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// IMPORTANT: Order matters! More specific routes MUST come before generic ones

// Create test
router.post("/create", authMiddleware, (req, res) =>
  testController.create(req, res)
);

// Get lists
router.get("/my-tests", authMiddleware, (req, res) =>
  testController.getMyTests(req, res)
);
router.get("/available", authMiddleware, (req, res) =>
  testController.getAvailableTests(req, res)
);

// Test-specific routes (BEFORE /:id to avoid conflicts)
router.get("/:id/status", authMiddleware, (req, res) =>
  testController.getTestStatus(req, res)
);
router.post("/:id/save-progress", authMiddleware, (req, res) =>
  testController.saveProgress(req, res)
);
router.get("/:id/take", authMiddleware, (req, res) =>
  testController.getTestForTaking(req, res)
);
router.post("/:id/submit", authMiddleware, (req, res) =>
  testController.submitTest(req, res)
);
router.get("/:id/results", authMiddleware, (req, res) =>
  testController.getTestResults(req, res)
);

// Review routes - specific before generic
router.get("/:id/review/:candidateId", authMiddleware, (req, res) =>
  testController.getAnswerReview(req, res)
);
router.get("/:id/review", authMiddleware, (req, res) =>
  testController.getAnswerReview(req, res)
);

// Generic CRUD (MUST come last)
router.get("/:id", authMiddleware, (req, res) =>
  testController.getTestById(req, res)
);
router.put("/:id", authMiddleware, (req, res) =>
  testController.update(req, res)
);
router.delete("/:id", authMiddleware, (req, res) =>
  testController.delete(req, res)
);

module.exports = router;
