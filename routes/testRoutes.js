// routes/testRoutes.js
const express = require("express");
const testController = require("../controllers/testController");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// IMPORTANT: Order matters! More specific routes MUST come before generic ones

// ============================================
// SPECIFIC ROUTES (must come FIRST)
// ============================================

// Check for active test - MUST be before any /:id routes
router.get("/active-test", authMiddleware, (req, res) =>
  testController.getActiveTest(req, res)
);

// Get all questions from question bank - MUST be before /:id routes
router.get("/questions/all", authMiddleware, (req, res) =>
  testController.getAllQuestions(req, res)
);

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

// ============================================
// TEST-SPECIFIC ROUTES (with :id parameter)
// ============================================

// Test status and progress
router.get("/:id/status", authMiddleware, (req, res) =>
  testController.getTestStatus(req, res)
);
router.post("/:id/save-progress", authMiddleware, (req, res) =>
  testController.saveProgress(req, res)
);

// Taking and submitting tests
router.get("/:id/take", authMiddleware, (req, res) =>
  testController.getTestForTaking(req, res)
);
router.post("/:id/submit", authMiddleware, (req, res) =>
  testController.submitTest(req, res)
);

// Results
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

// ============================================
// GENERIC CRUD ROUTES (MUST come LAST)
// ============================================

// Get specific test
router.get("/:id", authMiddleware, (req, res) =>
  testController.getTestById(req, res)
);

// Update test
router.put("/:id", authMiddleware, (req, res) =>
  testController.update(req, res)
);

// Delete test
router.delete("/:id", authMiddleware, (req, res) =>
  testController.delete(req, res)
);

module.exports = router;