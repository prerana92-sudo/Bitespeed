const express = require('express');
const knex = require('knex');
require('dotenv').config();
const contactsRouter = require('./src/routes/contact.routes');
const app = express();
app.use(express.json());

// Use routes
app.use('/', contactsRouter);
// Initialize the knex instance
const knexInstance = knex({
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST || 'db',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'Bitespeed_Contacts',
  },
  migrations: {
    directory: './migrations',
  },
  seeds: {
    directory: './db/seeds',
  },
});

// Function to run migrations
async function runMigrations() {
  try {
    await knexInstance.migrate.latest();
    console.log('Migrations ran successfully.');
  } catch (error) {
    console.error('Error running migrations:', error);
  }
}

// Start the server after running migrations
runMigrations().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});


