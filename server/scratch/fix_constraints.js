const pool = require('../db');

async function main() {
  try {
    console.log("Dropping existing constraint...");
    await pool.query("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_user_id_fkey");
    
    console.log("Adding correct constraint referencing users(id)...");
    await pool.query("ALTER TABLE tasks ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE");
    
    console.log("Database constraints updated successfully.");
  } catch (err) {
    console.error("Error updating constraints:", err);
  } finally {
    await pool.end();
  }
}

main();
