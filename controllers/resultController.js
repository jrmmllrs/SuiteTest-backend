// controllers/resultController.js
const database = require("../config/database");

class ResultController {
  async getUserResults(req, res) {
    try {
      const db = database.getPool();
      const [results] = await db.execute(
        `SELECT r.*, t.title, t.time_limit, t.description
         FROM results r
         JOIN tests t ON r.test_id = t.id
         WHERE r.candidate_id = ?
         ORDER BY r.taken_at DESC`,
        [req.user.id]
      );

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error("Error fetching results:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch results",
      });
    }
  }

  async getAllResults(req, res) {
    try {
      const db = database.getPool();
      const [results] = await db.execute(
        `SELECT r.id, r.score, r.remarks, r.taken_at,
                t.title as test_title,
                u.name as candidate_name,
                u.email as candidate_email
         FROM results r
         JOIN tests t ON r.test_id = t.id
         JOIN users u ON r.candidate_id = u.id
         ORDER BY r.taken_at DESC`
      );

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error("Error fetching admin results:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch results",
      });
    }
  }
}

module.exports = new ResultController();