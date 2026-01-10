'use client'
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, getDoc,
  deleteDoc, setDoc, Timestamp
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FaTrash, FaFilePdf, FaFileExcel, 
  FaMoneyBillWave, FaWarehouse, FaChartBar,
  FaPrint, FaFileCsv, FaHistory, FaSearch,
  FaFilter, FaSortAmountDown, FaSortAmountUp,
  FaUser, FaPhone, FaEnvelope, FaMapMarkerAlt,
  FaUsers, FaDownload, FaUpload, FaSync, FaExclamationTriangle,
  FaCheckCircle, FaTimesCircle, FaArrowUp, FaArrowDown,
  FaPercent, FaCalendarAlt, FaClock,
  FaShoppingCart, FaStore, FaReceipt, FaClipboardList,
  FaUserCog, FaUserSlash, FaUserPlus, FaKey, FaTachometerAlt,
  FaBox, FaBoxes, FaDollarSign, FaCreditCard, FaMobileAlt,
  FaBan, FaUndo, FaEye, FaEyeSlash, FaArchive, FaTrashAlt,
  FaUserCheck
} from 'react-icons/fa';

// Locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

export default function DeletionManagementDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales');
  const router = useRouter();

  // Dashboard Stats
  const [dashboardStats, setDashboardStats] = useState({
    totalSales: 0,
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    deletedSales: 0,
    deletedUsers: 0,
    todaySales: 0,
    monthlySales: 0
  });

  // Sales State
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesFilter, setSalesFilter] = useState({
    startDate: '',
    endDate: '',
    location: 'all',
    paymentMethod: 'all',
    minAmount: '',
    maxAmount: '',
    showDeleted: false
  });

  // Users State
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState({
    role: 'all',
    location: 'all',
    status: 'all'
  });

  // Deletion History
  const [deletionHistory, setDeletionHistory] = useState([]);
  const [selectedDeletions, setSelectedDeletions] = useState([]);

  // UI State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({
    show: false,
    type: '',
    id: '',
    data: null
  });

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'MK 0';
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-MW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      // Fetch sales (including deleted)
      const salesQuery = query(collection(db, 'sales'), orderBy('soldAt', 'desc'));
      const salesSnapshot = await getDocs(salesQuery);
      const salesData = salesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);

      // Fetch users
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersData);

      // Fetch deletion history
      const deletionQuery = query(collection(db, 'deletionLogs'), orderBy('deletedAt', 'desc'));
      const deletionSnapshot = await getDocs(deletionQuery);
      const deletionData = deletionSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDeletionHistory(deletionData);

      // Calculate dashboard stats
      calculateDashboardStats(salesData, usersData);

    } catch (error) {
      setError('Failed to fetch data: ' + error.message);
    }
  }, []);

  // Calculate dashboard statistics
  const calculateDashboardStats = (salesData, usersData) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const totalSales = salesData.length;
      const deletedSales = salesData.filter(s => s.isDeleted).length;
      
      const todaySales = salesData.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate >= today && saleDate < tomorrow && !sale.isDeleted;
      }).length;

      const monthlySales = salesData.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate.getMonth() === currentMonth && 
               saleDate.getFullYear() === currentYear && 
               !sale.isDeleted;
      }).length;

      const totalUsers = usersData.length;
      const activeUsers = usersData.filter(u => u.isActive !== false).length;
      const inactiveUsers = usersData.filter(u => u.isActive === false).length;
      const deletedUsers = usersData.filter(u => u.deletedAt).length;

      setDashboardStats({
        totalSales,
        totalUsers,
        activeUsers,
        inactiveUsers,
        deletedSales,
        deletedUsers,
        todaySales,
        monthlySales
      });
    } catch (error) {
      console.error('Error calculating dashboard stats:', error);
    }
  };

  // Filter sales
  useEffect(() => {
    let filtered = sales;
    
    // Filter by location
    if (salesFilter.location !== 'all') {
      filtered = filtered.filter(sale => sale.location === salesFilter.location);
    }
    
    // Filter by payment method
    if (salesFilter.paymentMethod !== 'all') {
      filtered = filtered.filter(sale => sale.paymentMethod === salesFilter.paymentMethod);
    }
    
    // Filter by date range
    if (salesFilter.startDate) {
      const startDate = new Date(salesFilter.startDate);
      filtered = filtered.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate >= startDate;
      });
    }
    
    if (salesFilter.endDate) {
      const endDate = new Date(salesFilter.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate <= endDate;
      });
    }
    
    // Filter by amount range
    if (salesFilter.minAmount) {
      const minAmount = parseFloat(salesFilter.minAmount);
      filtered = filtered.filter(sale => parseFloat(sale.finalSalePrice) >= minAmount);
    }
    
    if (salesFilter.maxAmount) {
      const maxAmount = parseFloat(salesFilter.maxAmount);
      filtered = filtered.filter(sale => parseFloat(sale.finalSalePrice) <= maxAmount);
    }
    
    // Filter by deletion status
    if (!salesFilter.showDeleted) {
      filtered = filtered.filter(sale => !sale.isDeleted);
    }
    
    // Filter by search
    if (salesSearch) {
      const searchLower = salesSearch.toLowerCase();
      filtered = filtered.filter(sale =>
        sale.customerName?.toLowerCase().includes(searchLower) ||
        sale.customerPhone?.includes(salesSearch) ||
        sale.receiptNumber?.toLowerCase().includes(searchLower) ||
        sale.itemCode?.toLowerCase().includes(searchLower) ||
        `${sale.brand} ${sale.model}`.toLowerCase().includes(searchLower)
      );
    }

    setFilteredSales(filtered);
  }, [sales, salesFilter, salesSearch]);

  // Filter users
  useEffect(() => {
    let filtered = users;
    
    // Filter by role
    if (userFilter.role !== 'all') {
      filtered = filtered.filter(user => user.role === userFilter.role);
    }
    
    // Filter by location
    if (userFilter.location !== 'all') {
      filtered = filtered.filter(user => user.location === userFilter.location);
    }
    
    // Filter by status
    if (userFilter.status !== 'all') {
      if (userFilter.status === 'active') {
        filtered = filtered.filter(user => user.isActive !== false && !user.deletedAt);
      } else if (userFilter.status === 'inactive') {
        filtered = filtered.filter(user => user.isActive === false && !user.deletedAt);
      } else if (userFilter.status === 'deleted') {
        filtered = filtered.filter(user => user.deletedAt);
      }
    }
    
    // Filter by search
    if (userSearch) {
      const searchLower = userSearch.toLowerCase();
      filtered = filtered.filter(user =>
        user.fullName?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.phone?.includes(userSearch) ||
        user.role?.toLowerCase().includes(searchLower) ||
        user.location?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredUsers(filtered);
  }, [users, userFilter, userSearch]);

  // ==================== SALES DELETION FUNCTIONS ====================

  const handleDeleteSale = async (saleId, permanent = false) => {
    try {
      const sale = sales.find(s => s.id === saleId);
      if (!sale) {
        setError('Sale not found');
        return;
      }

      if (permanent) {
        // Permanent deletion
        await deleteDoc(doc(db, 'sales', saleId));
        
        // Log the permanent deletion
        await addDoc(collection(db, 'deletionLogs'), {
          type: 'sale',
          action: 'permanent_delete',
          recordId: saleId,
          recordData: {
            receiptNumber: sale.receiptNumber || 'NO-RECEIPT-' + saleId.slice(0, 8),
            customerName: sale.customerName || 'Walk-in Customer',
            amount: sale.finalSalePrice || 0,
            profit: sale.profit || 0,
            date: sale.soldAt || serverTimestamp()
          },
          deletedBy: user.uid,
          deletedByName: user.fullName || user.email,
          deletedAt: serverTimestamp(),
          reason: 'Permanent deletion requested by superadmin'
        });
        
        setSuccess('Sale permanently deleted!');
      } else {
        // Soft delete (mark as deleted)
        await updateDoc(doc(db, 'sales', saleId), {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: user.uid,
          deletedByName: user.fullName || user.email,
          deletionReason: 'Deleted by superadmin'
        });
        
        // Log the soft deletion
        await addDoc(collection(db, 'deletionLogs'), {
          type: 'sale',
          action: 'soft_delete',
          recordId: saleId,
          recordData: {
            receiptNumber: sale.receiptNumber,
            customerName: sale.customerName,
            amount: sale.finalSalePrice,
            profit: sale.profit || 0,
            date: sale.soldAt
          },
          deletedBy: user.uid,
          deletedByName: user.fullName || user.email,
          deletedAt: serverTimestamp(),
          reason: 'Soft deletion by superadmin'
        });
        
        setSuccess('Sale marked as deleted!');
      }

      fetchAllData();
    } catch (error) {
      setError('Failed to delete sale: ' + error.message);
    }
  };

  const handleRestoreSale = async (saleId) => {
    try {
      await updateDoc(doc(db, 'sales', saleId), {
        isDeleted: false,
        restoredAt: serverTimestamp(),
        restoredBy: user.uid,
        restoredByName: user.fullName || user.email
      });
      
      setSuccess('Sale restored successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to restore sale: ' + error.message);
    }
  };

  const handleBulkDeleteSales = async () => {
    if (selectedDeletions.length === 0) {
      setError('Please select sales to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedDeletions.length} selected sales?`)) {
      return;
    }

    try {
      const batch = [];
      for (const saleId of selectedDeletions) {
        const sale = sales.find(s => s.id === saleId);
        if (sale) {
          batch.push({
            id: saleId,
            data: {
              isDeleted: true,
              deletedAt: serverTimestamp(),
              deletedBy: user.uid,
              deletedByName: user.fullName || user.email,
              deletionReason: 'Bulk deletion by superadmin'
            }
          });
        }
      }

      // Execute updates
      for (const item of batch) {
        await updateDoc(doc(db, 'sales', item.id), item.data);
      }

      // Log bulk deletion
      await addDoc(collection(db, 'deletionLogs'), {
        type: 'sale',
        action: 'bulk_delete',
        count: selectedDeletions.length,
        deletedBy: user.uid,
        deletedByName: user.fullName || user.email,
        deletedAt: serverTimestamp(),
        reason: 'Bulk deletion of selected sales'
      });

      setSelectedDeletions([]);
      setSuccess(`${selectedDeletions.length} sales deleted successfully!`);
      fetchAllData();
    } catch (error) {
      setError('Failed to delete sales: ' + error.message);
    }
  };

  // ==================== USER DELETION FUNCTIONS ====================

  const handleDeleteUser = async (userId, permanent = false) => {
    try {
      const userToDelete = users.find(u => u.id === userId);
      if (!userToDelete) {
        setError('User not found');
        return;
      }

      // Prevent self-deletion
      if (userToDelete.email === user.email) {
        setError('You cannot delete your own account');
        return;
      }

      if (permanent) {
        // Note: Permanent user deletion requires Firebase Admin SDK
        // For now, we'll just mark for deletion
        await updateDoc(doc(db, 'users', userId), {
          isActive: false,
          deletedAt: serverTimestamp(),
          deletedBy: user.uid,
          deletedByName: user.fullName || user.email,
          deletionReason: 'Permanent deletion requested',
          status: 'permanently_deleted'
        });
        
        setSuccess('User marked for permanent deletion!');
      } else {
        // Deactivate user (soft delete)
        await updateDoc(doc(db, 'users', userId), {
          isActive: false,
          deactivatedAt: serverTimestamp(),
          deactivatedBy: user.uid,
          deactivatedByName: user.fullName || user.email,
          deactivationReason: 'Deactivated by superadmin'
        });
        
        setSuccess('User deactivated successfully!');
      }

      // Log the deletion
      await addDoc(collection(db, 'deletionLogs'), {
        type: 'user',
        action: permanent ? 'permanent_delete' : 'deactivate',
        recordId: userId,
        recordData: {
          email: userToDelete.email,
          fullName: userToDelete.fullName,
          role: userToDelete.role,
          location: userToDelete.location
        },
        deletedBy: user.uid,
        deletedByName: user.fullName || user.email,
        deletedAt: serverTimestamp(),
        reason: permanent ? 'Permanent deletion requested' : 'Deactivated by superadmin'
      });

      fetchAllData();
    } catch (error) {
      setError('Failed to delete user: ' + error.message);
    }
  };

  const handleRestoreUser = async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isActive: true,
        restoredAt: serverTimestamp(),
        restoredBy: user.uid,
        restoredByName: user.fullName || user.email,
        deactivationReason: null
      });
      
      setSuccess('User restored successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to restore user: ' + error.message);
    }
  };

  const handleResetUserPassword = async (userId, userEmail) => {
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth');
      await sendPasswordResetEmail(auth, userEmail);
      
      // Log password reset
      await addDoc(collection(db, 'deletionLogs'), {
        type: 'user',
        action: 'password_reset',
        recordId: userId,
        recordData: {
          email: userEmail
        },
        performedBy: user.uid,
        performedByName: user.fullName || user.email,
        performedAt: serverTimestamp()
      });
      
      setSuccess('Password reset email sent successfully!');
    } catch (error) {
      setError('Failed to send reset email: ' + error.message);
    }
  };

  // ==================== REPORT GENERATION ====================

  const generateDeletionReportPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date();

      // Header
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 51, 102);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Deletion Management Report', pageWidth / 2, 30, { align: 'center' });

      // Report Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Generated by: ${user?.fullName || user?.email}`, 20, 52);

      // Summary Stats
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY STATISTICS', 20, 65);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // First column
      doc.text(`Total Sales Records: ${dashboardStats.totalSales}`, 20, 75);
      doc.text(`Deleted Sales: ${dashboardStats.deletedSales}`, 20, 82);
      doc.text(`Active Users: ${dashboardStats.activeUsers}`, 20, 89);
      
      // Second column
      doc.text(`Total Users: ${dashboardStats.totalUsers}`, 100, 75);
      doc.text(`Inactive Users: ${dashboardStats.inactiveUsers}`, 100, 82);
      doc.text(`Deleted Users: ${dashboardStats.deletedUsers}`, 100, 89);

      // Deletion History Table
      const tableData = deletionHistory.slice(0, 20).map(log => [
        log.type.toUpperCase(),
        log.action,
        log.recordId,
        log.recordData?.receiptNumber || log.recordData?.email || 'N/A',
        log.deletedByName || log.performedByName,
        formatDate(log.deletedAt || log.performedAt),
        log.reason || 'N/A'
      ]);

      autoTable(doc, {
        startY: 100,
        head: [['Type', 'Action', 'Record ID', 'Identifier', 'Performed By', 'Date', 'Reason']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [0, 51, 102],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8,
          textColor: 50
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { top: 100 }
      });

      // Footer
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Confidential - For Super Admin Use Only`, 20, finalY);
      doc.text(`Page 1 of 1`, pageWidth - 20, finalY, { align: 'right' });

      // Save PDF
      const filename = `KM_Deletion_Report_${today.getTime()}.pdf`;
      doc.save(filename);

      setSuccess('Deletion report generated successfully!');
    } catch (error) {
      setError('Failed to generate report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // ==================== CONFIRMATION MODAL ====================

  const ConfirmDeleteModal = () => {
    if (!confirmDelete.show) return null;

    const { type, id, data } = confirmDelete;
    const isPermanent = confirmDelete.permanent;

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-red-500/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-red-400">
              <FaExclamationTriangle className="inline mr-2" />
              Confirm {isPermanent ? 'Permanent ' : ''}Deletion
            </h3>
            <button
              onClick={() => setConfirmDelete({ show: false, type: '', id: '', data: null })}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          <div className="mb-6">
            <p className="text-gray-300 mb-4">
              Are you sure you want to {isPermanent ? 'permanently delete' : 'delete'} this {type}?
            </p>
            
            {type === 'sale' && data && (
              <div className="bg-gray-700/50 p-4 rounded-lg mb-4">
                <p><strong>Receipt:</strong> {data.receiptNumber}</p>
                <p><strong>Customer:</strong> {data.customerName}</p>
                <p><strong>Amount:</strong> {formatCurrency(data.finalSalePrice)}</p>
                <p><strong>Profit:</strong> {formatCurrency(data.profit || 0)}</p>
                <p><strong>Date:</strong> {formatDate(data.soldAt)}</p>
              </div>
            )}
            
            {type === 'user' && data && (
              <div className="bg-gray-700/50 p-4 rounded-lg mb-4">
                <p><strong>Name:</strong> {data.fullName}</p>
                <p><strong>Email:</strong> {data.email}</p>
                <p><strong>Role:</strong> {data.role}</p>
                <p><strong>Location:</strong> {data.location}</p>
              </div>
            )}
            
            {isPermanent && (
              <div className="bg-red-900/20 border border-red-700/50 p-3 rounded-lg mb-4">
                <p className="text-red-300 text-sm">
                  ⚠️ <strong>Warning:</strong> Permanent deletion cannot be undone. This action will permanently remove the record from the database.
                </p>
              </div>
            )}
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={() => {
                if (type === 'sale') {
                  handleDeleteSale(id, isPermanent);
                } else if (type === 'user') {
                  handleDeleteUser(id, isPermanent);
                }
                setConfirmDelete({ show: false, type: '', id: '', data: null });
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg transition-colors font-semibold"
            >
              {isPermanent ? 'Delete Permanently' : 'Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete({ show: false, type: '', id: '', data: null })}
              className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ==================== AUTHENTICATION ====================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userDoc = await getDocs(
            query(collection(db, 'users'), where('uid', '==', authUser.uid))
          );
          
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            if (userData.role === 'superadmin') {
              setUser(userData);
              await fetchAllData();
            } else {
              setError('Access denied. Super Admin privileges required.');
              router.push('/dashboard');
            }
          } else {
            router.push('/login');
          }
        } catch (error) {
          setError('Authentication error');
          router.push('/login');
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, fetchAllData]);

  // Clear messages
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-white">Loading Deletion Management Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800 text-white">
      {/* Messages */}
      {error && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <FaExclamationTriangle />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 text-white hover:text-gray-200">✕</button>
          </div>
        </div>
      )}
      
      {success && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <FaCheckCircle />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-4 text-white hover:text-gray-200">✕</button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmDeleteModal />

      {/* Header */}
      <header className="bg-gray-800/80 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-2xl font-bold">
                KM ELECTRONICS <span className="text-red-400">Deletion Management</span>
              </h1>
              <p className="text-gray-400 text-sm">
                Welcome, {user?.fullName || user?.email} | SUPER ADMIN
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
              <button
                onClick={generateDeletionReportPDF}
                disabled={isGeneratingReport}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 text-sm w-full sm:w-auto ${
                  isGeneratingReport 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {isGeneratingReport ? (
                  <>
                    <FaSync className="animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FaFilePdf />
                    <span className="hidden sm:inline">Generate Report</span>
                    <span className="sm:hidden">Report</span>
                  </>
                )}
              </button>
              
              <button
                onClick={() => signOut(auth).then(() => router.push('/login'))}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors text-sm w-full sm:w-auto"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-700">
          <nav className="flex flex-wrap gap-1 sm:gap-0 sm:space-x-8 overflow-x-auto py-2">
            {[
              { id: 'dashboard', name: 'Dashboard', icon: FaTachometerAlt },
              { id: 'sales', name: 'Sales Deletion', icon: FaShoppingCart },
              { id: 'users', name: 'User Deletion', icon: FaUsers },
              { id: 'history', name: 'Deletion History', icon: FaHistory }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 whitespace-nowrap py-3 px-2 sm:px-1 border-b-2 font-medium text-sm flex items-center space-x-2 rounded-t-lg sm:rounded-none transition-colors ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-400 bg-red-500/10 sm:bg-transparent'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600 hover:bg-gray-700/30 sm:hover:bg-transparent'
                }`}
              >
                <tab.icon className="text-sm sm:text-base" />
                <span className="hidden xs:inline sm:inline">{tab.name}</span>
                <span className="xs:hidden sm:hidden">{tab.name.split(' ')[0]}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="py-6">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-gray-400 text-xs sm:text-sm mb-2 truncate">Total Sales Records</h3>
                      <p className="text-xl sm:text-2xl font-bold text-blue-400 truncate">
                        {dashboardStats.totalSales}
                      </p>
                    </div>
                    <div className="bg-blue-500/20 p-2 sm:p-3 rounded-lg ml-2 shrink-0">
                      <FaShoppingCart className="text-blue-400 text-lg sm:text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs sm:text-sm mt-2">
                    {dashboardStats.deletedSales} deleted
                  </p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-gray-400 text-xs sm:text-sm mb-2 truncate">User Accounts</h3>
                      <p className="text-xl sm:text-2xl font-bold text-green-400 truncate">
                        {dashboardStats.totalUsers}
                      </p>
                    </div>
                    <div className="bg-green-500/20 p-2 sm:p-3 rounded-lg ml-2 shrink-0">
                      <FaUsers className="text-green-400 text-lg sm:text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs sm:text-sm mt-2">
                    {dashboardStats.activeUsers} active • {dashboardStats.inactiveUsers} inactive
                  </p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-gray-400 text-xs sm:text-sm mb-2 truncate">Today's Sales</h3>
                      <p className="text-xl sm:text-2xl font-bold text-purple-400 truncate">
                        {dashboardStats.todaySales}
                      </p>
                    </div>
                    <div className="bg-purple-500/20 p-2 sm:p-3 rounded-lg ml-2 shrink-0">
                      <FaDollarSign className="text-purple-400 text-lg sm:text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs sm:text-sm mt-2">
                    This month: {dashboardStats.monthlySales}
                  </p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 border border-red-700/50 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-gray-400 text-xs sm:text-sm mb-2 truncate">Deletion Actions</h3>
                      <p className="text-xl sm:text-2xl font-bold text-red-400 truncate">
                        {deletionHistory.length}
                      </p>
                    </div>
                    <div className="bg-red-500/20 p-2 sm:p-3 rounded-lg ml-2 shrink-0">
                      <FaTrash className="text-red-400 text-lg sm:text-xl" />
                    </div>
                  </div>
                    <p className="text-gray-500 text-xs sm:text-sm mt-2">
                      Total deletion records
                    </p>
                  </div>
                </div>

              {/* Quick Actions */}
              <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 border border-gray-700">
                <h2 className="text-lg sm:text-xl font-semibold mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <button
                    onClick={() => setActiveTab('sales')}
                    className="bg-blue-600 hover:bg-blue-700 p-3 sm:p-4 rounded-lg transition-colors flex flex-col items-center"
                  >
                    <FaShoppingCart className="text-xl sm:text-2xl mb-2" />
                    <span className="text-xs sm:text-sm">Manage Sales</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('users')}
                    className="bg-green-600 hover:bg-green-700 p-3 sm:p-4 rounded-lg transition-colors flex flex-col items-center"
                  >
                    <FaUsers className="text-xl sm:text-2xl mb-2" />
                    <span className="text-xs sm:text-sm">Manage Users</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="bg-purple-600 hover:bg-purple-700 p-3 sm:p-4 rounded-lg transition-colors flex flex-col items-center"
                  >
                    <FaHistory className="text-xl sm:text-2xl mb-2" />
                    <span className="text-xs sm:text-sm">View History</span>
                  </button>
                  <button
                    onClick={generateDeletionReportPDF}
                    className="bg-orange-600 hover:bg-orange-700 p-3 sm:p-4 rounded-lg transition-colors flex flex-col items-center"
                  >
                    <FaFilePdf className="text-xl sm:text-2xl mb-2" />
                    <span className="text-xs sm:text-sm">Generate Report</span>
                  </button>
                </div>
              </div>

              {/* Recent Deletions */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">Recent Deletion Activities</h2>
                <div className="space-y-3">
                  {deletionHistory.slice(0, 5).map((log, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                      <div>
                        <div className="font-medium text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs mr-2 ${
                            log.type === 'sale' ? 'bg-blue-900/50 text-blue-300' :
                            'bg-green-900/50 text-green-300'
                          }`}>
                            {log.type.toUpperCase()}
                          </span>
                          {log.action}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {log.recordData?.receiptNumber || log.recordData?.email || log.recordId}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-300 text-sm">{log.deletedByName}</div>
                        <div className="text-gray-400 text-xs">
                          {formatDate(log.deletedAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sales Deletion Tab */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              {/* Sales Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-blue-400">{filteredSales.length}</div>
                  <div className="text-gray-400 text-sm">Filtered Sales</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-green-400">
                    {formatCurrency(filteredSales.reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0))}
                  </div>
                  <div className="text-gray-400 text-sm">Total Value</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-yellow-400">
                    {formatCurrency(filteredSales.reduce((sum, sale) => sum + (parseFloat(sale.profit) || 0), 0))}
                  </div>
                  <div className="text-gray-400 text-sm">Total Profit</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-red-400">
                    {filteredSales.filter(s => s.isDeleted).length}
                  </div>
                  <div className="text-gray-400 text-sm">Deleted</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-orange-400">
                    {selectedDeletions.length}
                  </div>
                  <div className="text-gray-400 text-sm">Selected</div>
                </div>
              </div>

              {/* Bulk Actions */}
              {selectedDeletions.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-red-300">
                        <FaExclamationTriangle className="inline mr-2" />
                        {selectedDeletions.length} sales selected
                      </h3>
                      <p className="text-gray-400 text-sm mt-1">
                        Total value: {formatCurrency(
                          filteredSales
                            .filter(s => selectedDeletions.includes(s.id))
                            .reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0)
                        )}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleBulkDeleteSales}
                        className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <FaTrash />
                        <span>Delete Selected</span>
                      </button>
                      <button
                        onClick={() => setSelectedDeletions([])}
                        className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sales Filters */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Search Sales</label>
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-3 py-2"
                        placeholder="Search by customer, receipt, item..."
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Location</label>
                    <select
                      value={salesFilter.location}
                      onChange={(e) => setSalesFilter({...salesFilter, location: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Locations</option>
                      {LOCATIONS.map((location, index) => (
                        <option key={index} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Payment Method</label>
                    <select
                      value={salesFilter.paymentMethod}
                      onChange={(e) => setSalesFilter({...salesFilter, paymentMethod: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Methods</option>
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="installment">Installment</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Date Range</label>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                      <input
                        type="date"
                        value={salesFilter.startDate}
                        onChange={(e) => setSalesFilter({...salesFilter, startDate: e.target.value})}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm"
                        placeholder="Start"
                      />
                      <input
                        type="date"
                        value={salesFilter.endDate}
                        onChange={(e) => setSalesFilter({...salesFilter, endDate: e.target.value})}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm"
                        placeholder="End"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Amount Range (MK)</label>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={salesFilter.minAmount}
                        onChange={(e) => setSalesFilter({...salesFilter, minAmount: e.target.value})}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={salesFilter.maxAmount}
                        onChange={(e) => setSalesFilter({...salesFilter, maxAmount: e.target.value})}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={salesFilter.showDeleted}
                        onChange={(e) => setSalesFilter({...salesFilter, showDeleted: e.target.checked})}
                        className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                      />
                      <span className="text-gray-400 text-sm">Show Deleted Sales</span>
                    </label>
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={() => {
                        setSalesSearch('');
                        setSalesFilter({
                          startDate: '',
                          endDate: '',
                          location: 'all',
                          paymentMethod: 'all',
                          minAmount: '',
                          maxAmount: '',
                          showDeleted: false
                        });
                        setSelectedDeletions([]);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg transition-colors"
                    >
                      Clear Filters
                    </button>
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={() => setSelectedDeletions(filteredSales.map(s => s.id))}
                      className="w-full bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors"
                    >
                      Select All
                    </button>
                  </div>
                </div>
              </div>

              {/* Sales List */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">
                    <FaShoppingCart className="inline mr-2" />
                    Sales Records ({filteredSales.length})
                  </h2>
                  <div className="text-sm text-gray-400">
                    {selectedDeletions.length > 0 && `${selectedDeletions.length} selected`}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2 w-12">
                          <input
                            type="checkbox"
                            checked={selectedDeletions.length === filteredSales.length && filteredSales.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDeletions(filteredSales.map(s => s.id));
                              } else {
                                setSelectedDeletions([]);
                              }
                            }}
                            className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                          />
                        </th>
                        <th className="text-left py-2">Receipt No.</th>
                        <th className="text-left py-2">Customer</th>
                        <th className="text-left py-2 hidden sm:table-cell">Item</th>
                        <th className="text-left py-2">Amount</th>
                        <th className="text-left py-2 hidden md:table-cell">Profit</th>
                        <th className="text-left py-2 hidden lg:table-cell">Date</th>
                        <th className="text-left py-2 hidden md:table-cell">Location</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale, index) => (
                        <tr key={index} className={`border-b border-gray-700/50 ${
                          sale.isDeleted ? 'bg-red-900/20' : ''
                        }`}>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              checked={selectedDeletions.includes(sale.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeletions([...selectedDeletions, sale.id]);
                                } else {
                                  setSelectedDeletions(selectedDeletions.filter(id => id !== sale.id));
                                }
                              }}
                              className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                            />
                          </td>
                          <td className="py-2 font-mono text-sm">{sale.receiptNumber}</td>
                          <td className="py-2">
                            <div>{sale.customerName || 'Walk-in'}</div>
                            <div className="text-gray-400 text-xs">{sale.customerPhone}</div>
                          </td>
                          <td className="py-2 hidden sm:table-cell">
                            <div>{sale.brand} {sale.model}</div>
                            <div className="text-gray-400 text-xs">{sale.itemCode}</div>
                          </td>
                          <td className="py-2 font-semibold">{formatCurrency(sale.finalSalePrice)}</td>
                          <td className="py-2 font-semibold text-green-400 hidden md:table-cell">{formatCurrency(sale.profit || 0)}</td>
                          <td className="py-2 text-sm hidden lg:table-cell">
                            {formatDate(sale.soldAt)}
                          </td>
                          <td className="py-2 hidden md:table-cell">{sale.location}</td>
                          <td className="py-2">
                            {sale.isDeleted ? (
                              <span className="px-2 py-1 rounded-full text-xs bg-red-900/50 text-red-300">
                                Deleted
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-300">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                              {sale.isDeleted ? (
                                <button
                                  onClick={() => handleRestoreSale(sale.id)}
                                  className="bg-green-600 hover:bg-green-700 px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center justify-center space-x-1"
                                >
                                  <FaUndo size={12} />
                                  <span>Restore</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setConfirmDelete({
                                      show: true,
                                      type: 'sale',
                                      id: sale.id,
                                      data: sale,
                                      permanent: false
                                    })}
                                    className="bg-red-600 hover:bg-red-700 px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center justify-center space-x-1"
                                  >
                                    <FaTrash size={12} />
                                    <span>Delete</span>
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete({
                                      show: true,
                                      type: 'sale',
                                      id: sale.id,
                                      data: sale,
                                      permanent: true
                                    })}
                                    className="bg-red-800 hover:bg-red-900 px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors flex items-center justify-center space-x-1"
                                  >
                                    <FaTrashAlt size={12} />
                                    <span>Perm. Delete</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {filteredSales.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No sales found matching your criteria
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User Deletion Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* User Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-xl font-bold text-blue-400">{filteredUsers.length}</div>
                  <div className="text-gray-400 text-xs sm:text-sm">Filtered Users</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-xl font-bold text-green-400">
                    {filteredUsers.filter(u => u.isActive !== false && !u.deletedAt).length}
                  </div>
                  <div className="text-gray-400 text-xs sm:text-sm">Active</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-xl font-bold text-orange-400">
                    {filteredUsers.filter(u => u.isActive === false && !u.deletedAt).length}
                  </div>
                  <div className="text-gray-400 text-xs sm:text-sm">Inactive</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-xl font-bold text-red-400">
                    {filteredUsers.filter(u => u.deletedAt).length}
                  </div>
                  <div className="text-gray-400 text-xs sm:text-sm">Deleted</div>
                </div>
              </div>

              {/* User Filters */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Search Users</label>
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-3 py-2"
                        placeholder="Search by name, email, phone..."
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Role</label>
                    <select
                      value={userFilter.role}
                      onChange={(e) => setUserFilter({...userFilter, role: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Roles</option>
                      <option value="superadmin">Super Admin</option>
                      <option value="manager">Manager</option>
                      <option value="sales">Sales Personnel</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Location</label>
                    <select
                      value={userFilter.location}
                      onChange={(e) => setUserFilter({...userFilter, location: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Locations</option>
                      {LOCATIONS.map((location, index) => (
                        <option key={index} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Status</label>
                    <select
                      value={userFilter.status}
                      onChange={(e) => setUserFilter({...userFilter, status: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="deleted">Deleted</option>
                    </select>
                  </div>
                </div>
                
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setUserSearch('');
                      setUserFilter({
                        role: 'all',
                        location: 'all',
                        status: 'all'
                      });
                    }}
                    className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Users List */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">
                    <FaUsers className="inline mr-2" />
                    User Management ({filteredUsers.length})
                  </h2>
                  <div className="text-sm text-gray-400">
                    Super Admin can manage all user accounts
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2">Name</th>
                        <th className="text-left py-2">Email</th>
                        <th className="text-left py-2">Phone</th>
                        <th className="text-left py-2">Role</th>
                        <th className="text-left py-2">Location</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Created</th>
                        <th className="text-left py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((userData, index) => (
                        <tr key={index} className={`border-b border-gray-700/50 ${
                          userData.deletedAt ? 'bg-red-900/20' :
                          userData.isActive === false ? 'bg-orange-900/20' : ''
                        }`}>
                          <td className="py-2">
                            <div className="font-medium">{userData.fullName}</div>
                            {userData.email === user.email && (
                              <div className="text-blue-400 text-xs">(You)</div>
                            )}
                          </td>
                          <td className="py-2">{userData.email}</td>
                          <td className="py-2">{userData.phone}</td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              userData.role === 'superadmin' ? 'bg-red-900/50 text-red-300' :
                              userData.role === 'manager' ? 'bg-blue-900/50 text-blue-300' :
                              'bg-green-900/50 text-green-300'
                            }`}>
                              {userData.role}
                            </span>
                          </td>
                          <td className="py-2">{userData.location}</td>
                          <td className="py-2">
                            {userData.deletedAt ? (
                              <span className="px-2 py-1 rounded-full text-xs bg-red-900/50 text-red-300">
                                Deleted
                              </span>
                            ) : userData.isActive === false ? (
                              <span className="px-2 py-1 rounded-full text-xs bg-orange-900/50 text-orange-300">
                                Inactive
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-300">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-sm">
                            {formatDate(userData.createdAt)}
                          </td>
                          <td className="py-2">
                            <div className="flex space-x-2">
                              {userData.deletedAt ? (
                                <button
                                  onClick={() => handleRestoreUser(userData.id)}
                                  className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                >
                                  <FaUndo size={12} />
                                  <span>Restore</span>
                                </button>
                              ) : userData.isActive === false ? (
                                <>
                                  <button
                                    onClick={() => handleRestoreUser(userData.id)}
                                    className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                  >
                                    <FaUserCheck size={12} />
                                    <span>Activate</span>
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete({
                                      show: true,
                                      type: 'user',
                                      id: userData.id,
                                      data: userData,
                                      permanent: true
                                    })}
                                    className="bg-red-800 hover:bg-red-900 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                  >
                                    <FaTrashAlt size={12} />
                                    <span>Perm. Delete</span>
                                  </button>
                                </>
                              ) : userData.email !== user.email ? (
                                <>
                                  <button
                                    onClick={() => setConfirmDelete({
                                      show: true,
                                      type: 'user',
                                      id: userData.id,
                                      data: userData,
                                      permanent: false
                                    })}
                                    className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                  >
                                    <FaUserSlash size={12} />
                                    <span>Deactivate</span>
                                  </button>
                                  <button
                                    onClick={() => handleResetUserPassword(userData.id, userData.email)}
                                    className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                  >
                                    <FaKey size={12} />
                                    <span>Reset Pass</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-gray-400 text-sm px-2">Current User</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No users found matching your criteria
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Deletion History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {/* History Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-blue-400">{deletionHistory.length}</div>
                  <div className="text-gray-400 text-sm">Total Actions</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-green-400">
                    {deletionHistory.filter(d => d.type === 'sale').length}
                  </div>
                  <div className="text-gray-400 text-sm">Sales Actions</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-red-400">
                    {deletionHistory.filter(d => d.type === 'user').length}
                  </div>
                  <div className="text-gray-400 text-sm">User Actions</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-purple-400">
                    {deletionHistory.filter(d => d.action.includes('permanent')).length}
                  </div>
                  <div className="text-gray-400 text-sm">Permanent Deletions</div>
                </div>
              </div>

              {/* History Filters */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Type</label>
                    <select
                      onChange={(e) => {
                        // Filter logic would go here
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Types</option>
                      <option value="sale">Sales</option>
                      <option value="user">Users</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Action</label>
                    <select
                      onChange={(e) => {
                        // Filter logic would go here
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Actions</option>
                      <option value="delete">Deletions</option>
                      <option value="restore">Restorations</option>
                      <option value="deactivate">Deactivations</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Date Range</label>
                    <div className="flex space-x-2">
                      <input
                        type="date"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm"
                        placeholder="Start"
                      />
                      <input
                        type="date"
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-sm"
                        placeholder="End"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Deletion History List */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">
                    <FaHistory className="inline mr-2" />
                    Deletion History ({deletionHistory.length})
                  </h2>
                  <div className="text-sm text-gray-400">
                    Log of all deletion and restoration activities
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2">Type</th>
                        <th className="text-left py-2">Action</th>
                        <th className="text-left py-2">Record ID</th>
                        <th className="text-left py-2">Identifier</th>
                        <th className="text-left py-2">Performed By</th>
                        <th className="text-left py-2">Date & Time</th>
                        <th className="text-left py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletionHistory.map((log, index) => (
                        <tr key={index} className={`border-b border-gray-700/50 ${
                          log.action.includes('permanent') ? 'bg-red-900/10' :
                          log.action.includes('delete') ? 'bg-red-900/5' :
                          log.action.includes('restore') ? 'bg-green-900/5' : ''
                        }`}>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              log.type === 'sale' ? 'bg-blue-900/50 text-blue-300' :
                              'bg-green-900/50 text-green-300'
                            }`}>
                              {log.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              log.action.includes('permanent') ? 'bg-red-900/50 text-red-300' :
                              log.action.includes('delete') ? 'bg-orange-900/50 text-orange-300' :
                              log.action.includes('restore') ? 'bg-green-900/50 text-green-300' :
                              'bg-blue-900/50 text-blue-300'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 font-mono text-sm">{log.recordId.slice(0, 8)}...</td>
                          <td className="py-2">
                            {log.recordData?.receiptNumber || log.recordData?.email || 'N/A'}
                          </td>
                          <td className="py-2">{log.deletedByName || log.performedByName}</td>
                          <td className="py-2 text-sm">
                            {formatDate(log.deletedAt || log.performedAt)}
                          </td>
                          <td className="py-2 text-sm text-gray-400">
                            {log.reason || 'No reason provided'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {deletionHistory.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No deletion history found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
        </div>
      </footer>
    </div>
  );
}