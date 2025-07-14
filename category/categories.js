const express = require('express');
const pool = require('../db');
const router = express.Router();
const getMessage = require('../utils/messages');
const verifyApiKey = require('../middleware/verifyApiKey');

// CREATE category
router.post('/create', verifyApiKey, async (req, res) => {
  const lang = req.headers['accept-language']?.split(',')[0] || 'en';
  const { name } = req.body;
  const { id: created_by, api_key, role } = req.user;

  if (role !== 'admin') {
    return res.status(403).json({ error: getMessage(lang, 'category.onlyAdmins') });
  }

  if (!name) {
    return res.status(400).json({ error: getMessage(lang, 'category.categoryRequired') });
  }

  try {
    // Step 1: Check for duplicate category for this API key
    const existing = await pool.query(
      `SELECT * FROM category WHERE LOWER(name) = LOWER($1) AND api_key = $2`,
      [name.trim(), api_key]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: getMessage(lang, 'category.alreadyExists') || 'Category already exists' });
    }

    // Step 2: Insert new category
    const result = await pool.query(
      `INSERT INTO category (api_key, created_by, name) VALUES ($1, $2, $3) RETURNING *`,
      [api_key, created_by, name.trim()]
    );

    res.status(201).json({ message: getMessage(lang, 'category.categoryCreated'), category: result.rows[0] });

  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: getMessage(lang, 'category.internalError') });
  }
});


// GET all categories for the logged-in admin
router.get('/', verifyApiKey, async (req, res) => {
  const lang = req.headers['accept-language']?.split(',')[0] || 'en';
  const { api_key, role } = req.user;

  if (role !== 'admin') {
    return res.status(403).json({ error: getMessage(lang, 'category.onlyAdmins') });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM category WHERE api_key = $1 ORDER BY created_at DESC`,
      [api_key]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: getMessage(lang, 'category.internalError') });
  }
});

// DELETE category by ID
router.delete('/:id', verifyApiKey, async (req, res) => {
  const lang = req.headers['accept-language']?.split(',')[0] || 'en';
  const { id: adminId, api_key, role } = req.user;
  const categoryId = req.params.id;

  if (role !== 'admin') {
    return res.status(403).json({ error: getMessage(lang, 'category.onlyAdmins') });
  }

  try {
    const check = await pool.query(
      `SELECT * FROM category WHERE id = $1 AND api_key = $2`,
      [categoryId, api_key]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: getMessage(lang, 'category.notFoundOrUnauthorized') });
    }

    await pool.query(`DELETE FROM category WHERE id = $1`, [categoryId]);

    res.json({ message: getMessage(lang, 'category.deletedSuccess') });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: getMessage(lang, 'category.internalError') });
  }
});

module.exports = router;
