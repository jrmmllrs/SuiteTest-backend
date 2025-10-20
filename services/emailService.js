// services/emailService.js
const nodemailer = require("nodemailer");
const crypto = require("crypto");

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    console.log("📧 Email Configuration:");
    console.log("   HOST:", process.env.EMAIL_HOST || "NOT SET");
    console.log("   PORT:", process.env.EMAIL_PORT || "NOT SET");
    console.log("   USER:", process.env.EMAIL_USER || "NOT SET");
    console.log(
      "   PASSWORD:",
      process.env.EMAIL_PASSWORD ? "***SET***" : "NOT SET"
    );

    if (
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASSWORD
    ) {
      console.error("❌ Email configuration missing in .env file!");
      console.error(
        "   Required: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD"
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        secure: process.env.EMAIL_SECURE === "true",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        debug: true,
        logger: true,
      });

      console.log("✅ Email transporter initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize email transporter:", error);
    }
  }

  async sendTestInvitation(invitationData, db) {
    if (!this.transporter) {
      throw new Error("Email service not configured. Check your .env file.");
    }

    const {
      testId,
      candidateEmail,
      candidateName,
      invitedBy,
      testTitle,
      testDescription,
      timeLimit,
      questionCount,
      invitedByName,
    } = invitationData;

    const invitationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    try {
      const [result] = await db.query(
        `INSERT INTO test_invitations 
         (test_id, candidate_email, candidate_name, invited_by, invitation_token, expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [
          testId,
          candidateEmail,
          candidateName,
          invitedBy,
          invitationToken,
          expiresAt,
        ]
      );

      const invitationId = result.insertId;

      // FIX: Add hash (#) to the URL for hash-based routing
      const invitationLink = `${process.env.FRONTEND_URL}/#/invitation/${invitationToken}`;

      const mailOptions = {
        from:
          process.env.EMAIL_FROM || `"TestGorilla" <${process.env.EMAIL_USER}>`,
        to: candidateEmail,
        subject: `Test Invitation: ${testTitle}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { 
                display: inline-block;
                background-color: #10B981; 
                color: white !important; 
                padding: 14px 28px; 
                text-decoration: none; 
                border-radius: 6px; 
                font-weight: bold;
                margin: 20px 0;
              }
              .button:hover { background-color: #059669; }
              .details { 
                background-color: white; 
                padding: 20px; 
                border-radius: 6px; 
                margin: 20px 0;
                border-left: 4px solid #4F46E5;
              }
              .details ul { list-style: none; padding: 0; }
              .details li { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
              .details li:last-child { border-bottom: none; }
              .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
              .link-box { 
                background-color: #f3f4f6; 
                padding: 10px; 
                border-radius: 4px; 
                word-break: break-all; 
                font-size: 12px;
                margin-top: 10px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🎯 Test Invitation</h1>
              </div>
              <div class="content">
                <h2 style="color: #4F46E5; margin-top: 0;">Hello ${candidateName}! 👋</h2>
                <p><strong>${invitedByName}</strong> has invited you to take the test:</p>
                <h3 style="color: #1f2937;">"${testTitle}"</h3>
                
                <div class="details">
                  <h3 style="margin-top: 0; color: #4F46E5;">📋 Test Details</h3>
                  <ul>
                    <li><strong>Description:</strong> ${
                      testDescription || "No description provided"
                    }</li>
                    <li><strong>Questions:</strong> ${questionCount} question${
          questionCount > 1 ? "s" : ""
        }</li>
                    <li><strong>Time Limit:</strong> ${timeLimit} minutes ⏱️</li>
                    <li><strong>Valid Until:</strong> ${expiresAt.toLocaleDateString(
                      "en-US",
                      {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }
                    )}</li>
                  </ul>
                </div>

                <div style="text-align: center;">
                  <a href="${invitationLink}" class="button">
                    🚀 Start Test Now
                  </a>
                </div>

                <p style="color: #6b7280; font-size: 14px;">
                  <strong>Note:</strong> Click the button above to access your test. If the button doesn't work, 
                  copy and paste the link below into your browser:
                </p>
                
                <div class="link-box">
                  ${invitationLink}
                </div>

                <div class="footer">
                  <p>This invitation expires on ${expiresAt.toLocaleString()}</p>
                  <p style="color: #9ca3af;">© ${new Date().getFullYear()} TestGorilla. All rights reserved.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      console.log("📧 Attempting to send email to:", candidateEmail);
      console.log("🔗 Invitation link:", invitationLink);

      const info = await this.transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully! Message ID:", info.messageId);

      return { invitationId, invitationToken };
    } catch (error) {
      console.error("❌ Error sending email:", error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendTestReminder(invitationId, db) {
    if (!this.transporter) {
      throw new Error("Email service not configured");
    }

    const [invitations] = await db.query(
      `SELECT ti.*, t.title, t.description, u.name as invited_by_name
       FROM test_invitations ti
       JOIN tests t ON ti.test_id = t.id
       JOIN users u ON ti.invited_by = u.id
       WHERE ti.id = ?`,
      [invitationId]
    );

    if (invitations.length === 0) {
      throw new Error("Invitation not found");
    }

    const invitation = invitations[0];
    // FIX: Add hash (#) to the URL
    const invitationLink = `${process.env.FRONTEND_URL}/#/invitation/${invitation.invitation_token}`;

    const mailOptions = {
      from:
        process.env.EMAIL_FROM || `"TestGorilla" <${process.env.EMAIL_USER}>`,
      to: invitation.candidate_email,
      subject: `⏰ Reminder: Test Invitation - ${invitation.title}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #FEF3C7; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { 
              display: inline-block;
              background-color: #10B981; 
              color: white !important; 
              padding: 14px 28px; 
              text-decoration: none; 
              border-radius: 6px; 
              font-weight: bold;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">⏰ Test Reminder</h1>
            </div>
            <div class="content">
              <h2>Hi ${invitation.candidate_name},</h2>
              <p>This is a friendly reminder that you have a pending test invitation from <strong>${
                invitation.invited_by_name
              }</strong>.</p>
              
              <p><strong>Test:</strong> ${invitation.title}</p>
              <p><strong>Expires:</strong> ${new Date(
                invitation.expires_at
              ).toLocaleString()}</p>
              
              <div style="text-align: center;">
                <a href="${invitationLink}" class="button">
                  🚀 Start Test Now
                </a>
              </div>

              <p style="text-align: center; font-size: 12px; color: #92400E;">
                Or copy this link: <br>${invitationLink}
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    console.log("✅ Reminder email sent to:", invitation.candidate_email);
  }

  async sendCompletionNotification(
    candidateEmail,
    candidateName,
    testTitle,
    details,
    db
  ) {
    if (!this.transporter) {
      console.warn(
        "⚠️  Email service not configured, skipping completion notification"
      );
      return;
    }

    const mailOptions = {
      from:
        process.env.EMAIL_FROM || `"TestGorilla" <${process.env.EMAIL_USER}>`,
      to: candidateEmail,
      subject: `✅ Test Completed: ${testTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .score { font-size: 48px; font-weight: bold; color: #10B981; text-align: center; margin: 20px 0; }
            .details { background-color: white; padding: 20px; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✅ Test Completed!</h1>
            </div>
            <div class="content">
              <h2>Hi ${candidateName},</h2>
              <p>Congratulations! You have successfully completed the test: <strong>${testTitle}</strong></p>
              
              <div class="score">${details.score}%</div>
              
              <div class="details">
                <h3>📊 Test Results</h3>
                <ul style="list-style: none; padding: 0;">
                  <li><strong>Completion Time:</strong> ${
                    details.completionTime
                  }</li>
                  <li><strong>Total Questions:</strong> ${
                    details.totalQuestions
                  }</li>
                  <li><strong>Correct Answers:</strong> ${
                    details.correctAnswers || "N/A"
                  }</li>
                  <li><strong>Score:</strong> ${details.score}%</li>
                  <li><strong>Remarks:</strong> ${details.remarks}</li>
                </ul>
              </div>
              
              <p>Your results will be reviewed and you'll be notified of the outcome.</p>
              <p>Thank you for participating! 🎉</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    console.log("✅ Completion notification sent to:", candidateEmail);
  }
}

module.exports = new EmailService();
