// ==============================
// SuiteTest Backend Server
// ==============================
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mysql = require("mysql2");

// ==============================
// Environment Configuration
// ==============================
dotenv.config();

// ==============================
// Database Connection
// ==============================
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "testgorilla_db",
  port: process.env.DB_PORT || 3306,
  ssl:
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: true } // for Aiven or other managed databases
      : false,
});

db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL database");
  }
});

// ==============================
// Express App Setup
// ==============================
const app = express();
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*", // Allow all or restrict to frontend
    credentials: true,
  })
);
app.use(express.json());

// ==============================
// Routes
// ==============================
app.get("/", (req, res) => {
  res.json({
    message: "✅ Backend API is running",
    environment: process.env.NODE_ENV || "development",
    database: process.env.DB_NAME || "testgorilla_db",
  });
});

// Example: simple test route to check DB
app.get("/api/test-db", (req, res) => {
  db.query("SELECT NOW() AS currentTime", (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, serverTime: results[0].currentTime });
  });
});

// ==============================
// Server Start
// ==============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Export app for Vercel
module.exports = app;
