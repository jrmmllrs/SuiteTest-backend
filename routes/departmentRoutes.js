// File: backend/routes/departmentRoutes.js
const express = require("express");
const router = express.Router();
const { authMiddleware, adminMiddleware } = require("../middleware/auth");
const departmentController = require("../controllers/departmentController");

router.get("/", authMiddleware, departmentController.getAllDepartments);
router.get("/:id", authMiddleware, departmentController.getDepartmentById);
router.post("/", authMiddleware, adminMiddleware, departmentController.createDepartment);
router.put("/:id", authMiddleware, adminMiddleware, departmentController.updateDepartment);
router.delete("/:id", authMiddleware, adminMiddleware, departmentController.deleteDepartment);


module.exports = router;
