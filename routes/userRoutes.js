const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Get all departments (can be public or auth required)
router.get('/departments', userController.getDepartments);

// Get all users (admin only)
router.get('/all', authMiddleware, adminMiddleware, userController.getAllUsers);

// Create new user (admin only)
router.post('/create', authMiddleware, adminMiddleware, userController.createUser);

// Update user (admin only)
router.put('/update/:id', authMiddleware, adminMiddleware, userController.updateUser);

// Delete user (admin only)
router.delete('/delete/:id', authMiddleware, adminMiddleware, userController.deleteUser);

module.exports = router;