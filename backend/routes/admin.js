const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Multer memory storage for Excel files (max 5 MB)
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') return cb(null, true);
    cb(new Error('Only .xlsx and .xls files are allowed.'));
  }
});

// Safe wrapper to return clean JSON errors on file limits or invalid types
const handleExcelUpload = (req, res, next) => {
  excelUpload.single('excelFile')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'The selected file exceeds the maximum allowed size of 5 MB.' });
      }
      return res.status(400).json({ success: false, message: err.message || 'File upload error.' });
    }
    next();
  });
};

// All routes require admin JWT
router.use(requireAdmin);

// Dashboard
router.get('/dashboard/weekly-employee-performance', adminController.getEmployeeWeeklyPerformance);
router.get('/dashboard/employee-weekly-performance', adminController.getEmployeeWeeklyPerformance);
router.get('/dashboard', adminController.getDashboard);

// Employees
router.get('/employees', adminController.getEmployees);
router.post('/employees', adminController.addEmployee);
router.get('/employees/template', adminController.downloadEmployeeTemplate);
router.post('/employees/validate-import', handleExcelUpload, adminController.validateEmployeeImport);
router.post('/employees/confirm-import', adminController.confirmEmployeeImport);
router.post('/employees/bulk-import', handleExcelUpload, adminController.bulkImportEmployees);
router.delete('/employees/:id', adminController.removeEmployee);
router.patch('/employees/:id/deactivate', adminController.deactivateEmployee);
router.patch('/employees/:id/activate', adminController.activateEmployee);
router.post('/employees/:id/deactivate', adminController.deactivateEmployee);
router.post('/employees/:id/activate', adminController.activateEmployee);
router.post('/employees/:id/override', adminController.activateOverride);
router.post('/employees/:id/remove-override', adminController.removeOverride);
router.patch('/employees/:id/password', adminController.updateEmployeePassword);
router.post('/employees/:id/password', adminController.updateEmployeePassword);

// Customers
router.get('/customers', adminController.getCustomers);
router.get('/customers/export', adminController.exportCustomers);
router.get('/customers/:id', adminController.getCustomerDetail);

// Loans
router.get('/loans', adminController.getLoans);
router.get('/loans/:id', adminController.getLoanDetail);
router.patch('/loans/:id/status', adminController.updateLoanStatus);
router.delete('/loans/:id', adminController.deleteLoan);
router.post('/loans/delete', adminController.deleteLoansBulk);

// Working Hours
router.get('/working-hours', adminController.getWorkingHours);
router.put('/working-hours', adminController.updateWorkingHours);

// Utilities
router.get('/areas', adminController.getAreas);

// Export
router.get('/reports/export', adminController.exportLoans);

module.exports = router;
