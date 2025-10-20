// routes/testRoutes.js
const express = require("express");
const testController = require("../controllers/testController");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

router.post("/create", authMiddleware, (req, res) =>
  testController.create(req, res)
);
router.get("/my-tests", authMiddleware, (req, res) =>
  testController.getMyTests(req, res)
);
router.get("/available", authMiddleware, (req, res) =>
  testController.getAvailableTests(req, res)
);

// Get test status (check if completed or in progress)
router.get("/:id/status", authMiddleware, (req, res) =>
  testController.getTestStatus(req, res)
);

// Save test progress
router.post("/:id/save-progress", authMiddleware, (req, res) =>
  testController.saveProgress(req, res)
);

router.get("/:id", authMiddleware, (req, res) =>
  testController.getTestById(req, res)
);
router.get("/:id/take", authMiddleware, (req, res) =>
  testController.getTestForTaking(req, res)
);
router.post("/:id/submit", authMiddleware, (req, res) =>
  testController.submitTest(req, res)
);
router.put("/:id", authMiddleware, (req, res) =>
  testController.update(req, res)
);
router.delete("/:id", authMiddleware, (req, res) =>
  testController.delete(req, res)
);
router.get("/:id/results", authMiddleware, (req, res) =>
  testController.getTestResults(req, res)
);

// FIXED: Answer Review Routes - Two separate routes instead of optional parameter
// Route for viewing own review (no candidateId needed)
router.get("/:id/review", authMiddleware, (req, res) =>
  testController.getAnswerReview(req, res)
);

// Route for viewing specific candidate's review (admin/employer)
router.get("/:id/review/:candidateId", authMiddleware, (req, res) =>
  testController.getAnswerReview(req, res)
);

module.exports = router;