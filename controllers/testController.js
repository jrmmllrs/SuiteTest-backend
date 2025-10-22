// controllers/testController.js
const database = require("../config/database");
const EmailService = require("../services/emailService");

// Constants
const SCORE_REMARKS = [
  { min: 90, remark: "Excellent" },
  { min: 75, remark: "Very Good" },
  { min: 60, remark: "Good" },
  { min: 50, remark: "Fair" },
  { min: 0, remark: "Needs Improvement" },
];

const AUTO_GRADED_TYPES = ["multiple_choice", "true_false"];

const SQL_QUERIES = {
  selectTestById: `SELECT id, title, description, time_limit, created_by,
    pdf_url, google_drive_id, thumbnail_url, test_type, target_role, department_id,
    enable_proctoring, max_tab_switches, allow_copy_paste, require_fullscreen,
    created_at FROM tests WHERE id = ?`,

  selectTestsForTaking: `SELECT id, title, description, time_limit, test_type, target_role, department_id,
    pdf_url, google_drive_id, thumbnail_url FROM tests WHERE id = ?`,

  selectMyTests: `SELECT 
    t.id, t.title, t.description, t.time_limit, t.created_at, t.department_id,
    t.enable_proctoring, t.max_tab_switches,
    t.pdf_url, t.google_drive_id, t.thumbnail_url, t.test_type, t.target_role,
    d.department_name,
    COUNT(q.id) as question_count 
   FROM tests t 
   LEFT JOIN questions q ON t.id = q.test_id
   LEFT JOIN departments d ON t.department_id = d.id
   WHERE t.created_by = ? 
   GROUP BY t.id 
   ORDER BY t.created_at DESC`,

  selectAvailableTests: `SELECT 
    t.id, t.title, t.description, t.time_limit, t.created_at, t.department_id,
    t.enable_proctoring, t.test_type, t.target_role,
    t.pdf_url, t.google_drive_id, t.thumbnail_url,
    d.department_name,
    u.name as created_by_name
   FROM tests t 
   LEFT JOIN users u ON t.created_by = u.id
   LEFT JOIN departments d ON t.department_id = d.id
   WHERE t.target_role = ? AND t.is_active = 1
   ORDER BY t.created_at DESC`,

  selectTestsForCandidate: `SELECT 
    t.id, t.title, t.description, t.time_limit, t.created_at, t.department_id,
    t.test_type, t.target_role,
    t.pdf_url, t.google_drive_id, t.thumbnail_url,
    d.department_name,
    u.name as created_by_name
   FROM tests t 
   LEFT JOIN users u ON t.created_by = u.id
   LEFT JOIN departments d ON t.department_id = d.id
   WHERE t.target_role = 'candidate' AND t.is_active = 1 AND t.department_id = ?
   ORDER BY t.created_at DESC`,

  selectQuestions: `SELECT id, question_text, question_type, options, correct_answer, explanation 
    FROM questions WHERE test_id = ? ORDER BY id`,

  selectQuestionsForReview: `SELECT 
    q.id, q.question_text, q.question_type, q.options, q.correct_answer, q.explanation,
    a.answer as user_answer, a.is_correct
   FROM questions q
   LEFT JOIN answers a ON q.id = a.question_id AND a.candidate_id = ?
   WHERE q.test_id = ?
   ORDER BY q.id`,

selectTestResults: `SELECT 
    r.id, r.candidate_id, r.test_id, r.total_questions, r.correct_answers,
    r.score, r.remarks, r.taken_at, r.finished_at,
    u.name as candidate_name, u.email as candidate_email
   FROM results r
   INNER JOIN users u ON r.candidate_id = u.id
   WHERE r.test_id = ?
   GROUP BY r.id
   ORDER BY r.taken_at DESC`,
};

class TestController {
  // ============ Authorization & Validation ============

  async authorizeTestAccess(userId, testId, role = null) {
    const db = database.getPool();
    const [tests] = await db.execute(
      "SELECT created_by FROM tests WHERE id = ?",
      [testId]
    );

    if (tests.length === 0) {
      throw { status: 404, message: "Test not found" };
    }

    const isCreator = tests[0].created_by === userId;
    const isAdmin = role === "admin";

    if (!isCreator && !isAdmin) {
      throw { status: 403, message: "Unauthorized" };
    }

    return tests[0];
  }

  async getTestData(testId, query = SQL_QUERIES.selectTestById) {
    const db = database.getPool();
    const [tests] = await db.execute(query, [testId]);

    if (tests.length === 0) {
      throw { status: 404, message: "Test not found" };
    }

    return tests[0];
  }

  validateAnswers(answers) {
    if (!answers || typeof answers !== "object") {
      throw { status: 400, message: "Answers are required" };
    }
  }

  validateTimeRemaining(timeRemaining) {
    if (
      timeRemaining === undefined ||
      timeRemaining === null ||
      timeRemaining < 0
    ) {
      throw { status: 400, message: "Invalid time_remaining value" };
    }
  }

  // ============ Utility Methods ============

  parseOptions(options) {
    if (!options) return [];
    if (Array.isArray(options)) return options;

    if (typeof options === "string") {
      if (options.startsWith("[") || options.startsWith("{")) {
        try {
          return JSON.parse(options);
        } catch (e) {
          // Fall through to comma-separated parsing
        }
      }

      return options
        .split(",")
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);
    }

    return [];
  }

  calculateRemarks(score) {
    const remark = SCORE_REMARKS.find((r) => score >= r.min);
    return remark ? remark.remark : "Needs Improvement";
  }

  enrichWithParsedOptions(items) {
    return items.map((item) => ({
      ...item,
      options: this.parseOptions(item.options),
    }));
  }

  // ============ Test Retrieval ============

  async getTestById(req, res) {
    try {
      const test = await this.getTestData(
        req.params.id,
        SQL_QUERIES.selectTestById
      );

      await this.authorizeTestAccess(req.user.id, req.params.id, req.user.role);

      const [questions] = await database
        .getPool()
        .execute(SQL_QUERIES.selectQuestions, [req.params.id]);

      res.json({
        success: true,
        test: {
          ...test,
          questions: this.enrichWithParsedOptions(questions),
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PART 1: Update getTestForTaking to record start time
  async getTestForTaking(req, res) {
    try {
      const db = database.getPool();
      const { id: testId } = req.params;
      const userId = req.user.id;

      // Check if already completed
      const [results] = await db.execute(
        "SELECT id FROM results WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      if (results.length > 0) {
        return res.status(403).json({
          success: false,
          message: "You have already completed this test.",
        });
      }

      const test = await this.getTestData(
        testId,
        SQL_QUERIES.selectTestsForTaking
      );

      // Verify role eligibility
      if (test.target_role !== req.user.role) {
        return res.status(403).json({
          success: false,
          message: `This test is only available for ${test.target_role}s`,
        });
      }

      // If candidate, verify department access
      if (req.user.role === "candidate" && test.department_id) {
        const [userDept] = await db.execute(
          "SELECT department_id FROM users WHERE id = ?",
          [userId]
        );

        if (
          userDept.length === 0 ||
          userDept[0].department_id !== test.department_id
        ) {
          return res.status(403).json({
            success: false,
            message: "This test is not available for your department",
          });
        }
      }

      // **NEW: Create or update candidates_tests record with start_time**
      const [existingTest] = await db.execute(
        "SELECT id, start_time FROM candidates_tests WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      if (existingTest.length === 0) {
        // First time taking the test - record start time
        await db.execute(
          "INSERT INTO candidates_tests (candidate_id, test_id, start_time, status, time_remaining) VALUES (?, ?, NOW(), 'in_progress', ?)",
          [userId, testId, test.time_limit * 60] // Convert minutes to seconds
        );
      }

      const [questions] = await db.execute(
        "SELECT id, question_text, question_type, options FROM questions WHERE test_id = ?",
        [testId]
      );

      res.json({
        success: true,
        test: {
          ...test,
          questions: this.enrichWithParsedOptions(questions),
        },
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // PART 2: Updated submitTest method
  async submitTest(req, res) {
    const db = database.getPool();
    const connection = await db.getConnection();

    try {
      const { answers } = req.body;
      const { id: testId } = req.params;
      const userId = req.user.id;

      this.validateAnswers(answers);

      await connection.beginTransaction();

      // Verify test hasn't been completed already
      const [existingResults] = await connection.execute(
        "SELECT id FROM results WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      if (existingResults.length > 0) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "You have already submitted this test.",
        });
      }

      const test = await this.getTestData(
        testId,
        "SELECT * FROM tests WHERE id = ?"
      );

      const [questions] = await connection.execute(
        "SELECT id, question_type, correct_answer FROM questions WHERE test_id = ?",
        [testId]
      );

      if (questions.length === 0) {
        await connection.rollback();
        throw { status: 400, message: "No questions found for this test" };
      }

      // **CRITICAL: Get the ORIGINAL start time**
      const [candidateTest] = await connection.execute(
        "SELECT start_time FROM candidates_tests WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      // If no start_time exists, use current time (fallback)
      const startTime =
        candidateTest.length > 0 && candidateTest[0].start_time
          ? candidateTest[0].start_time
          : new Date();

      // Grade answers and save results
      const { correctCount, totalAutoGraded } = await this.gradeAnswers(
        connection,
        questions,
        answers,
        userId
      );

      const score =
        totalAutoGraded > 0
          ? Math.round((correctCount / totalAutoGraded) * 100)
          : 0;

      const remarks = this.calculateRemarks(score);

      // **IMPORTANT: Insert with BOTH taken_at (start) and finished_at (now)**
      await connection.execute(
        "INSERT INTO results (candidate_id, test_id, total_questions, correct_answers, score, remarks, taken_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
        [
          userId,
          testId,
          totalAutoGraded,
          correctCount,
          score,
          remarks,
          startTime,
        ]
      );

      // Update candidates_tests to completed
      await connection.execute(
        "UPDATE candidates_tests SET end_time = NOW(), score = ?, status = 'completed', saved_answers = NULL, time_remaining = NULL WHERE candidate_id = ? AND test_id = ?",
        [score, userId, testId]
      );

      await connection.commit();

      // Send notification email
      await this.sendCompletionNotification(
        userId,
        testId,
        test.title,
        totalAutoGraded,
        correctCount,
        score,
        remarks
      ).catch((err) => console.error("Error sending completion email:", err));

      res.status(201).json({
        success: true,
        message: "Test submitted successfully",
        submission: {
          score,
          total_questions: totalAutoGraded,
          correct_answers: correctCount,
          remarks,
        },
      });
    } catch (error) {
      await connection.rollback();
      this.handleError(res, error);
    } finally {
      connection.release();
    }
  }

async getAllQuestions(req, res) {
  try {
    const db = database.getPool();
    const userId = req.user.id;
    const userRole = req.user.role;

    // 👉 Add this: check if the request is for the Question Bank
    const isQuestionBank = req.query.source === "question-bank"; 

    if (isQuestionBank) {
      // 🔹 Always return questions from the Question Bank department only
      const [questions] = await db.execute(`
        SELECT 
          q.id, 
          q.test_id,
          q.question_text, 
          q.question_type, 
          q.options, 
          q.correct_answer, 
          q.explanation,
          q.created_at,
          t.title AS test_title,
          t.test_type,
          t.target_role,
          t.department_id,
          d.department_name
        FROM questions q
        LEFT JOIN tests t ON q.test_id = t.id
        LEFT JOIN departments d ON t.department_id = d.id
        WHERE d.department_name = 'Question Bank'
        AND t.is_active = 1
        ORDER BY q.created_at DESC
      `);

      const enrichedQuestions = questions.map(q => ({
        ...q,
        options: this.parseOptions(q.options)
      }));

      return res.json({
        success: true,
        questions: enrichedQuestions
      });
    }

    // 🔹 Existing logic below for admin/employer/candidate roles
    const [userInfo] = await db.execute(
      "SELECT department_id FROM users WHERE id = ?",
      [userId]
    );

    if (userInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const userDepartmentId = userInfo[0].department_id;

    let query;
    let params;

    if (userRole === 'admin') {
      query = `
        SELECT q.id, q.test_id, q.question_text, q.question_type, q.options, 
               q.correct_answer, q.explanation, q.created_at, 
               t.title AS test_title, t.test_type, t.target_role, 
               t.department_id, d.department_name
        FROM questions q
        LEFT JOIN tests t ON q.test_id = t.id
        LEFT JOIN departments d ON t.department_id = d.id
        WHERE t.is_active = 1
        ORDER BY q.created_at DESC
      `;
      params = [];
    } else if (userRole === 'employer') {
      if (userDepartmentId) {
        query = `
          SELECT q.id, q.test_id, q.question_text, q.question_type, q.options, 
                 q.correct_answer, q.explanation, q.created_at, 
                 t.title AS test_title, t.test_type, t.target_role, 
                 t.department_id, d.department_name
          FROM questions q
          LEFT JOIN tests t ON q.test_id = t.id
          LEFT JOIN departments d ON t.department_id = d.id
          WHERE (t.created_by = ? OR t.department_id = ?) 
          AND t.is_active = 1
          ORDER BY q.created_at DESC
        `;
        params = [userId, userDepartmentId];
      } else {
        query = `
          SELECT q.id, q.test_id, q.question_text, q.question_type, q.options, 
                 q.correct_answer, q.explanation, q.created_at, 
                 t.title AS test_title, t.test_type, t.target_role, 
                 t.department_id, d.department_name
          FROM questions q
          LEFT JOIN tests t ON q.test_id = t.id
          LEFT JOIN departments d ON t.department_id = d.id
          WHERE t.created_by = ? AND t.is_active = 1
          ORDER BY q.created_at DESC
        `;
        params = [userId];
      }
    } else {
      if (!userDepartmentId) {
        return res.json({
          success: true,
          questions: []
        });
      }

      query = `
        SELECT q.id, q.test_id, q.question_text, q.question_type, q.options, 
               q.correct_answer, q.explanation, q.created_at, 
               t.title AS test_title, t.test_type, t.target_role, 
               t.department_id, d.department_name
        FROM questions q
        LEFT JOIN tests t ON q.test_id = t.id
        LEFT JOIN departments d ON t.department_id = d.id
        WHERE t.department_id = ? 
        AND t.target_role = 'candidate'
        AND t.is_active = 1
        ORDER BY q.created_at DESC
      `;
      params = [userDepartmentId];
    }

    const [questions] = await db.execute(query, params);

    const enrichedQuestions = questions.map(q => ({
      ...q,
      options: this.parseOptions(q.options)
    }));

    res.json({
      success: true,
      questions: enrichedQuestions
    });

  } catch (error) {
    this.handleError(res, error);
  }
}

  async getMyTests(req, res) {
    try {
      const db = database.getPool();
      const [tests] = await db.execute(SQL_QUERIES.selectMyTests, [
        req.user.id,
      ]);

      res.json({ success: true, tests });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getAvailableTests(req, res) {
    try {
      const db = database.getPool();
      const userId = req.user.id;
      const userRole = req.user.role;

      let query = SQL_QUERIES.selectAvailableTests;
      let params = [userRole];

      // If candidate, filter by their department
      if (userRole === "candidate") {
        const [userDept] = await db.execute(
          "SELECT department_id FROM users WHERE id = ?",
          [userId]
        );

        if (userDept.length === 0 || !userDept[0].department_id) {
          return res.json({ success: true, tests: [] });
        }

        query = SQL_QUERIES.selectTestsForCandidate;
        params = [userDept[0].department_id];
      }

      const [tests] = await db.execute(query, params);

      const enrichedTests = await Promise.all(
        tests.map((test) => this.enrichTestWithMetadata(db, test, userId))
      );

      res.json({ success: true, tests: enrichedTests });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async enrichTestWithMetadata(db, test, userId) {
    const [questions] = await db.execute(
      "SELECT COUNT(*) as count FROM questions WHERE test_id = ?",
      [test.id]
    );

    const [results] = await db.execute(
      "SELECT id FROM results WHERE test_id = ? AND candidate_id = ?",
      [test.id, userId]
    );

    const [candidateTests] = await db.execute(
      "SELECT status FROM candidates_tests WHERE test_id = ? AND candidate_id = ?",
      [test.id, userId]
    );

    return {
      ...test,
      question_count: questions[0].count,
      is_completed: results.length > 0,
      is_in_progress:
        candidateTests.length > 0 && candidateTests[0].status === "in_progress",
    };
  }

  // ============ Test Status & Progress ============
  // ============ Test Status & Progress ============

  async getActiveTest(req, res) {
    try {
      const db = database.getPool();
      const userId = req.user.id;

      // Check for TRULY in-progress test (with saved answers or time spent)
      const [candidateTests] = await db.execute(
        `SELECT ct.test_id, ct.start_time, ct.time_remaining, ct.saved_answers,
         t.title, t.time_limit, t.test_type
         FROM candidates_tests ct
         INNER JOIN tests t ON ct.test_id = t.id
         WHERE ct.candidate_id = ? 
         AND ct.status = 'in_progress'
         AND (ct.saved_answers IS NOT NULL OR TIMESTAMPDIFF(SECOND, ct.start_time, NOW()) > 5)
         ORDER BY ct.start_time DESC
         LIMIT 1`,
        [userId]
      );

      if (candidateTests.length > 0) {
        const activeTest = candidateTests[0];

        // Double-check: Verify test is not already completed
        const [results] = await db.execute(
          "SELECT id FROM results WHERE candidate_id = ? AND test_id = ?",
          [userId, activeTest.test_id]
        );

        if (results.length > 0) {
          // Test already completed, clean up the stale record
          await db.execute(
            "UPDATE candidates_tests SET status = 'completed' WHERE candidate_id = ? AND test_id = ?",
            [userId, activeTest.test_id]
          );

          return res.json({
            success: true,
            activeTest: null,
          });
        }

        return res.json({
          success: true,
          activeTest: {
            test_id: activeTest.test_id,
            title: activeTest.title,
            start_time: activeTest.start_time,
            time_remaining: activeTest.time_remaining,
            saved_answers: activeTest.saved_answers
              ? JSON.parse(activeTest.saved_answers)
              : {},
            test_type: activeTest.test_type,
          },
        });
      }

      res.json({
        success: true,
        activeTest: null,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }
  async getTestStatus(req, res) {
    try {
      const db = database.getPool();
      const { id: testId } = req.params;
      const userId = req.user.id;

      // Check if test has been completed
      const [results] = await db.execute(
        "SELECT id, score, taken_at FROM results WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      if (results.length > 0) {
        return res.json({
          success: true,
          status: "completed",
          result: results[0],
        });
      }

      // Check if test is in progress
      const [candidateTests] = await db.execute(
        "SELECT start_time, saved_answers, time_remaining FROM candidates_tests WHERE candidate_id = ? AND test_id = ? AND status = 'in_progress'",
        [userId, testId]
      );

      if (candidateTests.length > 0) {
        const ct = candidateTests[0];
        return res.json({
          success: true,
          status: "in_progress",
          start_time: ct.start_time,
          time_remaining: ct.time_remaining,
          saved_answers: ct.saved_answers ? JSON.parse(ct.saved_answers) : {},
        });
      }

      res.json({ success: true, status: "not_started" });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async saveProgress(req, res) {
    try {
      const db = database.getPool();
      const { id: testId } = req.params;
      const userId = req.user.id;
      const { answers, time_remaining } = req.body;

      this.validateTimeRemaining(time_remaining);

      await this.getTestData(
        testId,
        "SELECT time_limit FROM tests WHERE id = ?"
      );

      const [existingRecord] = await db.execute(
        "SELECT id, start_time FROM candidates_tests WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      if (existingRecord.length > 0) {
        await db.execute(
          "UPDATE candidates_tests SET saved_answers = ?, time_remaining = ?, status = 'in_progress' WHERE candidate_id = ? AND test_id = ?",
          [JSON.stringify(answers), time_remaining, userId, testId]
        );
      } else {
        // First save - record the actual start time
        await db.execute(
          "INSERT INTO candidates_tests (candidate_id, test_id, start_time, saved_answers, time_remaining, status) VALUES (?, ?, NOW(), ?, ?, 'in_progress')",
          [userId, testId, JSON.stringify(answers), time_remaining]
        );
      }

      res.json({
        success: true,
        message: "Progress saved",
        time_remaining,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ============ Test Submission & Grading ============

  // Replace your submitTest method with this fixed version

  async submitTest(req, res) {
    const db = database.getPool();
    const connection = await db.getConnection();

    try {
      const { answers } = req.body;
      const { id: testId } = req.params;
      const userId = req.user.id;

      this.validateAnswers(answers);

      await connection.beginTransaction();

      // Verify test hasn't been completed already
      const [existingResults] = await connection.execute(
        "SELECT id FROM results WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      if (existingResults.length > 0) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "You have already submitted this test.",
        });
      }

      const test = await this.getTestData(
        testId,
        "SELECT * FROM tests WHERE id = ?"
      );
      const [questions] = await connection.execute(
        "SELECT id, question_type, correct_answer FROM questions WHERE test_id = ?",
        [testId]
      );

      if (questions.length === 0) {
        await connection.rollback();
        throw { status: 400, message: "No questions found for this test" };
      }

      // Get the start time from candidates_tests if it exists
      const [candidateTest] = await connection.execute(
        "SELECT start_time FROM candidates_tests WHERE candidate_id = ? AND test_id = ?",
        [userId, testId]
      );

      const startTime =
        candidateTest.length > 0 && candidateTest[0].start_time
          ? candidateTest[0].start_time
          : new Date();

      // Grade answers and save results
      const { correctCount, totalAutoGraded } = await this.gradeAnswers(
        connection,
        questions,
        answers,
        userId
      );

      const score =
        totalAutoGraded > 0
          ? Math.round((correctCount / totalAutoGraded) * 100)
          : 0;

      const remarks = this.calculateRemarks(score);

      // Insert results with proper taken_at and finished_at
      await connection.execute(
        "INSERT INTO results (candidate_id, test_id, total_questions, correct_answers, score, remarks, taken_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
        [
          userId,
          testId,
          totalAutoGraded,
          correctCount,
          score,
          remarks,
          startTime,
        ]
      );

      // Update candidates_tests status
      if (candidateTest.length > 0) {
        // Update existing record
        await connection.execute(
          "UPDATE candidates_tests SET end_time = NOW(), score = ?, status = 'completed', saved_answers = NULL, time_remaining = NULL WHERE candidate_id = ? AND test_id = ?",
          [score, userId, testId]
        );
      } else {
        // Insert new record (in case user submitted without progress save)
        await connection.execute(
          "INSERT INTO candidates_tests (candidate_id, test_id, start_time, end_time, score, status) VALUES (?, ?, ?, NOW(), ?, 'completed')",
          [userId, testId, startTime, score]
        );
      }

      await connection.commit();

      // Send notification email
      await this.sendCompletionNotification(
        userId,
        testId,
        test.title,
        totalAutoGraded,
        correctCount,
        score,
        remarks
      ).catch((err) => console.error("Error sending completion email:", err));

      res.status(201).json({
        success: true,
        message: "Test submitted successfully",
        submission: {
          score,
          total_questions: totalAutoGraded,
          correct_answers: correctCount,
          remarks,
        },
      });
    } catch (error) {
      await connection.rollback();
      this.handleError(res, error);
    } finally {
      connection.release();
    }
  }

  async gradeAnswers(connection, questions, answers, userId) {
    let correctCount = 0;
    let totalAutoGraded = 0;

    for (const question of questions) {
      const userAnswer = answers[question.id];
      const isAutoGraded = AUTO_GRADED_TYPES.includes(question.question_type);

      if (isAutoGraded) {
        totalAutoGraded++;
        const isCorrect = userAnswer === question.correct_answer;
        if (isCorrect) correctCount++;

        await connection.execute(
          "INSERT INTO answers (candidate_id, question_id, answer, is_correct) VALUES (?, ?, ?, ?)",
          [userId, question.id, userAnswer || null, isCorrect ? 1 : 0]
        );
      } else {
        await connection.execute(
          "INSERT INTO answers (candidate_id, question_id, answer, is_correct) VALUES (?, ?, ?, ?)",
          [userId, question.id, userAnswer || null, 0]
        );
      }
    }

    return { correctCount, totalAutoGraded };
  }

  // Fixed sendCompletionNotification method for testController.js

  async sendCompletionNotification(
    userId,
    testId,
    testTitle,
    totalAutoGraded,
    correctCount,
    score,
    remarks
  ) {
    try {
      const db = database.getPool();

      // Get user details
      const [users] = await db.execute(
        "SELECT name, email FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        console.warn(`User ${userId} not found for completion notification`);
        return;
      }

      const user = users[0];

      // Send email notification (if EmailService exists)
      try {
        if (
          EmailService &&
          typeof EmailService.sendCompletionNotification === "function"
        ) {
          await EmailService.sendCompletionNotification(
            user.email,
            user.name,
            testTitle,
            {
              completionTime: new Date().toLocaleString(),
              totalQuestions: totalAutoGraded,
              correctAnswers: correctCount,
              score,
              remarks,
            },
            db
          );
        }
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Don't throw - email failure shouldn't block test submission
      }

      // Update invitation status if exists
      try {
        // Check if completed_at column exists
        const [columns] = await db.execute(
          `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'test_invitations' 
         AND COLUMN_NAME = 'completed_at'`
        );

        if (columns.length > 0) {
          // Column exists, use it
          await db.execute(
            "UPDATE test_invitations SET status = ?, completed_at = NOW() WHERE candidate_email = ? AND test_id = ? AND status != ?",
            ["completed", user.email, testId, "completed"]
          );
        } else {
          // Column doesn't exist, update without it
          await db.execute(
            "UPDATE test_invitations SET status = ? WHERE candidate_email = ? AND test_id = ? AND status != ?",
            ["completed", user.email, testId, "completed"]
          );
        }
      } catch (invitationError) {
        console.error("Error updating invitation status:", invitationError);
        // Don't throw - invitation update failure shouldn't block test submission
      }
    } catch (error) {
      console.error("Error in sendCompletionNotification:", error);
      // Don't throw - notification failure shouldn't block test submission
    }
  }

  // ============ Test Results & Review ============

  async getTestResults(req, res) {
    try {
      await this.authorizeTestAccess(req.user.id, req.params.id, req.user.role);

      const db = database.getPool();
      const [results] = await db.execute(SQL_QUERIES.selectTestResults, [
        req.params.id,
      ]);

      res.json({ success: true, results });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getAnswerReview(req, res) {
    try {
      const db = database.getPool();
      const { id: testId, candidateId } = req.params;
      const userId = req.user.id;

      const test = await this.getTestData(
        testId,
        "SELECT created_by, title, description FROM tests WHERE id = ?"
      );

      // Check authorization
      const isAuthorized =
        req.user.role === "admin" ||
        test.created_by === userId ||
        candidateId == userId;

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const [results] = await db.execute(
        "SELECT id, score, total_questions, correct_answers, remarks, taken_at FROM results WHERE candidate_id = ? AND test_id = ?",
        [candidateId, testId]
      );

      if (results.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No results found for this test",
        });
      }

      const [questions] = await db.execute(
        SQL_QUERIES.selectQuestionsForReview,
        [candidateId, testId]
      );

      res.json({
        success: true,
        test: {
          id: testId,
          title: test.title,
          description: test.description,
        },
        result: results[0],
        questions: this.enrichWithParsedOptions(questions),
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  // ============ Test CRUD Operations ============

  async create(req, res) {
    const db = database.getPool();
    const connection = await db.getConnection();

    try {
      const {
        title,
        description,
        time_limit,
        questions,
        pdf_url,
        google_drive_id,
        thumbnail_url,
        test_type,
        target_role,
        department_id,
        enable_proctoring = true,
        max_tab_switches = 3,
        allow_copy_paste = false,
        require_fullscreen = true,
      } = req.body;

      if (!title || !questions || questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Title and at least one question are required",
        });
      }

      if (test_type === "pdf_based" && !pdf_url) {
        return res.status(400).json({
          success: false,
          message: "PDF URL is required for PDF-based tests",
        });
      }

      if (target_role === "candidate" && !department_id) {
        return res.status(400).json({
          success: false,
          message: "Department is required for candidate tests",
        });
      }

      await connection.beginTransaction();

      const [testResult] = await connection.execute(
        `INSERT INTO tests (
        title, description, time_limit, created_by,
        pdf_url, google_drive_id, thumbnail_url, test_type, target_role, department_id,
        enable_proctoring, max_tab_switches, allow_copy_paste, require_fullscreen, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          description || null,
          time_limit || 30,
          req.user.id,
          pdf_url || null,
          google_drive_id || null,
          thumbnail_url || null,
          test_type || "standard",
          target_role || "candidate",
          target_role === "candidate" ? department_id : null,
          enable_proctoring ? 1 : 0,
          max_tab_switches,
          allow_copy_paste ? 1 : 0,
          require_fullscreen ? 1 : 0,
          1,
        ]
      );

      await this.insertQuestions(connection, testResult.insertId, questions);
      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Test created successfully",
        testId: testResult.insertId,
      });
    } catch (error) {
      await connection.rollback();
      this.handleError(res, error);
    } finally {
      connection.release();
    }
  }

  async update(req, res) {
    const db = database.getPool();
    const connection = await db.getConnection();

    try {
      const { id: testId } = req.params;
      const {
        title,
        description,
        time_limit,
        questions,
        pdf_url,
        google_drive_id,
        thumbnail_url,
        test_type,
        target_role,
        department_id,
        enable_proctoring,
        max_tab_switches,
        allow_copy_paste,
        require_fullscreen,
      } = req.body;

      await this.authorizeTestAccess(req.user.id, testId, req.user.role);

      await connection.beginTransaction();

      await connection.execute(
        `UPDATE tests SET 
        title = ?, description = ?, time_limit = ?,
        pdf_url = ?, google_drive_id = ?, thumbnail_url = ?,
        test_type = ?, target_role = ?, department_id = ?,
        enable_proctoring = ?, max_tab_switches = ?, 
        allow_copy_paste = ?, require_fullscreen = ?
      WHERE id = ?`,
        [
          title,
          description || null,
          time_limit || 30,
          pdf_url || null,
          google_drive_id || null,
          thumbnail_url || null,
          test_type || "standard",
          target_role || "candidate",
          target_role === "candidate" ? department_id : null,
          enable_proctoring !== undefined ? (enable_proctoring ? 1 : 0) : 1,
          max_tab_switches !== undefined ? max_tab_switches : 3,
          allow_copy_paste !== undefined ? (allow_copy_paste ? 1 : 0) : 0,
          require_fullscreen !== undefined ? (require_fullscreen ? 1 : 0) : 1,
          testId,
        ]
      );

      if (questions && questions.length > 0) {
        await connection.execute("DELETE FROM questions WHERE test_id = ?", [
          testId,
        ]);
        await this.insertQuestions(connection, testId, questions);
      }

      await connection.commit();

      res.json({
        success: true,
        message: "Test updated successfully",
      });
    } catch (error) {
      await connection.rollback();
      this.handleError(res, error);
    } finally {
      connection.release();
    }
  }

  async delete(req, res) {
    const db = database.getPool();
    const connection = await db.getConnection();

    try {
      const { id: testId } = req.params;

      // Authorization check
      await this.authorizeTestAccess(req.user.id, testId, req.user.role);

      await connection.beginTransaction();

      // Delete in proper order to maintain referential integrity
      // 1. Delete answers first (references questions and candidates)
      await connection.execute(
        "DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE test_id = ?)",
        [testId]
      );

      // 2. Delete proctoring events
      await connection.execute(
        "DELETE FROM proctoring_events WHERE test_id = ?",
        [testId]
      );

      // 3. Delete test invitations
      await connection.execute(
        "DELETE FROM test_invitations WHERE test_id = ?",
        [testId]
      );

      // 4. Delete candidates_tests (test progress/status)
      await connection.execute(
        "DELETE FROM candidates_tests WHERE test_id = ?",
        [testId]
      );

      // 5. Delete results
      await connection.execute("DELETE FROM results WHERE test_id = ?", [
        testId,
      ]);

      // 6. Delete questions
      await connection.execute("DELETE FROM questions WHERE test_id = ?", [
        testId,
      ]);

      // 7. Finally, delete the test itself
      const [deleteResult] = await connection.execute(
        "DELETE FROM tests WHERE id = ?",
        [testId]
      );

      if (deleteResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Test not found or already deleted",
        });
      }

      await connection.commit();

      res.json({
        success: true,
        message: "Test and all associated data deleted successfully",
      });
    } catch (error) {
      await connection.rollback();
      this.handleError(res, error);
    } finally {
      connection.release();
    }
  }

  // ============ Helper Methods ============

  async insertQuestions(connection, testId, questions) {
    for (const question of questions) {
      await connection.execute(
        "INSERT INTO questions (test_id, question_text, question_type, options, correct_answer, explanation) VALUES (?, ?, ?, ?, ?, ?)",
        [
          testId,
          question.question_text,
          question.question_type,
          question.options || null,
          question.correct_answer || null,
          question.explanation || null,
        ]
      );
    }
  }

  handleError(res, error) {
    if (error.status && error.message) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Unhandled error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "An unexpected error occurred",
    });
  }
}

module.exports = new TestController();
