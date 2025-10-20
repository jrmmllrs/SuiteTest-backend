// config/database.js
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

class Database {
  constructor() {
    this.pool = null;
  }

  async initialize() {
    if (this.pool) return this.pool;

    try {
      // Check if a local Aiven CA certificate exists (optional)
      const caPath = path.join(__dirname, "ca.pem");
      const sslConfig = fs.existsSync(caPath)
        ? { ca: fs.readFileSync(caPath) }
        : { rejectUnauthorized: false }; // ✅ fallback for self-signed certs

      this.pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: sslConfig, // ✅ updated SSL config
      });

      // Test connection
      const [rows] = await this.pool.query("SELECT NOW() AS now");
      console.log("✅ Connected to MySQL:", rows[0].now);

      return this.pool;
    } catch (err) {
      console.error("❌ MySQL connection failed:", err);
      throw err;
    }
  }

  getPool() {
    if (!this.pool) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.pool;
  }
}

module.exports = new Database();
