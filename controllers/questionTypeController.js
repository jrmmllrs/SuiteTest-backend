// controllers/questionTypeController.js
const database = require("../config/database");

class QuestionTypeController {
  // Get all active question types
  async getQuestionTypes(req, res) {
    try {
      const db = database.getPool();
      const [types] = await db.execute(
        `SELECT 
          id, 
          type_key, 
          type_name, 
          description, 
          requires_options, 
          requires_correct_answer 
        FROM question_types 
        WHERE is_active = TRUE 
        ORDER BY type_name ASC`
      );

      res.json({
        success: true,
        questionTypes: types,
      });
    } catch (error) {
      console.error("Error fetching question types:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch question types",
      });
    }
  }

  // Get usage statistics for all question types
  async getUsageStats(req, res) {
    try {
      const db = database.getPool();
      
      // Count how many questions use each question type
      // Note: Using type_key string matching since questions table uses question_type field
      const [stats] = await db.execute(
        `SELECT 
          qt.id,
          COUNT(q.id) as usage_count
        FROM question_types qt
        LEFT JOIN questions q ON qt.type_key = q.question_type
        WHERE qt.is_active = TRUE
        GROUP BY qt.id`
      );

      // Convert to object for easier lookup
      const statsObj = {};
      stats.forEach(stat => {
        statsObj[stat.id] = stat.usage_count;
      });

      res.json({
        success: true,
        stats: statsObj,
      });
    } catch (error) {
      console.error("Error fetching usage stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch usage statistics",
      });
    }
  }

  // Get detailed usage for a specific question type
  async getTypeUsageDetails(req, res) {
    try {
      const { id } = req.params;
      const db = database.getPool();

      // Get the question type details
      const [typeDetails] = await db.execute(
        `SELECT * FROM question_types WHERE id = ? AND is_active = TRUE`,
        [id]
      );

      if (typeDetails.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Question type not found",
        });
      }

      // Get questions using this type (join on type_key string)
      const [questions] = await db.execute(
        `SELECT 
          q.id,
          q.question_text,
          q.points,
          t.title as test_title,
          t.id as test_id
        FROM questions q
        JOIN tests t ON q.test_id = t.id
        WHERE q.question_type = ?
        ORDER BY t.title, q.id`,
        [typeDetails[0].type_key]
      );

      res.json({
        success: true,
        questionType: typeDetails[0],
        questions,
        totalUsage: questions.length,
      });
    } catch (error) {
      console.error("Error fetching type usage details:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch usage details",
      });
    }
  }

  // Create new question type (admin only)
  async createQuestionType(req, res) {
    try {
      const { type_key, type_name, description, requires_options, requires_correct_answer } = req.body;

      // Validate required fields
      if (!type_key || !type_name) {
        return res.status(400).json({
          success: false,
          message: "Type key and type name are required",
        });
      }

      // Validate type_key format (lowercase, underscore only)
      if (!/^[a-z_]+$/.test(type_key)) {
        return res.status(400).json({
          success: false,
          message: "Type key must contain only lowercase letters and underscores",
        });
      }

      const db = database.getPool();

      await db.execute(
        `INSERT INTO question_types 
        (type_key, type_name, description, requires_options, requires_correct_answer) 
        VALUES (?, ?, ?, ?, ?)`,
        [
          type_key,
          type_name,
          description || null,
          requires_options ? 1 : 0,
          requires_correct_answer ? 1 : 0,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Question type created successfully",
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(400).json({
          success: false,
          message: "Question type with this key already exists",
        });
      }

      console.error("Error creating question type:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create question type",
      });
    }
  }

  // Update question type (admin only)
  async updateQuestionType(req, res) {
    try {
      const { id } = req.params;
      const { type_name, description, requires_options, requires_correct_answer, is_active } = req.body;

      const db = database.getPool();

      const [result] = await db.execute(
        `UPDATE question_types 
        SET type_name = ?, 
            description = ?, 
            requires_options = ?, 
            requires_correct_answer = ?,
            is_active = ?
        WHERE id = ?`,
        [
          type_name,
          description || null,
          requires_options !== undefined ? (requires_options ? 1 : 0) : 0,
          requires_correct_answer !== undefined ? (requires_correct_answer ? 1 : 0) : 0,
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          id,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Question type not found",
        });
      }

      res.json({
        success: true,
        message: "Question type updated successfully",
      });
    } catch (error) {
      console.error("Error updating question type:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update question type",
      });
    }
  }

  // Delete (deactivate) question type (admin only)
  async deleteQuestionType(req, res) {
    try {
      const { id } = req.params;
      const db = database.getPool();

      // Get the type_key first
      const [typeInfo] = await db.execute(
        `SELECT type_key FROM question_types WHERE id = ?`,
        [id]
      );

      if (typeInfo.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Question type not found",
        });
      }

      // Check if this type is being used (join on type_key string)
      const [usage] = await db.execute(
        `SELECT COUNT(*) as count FROM questions WHERE question_type = ?`,
        [typeInfo[0].type_key]
      );

      // Soft delete by setting is_active to false
      const [result] = await db.execute(
        "UPDATE question_types SET is_active = FALSE WHERE id = ?",
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Question type not found",
        });
      }

      res.json({
        success: true,
        message: usage[0].count > 0 
          ? `Question type deactivated. ${usage[0].count} existing question(s) remain unchanged.`
          : "Question type deactivated successfully",
        affectedQuestions: usage[0].count,
      });
    } catch (error) {
      console.error("Error deleting question type:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete question type",
      });
    }
  }

  // Bulk operations for question types
  async bulkUpdate(req, res) {
    try {
      const { ids, updates } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid IDs provided",
        });
      }

      const db = database.getPool();
      const placeholders = ids.map(() => '?').join(',');
      
      let updateQuery = "UPDATE question_types SET ";
      const queryParams = [];

      if (updates.is_active !== undefined) {
        updateQuery += "is_active = ? ";
        queryParams.push(updates.is_active ? 1 : 0);
      }

      updateQuery += `WHERE id IN (${placeholders})`;
      queryParams.push(...ids);

      await db.execute(updateQuery, queryParams);

      res.json({
        success: true,
        message: `${ids.length} question type(s) updated successfully`,
      });
    } catch (error) {
      console.error("Error in bulk update:", error);
      res.status(500).json({
        success: false,
        message: "Failed to perform bulk update",
      });
    }
  }
}

module.exports = new QuestionTypeController();