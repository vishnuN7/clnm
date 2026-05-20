const bcrypt = require('bcryptjs');
const UserModel = require('../models/userModel');
const CustomerModel = require('../models/customerModel');
const LoanModel = require('../models/loanModel');
const DocumentModel = require('../models/documentModel');

const adminController = {
  // ── Dashboard ───────────────────────────────────────────────
  async getDashboard(req, res) {
    try {
      const loanStats = await LoanModel.getDashboardStats();
      const [customers] = [await CustomerModel.getAll()];
      const employees = await UserModel.getAll('employee');

      return res.json({
        success: true,
        data: {
          totalCustomers: customers.length,
          totalEmployees: employees.length,
          loans: loanStats
        }
      });
    } catch (err) {
      console.error('[Admin] Dashboard error:', err);
      return res.status(500).json({ success: false, message: 'Failed to load dashboard data.' });
    }
  },

  // ── Employees ───────────────────────────────────────────────
  async getEmployees(req, res) {
    try {
      const employees = await UserModel.getAll('employee');
      // Remove password field from response
      const safeEmployees = employees.map(emp => {
        const { password, ...safe } = emp;
        return safe;
      });
      return res.json({ success: true, data: safeEmployees });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to fetch employees.' });
    }
  },

  async addEmployee(req, res) {
    try {
      const { name, email, password, phone } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
      }

      const existing = await UserModel.findByEmail(email);
      if (existing) {
        return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const id = await UserModel.create({ name, email: email.toLowerCase(), password: hashedPassword, role: 'employee', phone });

      return res.status(201).json({ success: true, message: 'Employee created successfully.', id });
    } catch (err) {
      console.error('[Admin] Add employee error:', err);
      return res.status(500).json({ success: false, message: 'Failed to create employee.' });
    }
  },

  async deactivateEmployee(req, res) {
    try {
      const { id } = req.params;
      await UserModel.deactivate(id);
      return res.json({ success: true, message: 'Employee deactivated.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to deactivate employee.' });
    }
  },

  async activateEmployee(req, res) {
    try {
      const { id } = req.params;
      await UserModel.activate(id);
      return res.json({ success: true, message: 'Employee activated.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to activate employee.' });
    }
  },

  async updateEmployeePassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.trim().length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await UserModel.updatePassword(id, hashedPassword);

      return res.json({ success: true, message: 'Employee password updated successfully.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to update employee password.' });
    }
  },

  // ── Customers ───────────────────────────────────────────────
  async getCustomers(req, res) {
    try {
      const { area, search } = req.query;
      const customers = await CustomerModel.getAll({ area, search });
      return res.json({ success: true, data: customers });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to fetch customers.' });
    }
  },

  async getCustomerDetail(req, res) {
    try {
      const { id } = req.params;
      const customer = await CustomerModel.findById(id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

      const documents = await DocumentModel.getByCustomer(id);
      const loans = await LoanModel.getAll({ customer_id: id });

      return res.json({ success: true, data: { customer, documents, loans } });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to fetch customer details.' });
    }
  },

  // ── Loans ───────────────────────────────────────────────────
  async getLoans(req, res) {
    try {
      const { status, area, period, search } = req.query;
      const loans = await LoanModel.getAll({ status, area, period, search });
      return res.json({ success: true, data: loans });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to fetch loans.' });
    }
  },

  async getAreas(req, res) {
    try {
      const areas = await CustomerModel.getAreas();
      return res.json({ success: true, data: areas });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to fetch areas.' });
    }
  },

  // ── Export ──────────────────────────────────────────────────
  async exportLoans(req, res) {
    try {
      const { status, area, period } = req.query;
      const loans = await LoanModel.getAll({ status, area, period });

      // Build CSV manually
      const headers = ['ID', 'Customer', 'Area', 'Phone', 'Amount', 'Purpose', 'Status', 'Applied By', 'Date'];
      const rows = loans.map(l => [
        l.id,
        `"${l.customer_name}"`,
        `"${l.area}"`,
        l.customer_phone,
        l.amount,
        `"${l.purpose || ''}"`,
        l.status,
        `"${l.applied_by_name}"`,
        new Date(l.created_at).toLocaleDateString('en-IN')
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="loans_export_${Date.now()}.csv"`);
      return res.send(csv);
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Export failed.' });
    }
  }
};

module.exports = adminController;
