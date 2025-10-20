// controllers/invitationController.js
const EmailService = require('../services/emailService');

class InvitationController {
  async sendInvitation(req, res) {
    try {
      const { testId, candidates } = req.body;
      const userId = req.user.id;

      // Get test details
      const [tests] = await req.db.query(
        `SELECT t.*, u.name as creator_name,
         (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
         FROM tests t
         JOIN users u ON t.created_by = u.id
         WHERE t.id = ?`,
        [testId]
      );

      if (tests.length === 0) {
        return res.status(404).json({ success: false, message: 'Test not found' });
      }

      const test = tests[0];
      const results = [];

      // Send invitation to each candidate
      for (const candidate of candidates) {
        try {
          const result = await EmailService.sendTestInvitation({
            testId: testId,
            candidateEmail: candidate.email,
            candidateName: candidate.name,
            invitedBy: userId,
            testTitle: test.title,
            testDescription: test.description,
            timeLimit: test.time_limit,
            questionCount: test.question_count,
            invitedByName: test.creator_name
          }, req.db);

          results.push({
            email: candidate.email,
            success: true,
            invitationId: result.invitationId
          });
        } catch (error) {
          results.push({
            email: candidate.email,
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: 'Invitations processed',
        results: results
      });
    } catch (error) {
      console.error('Error sending invitations:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async getTestInvitations(req, res) {
    try {
      const { testId } = req.params;

      const [invitations] = await req.db.query(
        `SELECT ti.*, u.name as invited_by_name
         FROM test_invitations ti
         JOIN users u ON ti.invited_by = u.id
         WHERE ti.test_id = ?
         ORDER BY ti.invited_at DESC`,
        [testId]
      );

      res.json({ success: true, invitations });
    } catch (error) {
      console.error('Error fetching invitations:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async acceptInvitation(req, res) {
    try {
      const { token } = req.params;

      const [invitations] = await req.db.query(
        `SELECT ti.*, t.title, t.description, t.time_limit,
         (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
         FROM test_invitations ti
         JOIN tests t ON ti.test_id = t.id
         WHERE ti.invitation_token = ?`,
        [token]
      );

      if (invitations.length === 0) {
        return res.status(404).json({ success: false, message: 'Invalid invitation' });
      }

      const invitation = invitations[0];

      // Check if expired
      if (new Date() > new Date(invitation.expires_at)) {
        await req.db.query(
          'UPDATE test_invitations SET status = ? WHERE id = ?',
          ['expired', invitation.id]
        );
        return res.status(400).json({ success: false, message: 'Invitation has expired' });
      }

      // Check if already completed
      if (invitation.status === 'completed') {
        return res.status(400).json({ success: false, message: 'Test already completed' });
      }

      // Update status to accepted
      if (invitation.status === 'pending') {
        await req.db.query(
          'UPDATE test_invitations SET status = ?, accepted_at = NOW() WHERE id = ?',
          ['accepted', invitation.id]
        );
      }

      res.json({
        success: true,
        invitation: {
          id: invitation.id,
          testId: invitation.test_id,
          testTitle: invitation.title,
          testDescription: invitation.description,
          timeLimit: invitation.time_limit,
          questionCount: invitation.question_count,
          candidateName: invitation.candidate_name,
          candidateEmail: invitation.candidate_email,
          expiresAt: invitation.expires_at
        }
      });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async sendReminder(req, res) {
    try {
      const { invitationId } = req.params;
      await EmailService.sendTestReminder(invitationId, req.db);
      res.json({ success: true, message: 'Reminder sent successfully' });
    } catch (error) {
      console.error('Error sending reminder:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // In controllers/invitationController.js - Update acceptInvitation method
async acceptInvitation(req, res) {
  try {
    const { token } = req.params;

    const [invitations] = await req.db.query(
      `SELECT ti.*, t.title, t.description, t.time_limit, t.id as test_id,
       (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
       FROM test_invitations ti
       JOIN tests t ON ti.test_id = t.id
       WHERE ti.invitation_token = ?`,
      [token]
    );

    if (invitations.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invalid invitation link' 
      });
    }

    const invitation = invitations[0];

    // Check if expired
    if (new Date() > new Date(invitation.expires_at)) {
      await req.db.query(
        'UPDATE test_invitations SET status = ? WHERE id = ?',
        ['expired', invitation.id]
      );
      return res.status(400).json({ 
        success: false, 
        message: 'This invitation has expired' 
      });
    }

    // Check if already completed
    if (invitation.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already completed this test' 
      });
    }

    // Update status to accepted
    if (invitation.status === 'pending') {
      await req.db.query(
        'UPDATE test_invitations SET status = ?, accepted_at = NOW() WHERE id = ?',
        ['accepted', invitation.id]
      );
    }

    res.json({
      success: true,
      invitation: {
        id: invitation.id,
        testId: invitation.test_id,
        testTitle: invitation.title,
        testDescription: invitation.description,
        timeLimit: invitation.time_limit,
        questionCount: invitation.question_count,
        candidateName: invitation.candidate_name,
        candidateEmail: invitation.candidate_email,
        expiresAt: invitation.expires_at
      }
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

async verifyAccess(req, res) {
  try {
    const { invitationToken, testId } = req.body;
    const userId = req.user.id;

    // If no invitation token, allow access (normal test taking)
    if (!invitationToken) {
      return res.json({ success: true, message: 'Direct access allowed' });
    }

    // Verify invitation exists and is for this user
    const [invitations] = await req.db.query(
      `SELECT ti.*, t.id as test_id
       FROM test_invitations ti
       JOIN tests t ON ti.test_id = t.id
       WHERE ti.invitation_token = ? AND ti.test_id = ?`,
      [invitationToken, testId]
    );

    if (invitations.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid invitation for this test' 
      });
    }

    const invitation = invitations[0];

    // Check if expired
    if (new Date() > new Date(invitation.expires_at)) {
      return res.status(400).json({ 
        success: false, 
        message: 'This invitation has expired' 
      });
    }

    // Check if already completed
    if (invitation.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already completed this test' 
      });
    }

    // Verify the logged-in user matches the invitation email
    const [users] = await req.db.query(
      'SELECT email FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0 || users[0].email !== invitation.candidate_email) {
      return res.status(403).json({ 
        success: false, 
        message: 'This invitation is not for your account' 
      });
    }

    res.json({ success: true, message: 'Access verified' });
  } catch (error) {
    console.error('Error verifying access:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}

  async deleteInvitation(req, res) {
    try {
      const { invitationId } = req.params;
      await req.db.query('DELETE FROM test_invitations WHERE id = ?', [invitationId]);
      res.json({ success: true, message: 'Invitation cancelled' });
    } catch (error) {
      console.error('Error deleting invitation:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}


module.exports = new InvitationController();