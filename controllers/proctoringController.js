// controllers/proctoringController.js
const database = require("../config/database");

class ProctoringController {
  async logEvent(req, res) {
    const { test_id, event_type, event_data } = req.body;
    const candidate_id = req.user.id;

    if (!test_id || !event_type) {
      return res.status(400).json({
        success: false,
        message: "test_id and event_type are required",
      });
    }

    const db = database.getPool();
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // Log the event
      await connection.execute(
        "INSERT INTO proctoring_events (candidate_id, test_id, event_type, event_data) VALUES (?, ?, ?, ?)",
        [
          candidate_id,
          test_id,
          event_type,
          event_data ? JSON.stringify(event_data) : null,
        ]
      );

      // Update violation counts in candidates_tests
      if (event_type === "tab_switch") {
        await connection.execute(
          `INSERT INTO candidates_tests (candidate_id, test_id, tab_switch_count, violation_count, status) 
           VALUES (?, ?, 1, 1, 'in_progress')
           ON DUPLICATE KEY UPDATE 
           tab_switch_count = tab_switch_count + 1,
           violation_count = violation_count + 1`,
          [candidate_id, test_id]
        );
      } else if (
        ["copy_attempt", "paste_attempt", "fullscreen_exit"].includes(
          event_type
        )
      ) {
        await connection.execute(
          `INSERT INTO candidates_tests (candidate_id, test_id, violation_count, status) 
           VALUES (?, ?, 1, 'in_progress')
           ON DUPLICATE KEY UPDATE 
           violation_count = violation_count + 1`,
          [candidate_id, test_id]
        );
      }

      // Check if candidate should be flagged
      const [testSettings] = await connection.execute(
        "SELECT max_tab_switches FROM tests WHERE id = ?",
        [test_id]
      );

      if (testSettings.length > 0) {
        const maxTabSwitches = testSettings[0].max_tab_switches;

        const [candidateTest] = await connection.execute(
          "SELECT tab_switch_count FROM candidates_tests WHERE candidate_id = ? AND test_id = ?",
          [candidate_id, test_id]
        );

        if (
          candidateTest.length > 0 &&
          candidateTest[0].tab_switch_count > maxTabSwitches
        ) {
          await connection.execute(
            "UPDATE candidates_tests SET flagged = TRUE WHERE candidate_id = ? AND test_id = ?",
            [candidate_id, test_id]
          );
        }
      }

      await connection.commit();

      // Get updated counts
      const [counts] = await connection.execute(
        "SELECT tab_switch_count, violation_count, flagged FROM candidates_tests WHERE candidate_id = ? AND test_id = ?",
        [candidate_id, test_id]
      );

      const responseData =
        counts.length > 0
          ? counts[0]
          : {
              tab_switch_count: 0,
              violation_count: 0,
              flagged: false,
            };

      res.json({
        success: true,
        message: "Event logged",
        ...responseData,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Error logging proctoring event:", error);
      res.status(500).json({
        success: false,
        message: "Failed to log event",
      });
    } finally {
      connection.release();
    }
  }

  async getTestEvents(req, res) {
    try {
      const db = database.getPool();
      const { testId } = req.params;

      // Check authorization - only test creator or admin can view
      const [tests] = await db.execute(
        "SELECT created_by FROM tests WHERE id = ?",
        [testId]
      );

      if (tests.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Test not found",
        });
      }

      if (tests[0].created_by !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const [events] = await db.execute(
        `SELECT pe.*, u.name as candidate_name, u.email as candidate_email
         FROM proctoring_events pe
         JOIN users u ON pe.candidate_id = u.id
         WHERE pe.test_id = ?
         ORDER BY pe.created_at DESC`,
        [testId]
      );

      // Parse event_data JSON
      const parsedEvents = events.map((event) => ({
        ...event,
        event_data:
          event.event_data && typeof event.event_data === "string"
            ? JSON.parse(event.event_data)
            : event.event_data || null,
      }));

      res.json({
        success: true,
        events: parsedEvents,
      });
    } catch (error) {
      console.error("Error fetching proctoring events:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch events",
      });
    }
  }

  async getCandidateEvents(req, res) {
    try {
      const db = database.getPool();
      const { testId, candidateId } = req.params;

      // Check authorization
      const [tests] = await db.execute(
        "SELECT created_by FROM tests WHERE id = ?",
        [testId]
      );

      if (tests.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Test not found",
        });
      }

      if (tests[0].created_by !== req.user.id && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const [events] = await db.execute(
        `SELECT * FROM proctoring_events 
         WHERE test_id = ? AND candidate_id = ?
         ORDER BY created_at DESC`,
        [testId, candidateId]
      );

      const parsedEvents = events.map((event) => ({
        ...event,
        event_data:
          event.event_data && typeof event.event_data === "string"
            ? JSON.parse(event.event_data)
            : event.event_data || null,
      }));

      // Get summary counts
      const [summary] = await db.execute(
        `SELECT 
          SUM(CASE WHEN event_type = 'tab_switch' THEN 1 ELSE 0 END) as tab_switches,
          SUM(CASE WHEN event_type = 'copy_attempt' THEN 1 ELSE 0 END) as copy_attempts,
          SUM(CASE WHEN event_type = 'paste_attempt' THEN 1 ELSE 0 END) as paste_attempts,
          SUM(CASE WHEN event_type = 'fullscreen_exit' THEN 1 ELSE 0 END) as fullscreen_exits,
          COUNT(*) as total_events
         FROM proctoring_events 
         WHERE test_id = ? AND candidate_id = ?`,
        [testId, candidateId]
      );

      res.json({
        success: true,
        events: parsedEvents,
        summary: summary[0],
      });
    } catch (error) {
      console.error("Error fetching candidate events:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch events",
      });
    }
  }

  async getTestSettings(req, res) {
    try {
      const db = database.getPool();
      const { testId } = req.params;

      const [tests] = await db.execute(
        "SELECT enable_proctoring, max_tab_switches, allow_copy_paste, require_fullscreen FROM tests WHERE id = ?",
        [testId]
      );

      if (tests.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Test not found",
        });
      }

      res.json({
        success: true,
        settings: tests[0],
      });
    } catch (error) {
      console.error("Error fetching test settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch settings",
      });
    }
  }
}

module.exports = new ProctoringController();
