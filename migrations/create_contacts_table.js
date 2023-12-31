exports.up = function (knex) {
    // Create the "contacts" table
    return knex.schema.createTable('contacts', function (table) {
      table.increments('id').primary();
      table.string('phoneNumber').nullable();
      table.string('email').nullable();
      table.string('linkPrecedence').notNullable().defaultTo('primary');
      table.integer('linkedId').unsigned().nullable();
      table.timestamps(true, true);
    })
  };
  
  exports.down = function (knex) {
    return knex.schema.dropTable('contacts');
  };
  