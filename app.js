// app.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const database = require("./config/database"); // Use your existing database
const { authMiddleware, requireRole } = require("./middleware/auth");

const authRoutes = require("./routes/authRoutes");
const testRoutes = require("./routes/testRoutes");
const resultRoutes = require("./routes/resultRoutes");
const resultController = require("./controllers/resultController");
const proctoringRoutes = require("./routes/proctoringRoutes");
const invitationRoutes = require("./routes/InvitationRoutes"); // NEW
const questionTypeRoutes = require('./routes/questionTypeRoutes');
const userRoutes = require('./routes/userRoutes'); // NEW: Add this line



dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Add database to request object - using your existing database class
app.use((req, res, next) => {
  req.db = database.getPool();
  next();
});

// Admin route MUST come before other result routes
app.get("/api/admin/results", authMiddleware, requireRole("admin"), (req, res) => {
  resultController.getAllResults(req, res);
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tests", testRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/proctoring", proctoringRoutes);
app.use("/api/invitations", invitationRoutes); // NEW
app.use('/api/question-types', questionTypeRoutes);
app.use('/api/users', userRoutes); // NEW: Add this line

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

module.exports = app;