const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const database = require("../config/database");

class AuthController {
  async register(req, res) {
    const { name, email, password, role, department_id } = req.body;

    // Basic validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate role
    if (!["employer", "candidate", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    // Department validation for candidates
    if (role === "candidate" && !department_id) {
      return res.status(400).json({
        success: false,
        message: "Department is required for candidates",
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    try {
      const db = database.getPool();

      // Check if email already exists
      const [existing] = await db.execute(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Email already registered",
        });
      }

      // If candidate, verify department exists and is active
      if (role === "candidate" && department_id) {
        const [deptCheck] = await db.execute(
          "SELECT id FROM departments WHERE id = ? AND is_active = 1",
          [department_id]
        );

        if (deptCheck.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid department selected",
          });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user with department
      const [result] = await db.execute(
        "INSERT INTO users (name, email, password, role, department_id) VALUES (?, ?, ?, ?, ?)",
        [
          name,
          email,
          hashedPassword,
          role,
          role === "candidate" ? department_id : null,
        ]
      );

      // Get the created user with department info
      const [newUser] = await db.execute(
        `SELECT u.id, u.name, u.email, u.role, u.department_id, d.department_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE u.id = ?`,
        [result.insertId]
      );

      const user = newUser[0];

      // Generate token
      const token = this.generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department_id: user.department_id,
          department_name: user.department_name,
        },
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to register user",
      });
    }
  }

  async login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    try {
      const db = database.getPool();

      // Get user with department info
      const [users] = await db.execute(
        `SELECT u.id, u.name, u.email, u.password, u.role, u.department_id, d.department_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE u.email = ?`,
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const user = users[0];

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.password);

      if (!passwordValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      // Generate token
      const token = this.generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      res.json({
        success: true,
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department_id: user.department_id,
          department_name: user.department_name,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Login failed",
      });
    }
  }

  async getCurrentUser(req, res) {
    try {
      const db = database.getPool();

      // Get user with department info
      const [users] = await db.execute(
        `SELECT u.id, u.name, u.email, u.role, u.department_id, d.department_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE u.id = ?`,
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        user: users[0],
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user",
      });
    }
  }

  async verifyToken(req, res) {
    try {
      const db = database.getPool();

      // Get user with department info
      const [users] = await db.execute(
        `SELECT u.id, u.name, u.email, u.role, u.department_id, d.department_name
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE u.id = ?`,
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        user: users[0],
      });
    } catch (error) {
      console.error("Token verification error:", error);
      res.status(500).json({
        success: false,
        message: "Token verification failed",
      });
    }
  }

  generateToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET || "your-secret-key", {
      expiresIn: "7d",
    });
  }
}

module.exports = new AuthController();