require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../config/db');

async function migrate() {
  console.log('Starting Banking Partner Portal migration...');
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. banking_partner_portals
    await connection.query(`
      CREATE TABLE IF NOT EXISTS banking_partner_portals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        location VARCHAR(100) NULL,
        login_url TEXT NOT NULL,
        description TEXT NULL,
        logo_url VARCHAR(255) NULL,
        institution_type ENUM('Bank', 'NBFC') DEFAULT 'Bank',
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        display_order INT DEFAULT 0,
        created_by INT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_status (status),
        INDEX idx_deleted_at (deleted_at),
        INDEX idx_order (display_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure location column exists if table was created previously
    const [cols] = await connection.query('DESCRIBE banking_partner_portals');
    if (!cols.some(c => c.Field === 'location')) {
      await connection.query('ALTER TABLE banking_partner_portals ADD COLUMN location VARCHAR(100) NULL AFTER name');
    }

    // 2. employee_portal_access (Level A)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_portal_access (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL UNIQUE,
        has_access TINYINT(1) DEFAULT 0 NOT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_employee (employee_id),
        INDEX idx_has_access (has_access),
        CONSTRAINT fk_epa_employee FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. employee_bank_permissions (Level B)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_bank_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        portal_id INT NOT NULL,
        is_allowed TINYINT(1) DEFAULT 1 NOT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_emp_portal (employee_id, portal_id),
        INDEX idx_emp_portal (employee_id, portal_id),
        CONSTRAINT fk_ebp_employee FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ebp_portal FOREIGN KEY (portal_id) REFERENCES banking_partner_portals(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. banking_partner_audit_logs
    await connection.query(`
      CREATE TABLE IF NOT EXISTS banking_partner_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        target_type ENUM('portal', 'permission', 'bulk') NOT NULL,
        target_id INT NULL,
        details TEXT NULL,
        ip_address VARCHAR(45) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin (admin_id),
        INDEX idx_action (action_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Seed default lenders if banking_partner_portals is empty
    const [existing] = await connection.query('SELECT COUNT(*) as cnt FROM banking_partner_portals WHERE deleted_at IS NULL');
    if (existing[0].cnt === 0) {
      console.log('Seeding initial banking partner portals...');
      const initialPortals = [
        {
          name: 'HDFC Bank',
          login_url: 'https://netbanking.hdfcbank.com/netbanking/',
          description: 'HDFC Bank NetBanking and Partner Lead Portal for loan processing.',
          logo_url: '/icons/lenders/hdfc-bank-logo.png',
          institution_type: 'Bank',
          status: 'Active',
          display_order: 1
        },
        {
          name: 'ICICI Bank',
          login_url: 'https://corporate.icicibank.com/',
          description: 'ICICI Bank Corporate & Lending Partner Portal for business applications.',
          logo_url: '/icons/lenders/icici-bank-logo.png',
          institution_type: 'Bank',
          status: 'Active',
          display_order: 2
        },
        {
          name: 'IDFC FIRST Bank',
          login_url: 'https://my.idfcfirstbank.com/',
          description: 'IDFC FIRST Bank Partner Portal for retail and business loan servicing.',
          logo_url: '/icons/lenders/idfc-first-bank-logo.png',
          institution_type: 'Bank',
          status: 'Active',
          display_order: 3
        },
        {
          name: 'InCred Finance',
          login_url: 'https://partner.incred.com/',
          description: 'InCred Personal and Business Loan Partner Login Portal.',
          logo_url: '/icons/lenders/incred-finance-logo.png',
          institution_type: 'NBFC',
          status: 'Active',
          display_order: 4
        }
      ];

      for (const p of initialPortals) {
        await connection.query(
          `INSERT INTO banking_partner_portals (name, login_url, description, logo_url, institution_type, status, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [p.name, p.login_url, p.description, p.logo_url, p.institution_type, p.status, p.display_order]
        );
      }
      console.log(`Seeded ${initialPortals.length} initial portals.`);
    } else {
      console.log('Banking partner portals already exist, skipping seed.');
    }

    await connection.commit();
    console.log('Banking Partner Portal migration completed successfully.');
  } catch (err) {
    await connection.rollback();
    console.error('Migration failed:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = migrate;
