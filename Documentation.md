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
  FaEdit, FaSave, FaTrash, FaFilePdf, FaFileExcel, 
  FaMoneyBillWave, FaWarehouse, FaChartBar, FaEye,
  FaPrint, FaFileCsv, FaHistory, FaBell, FaSearch,
  FaFilter, FaSortAmountDown, FaSortAmountUp, FaCalendarAlt,
  FaUser, FaPhone, FaEnvelope, FaMapMarkerAlt, FaCreditCard,
  FaUsers, FaDownload, FaUpload, FaSync, FaExclamationTriangle,
  FaCheckCircle, FaTimesCircle, FaArrowUp, FaArrowDown,
  FaPercent, FaCalendarPlus, FaClock, FaCalculator,
  FaRegMoneyBillAlt, FaChartLine, FaTachometerAlt,
  FaHandHoldingUsd, FaUserCheck, FaUserTimes, FaChartPie,
  FaBoxes, FaDollarSign, FaShieldAlt, FaListAlt
} from 'react-icons/fa';

// ==================== DATABASE STRUCTURE ====================
/*
ALL COLLECTIONS MUST MATCH THE FIRST DASHBOARD STRUCTURE:

1. users (User Management) - SAME STRUCTURE
   - id (auto)
   - uid (Firebase Auth UID)
   - email
   - fullName
   - role: 'superadmin' | 'manager' | 'sales' | 'dataEntry' | 'user'
   - location: 'Lilongwe' | 'Blantyre' | 'Zomba' | 'Mzuzu' | 'Chitipa' | 'Salima'
   - status: 'pending' | 'approved' | 'rejected'
   - phone: string
   - createdAt: timestamp
   - updatedAt: timestamp
   - approvedBy: uid
   - approvedByName: string
   - approvedAt: timestamp
   - rejectedBy: uid
   - rejectedByName: string
   - rejectedAt: timestamp
   - rejectionReason: string

2. stocks (Inventory Management) - SAME STRUCTURE
   - id (auto)
   - itemCode: string (unique identifier)
   - brand: string
   - model: string
   - category: 'Smartphone' | 'Tablet' | 'Laptop' | 'Accessory' | 'TV' | 'Audio' | 'Other'
   - color: string
   - storage: string
   - quantity: number
   - costPrice: number (in MWK)
   - retailPrice: number (in MWK)
   - wholesalePrice: number (in MWK)
   - discountPercentage: number (0-100)
   - minStockLevel: number
   - reorderQuantity: number
   - location: string
   - supplier: string
   - warrantyPeriod: number (months)
   - description: string
   - createdAt: timestamp
   - updatedAt: timestamp
   - addedBy: uid
   - addedByName: string
   - isActive: boolean (true)

3. sales (Sales Records) - SAME STRUCTURE
   - id (auto)
   - itemCode: string
   - brand: string
   - model: string
   - category: string
   - color: string
   - storage: string
   - quantity: number
   - costPrice: number
   - salePrice: number
   - discountPercentage: number
   - finalSalePrice: number (salePrice - discount)
   - profit: number (finalSalePrice - costPrice)
   - paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer' | 'installment'
   - customerName: string
   - customerPhone: string
   - customerEmail: string
   - customerAddress: string
   - location: string
   - soldBy: uid
   - soldByName: string
   - soldAt: timestamp
   - receiptNumber: string
   - notes: string

4. installments (Installment Plans) - NEW COLLECTION
   - id (auto)
   - installmentNumber: string (e.g., INST-001)
   - customerName: string
   - customerPhone: string
   - customerEmail: string
   - customerAddress: string
   - nationalId: string
   - itemId: string (reference to stocks.id)
   - itemCode: string
   - itemName: string (brand + model)
   - itemCategory: string
   - location: string
   - totalAmount: number (retail price)
   - initialPayment: number (60% of totalAmount)
   - initialPaymentDate: timestamp
   - installmentAmount: number (monthly payment)
   - totalInstallments: number (6, 12, 18, 24)
   - paidInstallments: number
   - remainingInstallments: number
   - totalPaid: number (initial + all installments paid)
   - totalPending: number (totalAmount - totalPaid)
   - startDate: timestamp
   - nextDueDate: timestamp
   - lastPaymentDate: timestamp
   - status: 'active' | 'completed' | 'defaulted' | 'cancelled'
   - defaultDate: timestamp (if defaulted)
   - completionDate: timestamp (if completed)
   - guarantorName: string
   - guarantorPhone: string
   - guarantorAddress: string
   - notes: string
   - createdBy: uid
   - createdByName: string
   - createdAt: timestamp
   - updatedAt: timestamp

5. installmentPayments (Payment Records) - NEW COLLECTION
   - id (auto)
   - installmentId: string (reference to installments.id)
   - installmentNumber: string
   - customerName: string
   - customerPhone: string
   - paymentNumber: number (1, 2, 3...)
   - paymentType: 'initial' | 'installment' | 'final' | 'penalty'
   - amount: number
   - paymentDate: timestamp
   - paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer'
   - receiptNumber: string
   - collectedBy: uid
   - collectedByName: string
   - recordedBy: uid
   - recordedByName: string
   - notes: string
   - isLate: boolean
   - lateFee: number
   - createdAt: timestamp

6. installmentSettings (System Settings) - NEW COLLECTION
   - id: 'installment_settings' (single document)
   - initialPaymentPercentage: number (60)
   - latePaymentFee: number (percentage or fixed amount)
   - gracePeriodDays: number (7)
   - maxInstallmentPeriod: number (24)
   - minInstallmentPeriod: number (6)
   - allowedCategories: array ['Smartphone', 'Tablet', 'Laptop', 'TV']
   - requireGuarantor: boolean
   - requireNationalId: boolean
   - updatedAt: timestamp
   - updatedBy: uid

7. installmentReports (Report History) - NEW COLLECTION
   - id (auto)
   - reportType: 'installment_summary' | 'payment_history' | 'default_report'
   - period: 'daily' | 'weekly' | 'monthly' | 'custom'
   - startDate: timestamp
   - endDate: timestamp
   - generatedBy: uid
   - generatedByName: string
   - fileName: string
   - downloadCount: number
   - createdAt: timestamp
*/

// Locations - MUST MATCH FIRST DASHBOARD
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'TV', 'Audio', 'Other'];

export default function InstallmentSuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Dashboard Stats
  const [dashboardStats, setDashboardStats] = useState({
    totalStockValue: 0,
    activeInstallments: 0,
    totalInstallmentValue: 0,
    totalPaid: 0,
    totalPending: 0,
    lowStockItems: 0,
    overdueInstallments: 0,
    defaultedInstallments: 0,
    todayPayments: 0,
    todayRevenue: 0,
    monthlyRevenue: 0
  });

  // Stocks State
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [stockSearch, setStockSearch] = useState('');
  const [editingStock, setEditingStock] = useState(null);
  const [stockForm, setStockForm] = useState({
    brand: '',
    model: '',
    itemCode: '',
    category: 'Smartphone',
    color: '',
    storage: '',
    quantity: '',
    costPrice: '',
    retailPrice: '',
    wholesalePrice: '',
    minStockLevel: '5',
    reorderQuantity: '10',
    location: '',
    supplier: '',
    warrantyPeriod: '12',
    description: ''
  });

  // Installments State
  const [installments, setInstallments] = useState([]);
  const [installmentPayments, setInstallmentPayments] = useState([]);
  const [filteredInstallments, setFilteredInstallments] = useState([]);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  
  // New Installment Form
  const [newInstallment, setNewInstallment] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    nationalId: '',
    itemId: '',
    itemCode: '',
    itemName: '',
    itemCategory: 'Smartphone',
    location: '',
    totalAmount: '',
    initialPayment: '',
    totalInstallments: '12',
    installmentAmount: '',
    startDate: new Date().toISOString().split('T')[0],
    nextDueDate: '',
    guarantorName: '',
    guarantorPhone: '',
    guarantorAddress: '',
    notes: ''
  });

  // Payment Form
  const [paymentForm, setPaymentForm] = useState({
    installmentId: '',
    installmentNumber: '',
    customerName: '',
    customerPhone: '',
    paymentType: 'installment',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    receiptNumber: '',
    collectedBy: '',
    notes: '',
    isLate: false,
    lateFee: 0
  });

  // Reports State
  const [reportType, setReportType] = useState('installments');
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: '',
    location: 'all',
    status: 'all',
    category: 'all'
  });
  const [generatedReports, setGeneratedReports] = useState([]);

  // Settings State
  const [installmentSettings, setInstallmentSettings] = useState({
    initialPaymentPercentage: 60,
    latePaymentFee: 5,
    gracePeriodDays: 7,
    maxInstallmentPeriod: 24,
    minInstallmentPeriod: 6,
    allowedCategories: ['Smartphone', 'Tablet', 'Laptop', 'TV'],
    requireGuarantor: true,
    requireNationalId: true,
    autoGenerateReceipt: true
  });

  // UI State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Format currency - MUST MATCH FIRST DASHBOARD
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'MK 0';
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Calculate percentages
  const calculatePercentage = (part, total) => {
    if (!total || total === 0) return 0;
    return Math.round((part / total) * 100);
  };

  // Generate installment number
  const generateInstallmentNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `INST-${timestamp.toString().slice(-6)}-${random.toString().padStart(3, '0')}`;
  };

  // Calculate 60% initial payment
  const calculateInitialPayment = (totalAmount) => {
    return (totalAmount * (installmentSettings.initialPaymentPercentage / 100)).toFixed(2);
  };

  // Calculate installment amount
  const calculateInstallmentAmount = (totalAmount, totalInstallments, initialPayment = 0) => {
    const remaining = totalAmount - (initialPayment || 0);
    return (remaining / totalInstallments).toFixed(2);
  };

  // Calculate next due date
  const calculateNextDueDate = (startDate, monthsToAdd) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + monthsToAdd);
    return date.toISOString().split('T')[0];
  };

  // Check if payment is late
  const checkIfLate = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today - due;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > installmentSettings.gracePeriodDays;
  };

  // Calculate late fee
  const calculateLateFee = (amount, daysLate) => {
    if (daysLate <= installmentSettings.gracePeriodDays) return 0;
    return (amount * (installmentSettings.latePaymentFee / 100)).toFixed(2);
  };

  // Initialize database collections if they don't exist
  const initializeDatabaseCollections = async (user) => {
    try {
      // Check and create installment settings if not exists
      const settingsRef = doc(db, 'installmentSettings', 'installment_settings');
      const settingsDoc = await getDoc(settingsRef);
      
      if (!settingsDoc.exists()) {
        await setDoc(settingsRef, {
          ...installmentSettings,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: user.fullName || user.email
        });
      } else {
        const existingSettings = settingsDoc.data();
        setInstallmentSettings(existingSettings);
      }

      return true;
    } catch (error) {
      console.error('Database initialization error:', error);
      return false;
    }
  };

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      // Fetch stocks - USING SAME STRUCTURE
      const stocksQuery = query(collection(db, 'stocks'), where('isActive', '==', true));
      const stocksSnapshot = await getDocs(stocksQuery);
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);

      // Fetch installments
      const installmentsQuery = query(collection(db, 'installments'), orderBy('createdAt', 'desc'));
      const installmentsSnapshot = await getDocs(installmentsQuery);
      const installmentsData = installmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallments(installmentsData);

      // Fetch installment payments
      const paymentsQuery = query(collection(db, 'installmentPayments'), orderBy('paymentDate', 'desc'));
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallmentPayments(paymentsData);

      // Fetch generated reports
      const reportsQuery = query(collection(db, 'installmentReports'), orderBy('createdAt', 'desc'));
      const reportsSnapshot = await getDocs(reportsQuery);
      const reportsData = reportsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGeneratedReports(reportsData);

      // Calculate dashboard stats
      calculateDashboardStats(stocksData, installmentsData, paymentsData);

    } catch (error) {
      setError('Failed to fetch data: ' + error.message);
    }
  }, []);

  // Calculate dashboard statistics
  const calculateDashboardStats = (stocksData, installmentsData, paymentsData) => {
    try {
      // Stock stats
      const totalStockValue = stocksData.reduce((sum, stock) => 
        sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0);

      const lowStockItems = stocksData.filter(stock => 
        (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) && 
        (parseInt(stock.quantity) || 0) > 0
      ).length;

      // Installment stats
      const activeInstallments = installmentsData.filter(i => i.status === 'active').length;
      const defaultedInstallments = installmentsData.filter(i => i.status === 'defaulted').length;
      const completedInstallments = installmentsData.filter(i => i.status === 'completed').length;
      
      const overdueInstallments = installmentsData.filter(i => {
        if (i.status === 'active' && i.nextDueDate) {
          const dueDate = i.nextDueDate.toDate ? i.nextDueDate.toDate() : new Date(i.nextDueDate);
          return dueDate < new Date();
        }
        return false;
      }).length;

      const totalInstallmentValue = installmentsData.reduce((sum, installment) => 
        sum + (parseFloat(installment.totalAmount) || 0), 0);

      const totalPaid = installmentsData.reduce((sum, installment) => 
        sum + (parseFloat(installment.totalPaid) || 0), 0);

      const totalPending = installmentsData.reduce((sum, installment) => 
        sum + (parseFloat(installment.totalPending) || 0), 0);

      // Today's payments
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayPayments = paymentsData.filter(payment => {
        const paymentDate = payment.paymentDate.toDate ? payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return paymentDate >= today && paymentDate < tomorrow;
      }).length;

      const todayRevenue = paymentsData.filter(payment => {
        const paymentDate = payment.paymentDate.toDate ? payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return paymentDate >= today && paymentDate < tomorrow;
      }).reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);

      // Monthly revenue (current month)
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyRevenue = paymentsData.filter(payment => {
        const paymentDate = payment.paymentDate.toDate ? payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
      }).reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);

      setDashboardStats({
        totalStockValue,
        activeInstallments,
        totalInstallmentValue,
        totalPaid,
        totalPending,
        lowStockItems,
        overdueInstallments,
        defaultedInstallments,
        todayPayments,
        todayRevenue,
        monthlyRevenue,
        completedInstallments
      });
    } catch (error) {
      console.error('Error calculating dashboard stats:', error);
    }
  };

  // Filter stocks
  useEffect(() => {
    let filtered = stocks;
    
    if (selectedLocation !== 'all') {
      filtered = filtered.filter(stock => stock.location === selectedLocation);
    }
    
    if (stockSearch) {
      const searchLower = stockSearch.toLowerCase();
      filtered = filtered.filter(stock =>
        stock.brand?.toLowerCase().includes(searchLower) ||
        stock.model?.toLowerCase().includes(searchLower) ||
        stock.itemCode?.toLowerCase().includes(searchLower) ||
        stock.category?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric values
        if (['quantity', 'costPrice', 'retailPrice', 'wholesalePrice'].includes(sortConfig.key)) {
          aValue = parseFloat(aValue) || 0;
          bValue = parseFloat(bValue) || 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredStocks(filtered);
  }, [stocks, selectedLocation, stockSearch, sortConfig]);

  // Filter installments
  useEffect(() => {
    let filtered = installments;
    
    // Filter by status
    if (selectedStatusFilter !== 'all') {
      filtered = filtered.filter(installment => installment.status === selectedStatusFilter);
    }
    
    // Filter by location
    if (reportFilters.location !== 'all') {
      filtered = filtered.filter(installment => installment.location === reportFilters.location);
    }

    // Filter by search query
    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(installment =>
        installment.customerName?.toLowerCase().includes(queryLower) ||
        installment.customerPhone?.includes(queryQuery) ||
        installment.installmentNumber?.toLowerCase().includes(queryLower) ||
        installment.itemName?.toLowerCase().includes(queryLower)
      );
    }

    setFilteredInstallments(filtered);
  }, [installments, selectedStatusFilter, reportFilters.location, searchQuery]);

  // CRUD Operations for Stocks - USING SAME STRUCTURE AS FIRST DASHBOARD
  const handleAddStock = async () => {
    try {
      if (!stockForm.brand || !stockForm.model || !stockForm.itemCode || !stockForm.quantity || !stockForm.location) {
        setError('Please fill in required fields: Brand, Model, Item Code, Quantity, and Location.');
        return;
      }

      const stockData = {
        ...stockForm,
        costPrice: parseFloat(stockForm.costPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.retailPrice) * 0.8) || 0,
        discountPercentage: parseFloat(stockForm.discountPercentage) || 0,
        quantity: parseInt(stockForm.quantity) || 0,
        minStockLevel: parseInt(stockForm.minStockLevel) || 5,
        reorderQuantity: parseInt(stockForm.reorderQuantity) || 10,
        warrantyPeriod: parseInt(stockForm.warrantyPeriod) || 12,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        addedBy: user.uid,
        addedByName: user.fullName || user.email,
        isActive: true
      };

      await addDoc(collection(db, 'stocks'), stockData);
      
      setStockForm({
        brand: '',
        model: '',
        itemCode: '',
        category: 'Smartphone',
        color: '',
        storage: '',
        quantity: '',
        costPrice: '',
        retailPrice: '',
        wholesalePrice: '',
        minStockLevel: '5',
        reorderQuantity: '10',
        location: '',
        supplier: '',
        warrantyPeriod: '12',
        description: ''
      });
      
      setSuccess('Stock added successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to add stock: ' + error.message);
    }
  };

  const handleEditStock = (stock) => {
    setEditingStock(stock.id);
    setStockForm({
      brand: stock.brand || '',
      model: stock.model || '',
      itemCode: stock.itemCode || '',
      category: stock.category || 'Smartphone',
      color: stock.color || '',
      storage: stock.storage || '',
      quantity: stock.quantity || '',
      costPrice: stock.costPrice || '',
      retailPrice: stock.retailPrice || '',
      wholesalePrice: stock.wholesalePrice || '',
      minStockLevel: stock.minStockLevel || '5',
      reorderQuantity: stock.reorderQuantity || '10',
      location: stock.location || '',
      supplier: stock.supplier || '',
      warrantyPeriod: stock.warrantyPeriod?.toString() || '12',
      description: stock.description || ''
    });
  };

  const handleUpdateStock = async () => {
    try {
      if (!editingStock) return;

      const stockData = {
        ...stockForm,
        costPrice: parseFloat(stockForm.costPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.retailPrice) * 0.8) || 0,
        quantity: parseInt(stockForm.quantity) || 0,
        minStockLevel: parseInt(stockForm.minStockLevel) || 5,
        reorderQuantity: parseInt(stockForm.reorderQuantity) || 10,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName || user.email
      };

      await updateDoc(doc(db, 'stocks', editingStock), stockData);
      
      setEditingStock(null);
      setSuccess('Stock updated successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to update stock: ' + error.message);
    }
  };

  const handleDeleteStock = async (stockId) => {
    if (!window.confirm('Are you sure you want to delete this stock item?')) return;

    try {
      // Soft delete - set isActive to false
      await updateDoc(doc(db, 'stocks', stockId), {
        isActive: false,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      setSuccess('Stock deleted successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to delete stock: ' + error.message);
    }
  };

  const handleCancelEdit = () => {
    setEditingStock(null);
    setStockForm({
      brand: '',
      model: '',
      itemCode: '',
      category: 'Smartphone',
      color: '',
      storage: '',
      quantity: '',
      costPrice: '',
      retailPrice: '',
      wholesalePrice: '',
      minStockLevel: '5',
      reorderQuantity: '10',
      location: '',
      supplier: '',
      warrantyPeriod: '12',
      description: ''
    });
  };

  // Installment Operations
  const handleCreateInstallment = async () => {
    try {
      // Validate required fields
      if (!newInstallment.customerName || !newInstallment.customerPhone || !newInstallment.totalAmount || !newInstallment.itemId) {
        setError('Please fill in required fields: Customer Name, Phone, Total Amount, and select an Item.');
        return;
      }

      // Validate guarantor if required
      if (installmentSettings.requireGuarantor && (!newInstallment.guarantorName || !newInstallment.guarantorPhone)) {
        setError('Guarantor information is required.');
        return;
      }

      // Validate national ID if required
      if (installmentSettings.requireNationalId && !newInstallment.nationalId) {
        setError('National ID is required.');
        return;
      }

      const selectedStock = stocks.find(s => s.id === newInstallment.itemId);
      if (!selectedStock) {
        setError('Selected item not found');
        return;
      }

      // Check if item is in stock
      if ((parseInt(selectedStock.quantity) || 0) <= 0) {
        setError('Selected item is out of stock');
        return;
      }

      // Calculate amounts
      const totalAmount = parseFloat(newInstallment.totalAmount);
      const initialPayment = parseFloat(newInstallment.initialPayment) || parseFloat(calculateInitialPayment(totalAmount));
      const totalInstallments = parseInt(newInstallment.totalInstallments);
      const installmentAmount = parseFloat(calculateInstallmentAmount(totalAmount, totalInstallments, initialPayment));
      const nextDueDate = calculateNextDueDate(newInstallment.startDate, 1);

      // Generate installment number
      const installmentNumber = generateInstallmentNumber();

      const installmentData = {
        installmentNumber,
        customerName: newInstallment.customerName.trim(),
        customerPhone: newInstallment.customerPhone.trim(),
        customerEmail: newInstallment.customerEmail || '',
        customerAddress: newInstallment.customerAddress || '',
        nationalId: newInstallment.nationalId || '',
        itemId: newInstallment.itemId,
        itemCode: selectedStock.itemCode,
        itemName: `${selectedStock.brand} ${selectedStock.model}`,
        itemCategory: selectedStock.category || 'Smartphone',
        location: selectedStock.location,
        totalAmount: totalAmount,
        initialPayment: initialPayment,
        installmentAmount: installmentAmount,
        totalInstallments: totalInstallments,
        paidInstallments: 0,
        remainingInstallments: totalInstallments,
        totalPaid: initialPayment,
        totalPending: totalAmount - initialPayment,
        startDate: Timestamp.fromDate(new Date(newInstallment.startDate)),
        nextDueDate: Timestamp.fromDate(new Date(nextDueDate)),
        lastPaymentDate: Timestamp.fromDate(new Date(newInstallment.startDate)),
        status: 'active',
        guarantorName: newInstallment.guarantorName || '',
        guarantorPhone: newInstallment.guarantorPhone || '',
        guarantorAddress: newInstallment.guarantorAddress || '',
        notes: newInstallment.notes || '',
        createdBy: user.uid,
        createdByName: user.fullName || user.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Add installment to database
      const installmentRef = await addDoc(collection(db, 'installments'), installmentData);

      // Reduce stock quantity
      await updateDoc(doc(db, 'stocks', selectedStock.id), {
        quantity: parseInt(selectedStock.quantity) - 1,
        updatedAt: serverTimestamp()
      });

      // Record initial payment
      const initialPaymentData = {
        installmentId: installmentRef.id,
        installmentNumber: installmentNumber,
        customerName: installmentData.customerName,
        customerPhone: installmentData.customerPhone,
        paymentNumber: 0, // 0 indicates initial payment
        paymentType: 'initial',
        amount: initialPayment,
        paymentDate: Timestamp.fromDate(new Date(newInstallment.startDate)),
        paymentMethod: 'cash',
        receiptNumber: `INIT-${Date.now()}`,
        collectedBy: user.uid,
        collectedByName: user.fullName || user.email,
        recordedBy: user.uid,
        recordedByName: user.fullName || user.email,
        notes: `Initial payment (${installmentSettings.initialPaymentPercentage}% of retail price)`,
        isLate: false,
        lateFee: 0,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'installmentPayments'), initialPaymentData);

      // Record sale
      const saleData = {
        itemCode: selectedStock.itemCode,
        brand: selectedStock.brand,
        model: selectedStock.model,
        category: selectedStock.category,
        color: selectedStock.color || '',
        storage: selectedStock.storage || '',
        quantity: 1,
        costPrice: selectedStock.costPrice || 0,
        salePrice: totalAmount,
        discountPercentage: 0,
        finalSalePrice: totalAmount,
        profit: totalAmount - (selectedStock.costPrice || 0),
        paymentMethod: 'installment',
        customerName: newInstallment.customerName,
        customerPhone: newInstallment.customerPhone,
        customerEmail: newInstallment.customerEmail || '',
        customerAddress: newInstallment.customerAddress || '',
        location: selectedStock.location,
        soldBy: user.uid,
        soldByName: user.fullName || user.email,
        soldAt: serverTimestamp(),
        receiptNumber: initialPaymentData.receiptNumber,
        notes: `Installment sale - ${installmentNumber}`
      };

      await addDoc(collection(db, 'sales'), saleData);

      // Reset form
      setNewInstallment({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: '',
        nationalId: '',
        itemId: '',
        itemCode: '',
        itemName: '',
        itemCategory: 'Smartphone',
        location: '',
        totalAmount: '',
        initialPayment: '',
        totalInstallments: '12',
        installmentAmount: '',
        startDate: new Date().toISOString().split('T')[0],
        nextDueDate: '',
        guarantorName: '',
        guarantorPhone: '',
        guarantorAddress: '',
        notes: ''
      });

      setSuccess(`Installment plan created successfully! Installment Number: ${installmentNumber}`);
      fetchAllData();
    } catch (error) {
      setError('Failed to create installment: ' + error.message);
    }
  };

  const handleRecordPayment = async () => {
    try {
      if (!paymentForm.installmentId || !paymentForm.amount) {
        setError('Please select installment and enter amount');
        return;
      }

      const installment = installments.find(i => i.id === paymentForm.installmentId);
      if (!installment) {
        setError('Installment not found');
        return;
      }

      const paymentAmount = parseFloat(paymentForm.amount);
      const paymentDate = new Date(paymentForm.paymentDate);
      
      // Check if payment is late
      const dueDate = installment.nextDueDate.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
      const daysLate = Math.ceil((paymentDate - dueDate) / (1000 * 60 * 60 * 24));
      const isLate = daysLate > installmentSettings.gracePeriodDays;
      const lateFee = isLate ? calculateLateFee(paymentAmount, daysLate) : 0;
      const totalPayment = paymentAmount + parseFloat(lateFee);

      // Get next payment number
      const installmentPaymentsForThis = installmentPayments.filter(p => p.installmentId === paymentForm.installmentId);
      const lastPayment = installmentPaymentsForThis.sort((a, b) => b.paymentNumber - a.paymentNumber)[0];
      const paymentNumber = (lastPayment?.paymentNumber || 0) + 1;

      const paymentData = {
        installmentId: paymentForm.installmentId,
        installmentNumber: installment.installmentNumber,
        customerName: installment.customerName,
        customerPhone: installment.customerPhone,
        paymentNumber: paymentNumber,
        paymentType: paymentForm.paymentType,
        amount: paymentAmount,
        paymentDate: Timestamp.fromDate(paymentDate),
        paymentMethod: paymentForm.paymentMethod,
        receiptNumber: paymentForm.receiptNumber || `PAY-${Date.now()}`,
        collectedBy: paymentForm.collectedBy || user.fullName || user.email,
        recordedBy: user.uid,
        recordedByName: user.fullName || user.email,
        notes: paymentForm.notes || '',
        isLate: isLate,
        lateFee: lateFee,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'installmentPayments'), paymentData);

      // Update installment
      const newTotalPaid = (installment.totalPaid || 0) + totalPayment;
      const newTotalPending = Math.max(0, installment.totalAmount - newTotalPaid);
      const newPaidInstallments = installment.paidInstallments + (paymentForm.paymentType === 'installment' ? 1 : 0);
      const newRemainingInstallments = Math.max(0, installment.totalInstallments - newPaidInstallments);
      
      let newStatus = installment.status;
      let nextDueDate = installment.nextDueDate;
      
      if (newTotalPaid >= installment.totalAmount) {
        newStatus = 'completed';
      } else if (paymentForm.paymentType === 'installment') {
        // Calculate next due date (one month from last payment)
        const lastPaymentDate = new Date(paymentForm.paymentDate);
        lastPaymentDate.setMonth(lastPaymentDate.getMonth() + 1);
        nextDueDate = Timestamp.fromDate(lastPaymentDate);
      }

      const updateData = {
        totalPaid: newTotalPaid,
        totalPending: newTotalPending,
        paidInstallments: newPaidInstallments,
        remainingInstallments: newRemainingInstallments,
        status: newStatus,
        lastPaymentDate: Timestamp.fromDate(paymentDate),
        nextDueDate: nextDueDate,
        updatedAt: serverTimestamp()
      };

      if (newStatus === 'completed') {
        updateData.completionDate = Timestamp.fromDate(paymentDate);
      }

      await updateDoc(doc(db, 'installments', paymentForm.installmentId), updateData);

      // Record sale for installment payment
      const saleData = {
        itemCode: installment.itemCode,
        brand: installment.itemName.split(' ')[0],
        model: installment.itemName.split(' ').slice(1).join(' '),
        category: installment.itemCategory,
        quantity: 0,
        costPrice: 0,
        salePrice: paymentAmount,
        discountPercentage: 0,
        finalSalePrice: paymentAmount,
        profit: paymentAmount,
        paymentMethod: paymentForm.paymentMethod,
        customerName: installment.customerName,
        customerPhone: installment.customerPhone,
        location: installment.location,
        soldBy: user.uid,
        soldByName: user.fullName || user.email,
        soldAt: serverTimestamp(),
        receiptNumber: paymentData.receiptNumber,
        notes: `Installment payment - ${installment.installmentNumber}${lateFee > 0 ? ` (Late fee: ${formatCurrency(lateFee)})` : ''}`
      };

      await addDoc(collection(db, 'sales'), saleData);

      // Reset form
      setPaymentForm({
        installmentId: '',
        installmentNumber: '',
        customerName: '',
        customerPhone: '',
        paymentType: 'installment',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        receiptNumber: '',
        collectedBy: '',
        notes: '',
        isLate: false,
        lateFee: 0
      });

      setSuccess(`Payment recorded successfully!${lateFee > 0 ? ` Late fee: ${formatCurrency(lateFee)}` : ''}`);
      fetchAllData();
    } catch (error) {
      setError('Failed to record payment: ' + error.message);
    }
  };

  const handleMarkAsDefaulted = async (installmentId) => {
    if (!window.confirm('Are you sure you want to mark this installment as defaulted?')) return;

    try {
      await updateDoc(doc(db, 'installments', installmentId), {
        status: 'defaulted',
        defaultDate: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setSuccess('Installment marked as defaulted!');
      fetchAllData();
    } catch (error) {
      setError('Failed to mark as defaulted: ' + error.message);
    }
  };

  const handleMarkAsCompleted = async (installmentId) => {
    if (!window.confirm('Are you sure you want to mark this installment as completed?')) return;

    try {
      const installment = installments.find(i => i.id === installmentId);
      if (!installment) {
        setError('Installment not found');
        return;
      }

      await updateDoc(doc(db, 'installments', installmentId), {
        status: 'completed',
        completionDate: serverTimestamp(),
        totalPaid: installment.totalAmount,
        totalPending: 0,
        paidInstallments: installment.totalInstallments,
        remainingInstallments: 0,
        updatedAt: serverTimestamp()
      });

      setSuccess('Installment marked as completed!');
      fetchAllData();
    } catch (error) {
      setError('Failed to mark as completed: ' + error.message);
    }
  };

  // Report Generation
  const generateInstallmentReportPDF = async () => {
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
      doc.text('Installment Processing Report', pageWidth / 2, 30, { align: 'center' });

      // Report Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`, 20, 52);
      doc.text(`Location: ${reportFilters.location === 'all' ? 'All Locations' : reportFilters.location}`, 20, 59);
      doc.text(`Status: ${reportFilters.status === 'all' ? 'All Statuses' : reportFilters.status}`, 20, 66);

      // Summary Stats
      const totalActive = filteredInstallments.filter(i => i.status === 'active').length;
      const totalCompleted = filteredInstallments.filter(i => i.status === 'completed').length;
      const totalDefaulted = filteredInstallments.filter(i => i.status === 'defaulted').length;
      const totalOverdue = filteredInstallments.filter(i => {
        if (i.status === 'active' && i.nextDueDate) {
          const dueDate = i.nextDueDate.toDate ? i.nextDueDate.toDate() : new Date(i.nextDueDate);
          return dueDate < today;
        }
        return false;
      }).length;

      const totalInstallmentValue = filteredInstallments.reduce((sum, i) => sum + (parseFloat(i.totalAmount) || 0), 0);
      const totalPaid = filteredInstallments.reduce((sum, i) => sum + (parseFloat(i.totalPaid) || 0), 0);
      const totalPending = filteredInstallments.reduce((sum, i) => sum + (parseFloat(i.totalPending) || 0), 0);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY STATISTICS', 20, 80);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // First column
      doc.text(`Total Installments: ${filteredInstallments.length}`, 20, 90);
      doc.text(`Active: ${totalActive}`, 20, 97);
      doc.text(`Completed: ${totalCompleted}`, 20, 104);
      
      // Second column
      doc.text(`Defaulted: ${totalDefaulted}`, 100, 90);
      doc.text(`Overdue: ${totalOverdue}`, 100, 97);
      
      // Third column
      doc.text(`Total Value: ${formatCurrency(totalInstallmentValue)}`, 180, 90);
      doc.text(`Total Paid: ${formatCurrency(totalPaid)}`, 180, 97);
      doc.text(`Total Pending: ${formatCurrency(totalPending)}`, 180, 104);

      // Installment Details Table
      const tableData = filteredInstallments.map(installment => {
        const dueDate = installment.nextDueDate?.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
        const isOverdue = dueDate && dueDate < today;
        const paymentProgress = calculatePercentage(installment.totalPaid || 0, installment.totalAmount);
        
        return [
          installment.installmentNumber,
          installment.customerName,
          installment.customerPhone,
          installment.itemName,
          installment.location,
          formatCurrency(installment.totalAmount),
          formatCurrency(installment.totalPaid || 0),
          formatCurrency(installment.totalPending || 0),
          `${paymentProgress}%`,
          installment.status + (isOverdue && installment.status === 'active' ? ' (Overdue)' : ''),
          installment.startDate.toDate ? 
            installment.startDate.toDate().toLocaleDateString('en-MW') : 
            new Date(installment.startDate).toLocaleDateString('en-MW')
        ];
      });

      autoTable(doc, {
        startY: 115,
        head: [['Inst. No.', 'Customer', 'Phone', 'Item', 'Location', 'Total', 'Paid', 'Pending', 'Progress', 'Status', 'Start Date']],
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
        margin: { top: 115 }
      });

      // Footer
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Report generated by: ${user?.fullName || user?.email}`, 20, finalY);
      doc.text(`Page 1 of 1`, pageWidth - 20, finalY, { align: 'right' });

      // Save PDF
      const filename = `KM_Installment_Report_${today.getTime()}.pdf`;
      doc.save(filename);

      // Record report generation
      await addDoc(collection(db, 'installmentReports'), {
        reportType: 'installment_summary',
        period: reportFilters.startDate && reportFilters.endDate ? 'custom' : 'all',
        startDate: reportFilters.startDate ? Timestamp.fromDate(new Date(reportFilters.startDate)) : null,
        endDate: reportFilters.endDate ? Timestamp.fromDate(new Date(reportFilters.endDate)) : null,
        generatedBy: user.uid,
        generatedByName: user.fullName || user.email,
        fileName: filename,
        downloadCount: 1,
        createdAt: serverTimestamp()
      });

      setSuccess('Installment report generated successfully!');
    } catch (error) {
      setError('Failed to generate PDF report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generatePaymentHistoryPDF = async (installmentId = null) => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date();

      // Filter payments
      let paymentsToReport = installmentPayments;
      let installmentInfo = null;
      
      if (installmentId) {
        paymentsToReport = paymentsToReport.filter(p => p.installmentId === installmentId);
        installmentInfo = installments.find(i => i.id === installmentId);
      }

      // Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 51, 102);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.text('Payment History Report', pageWidth / 2, 30, { align: 'center' });

      if (installmentInfo) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Installment: ${installmentInfo.installmentNumber}`, 20, 40);
        doc.text(`Customer: ${installmentInfo.customerName} (${installmentInfo.customerPhone})`, 20, 47);
        doc.text(`Item: ${installmentInfo.itemName}`, 20, 54);
      }

      // Report Info
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, installmentInfo ? 61 : 40);
      doc.text(`Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`, 20, installmentInfo ? 68 : 47);

      // Summary
      const totalAmount = paymentsToReport.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const latePayments = paymentsToReport.filter(p => p.isLate).length;
      const totalLateFees = paymentsToReport.reduce((sum, p) => sum + (parseFloat(p.lateFee) || 0), 0);

      const startY = installmentInfo ? 78 : 57;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 20, startY);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Payments: ${paymentsToReport.length}`, 20, startY + 8);
      doc.text(`Total Amount: ${formatCurrency(totalAmount)}`, 20, startY + 16);
      doc.text(`Late Payments: ${latePayments}`, 100, startY + 8);
      doc.text(`Total Late Fees: ${formatCurrency(totalLateFees)}`, 100, startY + 16);

      // Payment Details Table
      const tableData = paymentsToReport.map(payment => {
        const paymentDate = payment.paymentDate.toDate ? payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return [
          payment.receiptNumber,
          payment.customerName,
          payment.paymentType.toUpperCase(),
          formatCurrency(payment.amount),
          paymentDate.toLocaleDateString('en-MW'),
          payment.paymentMethod,
          payment.isLate ? 'Yes' : 'No',
          formatCurrency(payment.lateFee || 0),
          payment.collectedByName || 'N/A'
        ];
      });

      autoTable(doc, {
        startY: startY + 25,
        head: [['Receipt No.', 'Customer', 'Type', 'Amount', 'Date', 'Method', 'Late', 'Late Fee', 'Collected By']],
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
        margin: { top: startY + 25 }
      });

      // Save PDF
      const filename = installmentId 
        ? `KM_Payment_History_${installmentInfo?.installmentNumber}_${today.getTime()}.pdf`
        : `KM_Payment_History_${today.getTime()}.pdf`;
      
      doc.save(filename);

      // Record report generation
      await addDoc(collection(db, 'installmentReports'), {
        reportType: 'payment_history',
        period: reportFilters.startDate && reportFilters.endDate ? 'custom' : 'all',
        startDate: reportFilters.startDate ? Timestamp.fromDate(new Date(reportFilters.startDate)) : null,
        endDate: reportFilters.endDate ? Timestamp.fromDate(new Date(reportFilters.endDate)) : null,
        generatedBy: user.uid,
        generatedByName: user.fullName || user.email,
        fileName: filename,
        downloadCount: 1,
        createdAt: serverTimestamp()
      });

      setSuccess('Payment history report generated successfully!');
    } catch (error) {
      setError('Failed to generate payment history report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateStockBalanceReportPDF = async () => {
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
      doc.text('Stock Balance Report', pageWidth / 2, 30, { align: 'center' });

      // Report Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Location: ${selectedLocation === 'all' ? 'All Locations' : selectedLocation}`, 20, 52);

      // Summary
      const totalValue = filteredStocks.reduce((sum, stock) => 
        sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0);

      const lowStockItems = filteredStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) &&
        (parseInt(stock.quantity) || 0) > 0
      );

      const outOfStockItems = filteredStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) <= 0
      );

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 20, 65);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Items: ${filteredStocks.length}`, 20, 75);
      doc.text(`Total Quantity: ${filteredStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)}`, 100, 75);
      doc.text(`Total Value: ${formatCurrency(totalValue)}`, 180, 75);
      doc.text(`Low Stock Items: ${lowStockItems.length}`, 260, 75);

      // Stock Table
      const tableData = filteredStocks.map(stock => [
        stock.location,
        stock.itemCode,
        `${stock.brand} ${stock.model}`,
        stock.category || 'N/A',
        parseInt(stock.quantity) || 0,
        parseInt(stock.minStockLevel) || 5,
        formatCurrency(parseFloat(stock.costPrice) || 0),
        formatCurrency(parseFloat(stock.retailPrice) || 0),
        formatCurrency((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0))
      ]);

      autoTable(doc, {
        startY: 85,
        head: [['Location', 'Item Code', 'Product', 'Category', 'Qty', 'Min Level', 'Cost', 'Retail', 'Total Value']],
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
        margin: { top: 85 }
      });

      // Stock Alerts
      const finalY = doc.lastAutoTable.finalY + 10;
      
      if (lowStockItems.length > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 140, 0);
        doc.text('LOW STOCK ALERT:', 20, finalY);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        lowStockItems.slice(0, 5).forEach((stock, index) => {
          doc.text(`${stock.itemCode} - ${stock.brand} ${stock.model}: ${stock.quantity} units (Min: ${stock.minStockLevel})`, 
            20, finalY + 10 + (index * 5));
        });
      }

      if (outOfStockItems.length > 0) {
        const alertY = finalY + (lowStockItems.length > 0 ? 10 + (lowStockItems.length * 5) : 0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 0, 0);
        doc.text('OUT OF STOCK:', 20, alertY);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        outOfStockItems.slice(0, 5).forEach((stock, index) => {
          doc.text(`${stock.itemCode} - ${stock.brand} ${stock.model}`, 
            20, alertY + 10 + (index * 5));
        });
      }

      // Save PDF
      const filename = `KM_Stock_Balance_Report_${today.getTime()}.pdf`;
      doc.save(filename);

      // Record report generation
      await addDoc(collection(db, 'installmentReports'), {
        reportType: 'stock_balance',
        period: 'current',
        generatedBy: user.uid,
        generatedByName: user.fullName || user.email,
        fileName: filename,
        downloadCount: 1,
        createdAt: serverTimestamp()
      });

      setSuccess('Stock balance report generated successfully!');
    } catch (error) {
      setError('Failed to generate stock report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Settings Management
  const saveInstallmentSettings = async () => {
    try {
      const settingsRef = doc(db, 'installmentSettings', 'installment_settings');
      await setDoc(settingsRef, {
        ...installmentSettings,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName || user.email
      });
      setSuccess('Installment settings saved successfully!');
    } catch (error) {
      setError('Failed to save installment settings: ' + error.message);
    }
  };

  // Handle sort
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

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

  // Authentication and initialization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userDoc = await getDocs(
            query(collection(db, 'users'), where('uid', '==', authUser.uid))
          );
          
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            if (userData.role === 'superadmin' || userData.role === 'manager') {
              setUser(userData);
              // Initialize database collections
              await initializeDatabaseCollections(userData);
              await fetchAllData();
            } else {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-white">Loading Installment Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white">
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

      {/* Header */}
      <header className="bg-gray-800/80 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold">
                KM ELECTRONICS <span className="text-blue-400">Installment System</span>
              </h1>
              <p className="text-gray-400 text-sm">
                Welcome, {user?.fullName || user?.email} | {user?.role?.toUpperCase()}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-white"
              >
                <option value="all">All Locations</option>
                {LOCATIONS.map((location, index) => (
                  <option key={index} value={location}>{location}</option>
                ))}
              </select>
              
              <button
                onClick={() => signOut(auth).then(() => router.push('/login'))}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
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
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: 'dashboard', name: 'Dashboard', icon: FaTachometerAlt },
              { id: 'installments', name: 'Installments', icon: FaHandHoldingUsd },
              { id: 'stocks', name: 'Stock Management', icon: FaWarehouse },
              { id: 'reports', name: 'Reports', icon: FaChartBar },
              { id: 'payments', name: 'Payment Records', icon: FaRegMoneyBillAlt },
              { id: 'settings', name: 'Settings', icon: FaShieldAlt }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                <tab.icon />
                <span>{tab.name}</span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Total Installment Value</h3>
                      <p className="text-2xl font-bold text-blue-400">
                        {formatCurrency(dashboardStats.totalInstallmentValue)}
                      </p>
                    </div>
                    <div className="bg-blue-500/20 p-3 rounded-lg">
                      <FaHandHoldingUsd className="text-blue-400 text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mt-2">
                    {dashboardStats.activeInstallments} active plans
                  </p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Installment Payments</h3>
                      <p className="text-2xl font-bold text-green-400">
                        {formatCurrency(dashboardStats.totalPaid)}
                      </p>
                    </div>
                    <div className="bg-green-500/20 p-3 rounded-lg">
                      <FaMoneyBillWave className="text-green-400 text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mt-2">
                    {formatCurrency(dashboardStats.totalPending)} pending
                  </p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Stock Value</h3>
                      <p className="text-2xl font-bold text-purple-400">
                        {formatCurrency(dashboardStats.totalStockValue)}
                      </p>
                    </div>
                    <div className="bg-purple-500/20 p-3 rounded-lg">
                      <FaWarehouse className="text-purple-400 text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mt-2">
                    {dashboardStats.lowStockItems} low stock items
                  </p>
                </div>
                
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Today's Revenue</h3>
                      <p className="text-2xl font-bold text-orange-400">
                        {formatCurrency(dashboardStats.todayRevenue)}
                      </p>
                    </div>
                    <div className="bg-orange-500/20 p-3 rounded-lg">
                      <FaChartLine className="text-orange-400 text-xl" />
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mt-2">
                    {dashboardStats.todayPayments} payments today
                  </p>
                </div>
              </div>

              {/* Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Installment Status</h2>
                    <FaChartPie className="text-blue-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Active</span>
                      <span className="text-blue-400 font-semibold">{dashboardStats.activeInstallments}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Overdue</span>
                      <span className="text-orange-400 font-semibold">{dashboardStats.overdueInstallments}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Defaulted</span>
                      <span className="text-red-400 font-semibold">{dashboardStats.defaultedInstallments}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Completed</span>
                      <span className="text-green-400 font-semibold">{dashboardStats.completedInstallments}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setActiveTab('installments')}
                      className="bg-blue-600 hover:bg-blue-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaHandHoldingUsd className="text-2xl mb-2" />
                      <span className="text-sm">New Installment</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('payments')}
                      className="bg-green-600 hover:bg-green-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaMoneyBillWave className="text-2xl mb-2" />
                      <span className="text-sm">Record Payment</span>
                    </button>
                    <button
                      onClick={generateInstallmentReportPDF}
                      className="bg-purple-600 hover:bg-purple-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaFilePdf className="text-2xl mb-2" />
                      <span className="text-sm">Generate Report</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('stocks')}
                      className="bg-orange-600 hover:bg-orange-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaWarehouse className="text-2xl mb-2" />
                      <span className="text-sm">Manage Stock</span>
                    </button>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                  <h2 className="text-lg font-semibold mb-4">Recent Payments</h2>
                  <div className="space-y-3">
                    {installmentPayments.slice(0, 5).map((payment, index) => (
                      <div key={index} className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{payment.customerName}</div>
                          <div className="text-gray-400 text-xs">{payment.receiptNumber}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-semibold text-sm">
                            {formatCurrency(payment.amount)}
                          </div>
                          <div className="text-gray-400 text-xs">
                            {payment.paymentDate?.toDate?.().toLocaleDateString() || 'Today'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Installments Tab */}
          {activeTab === 'installments' && (
            <div className="space-y-6">
              {/* Installment Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-blue-400">{dashboardStats.activeInstallments}</div>
                  <div className="text-gray-400 text-sm">Active</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-green-400">{formatCurrency(dashboardStats.totalPaid)}</div>
                  <div className="text-gray-400 text-sm">Paid</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-orange-400">{formatCurrency(dashboardStats.totalPending)}</div>
                  <div className="text-gray-400 text-sm">Pending</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-red-400">{dashboardStats.overdueInstallments}</div>
                  <div className="text-gray-400 text-sm">Overdue</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-red-500">{dashboardStats.defaultedInstallments}</div>
                  <div className="text-gray-400 text-sm">Defaulted</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-green-500">{dashboardStats.completedInstallments}</div>
                  <div className="text-gray-400 text-sm">Completed</div>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Search Installments</label>
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-3 py-2"
                        placeholder="Search by customer, phone, installment number..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Filter by Status</label>
                    <select
                      value={selectedStatusFilter}
                      onChange={(e) => setSelectedStatusFilter(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="defaulted">Defaulted</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Actions</label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedStatusFilter('all');
                        }}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg transition-colors"
                      >
                        Clear Filters
                      </button>
                      <button
                        onClick={generateInstallmentReportPDF}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                      >
                        <FaFilePdf />
                        <span>Export PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Create Installment */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">
                    <FaHandHoldingUsd className="inline mr-2" />
                    Create New Installment ({installmentSettings.initialPaymentPercentage}% Start)
                  </h2>
                  <span className="text-sm text-gray-400">
                    Stock Available: {stocks.filter(s => (parseInt(s.quantity) || 0) > 0).length} items
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Customer Name *</label>
                    <input
                      type="text"
                      value={newInstallment.customerName}
                      onChange={(e) => setNewInstallment({...newInstallment, customerName: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="Full Name"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Customer Phone *</label>
                    <input
                      type="tel"
                      value={newInstallment.customerPhone}
                      onChange={(e) => setNewInstallment({...newInstallment, customerPhone: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="0999 999 999"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">National ID {installmentSettings.requireNationalId && '*'}</label>
                    <input
                      type="text"
                      value={newInstallment.nationalId}
                      onChange={(e) => setNewInstallment({...newInstallment, nationalId: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="National ID Number"
                      required={installmentSettings.requireNationalId}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Select Item *</label>
                    <select
                      value={newInstallment.itemId}
                      onChange={(e) => {
                        const selected = stocks.find(s => s.id === e.target.value);
                        if (selected) {
                          const retailPrice = parseFloat(selected.retailPrice) || 0;
                          const startPrice = calculateInitialPayment(retailPrice);
                          const installmentAmount = calculateInstallmentAmount(
                            retailPrice, 
                            parseInt(newInstallment.totalInstallments), 
                            parseFloat(startPrice)
                          );
                          
                          setNewInstallment({
                            ...newInstallment,
                            itemId: e.target.value,
                            itemCode: selected.itemCode,
                            itemName: `${selected.brand} ${selected.model}`,
                            itemCategory: selected.category || 'Smartphone',
                            location: selected.location,
                            totalAmount: retailPrice.toString(),
                            initialPayment: startPrice,
                            installmentAmount: installmentAmount
                          });
                        }
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">Select Product</option>
                      {stocks
                        .filter(stock => (parseInt(stock.quantity) || 0) > 0)
                        .map((stock, index) => (
                          <option key={index} value={stock.id}>
                            {stock.brand} {stock.model} - {formatCurrency(parseFloat(stock.retailPrice) || 0)}
                          </option>
                        ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Total Amount (MK) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newInstallment.totalAmount}
                      onChange={(e) => {
                        const total = e.target.value;
                        const initial = calculateInitialPayment(parseFloat(total) || 0);
                        const installmentAmt = calculateInstallmentAmount(
                          parseFloat(total) || 0, 
                          parseInt(newInstallment.totalInstallments), 
                          parseFloat(initial)
                        );
                        
                        setNewInstallment({
                          ...newInstallment,
                          totalAmount: total,
                          initialPayment: initial,
                          installmentAmount: installmentAmt
                        });
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Initial Payment ({installmentSettings.initialPaymentPercentage}%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newInstallment.initialPayment}
                      onChange={(e) => setNewInstallment({...newInstallment, initialPayment: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Installment Period</label>
                    <select
                      value={newInstallment.totalInstallments}
                      onChange={(e) => {
                        const installments = e.target.value;
                        const installmentAmt = calculateInstallmentAmount(
                          parseFloat(newInstallment.totalAmount) || 0, 
                          parseInt(installments), 
                          parseFloat(newInstallment.initialPayment) || 0
                        );
                        
                        setNewInstallment({
                          ...newInstallment,
                          totalInstallments: installments,
                          installmentAmount: installmentAmt
                        });
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="6">6 Months</option>
                      <option value="12">12 Months</option>
                      <option value="18">18 Months</option>
                      <option value="24">24 Months</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Monthly Installment</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newInstallment.installmentAmount}
                      readOnly
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Start Date</label>
                    <input
                      type="date"
                      value={newInstallment.startDate}
                      onChange={(e) => {
                        const startDate = e.target.value;
                        const nextDue = calculateNextDueDate(startDate, 1);
                        setNewInstallment({
                          ...newInstallment,
                          startDate: startDate,
                          nextDueDate: nextDue
                        });
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  {installmentSettings.requireGuarantor && (
                    <>
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Guarantor Name *</label>
                        <input
                          type="text"
                          value={newInstallment.guarantorName}
                          onChange={(e) => setNewInstallment({...newInstallment, guarantorName: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                          placeholder="Guarantor Full Name"
                          required={installmentSettings.requireGuarantor}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Guarantor Phone *</label>
                        <input
                          type="tel"
                          value={newInstallment.guarantorPhone}
                          onChange={(e) => setNewInstallment({...newInstallment, guarantorPhone: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                          placeholder="0999 999 999"
                          required={installmentSettings.requireGuarantor}
                        />
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex space-x-4">
                  <button
                    onClick={handleCreateInstallment}
                    className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <FaHandHoldingUsd />
                    <span>Create Installment Plan</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setNewInstallment({
                        customerName: '',
                        customerPhone: '',
                        customerEmail: '',
                        customerAddress: '',
                        nationalId: '',
                        itemId: '',
                        itemCode: '',
                        itemName: '',
                        itemCategory: 'Smartphone',
                        location: '',
                        totalAmount: '',
                        initialPayment: '',
                        totalInstallments: '12',
                        installmentAmount: '',
                        startDate: new Date().toISOString().split('T')[0],
                        nextDueDate: '',
                        guarantorName: '',
                        guarantorPhone: '',
                        guarantorAddress: '',
                        notes: ''
                      });
                    }}
                    className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg transition-colors"
                  >
                    Clear Form
                  </button>
                </div>
              </div>

              {/* Installments List */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">
                    <FaListAlt className="inline mr-2" />
                    Installments ({filteredInstallments.length})
                  </h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                      className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                    >
                      {viewMode === 'grid' ? 'List View' : 'Grid View'}
                    </button>
                    <button
                      onClick={generateInstallmentReportPDF}
                      className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFilePdf />
                      <span>Generate Report</span>
                    </button>
                  </div>
                </div>
                
                {viewMode === 'grid' ? (
                  // Grid View
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredInstallments.map((installment, index) => {
                      const paymentProgress = calculatePercentage(installment.totalPaid || 0, installment.totalAmount);
                      const dueDate = installment.nextDueDate?.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
                      const isOverdue = dueDate && dueDate < new Date();
                      
                      return (
                        <div key={index} className={`rounded-xl p-5 border ${
                          installment.status === 'active' ? 'border-blue-500/30 bg-blue-500/5' :
                          installment.status === 'completed' ? 'border-green-500/30 bg-green-500/5' :
                          installment.status === 'defaulted' ? 'border-red-500/30 bg-red-500/5' :
                          'border-gray-600 bg-gray-700/30'
                        }`}>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="font-semibold text-lg">{installment.customerName}</h3>
                              <p className="text-gray-400 text-sm">{installment.customerPhone}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              installment.status === 'active' ? 'bg-blue-500/20 text-blue-300' :
                              installment.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                              installment.status === 'defaulted' ? 'bg-red-500/20 text-red-300' :
                              'bg-gray-500/20 text-gray-300'
                            }`}>
                              {installment.status}{isOverdue ? ' (Overdue)' : ''}
                            </span>
                          </div>
                          
                          <div className="mb-4">
                            <p className="text-gray-300 font-medium">{installment.itemName}</p>
                            <p className="text-gray-400 text-sm">{installment.installmentNumber}</p>
                          </div>
                          
                          <div className="space-y-2 mb-4">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Total:</span>
                              <span className="font-semibold">{formatCurrency(installment.totalAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Paid:</span>
                              <span className="text-green-400">{formatCurrency(installment.totalPaid || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Pending:</span>
                              <span className="text-orange-400">{formatCurrency(installment.totalPending || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Progress:</span>
                              <span className="font-semibold">{paymentProgress}%</span>
                            </div>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="w-full bg-gray-700 rounded-full h-2 mb-4">
                            <div 
                              className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-green-500"
                              style={{ width: `${Math.min(paymentProgress, 100)}%` }}
                            ></div>
                          </div>
                          
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setPaymentForm({
                                  ...paymentForm,
                                  installmentId: installment.id,
                                  installmentNumber: installment.installmentNumber,
                                  customerName: installment.customerName,
                                  customerPhone: installment.customerPhone,
                                  amount: installment.installmentAmount?.toString() || ''
                                });
                                setActiveTab('payments');
                              }}
                              className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 rounded-lg text-sm transition-colors"
                            >
                              Record Payment
                            </button>
                            <button
                              onClick={() => generatePaymentHistoryPDF(installment.id)}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg text-sm transition-colors"
                            >
                              History
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // List View
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-3 px-2">Inst. No.</th>
                          <th className="text-left py-3 px-2">Customer</th>
                          <th className="text-left py-3 px-2">Item</th>
                          <th className="text-left py-3 px-2">Total</th>
                          <th className="text-left py-3 px-2">Paid</th>
                          <th className="text-left py-3 px-2">Pending</th>
                          <th className="text-left py-3 px-2">Progress</th>
                          <th className="text-left py-3 px-2">Status</th>
                          <th className="text-left py-3 px-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInstallments.map((installment, index) => {
                          const paymentProgress = calculatePercentage(installment.totalPaid || 0, installment.totalAmount);
                          const dueDate = installment.nextDueDate?.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
                          const isOverdue = dueDate && dueDate < new Date();
                          
                          return (
                            <tr key={index} className={`border-b border-gray-700/50 ${
                              isOverdue ? 'bg-orange-900/20' : ''
                            }`}>
                              <td className="py-3 px-2">
                                <div className="font-mono text-sm">{installment.installmentNumber}</div>
                              </td>
                              <td className="py-3 px-2">
                                <div className="font-medium">{installment.customerName}</div>
                                <div className="text-gray-400 text-xs">{installment.customerPhone}</div>
                              </td>
                              <td className="py-3 px-2">
                                <div>{installment.itemName}</div>
                                <div className="text-gray-400 text-xs">{installment.location}</div>
                              </td>
                              <td className="py-3 px-2">{formatCurrency(installment.totalAmount)}</td>
                              <td className="py-3 px-2 text-green-400">{formatCurrency(installment.totalPaid || 0)}</td>
                              <td className="py-3 px-2 text-orange-400">{formatCurrency(installment.totalPending || 0)}</td>
                              <td className="py-3 px-2">
                                <div className="w-24 bg-gray-700 rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      paymentProgress >= 80 ? 'bg-green-500' :
                                      paymentProgress >= 50 ? 'bg-yellow-500' :
                                      paymentProgress >= 25 ? 'bg-orange-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${paymentProgress}%` }}
                                  ></div>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">{paymentProgress}%</div>
                              </td>
                              <td className="py-3 px-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  installment.status === 'completed' ? 'bg-green-900/50 text-green-300' :
                                  isOverdue ? 'bg-orange-900/50 text-orange-300' :
                                  installment.status === 'defaulted' ? 'bg-red-900/50 text-red-300' :
                                  'bg-blue-900/50 text-blue-300'
                                }`}>
                                  {installment.status} {isOverdue ? '(Overdue)' : ''}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setPaymentForm({
                                        ...paymentForm,
                                        installmentId: installment.id,
                                        installmentNumber: installment.installmentNumber,
                                        customerName: installment.customerName,
                                        customerPhone: installment.customerPhone,
                                        amount: installment.installmentAmount?.toString() || ''
                                      });
                                      setActiveTab('payments');
                                    }}
                                    className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm transition-colors"
                                  >
                                    Payment
                                  </button>
                                  {installment.status === 'active' && (
                                    <button
                                      onClick={() => handleMarkAsDefaulted(installment.id)}
                                      className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors"
                                    >
                                      Default
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stock Management Tab */}
          {activeTab === 'stocks' && (
            <div className="space-y-6">
              {/* Stock Filters */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Search Stocks</label>
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-3 py-2"
                        placeholder="Search by brand, model, item code..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Category</label>
                    <select
                      value={reportFilters.category}
                      onChange={(e) => setReportFilters({...reportFilters, category: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="all">All Categories</option>
                      {CATEGORIES.map((category, index) => (
                        <option key={index} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Actions</label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setStockSearch('');
                          setReportFilters({...reportFilters, category: 'all'});
                        }}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg transition-colors"
                      >
                        Clear Filters
                      </button>
                      <button
                        onClick={generateStockBalanceReportPDF}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                      >
                        <FaFilePdf />
                        <span>Export PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Form */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">
                  {editingStock ? '✏️ Edit Stock' : '➕ Add New Stock'}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Brand *</label>
                    <input
                      type="text"
                      value={stockForm.brand}
                      onChange={(e) => setStockForm({...stockForm, brand: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="Samsung"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Model *</label>
                    <input
                      type="text"
                      value={stockForm.model}
                      onChange={(e) => setStockForm({...stockForm, model: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="Galaxy S23"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Item Code *</label>
                    <input
                      type="text"
                      value={stockForm.itemCode}
                      onChange={(e) => setStockForm({...stockForm, itemCode: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="SAM-GS23-BLK-256"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Location *</label>
                    <select
                      value={stockForm.location}
                      onChange={(e) => setStockForm({...stockForm, location: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">Select Location</option>
                      {LOCATIONS.map((location, index) => (
                        <option key={index} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Quantity *</label>
                    <input
                      type="number"
                      min="0"
                      value={stockForm.quantity}
                      onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="10"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Cost Price (MK) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={stockForm.costPrice}
                      onChange={(e) => setStockForm({...stockForm, costPrice: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="500000"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Retail Price (MK) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={stockForm.retailPrice}
                      onChange={(e) => setStockForm({...stockForm, retailPrice: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="750000"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Min Stock Level</label>
                    <input
                      type="number"
                      min="1"
                      value={stockForm.minStockLevel}
                      onChange={(e) => setStockForm({...stockForm, minStockLevel: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="5"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-4">
                  {editingStock ? (
                    <>
                      <button
                        onClick={handleUpdateStock}
                        className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <FaSave />
                        <span>Update Stock</span>
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleAddStock}
                      className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <span>+</span>
                      <span>Add Stock</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stocks List */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">
                    <FaBoxes className="inline mr-2" />
                    Stock Inventory ({filteredStocks.length} items)
                  </h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSort('quantity')}
                      className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      {sortConfig.key === 'quantity' && sortConfig.direction === 'asc' ? (
                        <FaSortAmountUp />
                      ) : (
                        <FaSortAmountDown />
                      )}
                      <span>Sort</span>
                    </button>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-2">Item Code</th>
                        <th className="text-left py-3 px-2">Product</th>
                        <th className="text-left py-3 px-2">Location</th>
                        <th className="text-left py-3 px-2">Quantity</th>
                        <th className="text-left py-3 px-2">Cost</th>
                        <th className="text-left py-3 px-2">Retail</th>
                        <th className="text-left py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStocks.map((stock, index) => {
                        const isLowStock = (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) && (parseInt(stock.quantity) || 0) > 0;
                        const isOutOfStock = (parseInt(stock.quantity) || 0) <= 0;
                        
                        return (
                          <tr key={index} className={`border-b border-gray-700/50 ${
                            isOutOfStock ? 'bg-red-900/20' :
                            isLowStock ? 'bg-orange-900/20' : ''
                          }`}>
                            <td className="py-3 px-2">
                              <div className="font-mono text-sm">{stock.itemCode}</div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="font-medium">{stock.brand} {stock.model}</div>
                              <div className="text-gray-400 text-xs">{stock.category}</div>
                            </td>
                            <td className="py-3 px-2">{stock.location}</td>
                            <td className="py-3 px-2">
                              <div className={`font-semibold ${
                                isOutOfStock ? 'text-red-400' :
                                isLowStock ? 'text-orange-400' : ''
                              }`}>
                                {stock.quantity || 0}
                              </div>
                              {isLowStock && !isOutOfStock && (
                                <div className="text-orange-400 text-xs">Low Stock</div>
                              )}
                              {isOutOfStock && (
                                <div className="text-red-400 text-xs">Out of Stock</div>
                              )}
                            </td>
                            <td className="py-3 px-2">{formatCurrency(parseFloat(stock.costPrice) || 0)}</td>
                            <td className="py-3 px-2">{formatCurrency(parseFloat(stock.retailPrice) || 0)}</td>
                            <td className="py-3 px-2">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleEditStock(stock)}
                                  className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                >
                                  <FaEdit size={12} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteStock(stock.id)}
                                  className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                >
                                  <FaTrash size={12} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Report Type Selection */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">
                  <FaChartBar className="inline mr-2" />
                  Generate Reports
                </h2>
                
                <div className="flex space-x-4 mb-6">
                  <button
                    onClick={() => setReportType('installments')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                      reportType === 'installments' 
                        ? 'bg-blue-600' 
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <FaHandHoldingUsd />
                    <span>Installment Report</span>
                  </button>
                  
                  <button
                    onClick={() => setReportType('payments')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                      reportType === 'payments' 
                        ? 'bg-blue-600' 
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <FaMoneyBillWave />
                    <span>Payment History</span>
                  </button>
                  
                  <button
                    onClick={() => setReportType('stocks')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                      reportType === 'stocks' 
                        ? 'bg-blue-600' 
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <FaWarehouse />
                    <span>Stock Balance Report</span>
                  </button>
                </div>

                {/* Report Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {reportType === 'installments' && (
                    <>
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Start Date</label>
                        <input
                          type="date"
                          value={reportFilters.startDate}
                          onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">End Date</label>
                        <input
                          type="date"
                          value={reportFilters.endDate}
                          onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Status</label>
                        <select
                          value={reportFilters.status}
                          onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        >
                          <option value="all">All Statuses</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="defaulted">Defaulted</option>
                        </select>
                      </div>
                    </>
                  )}
                  
                  {reportType === 'payments' && (
                    <>
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Start Date</label>
                        <input
                          type="date"
                          value={reportFilters.startDate}
                          onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">End Date</label>
                        <input
                          type="date"
                          value={reportFilters.endDate}
                          onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Payment Type</label>
                        <select
                          value={reportFilters.status}
                          onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        >
                          <option value="all">All Types</option>
                          <option value="initial">Initial</option>
                          <option value="installment">Installment</option>
                          <option value="late">Late Payments</option>
                        </select>
                      </div>
                    </>
                  )}
                  
                  {reportType === 'stocks' && (
                    <>
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Location</label>
                        <select
                          value={reportFilters.location}
                          onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        >
                          <option value="all">All Locations</option>
                          {LOCATIONS.map((location, index) => (
                            <option key={index} value={location}>{location}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Category</label>
                        <select
                          value={reportFilters.category}
                          onChange={(e) => setReportFilters({...reportFilters, category: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        >
                          <option value="all">All Categories</option>
                          {CATEGORIES.map((category, index) => (
                            <option key={index} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Stock Status</label>
                        <select
                          value={reportFilters.status}
                          onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        >
                          <option value="all">All</option>
                          <option value="low">Low Stock Only</option>
                          <option value="out">Out of Stock</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {/* Generate Report Button */}
                <div>
                  {reportType === 'installments' ? (
                    <button
                      onClick={generateInstallmentReportPDF}
                      disabled={isGeneratingReport}
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                        isGeneratingReport 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-green-600 hover:bg-green-700'
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
                          <span>Generate Installment Report PDF</span>
                        </>
                      )}
                    </button>
                  ) : reportType === 'payments' ? (
                    <button
                      onClick={() => generatePaymentHistoryPDF()}
                      disabled={isGeneratingReport}
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                        isGeneratingReport 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-green-600 hover:bg-green-700'
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
                          <span>Generate Payment History PDF</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={generateStockBalanceReportPDF}
                      disabled={isGeneratingReport}
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                        isGeneratingReport 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-green-600 hover:bg-green-700'
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
                          <span>Generate Stock Balance Report PDF</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Report History */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-semibold mb-4">Report History</h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2">Report Type</th>
                        <th className="text-left py-2">Period</th>
                        <th className="text-left py-2">Generated By</th>
                        <th className="text-left py-2">File Name</th>
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Downloads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedReports.slice(0, 10).map((report, index) => (
                        <tr key={index} className="border-b border-gray-700/50">
                          <td className="py-2">
                            <span className="px-2 py-1 rounded-full text-xs bg-blue-900/50 text-blue-300">
                              {report.reportType}
                            </span>
                          </td>
                          <td className="py-2">{report.period}</td>
                          <td className="py-2">{report.generatedByName}</td>
                          <td className="py-2 font-mono text-sm">{report.fileName}</td>
                          <td className="py-2">
                            {report.createdAt?.toDate?.().toLocaleDateString() || 'Unknown'}
                          </td>
                          <td className="py-2 text-center">{report.downloadCount || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Payment Records Tab */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              {/* Payment Form */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">
                  <FaMoneyBillWave className="inline mr-2" />
                  Record Payment
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div className="md:col-span-2">
                    <label className="block text-gray-400 text-sm mb-2">Select Installment *</label>
                    <select
                      value={paymentForm.installmentId}
                      onChange={(e) => {
                        const selected = installments.find(i => i.id === e.target.value);
                        if (selected) {
                          setPaymentForm({
                            ...paymentForm,
                            installmentId: selected.id,
                            installmentNumber: selected.installmentNumber,
                            customerName: selected.customerName,
                            customerPhone: selected.customerPhone,
                            amount: selected.installmentAmount?.toString() || ''
                          });
                        }
                      }}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">Select Installment</option>
                      {installments
                        .filter(i => i.status === 'active')
                        .map((installment, index) => {
                          const dueDate = installment.nextDueDate?.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
                          const isOverdue = dueDate && dueDate < new Date();
                          
                          return (
                            <option key={index} value={installment.id}>
                              {installment.installmentNumber} - {installment.customerName} - 
                              Pending: {formatCurrency(installment.totalPending || 0)}
                              {isOverdue ? ' (OVERDUE)' : ''}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Payment Type</label>
                    <select
                      value={paymentForm.paymentType}
                      onChange={(e) => setPaymentForm({...paymentForm, paymentType: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="installment">Installment</option>
                      <option value="final">Final Payment</option>
                      <option value="penalty">Penalty/Late Fee</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Amount (MK) *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Payment Date</label>
                    <input
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm({...paymentForm, paymentDate: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Payment Method</label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={(e) => setPaymentForm({...paymentForm, paymentMethod: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Receipt Number</label>
                    <input
                      type="text"
                      value={paymentForm.receiptNumber}
                      onChange={(e) => setPaymentForm({...paymentForm, receiptNumber: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      placeholder="Auto-generated if empty"
                    />
                  </div>
                </div>
                
                <button
                  onClick={handleRecordPayment}
                  className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <FaMoneyBillWave />
                  <span>Record Payment</span>
                </button>
              </div>

              {/* Recent Payments */}
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Recent Payments</h2>
                  <button
                    onClick={() => generatePaymentHistoryPDF()}
                    className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <FaFilePdf />
                    <span>Generate Report</span>
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-2">Receipt No.</th>
                        <th className="text-left py-2">Customer</th>
                        <th className="text-left py-2">Installment No.</th>
                        <th className="text-left py-2">Amount</th>
                        <th className="text-left py-2">Date</th>
                        <th className="text-left py-2">Method</th>
                        <th className="text-left py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {installmentPayments.slice(0, 20).map((payment, index) => (
                        <tr key={index} className={`border-b border-gray-700/50 ${payment.isLate ? 'bg-orange-900/20' : ''}`}>
                          <td className="py-2 font-mono text-sm">{payment.receiptNumber}</td>
                          <td className="py-2">{payment.customerName}</td>
                          <td className="py-2 font-mono text-sm">{payment.installmentNumber}</td>
                          <td className="py-2">
                            <div className="text-green-400 font-semibold">{formatCurrency(payment.amount)}</div>
                            {payment.lateFee > 0 && (
                              <div className="text-red-400 text-xs">Late fee: {formatCurrency(payment.lateFee)}</div>
                            )}
                          </td>
                          <td className="py-2">
                            {payment.paymentDate?.toDate?.().toLocaleDateString() || 'Today'}
                          </td>
                          <td className="py-2">
                            <span className="px-2 py-1 rounded-full text-xs bg-gray-700">
                              {payment.paymentMethod}
                            </span>
                          </td>
                          <td className="py-2">
                            {payment.isLate ? (
                              <span className="px-2 py-1 rounded-full text-xs bg-orange-900/50 text-orange-300">
                                Late
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-full text-xs bg-green-900/50 text-green-300">
                                On Time
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-6">
                  <FaShieldAlt className="inline mr-2" />
                  Installment System Settings
                </h2>
                
                <div className="max-w-3xl space-y-6">
                  {/* Payment Settings */}
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Payment Settings</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">
                          Initial Payment Percentage
                          <span className="text-gray-500 text-xs ml-1">(Default: 60%)</span>
                        </label>
                        <div className="flex items-center space-x-4">
                          <input
                            type="range"
                            min="10"
                            max="90"
                            step="5"
                            value={installmentSettings.initialPaymentPercentage}
                            onChange={(e) => setInstallmentSettings({
                              ...installmentSettings,
                              initialPaymentPercentage: parseInt(e.target.value)
                            })}
                            className="flex-1"
                          />
                          <span className="text-blue-400 font-semibold w-16">
                            {installmentSettings.initialPaymentPercentage}%
                          </span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">
                          Late Payment Fee (% per month)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.5"
                          value={installmentSettings.latePaymentFee}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            latePaymentFee: parseFloat(e.target.value)
                          })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">
                          Grace Period (Days)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          value={installmentSettings.gracePeriodDays}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            gracePeriodDays: parseInt(e.target.value)
                          })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Installment Period Settings */}
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Installment Period Settings</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Minimum Installment Period (Months)</label>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          value={installmentSettings.minInstallmentPeriod}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            minInstallmentPeriod: parseInt(e.target.value)
                          })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-2">Maximum Installment Period (Months)</label>
                        <input
                          type="number"
                          min="6"
                          max="36"
                          value={installmentSettings.maxInstallmentPeriod}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            maxInstallmentPeriod: parseInt(e.target.value)
                          })}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Requirements */}
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Customer Requirements</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-gray-300">Require Guarantor</label>
                          <p className="text-gray-500 text-sm">Customer must provide a guarantor</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={installmentSettings.requireGuarantor}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            requireGuarantor: e.target.checked
                          })}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-gray-300">Require National ID</label>
                          <p className="text-gray-500 text-sm">Customer must provide National ID</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={installmentSettings.requireNationalId}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            requireNationalId: e.target.checked
                          })}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-gray-300">Auto-generate Receipt Numbers</label>
                          <p className="text-gray-500 text-sm">Automatically generate unique receipt numbers</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={installmentSettings.autoGenerateReceipt}
                          onChange={(e) => setInstallmentSettings({
                            ...installmentSettings,
                            autoGenerateReceipt: e.target.checked
                          })}
                          className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Allowed Categories */}
                  <div className="bg-gray-800/30 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Allowed Categories for Installments</h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {CATEGORIES.map((category, index) => (
                        <label key={index} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={installmentSettings.allowedCategories.includes(category)}
                            onChange={(e) => {
                              const newCategories = e.target.checked
                                ? [...installmentSettings.allowedCategories, category]
                                : installmentSettings.allowedCategories.filter(c => c !== category);
                              setInstallmentSettings({
                                ...installmentSettings,
                                allowedCategories: newCategories
                              });
                            }}
                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                          />
                          <span className="text-gray-300 text-sm">{category}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={saveInstallmentSettings}
                    className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors font-semibold flex items-center justify-center space-x-2"
                  >
                    <FaSave />
                    <span>Save Settings</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full fixed bottom-0 left-0 z-10 bg-gradient-to-br from-gray-900 to-gray-800 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-200 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK | INSTALLMENT SYSTEM v2.0
        </div>
      </footer>
    </div>
  );
}