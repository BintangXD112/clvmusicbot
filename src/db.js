const mysql = require('mysql2/promise');

let pool = null;
let dbConnected = false;

async function initDb() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT) || 3306;

  if (!host || !user || !database) {
    console.log('\x1b[33m[DB WARN] Variabel MySQL (DB_HOST, DB_USER, DB_NAME) belum diset di .env. Menggunakan Mode Fallback Auth (Admin Default).\x1b[0m');
    return false;
  }

  try {
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    const conn = await pool.getConnection();
    conn.release();

    dbConnected = true;
    console.log(`\x1b[32m✅ [DB SUCCESS] Berhasil terhubung ke MySQL Database "${database}" di ${host}:${port}\x1b[0m`);

    // Ensure users table exists automatically
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`username\` VARCHAR(50) NOT NULL UNIQUE,
        \`password\` VARCHAR(255) NOT NULL,
        \`role\` ENUM('admin', 'operator') DEFAULT 'admin',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure default admin user exists if table is empty
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM users');
    if (rows[0].cnt === 0) {
      const defaultHash = await bcrypt.hash('adminpassword', 10);
      await pool.query(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        ['admin', defaultHash, 'admin']
      );
      console.log('\x1b[32m✅ [DB INITIALIZED] Akun default admin ("admin" / "adminpassword") berhasil dibuat di database MySQL.\x1b[0m');
    }

    return true;
  } catch (err) {
    dbConnected = false;
    console.error(`\x1b[31m❌ [DB ERROR] Gagal terhubung ke MySQL (${err.message}). Menggunakan Mode Fallback Auth.\x1b[0m`);
    return false;
  }
}

module.exports = {
  initDb,
  isDbConnected: () => dbConnected
};
