const express = require('express');
const app = express();
const bodyParser = require('body-parser');
require('dotenv').config();


app.use(express.json());
app.use(bodyParser.json());

// Import routes
const contactsRouter = require('./src/routes/contact.routes');

// Use routes
app.use('/', contactsRouter);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
