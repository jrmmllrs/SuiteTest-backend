// routes/authRoutes.js
const express = require("express");
const authController = require("../controllers/AuthController");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// GET /api/users/departments - Fetch all active departments
router.get("/departments", authMiddleware, async (req, res) => {
  try {
    const db = database.getPool();
    const [departments] = await db.execute(
      "SELECT id, department_name FROM departments WHERE is_active = 1 ORDER BY department_name ASC"
    );

    res.json({
      success: true,
      departments,
    });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
      departments: [],
    });
  }
});


router.post("/register", (req, res) => authController.register(req, res));
router.post("/login", (req, res) => authController.login(req, res));
router.get("/me", authMiddleware, (req, res) =>
  authController.getCurrentUser(req, res)
);

module.exports = router;
