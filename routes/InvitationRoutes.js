// routes/invitationRoutes.js
const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/InvitationController');
const { authMiddleware } = require('../middleware/auth');

// Protected routes
router.post('/send-invitation', authMiddleware, invitationController.sendInvitation);
router.get('/test/:testId/invitations', authMiddleware, invitationController.getTestInvitations);
router.post('/send-reminder/:invitationId', authMiddleware, invitationController.sendReminder);
router.delete('/invitation/:invitationId', authMiddleware, invitationController.deleteInvitation);
router.post('/verify-access', authMiddleware, invitationController.verifyAccess);

// Public route
router.get('/accept/:token', invitationController.acceptInvitation);

module.exports = router;