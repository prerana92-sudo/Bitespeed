const express = require('express');
const router = express.Router();
const contactsController = require('../controller/contact.controller');

// Define routes
router.post('/identify', contactsController.identifyContact);

module.exports = router;
