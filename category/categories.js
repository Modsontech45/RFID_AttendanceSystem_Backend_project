// routes/categories.js
const express = require('express');
const pool = require('../db');
const router = express.Router();
const verifyApiKey = require('../middleware/verifyApiKey');

// CREATE category
router.post('/create', verifyApiKey, async (req, res) => {
  const { name } = req.body;
  const { id: created_by, api_key, role } = req.user;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can create categories.' });
  }

  if (!name) {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO category (api_key, created_by, name) VALUES ($1, $2, $3) RETURNING *`,
      [api_key, created_by, name]
    );
    res.status(201).json({ message: 'Category created', category: result.rows[0] });
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all categories for the logged-in admin
router.get('/', verifyApiKey, async (req, res) => {
  const { api_key, role } = req.user;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can fetch categories.' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM category WHERE api_key = $1 ORDER BY created_at DESC`,
      [api_key]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE category by ID
router.delete('/:id', verifyApiKey, async (req, res) => {
  const { id: adminId, api_key, role } = req.user;
  const categoryId = req.params.id;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete categories.' });
  }

  try {
    // Check if category exists and was created by this admin
    const check = await pool.query(
      `SELECT * FROM category WHERE id = $1 AND api_key = $2`,
      [categoryId, api_key]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found or unauthorized.' });
    }

    await pool.query(`DELETE FROM category WHERE id = $1`, [categoryId]);

    res.json({ message: 'Category deleted successfully.' });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
