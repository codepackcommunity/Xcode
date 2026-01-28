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

// React Icons
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
  FaUserCheck, FaSignOutAlt, FaHome, FaCog, FaBell, FaChartLine
} from 'react-icons/fa';
import { FiMenu, FiX, FiChevronRight, FiChevronLeft, FiAlertCircle } from 'react-icons/fi';
import { 
  MdDashboard, MdPerson, MdDelete, MdHistory, 
  MdReport, MdSettings, MdLogout, MdWarning 
} from 'react-icons/md';

// shadcn/ui components
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// Locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

export default function DeletionManagementDashboard() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', name: 'Dashboard', icon: <MdDashboard className="w-5 h-5" /> },
    { id: 'sales', name: 'Sales', icon: <FaShoppingCart className="w-5 h-5" /> },
    { id: 'users', name: 'Users', icon: <FaUsers className="w-5 h-5" /> },
    { id: 'deletions', name: 'Deletion History', icon: <MdHistory className="w-5 h-5" /> },
    { id: 'reports', name: 'Reports', icon: <MdReport className="w-5 h-5" /> },
  ];

  const externalLinks = [
    { name: 'Operations', icon: <FaTachometerAlt className="w-5 h-5" />, route: '/operations' },
    { name: 'SuperAdmin', icon: <FaUserCog className="w-5 h-5" />, route: '/admin/superadmin/dashboard' },
    { name: 'Shops', icon: <FaStore className="w-5 h-5" />, route: '/shops' }
  ];

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
    data: null,
    permanent: false
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
      setFilteredSales(salesData);

      // Fetch users
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsers(usersData);
      setFilteredUsers(usersData);

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

  // ==================== CONFIRMATION DIALOG ====================

  const ConfirmDeleteDialog = () => {
    const { type, id, data, permanent } = confirmDelete;

    return (
      <Dialog open={confirmDelete.show} onOpenChange={(open) => !open && setConfirmDelete({ show: false, type: '', id: '', data: null })}>
        <DialogContent className="sm:max-w-md bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MdWarning className="text-red-500" />
              Confirm {permanent ? 'Permanent ' : ''}Deletion
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to {permanent ? 'permanently delete' : 'delete'} this {type}? 
              {permanent && ' This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          
          {type === 'sale' && data && (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Receipt:</span>
                    <span className="font-mono">{data.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Customer:</span>
                    <span>{data.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amount:</span>
                    <span className="font-semibold">{formatCurrency(data.finalSalePrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Date:</span>
                    <span>{formatDate(data.soldAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {type === 'user' && data && (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span>{data.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Email:</span>
                    <span>{data.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Role:</span>
                    <Badge variant={data.role === 'superadmin' ? 'destructive' : data.role === 'manager' ? 'default' : 'secondary'}>
                      {data.role}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Location:</span>
                    <span>{data.location}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete({ show: false, type: '', id: '', data: null })}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant={permanent ? "destructive" : "default"}
              onClick={() => {
                if (type === 'sale') {
                  handleDeleteSale(id, permanent);
                } else if (type === 'user') {
                  handleDeleteUser(id, permanent);
                }
                setConfirmDelete({ show: false, type: '', id: '', data: null });
              }}
              className="flex-1"
            >
              {permanent ? 'Delete Permanently' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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


  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800 text-white">
      {/* Mobile Sidebar */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-80 bg-gray-900 border-r border-gray-800 p-0">
          <ScrollArea className="h-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-8">
                <div className="bg-purple-600 p-2 rounded-lg">
                  <FaStore className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">KM ELECTRONICS</h1>
                  <p className="text-xs text-gray-400">Deletion Management</p>
                </div>
              </div>
              
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <Button
                    key={item.id}
                    variant={activeTab === item.id ? "secondary" : "ghost"}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileSidebarOpen(false);
                    }}
                    className="w-full justify-start gap-3"
                  >
                    {item.icon}
                    {item.name}
                  </Button>
                ))}
                
                <Separator className="my-4" />
                
                <h3 className="text-sm font-medium text-gray-400 mb-2">External Links</h3>
                {externalLinks.map((link) => (
                  <Button
                    key={link.name}
                    variant="ghost"
                    onClick={() => router.push(link.route)}
                    className="w-full justify-start gap-3"
                  >
                    {link.icon}
                    {link.name}
                  </Button>
                ))}
              </nav>
              
              <div className="mt-auto pt-8">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-purple-600">
                          {user?.fullName?.charAt(0) || 'A'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user?.fullName}</p>
                        <p className="text-xs text-gray-400">Super Admin</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-gray-900 border-r border-gray-800">
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-purple-600 p-2 rounded-lg">
              <FaStore className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-xl font-bold">KM ELECTRONICS</h1>
              <p className="text-xs text-gray-400">Deletion Management</p>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            <nav className="space-y-2">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "secondary" : "ghost"}
                  onClick={() => setActiveTab(item.id)}
                  className="w-full justify-start gap-3"
                >
                  {item.icon}
                  {item.name}
                </Button>
              ))}
              
              <Separator className="my-4" />
              
              <h3 className="text-sm font-medium text-gray-400 mb-2">External Links</h3>
              {externalLinks.map((link) => (
                <Button
                  key={link.name}
                  variant="ghost"
                  onClick={() => router.push(link.route)}
                  className="w-full justify-start gap-3"
                >
                  {link.icon}
                  {link.name}
                </Button>
              ))}
            </nav>
          </ScrollArea>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-purple-600">
                    {user?.fullName?.charAt(0) || 'A'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user?.fullName}</p>
                  <p className="text-xs text-gray-400">Super Admin</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-gray-900/80 backdrop-blur-lg border-b border-gray-800">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="lg:hidden"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <FiMenu className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-bold">
                    <span className="text-purple-400">Deletion</span> Management Dashboard
                  </h1>
                  <p className="text-sm text-gray-400">
                    Welcome, {user?.fullName || user?.email}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <FaBell className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 bg-gray-900 border-gray-800">
                    <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="p-4 text-center text-gray-400">
                      No new notifications
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                <Button
                  onClick={() => signOut(auth).then(() => router.push('/login'))}
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                >
                  <FaSignOutAlt />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="p-6">
          {/* Messages */}
          {error && (
            <div className="mb-6">
              <Card className="bg-red-900/20 border-red-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FiAlertCircle className="h-5 w-5 text-red-400" />
                    <div>
                      <p className="font-medium text-red-300">{error}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setError(null)}
                      className="ml-auto"
                    >
                      <FiX className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {success && (
            <div className="mb-6">
              <Card className="bg-green-900/20 border-green-700">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FaCheckCircle className="h-5 w-5 text-green-400" />
                    <div>
                      <p className="font-medium text-green-300">{success}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSuccess(null)}
                      className="ml-auto"
                    >
                      <FiX className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Confirmation Dialog */}
          <ConfirmDeleteDialog />

          {/* Tabs Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
            <TabsList className="bg-gray-800 border border-gray-700">
              {navItems.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="gap-2">
                  {item.icon}
                  {item.name}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Total Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{dashboardStats.totalSales}</div>
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <FaShoppingCart className="h-6 w-6 text-blue-400" />
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      {dashboardStats.deletedSales} deleted
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Total Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{dashboardStats.totalUsers}</div>
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <FaUsers className="h-6 w-6 text-green-400" />
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      {dashboardStats.activeUsers} active
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Today's Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{dashboardStats.todaySales}</div>
                      <div className="p-2 bg-purple-500/20 rounded-lg">
                        <FaChartLine className="h-6 w-6 text-purple-400" />
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      This month: {dashboardStats.monthlySales}
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Deletion Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold">{deletionHistory.length}</div>
                      <div className="p-2 bg-red-500/20 rounded-lg">
                        <FaTrash className="h-6 w-6 text-red-400" />
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      Total deletion records
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Frequently used actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        onClick={() => setActiveTab('sales')}
                        variant="outline"
                        className="h-24 flex-col gap-3"
                      >
                        <FaShoppingCart className="h-8 w-8" />
                        <span>Manage Sales</span>
                      </Button>
                      <Button 
                        onClick={() => setActiveTab('users')}
                        variant="outline"
                        className="h-24 flex-col gap-3"
                      >
                        <FaUsers className="h-8 w-8" />
                        <span>Manage Users</span>
                      </Button>
                      <Button 
                        onClick={() => setActiveTab('deletions')}
                        variant="outline"
                        className="h-24 flex-col gap-3"
                      >
                        <MdHistory className="h-8 w-8" />
                        <span>View History</span>
                      </Button>
                      <Button 
                        onClick={generateDeletionReportPDF}
                        disabled={isGeneratingReport}
                        variant="outline"
                        className="h-24 flex-col gap-3"
                      >
                        {isGeneratingReport ? (
                          <FaSync className="h-8 w-8 animate-spin" />
                        ) : (
                          <FaFilePdf className="h-8 w-8" />
                        )}
                        <span>Generate Report</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle>Recent Activities</CardTitle>
                    <CardDescription>Latest deletion actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {deletionHistory.slice(0, 5).map((log, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${
                                log.type === 'sale' ? 'bg-blue-500/20' : 'bg-green-500/20'
                              }`}>
                                {log.type === 'sale' ? (
                                  <FaShoppingCart className="h-4 w-4 text-blue-400" />
                                ) : (
                                  <FaUsers className="h-4 w-4 text-green-400" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{log.action}</p>
                                <p className="text-sm text-gray-400">
                                  {log.recordData?.receiptNumber || log.recordData?.email}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm">{log.deletedByName}</p>
                              <p className="text-xs text-gray-400">{formatDate(log.deletedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            {/* Sales Tab */}
            <TabsContent value="sales" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sales Management</CardTitle>
                  <CardDescription>Manage and delete sales records</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Search Sales</Label>
                        <div className="relative">
                          <FaSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search..."
                            value={salesSearch}
                            onChange={(e) => setSalesSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Select value={salesFilter.location} onValueChange={(val) => setSalesFilter({...salesFilter, location: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="All Locations" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Locations</SelectItem>
                            {LOCATIONS.map((location, index) => (
                              <SelectItem key={index} value={location}>{location}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select value={salesFilter.paymentMethod} onValueChange={(val) => setSalesFilter({...salesFilter, paymentMethod: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="All Methods" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Methods</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Show Deleted</Label>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={salesFilter.showDeleted}
                            onCheckedChange={(checked) => setSalesFilter({...salesFilter, showDeleted: !!checked})}
                            id="showDeleted"
                          />
                          <Label htmlFor="showDeleted">Show deleted sales</Label>
                        </div>
                      </div>
                    </div>
                    
                    {/* Bulk Actions */}
                    {selectedDeletions.length > 0 && (
                      <Card className="bg-red-900/20 border-red-700">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FaExclamationTriangle className="h-5 w-5 text-red-400" />
                              <div>
                                <p className="font-medium">{selectedDeletions.length} sales selected</p>
                                <p className="text-sm text-gray-400">
                                  Total value: {formatCurrency(
                                    filteredSales
                                      .filter(s => selectedDeletions.includes(s.id))
                                      .reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0)
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive">Delete Selected</Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-gray-900 border-gray-700">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Selected Sales</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete {selectedDeletions.length} selected sales?
                                      This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleBulkDeleteSales}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              <Button variant="outline" onClick={() => setSelectedDeletions([])}>
                                Clear
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Sales Table */}
                    <div className="rounded-md border border-gray-700">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={selectedDeletions.length === filteredSales.length && filteredSales.length > 0}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedDeletions(filteredSales.map(s => s.id));
                                  } else {
                                    setSelectedDeletions([]);
                                  }
                                }}
                              />
                            </TableHead>
                            <TableHead>Receipt</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredSales.map((sale) => (
                            <TableRow key={sale.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedDeletions.includes(sale.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedDeletions([...selectedDeletions, sale.id]);
                                    } else {
                                      setSelectedDeletions(selectedDeletions.filter(id => id !== sale.id));
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell className="font-mono">{sale.receiptNumber}</TableCell>
                              <TableCell>
                                <div>{sale.customerName}</div>
                                <div className="text-sm text-gray-400">{sale.customerPhone}</div>
                              </TableCell>
                              <TableCell className="font-semibold">
                                {formatCurrency(sale.finalSalePrice)}
                              </TableCell>
                              <TableCell>{formatDate(sale.soldAt)}</TableCell>
                              <TableCell>
                                {sale.isDeleted ? (
                                  <Badge variant="destructive">Deleted</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-green-700 text-green-400">
                                    Active
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  {sale.isDeleted ? (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleRestoreSale(sale.id)}
                                    >
                                      <FaUndo className="h-3 w-3 mr-2" />
                                      Restore
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setConfirmDelete({
                                          show: true,
                                          type: 'sale',
                                          id: sale.id,
                                          data: sale,
                                          permanent: false
                                        })}
                                      >
                                        <FaTrash className="h-3 w-3 mr-2" />
                                        Delete
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setConfirmDelete({
                                          show: true,
                                          type: 'sale',
                                          id: sale.id,
                                          data: sale,
                                          permanent: true
                                        })}
                                      >
                                        <FaTrashAlt className="h-3 w-3 mr-2" />
                                        Perm
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Users Tab */}
            <TabsContent value="users" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage and deactivate user accounts</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="space-y-2">
                      <Label>Search Users</Label>
                      <div className="relative">
                        <FaSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select value={userFilter.role} onValueChange={(val) => setUserFilter({...userFilter, role: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Roles" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Roles</SelectItem>
                          <SelectItem value="superadmin">Super Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="sales">Sales Personnel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={userFilter.status} onValueChange={(val) => setUserFilter({...userFilter, status: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="deleted">Deleted</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Users Table */}
                  <div className="rounded-md border border-gray-700">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((userData) => (
                          <TableRow key={userData.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-purple-600">
                                    {userData.fullName?.charAt(0)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium">{userData.fullName}</div>
                                  {userData.email === user.email && (
                                    <Badge variant="outline" className="text-xs">You</Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{userData.email}</TableCell>
                            <TableCell>
                              <Badge variant={
                                userData.role === 'superadmin' ? 'destructive' :
                                userData.role === 'manager' ? 'default' : 'secondary'
                              }>
                                {userData.role}
                              </Badge>
                            </TableCell>
                            <TableCell>{userData.location}</TableCell>
                            <TableCell>
                              {userData.deletedAt ? (
                                <Badge variant="destructive">Deleted</Badge>
                              ) : userData.isActive === false ? (
                                <Badge variant="outline" className="border-yellow-700 text-yellow-400">
                                  Inactive
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-green-700 text-green-400">
                                  Active
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {userData.deletedAt ? (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleRestoreUser(userData.id)}
                                  >
                                    <FaUndo className="h-3 w-3 mr-2" />
                                    Restore
                                  </Button>
                                ) : userData.isActive === false ? (
                                  <>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleRestoreUser(userData.id)}
                                    >
                                      <FaUserCheck className="h-3 w-3 mr-2" />
                                      Activate
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => setConfirmDelete({
                                        show: true,
                                        type: 'user',
                                        id: userData.id,
                                        data: userData,
                                        permanent: true
                                      })}
                                    >
                                      <FaTrashAlt className="h-3 w-3 mr-2" />
                                      Delete
                                    </Button>
                                  </>
                                ) : userData.email !== user.email ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setConfirmDelete({
                                        show: true,
                                        type: 'user',
                                        id: userData.id,
                                        data: userData,
                                        permanent: false
                                      })}
                                    >
                                      <FaUserSlash className="h-3 w-3 mr-2" />
                                      Deactivate
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => handleResetUserPassword(userData.id, userData.email)}
                                    >
                                      <FaKey className="h-3 w-3 mr-2" />
                                      Reset Pass
                                    </Button>
                                  </>
                                ) : (
                                  <Badge variant="outline">Current User</Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Deletions History Tab */}
            <TabsContent value="deletions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Deletion History</CardTitle>
                  <CardDescription>Audit trail of all deletion actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-gray-700">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Record ID</TableHead>
                          <TableHead>Performed By</TableHead>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deletionHistory.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge variant={log.type === 'sale' ? 'default' : 'secondary'}>
                                {log.type.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                log.action.includes('permanent') ? 'destructive' :
                                log.action.includes('delete') ? 'default' :
                                'outline'
                              }>
                                {log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {log.recordId?.slice(0, 8)}...
                            </TableCell>
                            <TableCell>{log.deletedByName}</TableCell>
                            <TableCell>{formatDate(log.deletedAt)}</TableCell>
                            <TableCell className="max-w-xs truncate">
                              {log.reason || 'No reason provided'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Reports Tab */}
            <TabsContent value="reports" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Report Generation</CardTitle>
                  <CardDescription>Generate and download deletion reports</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-lg">Deletion Summary Report</CardTitle>
                        <CardDescription>PDF report of all deletion activities</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Report Period</Label>
                            <Select defaultValue="all">
                              <SelectTrigger>
                                <SelectValue placeholder="Select period" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Time</SelectItem>
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="week">This Week</SelectItem>
                                <SelectItem value="month">This Month</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Report Type</Label>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox id="sales" defaultChecked />
                                <Label htmlFor="sales">Include Sales Deletions</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox id="users" defaultChecked />
                                <Label htmlFor="users">Include User Deletions</Label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button
                          onClick={generateDeletionReportPDF}
                          disabled={isGeneratingReport}
                          className="w-full gap-2"
                        >
                          {isGeneratingReport ? (
                            <>
                              <FaSync className="h-4 w-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <FaFilePdf className="h-4 w-4" />
                              Generate PDF Report
                            </>
                          )}
                        </Button>
                      </CardFooter>
                    </Card>
                    
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-lg">Statistics Overview</CardTitle>
                        <CardDescription>Quick statistics and metrics</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                              <div className="text-2xl font-bold text-blue-400">
                                {deletionHistory.length}
                              </div>
                              <div className="text-sm text-gray-400">Total Actions</div>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-lg">
                              <div className="text-2xl font-bold text-red-400">
                                {deletionHistory.filter(d => d.action.includes('permanent')).length}
                              </div>
                              <div className="text-sm text-gray-400">Permanent Deletions</div>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label>Most Recent Deletion</Label>
                            {deletionHistory[0] && (
                              <Card className="bg-gray-900/50 border-gray-700">
                                <CardContent className="p-4">
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Type:</span>
                                      <Badge>{deletionHistory[0].type}</Badge>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Action:</span>
                                      <span>{deletionHistory[0].action}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">By:</span>
                                      <span>{deletionHistory[0].deletedByName}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Date:</span>
                                      <span>{formatDate(deletionHistory[0].deletedAt)}</span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
        
        {/* Footer */}
        <footer className="p-6 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-400">
              © {new Date().getFullYear()} KM ELECTRONICS | Deletion Management System
            </div>
            <div className="text-sm text-gray-400">
              DESIGNED BY COD3PACK
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}