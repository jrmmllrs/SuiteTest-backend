// controllers/departmentController.js
const database = require("../config/database"); // ✅ this import is required

exports.getAllDepartments = async (req, res) => {
  try {
    const db = await database.initialize(); // ✅ get the MySQL pool

    const [departments] = await db.query(`
      SELECT 
        d.*,
        COUNT(DISTINCT u.id) AS user_count,
        COUNT(DISTINCT t.id) AS test_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      LEFT JOIN tests t ON d.id = t.department_id
      GROUP BY d.id
      ORDER BY d.department_name ASC
    `);

    res.json({ success: true, departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch departments" });
  }
};



// GET department by ID
exports.getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT 
        d.*,
        COUNT(DISTINCT u.id) AS user_count,
        COUNT(DISTINCT t.id) AS test_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      LEFT JOIN tests t ON d.id = t.department_id
      WHERE d.id = ?
      GROUP BY d.id
    `;
    const [departments] = await db.query(query, [id]);

    if (departments.length === 0)
      return res.status(404).json({ success: false, message: "Department not found" });

    res.json({ success: true, department: departments[0] });
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({ success: false, message: "Failed to fetch department" });
  }
};

// CREATE department
exports.createDepartment = async (req, res) => {
  try {
    const { department_name, description, is_active = true } = req.body;
    if (!department_name?.trim()) {
      return res.status(400).json({ success: false, message: "Department name is required" });
    }

    const [existing] = await db.query(
      "SELECT id FROM departments WHERE department_name = ?",
      [department_name.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "A department with this name already exists" });
    }

    const [result] = await db.query(
      "INSERT INTO departments (department_name, description, is_active) VALUES (?, ?, ?)",
      [department_name.trim(), description?.trim() || null, is_active ? 1 : 0]
    );

    const [newDept] = await db.query("SELECT * FROM departments WHERE id = ?", [result.insertId]);
    res.status(201).json({ success: true, message: "Department created successfully", department: newDept[0] });
  } catch (error) {
    console.error("Error creating department:", error);
    res.status(500).json({ success: false, message: "Failed to create department" });
  }
};

// UPDATE department
exports.updateDepartment = async (req, res) => {
  try {
    const db = database.getPool(); // ✅ Initialize db connection pool here
    const { id } = req.params;
    const { department_name, description, is_active } = req.body;

    const [existing] = await db.query("SELECT id FROM departments WHERE id = ?", [id]);
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: "Department not found" });

    if (!department_name?.trim()) {
      return res.status(400).json({ success: false, message: "Department name is required" });
    }

    const [conflict] = await db.query(
      "SELECT id FROM departments WHERE department_name = ? AND id != ?",
      [department_name.trim(), id]
    );
    if (conflict.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "A department with this name already exists" });
    }

    await db.query(
      "UPDATE departments SET department_name=?, description=?, is_active=? WHERE id=?",
      [department_name.trim(), description?.trim() || null, is_active ? 1 : 0, id]
    );

    const [updated] = await db.query("SELECT * FROM departments WHERE id=?", [id]);
    res.json({ success: true, message: "Department updated successfully", department: updated[0] });
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({ success: false, message: "Failed to update department" });
  }
};
// DELETE department
exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query("SELECT id, department_name FROM departments WHERE id=?", [id]);
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: "Department not found" });

    if (existing[0].department_name.toLowerCase() === "question bank") {
      return res.status(400).json({ success: false, message: "Cannot delete the Question Bank department" });
    }

    await db.query("DELETE FROM departments WHERE id=?", [id]);
    res.json({ success: true, message: "Department deleted successfully. Users and tests have been unassigned." });
  } catch (error) {
    console.error("Error deleting department:", error);
    res.status(500).json({ success: false, message: "Failed to delete department" });
  }
};
