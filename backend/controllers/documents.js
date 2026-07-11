const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { requireAuth } = require('../middleware/auth');

// Any logged-in user (admin or employee) may hit this — the controller
// itself checks whether THIS user is allowed to see THIS specific document.
router.get('/:id/view', requireAuth, documentController.viewDocument);

module.exports = router;