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

// React Icons - replacing all FontAwesome icons
import { 
  FiEdit, FiSave, FiTrash, FiFileText, FiFile, 
  FiDollarSign, FiPackage, FiBarChart, FiEye,
  FiPrinter, FiDownload, FiUpload, FiRefreshCw, FiAlertTriangle,
  FiCheckCircle, FiXCircle, FiArrowUp, FiArrowDown,
  FiPercent, FiCalendar, FiClock, FiCalculator,
  FiCreditCard, FiTrendingUp, FiActivity, 
  FiUsers, FiUserCheck, FiUserX, FiPieChart,
  FiBox, FiShoppingCart, FiStore, FiReceipt, FiList,
  FiHome, FiMenu, FiX, FiChevronLeft, FiChevronRight,
  FiSearch, FiFilter, FiUser, FiPhone, FiMail, FiMapPin,
  FiShield, FiSettings, FiBell, FiCheck, FiPlus,
  FiGrid, FiLayers, FiDatabase, FiExternalLink,
  FiCalendar as FiCalendarAlt
} from 'react-icons/fi';

// Material Design Icons for additional variety
import {
  MdDashboard,
  MdPayments,
  MdInventory,
  MdPointOfSale,
  MdAssessment,
  MdHistory,
  MdLocationOn,
  MdCategory,
  MdAttachMoney,
  MdWarehouse,
  MdShoppingCart,
  MdReceiptLong,
  MdPeople,
  MdSecurity,
  MdViewList,
  MdGridOn,
  MdSort,
  MdAdd,
  MdRemove,
  MdWarning,
  MdError,
  MdInfo,
  MdTune,
  MdDateRange,
  MdMoney,
  MdInventory2,
  MdTrendingUp,
  MdStore,
  MdAccountBalance,
  MdDescription,
  MdPhone,
  MdEmail,
  MdPlace
} from 'react-icons/md';

// Import shadcn/ui components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

// Navigation items
const NAV_ITEMS = [
  { id: 'dashboard', name: 'Dashboard', icon: MdDashboard, color: 'text-blue-500' },
  { id: 'installments', name: 'Installments', icon: MdPayments, color: 'text-green-500' },
  { id: 'stocks', name: 'Stock Management', icon: MdInventory, color: 'text-orange-500' },
  { id: 'sales', name: 'Sales Management', icon: MdPointOfSale, color: 'text-purple-500' },
  { id: 'payments', name: 'Payment Records', icon: MdPayments, color: 'text-emerald-500' },
  { id: 'reports', name: 'Reports', icon: MdAssessment, color: 'text-indigo-500' },
  { id: 'settings', name: 'Settings', icon: FiSettings, color: 'text-gray-500' },
];

const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'TV', 'Audio', 'Other'];

export default function InstallmentSuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    monthlyRevenue: 0,
    totalSales: 0,
    todaySales: 0,
    monthlySales: 0,
    completedInstallments: 0
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
    maxAmount: ''
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
const [viewMode, setViewMode] = useState('grid');
const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
const [searchQuery, setSearchQuery] = useState('');

  // Form Validation State
  const [formErrors, setFormErrors] = useState({
    stock: {},
    installment: {},
    payment: {}
  });

  // ==================== ENHANCED VALIDATION FUNCTIONS ====================

  const validateStockForm = () => {
    const errors = {};
    let isValid = true;

    if (!stockForm.brand?.trim()) {
      errors.brand = 'Brand is required';
      isValid = false;
    }
    if (!stockForm.model?.trim()) {
      errors.model = 'Model is required';
      isValid = false;
    }
    if (!stockForm.itemCode?.trim()) {
      errors.itemCode = 'Item Code is required';
      isValid = false;
    }
    if (!stockForm.location?.trim()) {
      errors.location = 'Location is required';
      isValid = false;
    }
    if (!stockForm.quantity?.toString().trim() || parseInt(stockForm.quantity) < 0) {
      errors.quantity = 'Valid quantity is required';
      isValid = false;
    }
    if (!stockForm.costPrice?.toString().trim() || parseFloat(stockForm.costPrice) < 0) {
      errors.costPrice = 'Valid cost price is required';
      isValid = false;
    }
    if (!stockForm.retailPrice?.toString().trim() || parseFloat(stockForm.retailPrice) < 0) {
      errors.retailPrice = 'Valid retail price is required';
      isValid = false;
    }

    setFormErrors(prev => ({ ...prev, stock: errors }));
    return isValid;
  };

  const validateInstallmentForm = () => {
    const errors = {};
    let isValid = true;

    if (!newInstallment.customerName?.trim()) {
      errors.customerName = 'Customer Name is required';
      isValid = false;
    }
    if (!newInstallment.customerPhone?.trim()) {
      errors.customerPhone = 'Customer Phone is required';
      isValid = false;
    }
    if (installmentSettings.requireNationalId && !newInstallment.nationalId?.trim()) {
      errors.nationalId = 'National ID is required';
      isValid = false;
    }
    if (!newInstallment.itemId) {
      errors.itemId = 'Please select an item';
      isValid = false;
    }
    if (!newInstallment.totalAmount || parseFloat(newInstallment.totalAmount) <= 0) {
      errors.totalAmount = 'Valid total amount is required';
      isValid = false;
    }
    if (installmentSettings.requireGuarantor) {
      if (!newInstallment.guarantorName?.trim()) {
        errors.guarantorName = 'Guarantor Name is required';
        isValid = false;
      }
      if (!newInstallment.guarantorPhone?.trim()) {
        errors.guarantorPhone = 'Guarantor Phone is required';
        isValid = false;
      }
    }

    setFormErrors(prev => ({ ...prev, installment: errors }));
    return isValid;
  };

  const validatePaymentForm = () => {
    const errors = {};
    let isValid = true;

    if (!paymentForm.installmentId) {
      errors.installmentId = 'Please select an installment';
      isValid = false;
    }
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      errors.amount = 'Valid payment amount is required';
      isValid = false;
    }
    if (!paymentForm.paymentDate) {
      errors.paymentDate = 'Payment date is required';
      isValid = false;
    }

    setFormErrors(prev => ({ ...prev, payment: errors }));
    return isValid;
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'MK 0';
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const calculatePercentage = (part, total) => {
    if (!total || total === 0) return 0;
    return Math.round((part / total) * 100);
  };

  const generateInstallmentNumber = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `INST-${timestamp.toString().slice(-6)}-${random.toString().padStart(3, '0')}`;
  };

  const calculateInitialPayment = (totalAmount) => {
    return (totalAmount * (installmentSettings.initialPaymentPercentage / 100)).toFixed(2);
  };

  const calculateInstallmentAmount = (totalAmount, totalInstallments, initialPayment = 0) => {
    const remaining = totalAmount - (initialPayment || 0);
    return (remaining / totalInstallments).toFixed(2);
  };

  const calculateNextDueDate = (startDate, monthsToAdd) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + monthsToAdd);
    return date.toISOString().split('T')[0];
  };

  const checkIfLate = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today - due;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > installmentSettings.gracePeriodDays;
  };

  const calculateLateFee = (amount, daysLate) => {
    if (daysLate <= installmentSettings.gracePeriodDays) return 0;
    return (amount * (installmentSettings.latePaymentFee / 100)).toFixed(2);
  };

  const initializeDatabaseCollections = async (user) => {
    try {
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

  const fetchAllData = useCallback(async () => {
    try {
      // Fetch stocks
      const stocksQuery = query(collection(db, 'stocks'), where('isActive', '==', true));
      const stocksSnapshot = await getDocs(stocksQuery);
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);

      // Fetch sales
      const salesQuery = query(collection(db, 'sales'), orderBy('soldAt', 'desc'));
      const salesSnapshot = await getDocs(salesQuery);
      const salesData = salesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);

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
      calculateDashboardStats(stocksData, installmentsData, paymentsData, salesData);

    } catch (error) {
      setError('Failed to fetch data: ' + error.message);
    }
  }, []);

  const calculateDashboardStats = (stocksData, installmentsData, paymentsData, salesData) => {
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

      // Sales stats
      const totalSales = salesData.length;
      
      // Today's stats
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

      const todaySales = salesData.filter(sale => {
        const saleDate = sale.soldAt.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate >= today && saleDate < tomorrow;
      }).length;

      // Monthly revenue (current month)
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyRevenue = paymentsData.filter(payment => {
        const paymentDate = payment.paymentDate.toDate ? payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
      }).reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);

      const monthlySales = salesData.filter(sale => {
        const saleDate = sale.soldAt.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
      }).length;

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
        completedInstallments,
        totalSales,
        todaySales,
        monthlySales
      });
    } catch (error) {
      console.error('Error calculating dashboard stats:', error);
    }
  };

  // Filter effects
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

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

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

  useEffect(() => {
    let filtered = installments;
    
    if (selectedStatusFilter !== 'all') {
      filtered = filtered.filter(installment => installment.status === selectedStatusFilter);
    }
    
    if (reportFilters.location !== 'all') {
      filtered = filtered.filter(installment => installment.location === reportFilters.location);
    }

    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      filtered = filtered.filter(installment =>
        installment.customerName?.toLowerCase().includes(queryLower) ||
        installment.customerPhone?.includes(searchQuery) ||
        installment.installmentNumber?.toLowerCase().includes(queryLower) ||
        installment.itemName?.toLowerCase().includes(queryLower)
      );
    }

    setFilteredInstallments(filtered);
  }, [installments, selectedStatusFilter, reportFilters.location, searchQuery]);

  useEffect(() => {
    let filtered = sales;
    
    if (salesFilter.location !== 'all') {
      filtered = filtered.filter(sale => sale.location === salesFilter.location);
    }
    
    if (salesFilter.paymentMethod !== 'all') {
      filtered = filtered.filter(sale => sale.paymentMethod === salesFilter.paymentMethod);
    }
    
    if (salesFilter.startDate) {
      const startDate = new Date(salesFilter.startDate);
      filtered = filtered.filter(sale => {
        const saleDate = sale.soldAt.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate >= startDate;
      });
    }
    
    if (salesFilter.endDate) {
      const endDate = new Date(salesFilter.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(sale => {
        const saleDate = sale.soldAt.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate <= endDate;
      });
    }
    
    if (salesFilter.minAmount) {
      const minAmount = parseFloat(salesFilter.minAmount);
      filtered = filtered.filter(sale => parseFloat(sale.finalSalePrice) >= minAmount);
    }
    
    if (salesFilter.maxAmount) {
      const maxAmount = parseFloat(salesFilter.maxAmount);
      filtered = filtered.filter(sale => parseFloat(sale.finalSalePrice) <= maxAmount);
    }
    
    if (salesSearch) {
      const searchLower = salesSearch.toLowerCase();
      filtered = filtered.filter(sale =>
        sale.customerName?.toLowerCase().includes(searchLower) ||
        sale.customerPhone?.includes(salesSearch) ||
        sale.receiptNumber?.toLowerCase().includes(searchLower) ||
        sale.itemCode?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredSales(filtered);
  }, [sales, salesFilter, salesSearch]);

  // ==================== ENHANCED STOCK CRUD OPERATIONS ====================

  const handleAddStock = async () => {
    if (!validateStockForm()) {
      setError('Please fix stock form errors before submitting');
      return;
    }

    try {
      const stockData = {
        ...stockForm,
        costPrice: parseFloat(stockForm.costPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.retailPrice) * 0.8) || 0,
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
      
      setFormErrors(prev => ({ ...prev, stock: {} }));
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
      quantity: stock.quantity?.toString() || '',
      costPrice: stock.costPrice?.toString() || '',
      retailPrice: stock.retailPrice?.toString() || '',
      wholesalePrice: stock.wholesalePrice?.toString() || '',
      minStockLevel: stock.minStockLevel?.toString() || '5',
      reorderQuantity: stock.reorderQuantity?.toString() || '10',
      location: stock.location || '',
      supplier: stock.supplier || '',
      warrantyPeriod: stock.warrantyPeriod?.toString() || '12',
      description: stock.description || ''
    });
    setFormErrors(prev => ({ ...prev, stock: {} }));
  };

  const handleUpdateStock = async () => {
    if (!validateStockForm()) {
      setError('Please fix stock form errors before updating');
      return;
    }

    if (!editingStock) return;

    try {
      const stockData = {
        ...stockForm,
        costPrice: parseFloat(stockForm.costPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.retailPrice) * 0.8) || 0,
        quantity: parseInt(stockForm.quantity) || 0,
        minStockLevel: parseInt(stockForm.minStockLevel) || 5,
        reorderQuantity: parseInt(stockForm.reorderQuantity) || 10,
        warrantyPeriod: parseInt(stockForm.warrantyPeriod) || 12,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName || user.email
      };

      await updateDoc(doc(db, 'stocks', editingStock), stockData);
      
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
      setFormErrors(prev => ({ ...prev, stock: {} }));
      setSuccess('Stock updated successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to update stock: ' + error.message);
    }
  };

  const handleDeleteStock = async (stockId) => {
    if (!window.confirm('Are you sure you want to delete this stock item?')) return;

    try {
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
    setFormErrors(prev => ({ ...prev, stock: {} }));
  };

  // ==================== INSTALLMENT AND PAYMENT FUNCTIONS ====================

  const handleCreateInstallment = async () => {
    if (!validateInstallmentForm()) {
      setError('Please fix installment form errors before submitting');
      return;
    }

    try {
      const selectedStock = stocks.find(s => s.id === newInstallment.itemId);
      if (!selectedStock) {
        setError('Selected item not found');
        return;
      }

      if ((parseInt(selectedStock.quantity) || 0) <= 0) {
        setError('Selected item is out of stock');
        return;
      }

      const totalAmount = parseFloat(newInstallment.totalAmount);
      const initialPayment = parseFloat(newInstallment.initialPayment) || parseFloat(calculateInitialPayment(totalAmount));
      const totalInstallments = parseInt(newInstallment.totalInstallments);
      const installmentAmount = parseFloat(calculateInstallmentAmount(totalAmount, totalInstallments, initialPayment));
      const nextDueDate = calculateNextDueDate(newInstallment.startDate, 1);

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

      const installmentRef = await addDoc(collection(db, 'installments'), installmentData);

      await updateDoc(doc(db, 'stocks', selectedStock.id), {
        quantity: parseInt(selectedStock.quantity) - 1,
        updatedAt: serverTimestamp()
      });

      const initialPaymentData = {
        installmentId: installmentRef.id,
        installmentNumber: installmentNumber,
        customerName: installmentData.customerName,
        customerPhone: installmentData.customerPhone,
        paymentNumber: 0,
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

      setFormErrors(prev => ({ ...prev, installment: {} }));
      setSuccess(`Installment plan created successfully! Installment Number: ${installmentNumber}`);
      fetchAllData();
    } catch (error) {
      setError('Failed to create installment: ' + error.message);
    }
  };

  const handleRecordPayment = async () => {
    if (!validatePaymentForm()) {
      setError('Please fix payment form errors before submitting');
      return;
    }

    try {
      const installment = installments.find(i => i.id === paymentForm.installmentId);
      if (!installment) {
        setError('Installment not found');
        return;
      }

      const paymentAmount = parseFloat(paymentForm.amount);
      const paymentDate = new Date(paymentForm.paymentDate);
      
      const dueDate = installment.nextDueDate.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
      const daysLate = Math.ceil((paymentDate - dueDate) / (1000 * 60 * 60 * 24));
      const isLate = daysLate > installmentSettings.gracePeriodDays;
      const lateFee = isLate ? calculateLateFee(paymentAmount, daysLate) : 0;
      const totalPayment = paymentAmount + parseFloat(lateFee);

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

      const newTotalPaid = (installment.totalPaid || 0) + totalPayment;
      const newTotalPending = Math.max(0, installment.totalAmount - newTotalPaid);
      const newPaidInstallments = installment.paidInstallments + (paymentForm.paymentType === 'installment' ? 1 : 0);
      const newRemainingInstallments = Math.max(0, installment.totalInstallments - newPaidInstallments);
      
      let newStatus = installment.status;
      let nextDueDate = installment.nextDueDate;
      
      if (newTotalPaid >= installment.totalAmount) {
        newStatus = 'completed';
      } else if (paymentForm.paymentType === 'installment') {
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

      setFormErrors(prev => ({ ...prev, payment: {} }));
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

  // ==================== ENHANCED REPORT FUNCTIONS WITH LOCATION SORTING ====================

  const generateInstallmentReportPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date();

      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 51, 102);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Installment Processing Report', pageWidth / 2, 30, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`, 20, 52);
      doc.text(`Location: ${reportFilters.location === 'all' ? 'All Locations' : reportFilters.location}`, 20, 59);
      doc.text(`Status: ${reportFilters.status === 'all' ? 'All Statuses' : reportFilters.status}`, 20, 66);

      // Sort installments by location
      const sortedInstallments = [...filteredInstallments].sort((a, b) => {
        const locationA = a.location || '';
        const locationB = b.location || '';
        return locationA.localeCompare(locationB);
      });

      const totalActive = sortedInstallments.filter(i => i.status === 'active').length;
      const totalCompleted = sortedInstallments.filter(i => i.status === 'completed').length;
      const totalDefaulted = sortedInstallments.filter(i => i.status === 'defaulted').length;
      const totalOverdue = sortedInstallments.filter(i => {
        if (i.status === 'active' && i.nextDueDate) {
          const dueDate = i.nextDueDate.toDate ? i.nextDueDate.toDate() : new Date(i.nextDueDate);
          return dueDate < today;
        }
        return false;
      }).length;

      const totalInstallmentValue = sortedInstallments.reduce((sum, i) => sum + (parseFloat(i.totalAmount) || 0), 0);
      const totalPaid = sortedInstallments.reduce((sum, i) => sum + (parseFloat(i.totalPaid) || 0), 0);
      const totalPending = sortedInstallments.reduce((sum, i) => sum + (parseFloat(i.totalPending) || 0), 0);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY STATISTICS', 20, 80);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      doc.text(`Total Installments: ${sortedInstallments.length}`, 20, 90);
      doc.text(`Active: ${totalActive}`, 20, 97);
      doc.text(`Completed: ${totalCompleted}`, 20, 104);
      
      doc.text(`Defaulted: ${totalDefaulted}`, 100, 90);
      doc.text(`Overdue: ${totalOverdue}`, 100, 97);
      
      doc.text(`Total Value: ${formatCurrency(totalInstallmentValue)}`, 180, 90);
      doc.text(`Total Paid: ${formatCurrency(totalPaid)}`, 180, 97);
      doc.text(`Total Pending: ${formatCurrency(totalPending)}`, 180, 104);

      const tableData = sortedInstallments.map(installment => {
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

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Report generated by: ${user?.fullName || user?.email}`, 20, finalY);
      doc.text(`Page 1 of 1`, pageWidth - 20, finalY, { align: 'right' });

      const filename = `KM_Installment_Report_${today.getTime()}.pdf`;
      doc.save(filename);

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

      let paymentsToReport = installmentPayments;
      let installmentInfo = null;
      
      if (installmentId) {
        paymentsToReport = paymentsToReport.filter(p => p.installmentId === installmentId);
        installmentInfo = installments.find(i => i.id === installmentId);
      }

      // Sort payments by location
      const sortedPayments = [...paymentsToReport].sort((a, b) => {
        const installmentA = installments.find(i => i.id === a.installmentId);
        const installmentB = installments.find(i => i.id === b.installmentId);
        const locationA = installmentA?.location || '';
        const locationB = installmentB?.location || '';
        return locationA.localeCompare(locationB);
      });

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

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, installmentInfo ? 61 : 40);
      doc.text(`Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`, 20, installmentInfo ? 68 : 47);

      const totalAmount = sortedPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const latePayments = sortedPayments.filter(p => p.isLate).length;
      const totalLateFees = sortedPayments.reduce((sum, p) => sum + (parseFloat(p.lateFee) || 0), 0);

      const startY = installmentInfo ? 78 : 57;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 20, startY);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Payments: ${sortedPayments.length}`, 20, startY + 8);
      doc.text(`Total Amount: ${formatCurrency(totalAmount)}`, 20, startY + 16);
      doc.text(`Late Payments: ${latePayments}`, 100, startY + 8);
      doc.text(`Total Late Fees: ${formatCurrency(totalLateFees)}`, 100, startY + 16);

      const tableData = sortedPayments.map(payment => {
        const installment = installments.find(i => i.id === payment.installmentId);
        const paymentDate = payment.paymentDate.toDate ? payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return [
          payment.receiptNumber,
          payment.customerName,
          installment?.location || 'N/A',
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
        head: [['Receipt No.', 'Customer', 'Location', 'Type', 'Amount', 'Date', 'Method', 'Late', 'Late Fee', 'Collected By']],
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

      const filename = installmentId 
        ? `KM_Payment_History_${installmentInfo?.installmentNumber}_${today.getTime()}.pdf`
        : `KM_Payment_History_${today.getTime()}.pdf`;
      
      doc.save(filename);

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

      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 51, 102);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Stock Balance Report', pageWidth / 2, 30, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Location: ${selectedLocation === 'all' ? 'All Locations' : selectedLocation}`, 20, 52);

      // Sort stocks by location
      const sortedStocks = [...filteredStocks].sort((a, b) => {
        const locationA = a.location || '';
        const locationB = b.location || '';
        return locationA.localeCompare(locationB);
      });

      const totalValue = sortedStocks.reduce((sum, stock) => 
        sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0);

      const lowStockItems = sortedStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) &&
        (parseInt(stock.quantity) || 0) > 0
      );

      const outOfStockItems = sortedStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) <= 0
      );

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 20, 65);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Items: ${sortedStocks.length}`, 20, 75);
      doc.text(`Total Quantity: ${sortedStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)}`, 100, 75);
      doc.text(`Total Value: ${formatCurrency(totalValue)}`, 180, 75);
      doc.text(`Low Stock Items: ${lowStockItems.length}`, 260, 75);

      const tableData = sortedStocks.map(stock => [
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

      const filename = `KM_Stock_Balance_Report_${today.getTime()}.pdf`;
      doc.save(filename);

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

  const generateSalesReportPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date();

      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 51, 102);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Sales Report', pageWidth / 2, 30, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Period: ${salesFilter.startDate || 'Start'} to ${salesFilter.endDate || 'End'}`, 20, 52);
      doc.text(`Location: ${salesFilter.location === 'all' ? 'All Locations' : salesFilter.location}`, 20, 59);
      doc.text(`Payment Method: ${salesFilter.paymentMethod === 'all' ? 'All Methods' : salesFilter.paymentMethod}`, 20, 66);

      // Sort sales by location
      const sortedSales = [...filteredSales].sort((a, b) => {
        const locationA = a.location || '';
        const locationB = b.location || '';
        return locationA.localeCompare(locationB);
      });

      const totalSales = sortedSales.length;
      const totalRevenue = sortedSales.reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0);
      const totalProfit = sortedSales.reduce((sum, sale) => sum + (parseFloat(sale.profit) || 0), 0);
      const installmentSales = sortedSales.filter(s => s.paymentMethod === 'installment').length;
      const cashSales = sortedSales.filter(s => s.paymentMethod === 'cash').length;
      const mobileSales = sortedSales.filter(s => s.paymentMethod === 'mobile_money').length;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY STATISTICS', 20, 80);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      doc.text(`Total Sales: ${totalSales}`, 20, 90);
      doc.text(`Total Revenue: ${formatCurrency(totalRevenue)}`, 20, 97);
      doc.text(`Total Profit: ${formatCurrency(totalProfit)}`, 20, 104);
      
      doc.text(`Installment Sales: ${installmentSales}`, 100, 90);
      doc.text(`Cash Sales: ${cashSales}`, 100, 97);
      doc.text(`Mobile Money Sales: ${mobileSales}`, 100, 104);

      const tableData = sortedSales.map(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return [
          sale.receiptNumber,
          sale.customerName,
          sale.customerPhone,
          `${sale.brand} ${sale.model}`,
          sale.location,
          sale.paymentMethod,
          sale.quantity || 1,
          formatCurrency(sale.finalSalePrice),
          formatCurrency(sale.profit),
          saleDate.toLocaleDateString('en-MW')
        ];
      });

      autoTable(doc, {
        startY: 115,
        head: [['Receipt', 'Customer', 'Phone', 'Item', 'Location', 'Method', 'Qty', 'Amount', 'Profit', 'Date']],
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

      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Report generated by: ${user?.fullName || user?.email}`, 20, finalY);
      doc.text(`Page 1 of 1`, pageWidth - 20, finalY, { align: 'right' });

      const filename = `KM_Sales_Report_${today.getTime()}.pdf`;
      doc.save(filename);

      await addDoc(collection(db, 'installmentReports'), {
        reportType: 'sales_summary',
        period: salesFilter.startDate && salesFilter.endDate ? 'custom' : 'all',
        startDate: salesFilter.startDate ? Timestamp.fromDate(new Date(salesFilter.startDate)) : null,
        endDate: salesFilter.endDate ? Timestamp.fromDate(new Date(salesFilter.endDate)) : null,
        generatedBy: user.uid,
        generatedByName: user.fullName || user.email,
        fileName: filename,
        downloadCount: 1,
        createdAt: serverTimestamp()
      });

      setSuccess('Sales report generated successfully!');
    } catch (error) {
      setError('Failed to generate sales report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

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
        // clear out states
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
    });

    return () => unsubscribe();
  }, [router, fetchAllData]);

  // ==================== UI COMPONENTS ====================

  // Stat Card Component
  const StatCard = ({ title, value, icon: Icon, color, description, trend }) => (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-400">{title}</p>
            <h3 className={`text-2xl font-bold mt-2 ${color}`}>{value}</h3>
            {description && (
              <p className="text-sm text-gray-500 mt-1">{description}</p>
            )}
          </div>
          <div className={`p-3 rounded-lg ${color.replace('text', 'bg')}/20`}>
            <Icon className={`h-6 w-6 ${color}`} />
          </div>
        </div>
        {trend && (
          <div className="flex items-center mt-4 text-sm">
            <span className={trend > 0 ? 'text-green-500' : 'text-red-500'}>
              {trend > 0 ? <FiArrowUp className="inline mr-1" /> : <FiArrowDown className="inline mr-1" />}
              {Math.abs(trend)}%
            </span>
            <span className="text-gray-500 ml-2">from last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Installment Card Component
  const InstallmentCard = ({ installment }) => {
    const paymentProgress = calculatePercentage(installment.totalPaid || 0, installment.totalAmount);
    const dueDate = installment.nextDueDate?.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
    const isOverdue = dueDate && dueDate < new Date();
    
    return (
      <Card className={`border ${
        installment.status === 'active' ? 'border-blue-500/30' :
        installment.status === 'completed' ? 'border-green-500/30' :
        'border-red-500/30'
      } bg-gray-800/50`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">{installment.customerName}</CardTitle>
              <CardDescription>{installment.customerPhone}</CardDescription>
            </div>
            <Badge variant={
              installment.status === 'active' ? 'default' :
              installment.status === 'completed' ? 'secondary' :
              'destructive'
            }>
              {installment.status}
              {isOverdue && installment.status === 'active' && ' (Overdue)'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-400">Item</p>
              <p className="font-medium">{installment.itemName}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-gray-400">Total</p>
                <p className="font-semibold">{formatCurrency(installment.totalAmount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Paid</p>
                <p className="text-green-400 font-semibold">{formatCurrency(installment.totalPaid || 0)}</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Progress</span>
                <span className="font-semibold">{paymentProgress}%</span>
              </div>
              <Progress value={paymentProgress} className="h-2" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 pt-0">
          <Button
            size="sm"
            className="flex-1"
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
          >
            <FiDollarSign className="mr-2 h-4 w-4" />
            Payment
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generatePaymentHistoryPDF(installment.id)}
                >
                  <FiEye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View Payment History</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardFooter>
      </Card>
    );
  };

  // Mobile Navigation Sheet
  const MobileNavSheet = () => (
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <SheetContent side="left" className="w-64 p-0 bg-gray-900 border-gray-800">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center">
              <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold">KM</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">KM Electronics</h2>
                <p className="text-xs text-gray-400">Installment System</p>
              </div>
            </div>
          </div>
          <ScrollArea className="flex-1 p-4">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "secondary" : "ghost"}
                  className={`w-full justify-start h-12 ${
                    activeTab === item.id 
                      ? 'bg-gray-800 text-white' 
                      : 'text-gray-300 hover:text-white hover:bg-gray-800/50'
                  }`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${item.color}`} />
                  {item.name}
                  {item.id === 'dashboard' && dashboardStats.activeInstallments > 0 && (
                    <Badge variant="default" className="ml-auto">
                      {dashboardStats.activeInstallments}
                    </Badge>
                  )}
                </Button>
              ))}
            </nav>
          </ScrollArea>
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center space-x-3">
              <Avatar>
                <AvatarFallback className="bg-blue-600 text-white">
                  {user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.fullName || user?.email}
                </p>
                <p className="text-xs text-gray-400 capitalize truncate">
                  {user?.role || 'Super Admin'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <TooltipProvider>
        {/* Mobile Navigation */}
        <MobileNavSheet />
        
        {/* Main Layout */}
        <div className="flex h-screen">
          {/* Desktop Sidebar */}
          <div className="hidden lg:flex lg:w-64 lg:flex-col">
            <div className="flex flex-col flex-1 min-h-0 bg-gray-900 border-r border-gray-800">
              <div className="flex items-center h-16 shrink-0 px-4 border-b border-gray-800">
                <div className="flex items-center flex-1">
                  <div className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-white font-bold">KM</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">KM Electronics</h2>
                    <p className="text-xs text-gray-400">Installment System</p>
                  </div>
                </div>
              </div>
              <ScrollArea className="flex-1 overflow-y-auto">
                <nav className="p-4 space-y-1">
                  {NAV_ITEMS.map((item) => (
                    <Button
                      key={item.id}
                      variant={activeTab === item.id ? "secondary" : "ghost"}
                      className={`w-full justify-start h-12 ${
                        activeTab === item.id 
                          ? 'bg-gray-800 text-white' 
                          : 'text-gray-300 hover:text-white hover:bg-gray-800/50'
                      }`}
                      onClick={() => setActiveTab(item.id)}
                    >
                      <item.icon className={`mr-3 h-5 w-5 ${item.color}`} />
                      {item.name}
                      {item.id === 'dashboard' && dashboardStats.activeInstallments > 0 && (
                        <Badge variant="default" className="ml-auto">
                          {dashboardStats.activeInstallments}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </nav>
              </ScrollArea>
              <div className="shrink-0 flex border-t border-gray-800 p-4">
                <div className="flex items-center w-full">
                  <Avatar>
                    <AvatarFallback className="bg-blue-600 text-white">
                      {user?.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-3 flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.fullName || user?.email}
                    </p>
                    <p className="text-xs text-gray-400 capitalize truncate">
                      {user?.role || 'Super Admin'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="sticky top-0 z-10 flex h-16 shrink-0 bg-gray-900/95 backdrop-blur-lg border-b border-gray-800">
              <div className="flex flex-1 justify-between px-4 md:px-6">
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden mr-2"
                    onClick={() => setSidebarOpen(true)}
                  >
                    <FiMenu className="h-5 w-5" />
                  </Button>
                  <h1 className="text-xl font-semibold text-white">
                    {NAV_ITEMS.find(item => item.id === activeTab)?.name || 'Dashboard'}
                  </h1>
                </div>
                
                <div className="flex items-center space-x-2 md:space-x-4">
                  <div className="hidden md:block">
                    <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                      <SelectTrigger className="w-40 bg-gray-800 border-gray-700">
                        <MdLocationOn className="mr-2 h-4 w-4" />
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Locations</SelectItem>
                        {LOCATIONS.map((location) => (
                          <SelectItem key={location} value={location}>{location}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => signOut(auth).then(() => router.push('/login'))}
                  >
                    Logout
                  </Button>
                </div>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {/* Alerts */}
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <FiAlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {success && (
                <Alert className="mb-4">
                  <FiCheckCircle className="h-4 w-4" />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              {/* Dashboard Tab */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                      title="Total Installment Value"
                      value={formatCurrency(dashboardStats.totalInstallmentValue)}
                      icon={MdAttachMoney}
                      color="text-blue-400"
                      description={`${dashboardStats.activeInstallments} active plans`}
                    />
                    <StatCard
                      title="Installment Payments"
                      value={formatCurrency(dashboardStats.totalPaid)}
                      icon={FiCreditCard}
                      color="text-green-400"
                      description={formatCurrency(dashboardStats.totalPending) + " pending"}
                    />
                    <StatCard
                      title="Total Sales"
                      value={dashboardStats.totalSales.toString()}
                      icon={MdShoppingCart}
                      color="text-purple-400"
                      description={`${dashboardStats.todaySales} sales today`}
                    />
                    <StatCard
                      title="Today's Revenue"
                      value={formatCurrency(dashboardStats.todayRevenue)}
                      icon={FiTrendingUp}
                      color="text-orange-400"
                      description={`${dashboardStats.todayPayments} payments today`}
                    />
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-400">{dashboardStats.activeInstallments}</div>
                        <div className="text-sm text-gray-400">Active</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-400">{dashboardStats.completedInstallments}</div>
                        <div className="text-sm text-gray-400">Completed</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-orange-400">{dashboardStats.overdueInstallments}</div>
                        <div className="text-sm text-gray-400">Overdue</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-400">{dashboardStats.defaultedInstallments}</div>
                        <div className="text-sm text-gray-400">Defaulted</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-400">{dashboardStats.lowStockItems}</div>
                        <div className="text-sm text-gray-400">Low Stock</div>
                      </CardContent>
                    </Card>
                    
                  </div>

                  {/* Main Content Area */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Installment Status */}
                    <Card className="border-gray-700 bg-gray-800/50">
                      <CardHeader>
                        <CardTitle className="flex items-center">
                          <FiPieChart className="mr-2 h-5 w-5 text-blue-400" />
                          Installment Status
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {[
                            { label: 'Active', value: dashboardStats.activeInstallments, color: 'bg-blue-500' },
                            { label: 'Completed', value: dashboardStats.completedInstallments, color: 'bg-green-500' },
                            { label: 'Overdue', value: dashboardStats.overdueInstallments, color: 'bg-orange-500' },
                            { label: 'Defaulted', value: dashboardStats.defaultedInstallments, color: 'bg-red-500' },
                          ].map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                              <div className="flex items-center">
                                <div className={`w-3 h-3 rounded-full mr-3 ${item.color}`} />
                                <span className="text-gray-300">{item.label}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-white font-semibold">{item.value}</span>
                                {item.value > 0 && (
                                  <span className="text-xs text-gray-500">
                                    {Math.round((item.value / (dashboardStats.activeInstallments + dashboardStats.completedInstallments + dashboardStats.overdueInstallments + dashboardStats.defaultedInstallments)) * 100)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Quick Actions */}
                    <Card className="border-gray-700 bg-gray-800/50">
                      <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>Perform common tasks quickly</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            variant="outline" 
                            className="h-auto py-4 flex-col border-gray-600 hover:bg-gray-700/50"
                            onClick={() => setActiveTab('installments')}
                          >
                            <MdPayments className="h-6 w-6 mb-2 text-green-500" />
                            <span className="text-sm">New Installment</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            className="h-auto py-4 flex-col border-gray-600 hover:bg-gray-700/50"
                            onClick={() => setActiveTab('payments')}
                          >
                            <FiDollarSign className="h-6 w-6 mb-2 text-blue-500" />
                            <span className="text-sm">Record Payment</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            className="h-auto py-4 flex-col border-gray-600 hover:bg-gray-700/50"
                            onClick={() => setActiveTab('sales')}
                          >
                            <FiShoppingCart className="h-6 w-6 mb-2 text-purple-500" />
                            <span className="text-sm">View Sales</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            className="h-auto py-4 flex-col border-gray-600 hover:bg-gray-700/50"
                            onClick={() => setActiveTab('stocks')}
                          >
                            <MdInventory className="h-6 w-6 mb-2 text-orange-500" />
                            <span className="text-sm">Manage Stock</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            className="h-auto py-4 flex-col border-gray-600 hover:bg-gray-700/50"
                            onClick={() => setActiveTab('reports')}
                          >
                            <MdAssessment className="h-6 w-6 mb-2 text-indigo-500" />
                            <span className="text-sm">Generate Report</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            className="h-auto py-4 flex-col border-gray-600 hover:bg-gray-700/50"
                            onClick={() => setActiveTab('settings')}
                          >
                            <FiSettings className="h-6 w-6 mb-2 text-gray-500" />
                            <span className="text-sm">Settings</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recent Payments */}
                    <Card className="border-gray-700 bg-gray-800/50">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>Recent Payments</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setActiveTab('payments')}
                          >
                            View All
                          </Button>
                        </CardTitle>
                        <CardDescription>Latest payment transactions</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-64">
                          {installmentPayments.slice(0, 10).map((payment, index) => (
                            <div key={index} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                              <div className="flex items-center space-x-3">
                                <div className={`p-2 rounded-lg ${
                                  payment.isLate ? 'bg-orange-500/20' : 'bg-green-500/20'
                                }`}>
                                  {payment.isLate ? (
                                    <MdWarning className="h-4 w-4 text-orange-400" />
                                  ) : (
                                    <FiCheck className="h-4 w-4 text-green-400" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-white text-sm">
                                    {payment.customerName}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {payment.receiptNumber}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-green-400 text-sm">
                                  {formatCurrency(payment.amount)}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {payment.paymentDate?.toDate?.().toLocaleDateString('en-MW') || 'Today'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Installments Tab */}
              {activeTab === 'installments' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Installment Management</h2>
                      <p className="text-gray-400">Create and manage customer installment plans</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                      >
                        {viewMode === 'grid' ? (
                          <>
                            <MdViewList className="mr-2 h-4 w-4" />
                            List View
                          </>
                        ) : (
                          <>
                            <MdGridOn className="mr-2 h-4 w-4" />
                            Grid View
                          </>
                        )}
                      </Button>
                      <Button onClick={() => {
                        document.getElementById('create-installment-tab').click();
                      }}>
                        <FiPlus className="mr-2 h-4 w-4" />
                        New Installment
                      </Button>
                    </div>
                  </div>

                  <Tabs defaultValue="list" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="list" id="list-installment-tab">
                        <MdViewList className="mr-2 h-4 w-4" />
                        Installment List
                      </TabsTrigger>
                      <TabsTrigger value="create" id="create-installment-tab">
                        <FiPlus className="mr-2 h-4 w-4" />
                        Create New
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="list" className="space-y-4">
                      {/* Filters */}
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardContent className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor="search-installments">Search</Label>
                              <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-4 w-4" />
                                <Input
                                  id="search-installments"
                                  placeholder="Search by customer, phone..."
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="pl-9"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="status-filter">Status</Label>
                              <Select 
                                value={selectedStatusFilter} 
                                onValueChange={setSelectedStatusFilter}
                              >
                                <SelectTrigger id="status-filter">
                                  <SelectValue placeholder="Filter by status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Statuses</SelectItem>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="defaulted">Defaulted</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end space-x-2">
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  setSearchQuery('');
                                  setSelectedStatusFilter('all');
                                }}
                              >
                                <FiX className="mr-2 h-4 w-4" />
                                Clear Filters
                              </Button>
                              <Button
                                variant="default"
                                className="flex-1"
                                onClick={generateInstallmentReportPDF}
                              >
                                <FiFileText className="mr-2 h-4 w-4" />
                                Export PDF
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Installments List/Grid */}
                      {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {filteredInstallments.slice(0, 12).map((installment) => (
                            <InstallmentCard key={installment.id} installment={installment} />
                          ))}
                        </div>
                      ) : (
                        <Card className="border-gray-700 bg-gray-800/50">
                          <CardContent className="p-0">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Customer</TableHead>
                                  <TableHead>Installment No.</TableHead>
                                  <TableHead>Item</TableHead>
                                  <TableHead>Total Amount</TableHead>
                                  <TableHead>Paid</TableHead>
                                  <TableHead>Progress</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredInstallments.slice(0, 10).map((installment) => {
                                  const paymentProgress = calculatePercentage(installment.totalPaid || 0, installment.totalAmount);
                                  return (
                                    <TableRow key={installment.id}>
                                      <TableCell>
                                        <div className="font-medium">{installment.customerName}</div>
                                        <div className="text-sm text-gray-400">{installment.customerPhone}</div>
                                      </TableCell>
                                      <TableCell className="font-mono text-sm">
                                        {installment.installmentNumber}
                                      </TableCell>
                                      <TableCell>
                                        <div>{installment.itemName}</div>
                                        <div className="text-sm text-gray-400">{installment.location}</div>
                                      </TableCell>
                                      <TableCell className="font-semibold">
                                        {formatCurrency(installment.totalAmount)}
                                      </TableCell>
                                      <TableCell>
                                        <div className="text-green-400">{formatCurrency(installment.totalPaid || 0)}</div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center space-x-2">
                                          <Progress value={paymentProgress} className="h-2 w-20" />
                                          <span className="text-sm">{paymentProgress}%</span>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={
                                          installment.status === 'active' ? 'default' :
                                          installment.status === 'completed' ? 'secondary' :
                                          'destructive'
                                        }>
                                          {installment.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex space-x-2">
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  size="sm"
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
                                                >
                                                  <FiDollarSign className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Record Payment</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button variant="outline" size="sm" onClick={() => generatePaymentHistoryPDF(installment.id)}>
                                                  <FiEye className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>View Payment History</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                          {installment.status === 'active' && (
                                            <TooltipProvider>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button variant="outline" size="sm" onClick={() => handleMarkAsDefaulted(installment.id)}>
                                                    <FiX className="h-4 w-4" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Mark as Defaulted</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            </TooltipProvider>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="create">
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardHeader>
                          <CardTitle>Create New Installment</CardTitle>
                          <CardDescription>
                            Create a new installment plan for a customer ({installmentSettings.initialPaymentPercentage}% initial payment required)
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <form className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="customerName">
                                  Customer Name <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="customerName"
                                  value={newInstallment.customerName}
                                  onChange={(e) => setNewInstallment({...newInstallment, customerName: e.target.value})}
                                  placeholder="Full Name"
                                  className={formErrors.installment.customerName ? 'border-red-500' : ''}
                                />
                                {formErrors.installment.customerName && (
                                  <p className="text-red-400 text-xs">{formErrors.installment.customerName}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="customerPhone">
                                  Customer Phone <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="customerPhone"
                                  value={newInstallment.customerPhone}
                                  onChange={(e) => setNewInstallment({...newInstallment, customerPhone: e.target.value})}
                                  placeholder="0999 999 999"
                                  className={formErrors.installment.customerPhone ? 'border-red-500' : ''}
                                />
                                {formErrors.installment.customerPhone && (
                                  <p className="text-red-400 text-xs">{formErrors.installment.customerPhone}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="nationalId">
                                  National ID {installmentSettings.requireNationalId && <span className="text-red-500">*</span>}
                                </Label>
                                <Input
                                  id="nationalId"
                                  value={newInstallment.nationalId}
                                  onChange={(e) => setNewInstallment({...newInstallment, nationalId: e.target.value})}
                                  placeholder="National ID Number"
                                  className={formErrors.installment.nationalId ? 'border-red-500' : ''}
                                />
                                {formErrors.installment.nationalId && (
                                  <p className="text-red-400 text-xs">{formErrors.installment.nationalId}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="itemId">
                                  Select Item <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={newInstallment.itemId}
                                  onValueChange={(value) => {
                                    const selected = stocks.find(s => s.id === value);
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
                                        itemId: value,
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
                                >
                                  <SelectTrigger className={formErrors.installment.itemId ? 'border-red-500' : ''}>
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {stocks
                                      .filter(stock => (parseInt(stock.quantity) || 0) > 0)
                                      .map((stock) => (
                                        <SelectItem key={stock.id} value={stock.id}>
                                          {stock.brand} {stock.model} - {formatCurrency(parseFloat(stock.retailPrice) || 0)}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                {formErrors.installment.itemId && (
                                  <p className="text-red-400 text-xs">{formErrors.installment.itemId}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="totalAmount">
                                  Total Amount (MK) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="totalAmount"
                                  type="number"
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
                                  placeholder="750000"
                                  className={formErrors.installment.totalAmount ? 'border-red-500' : ''}
                                />
                                {formErrors.installment.totalAmount && (
                                  <p className="text-red-400 text-xs">{formErrors.installment.totalAmount}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="initialPayment">
                                  Initial Payment ({installmentSettings.initialPaymentPercentage}%)
                                </Label>
                                <Input
                                  id="initialPayment"
                                  type="number"
                                  value={newInstallment.initialPayment}
                                  onChange={(e) => setNewInstallment({...newInstallment, initialPayment: e.target.value})}
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="totalInstallments">Installment Period</Label>
                                <Select
                                  value={newInstallment.totalInstallments}
                                  onValueChange={(value) => {
                                    const installmentAmt = calculateInstallmentAmount(
                                      parseFloat(newInstallment.totalAmount) || 0, 
                                      parseInt(value), 
                                      parseFloat(newInstallment.initialPayment) || 0
                                    );
                                    
                                    setNewInstallment({
                                      ...newInstallment,
                                      totalInstallments: value,
                                      installmentAmount: installmentAmt
                                    });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select period" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="6">6 Months</SelectItem>
                                    <SelectItem value="12">12 Months</SelectItem>
                                    <SelectItem value="18">18 Months</SelectItem>
                                    <SelectItem value="24">24 Months</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="installmentAmount">Monthly Installment</Label>
                                <Input
                                  id="installmentAmount"
                                  type="number"
                                  value={newInstallment.installmentAmount}
                                  readOnly
                                />
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="startDate">Start Date</Label>
                                <Input
                                  id="startDate"
                                  type="date"
                                  value={newInstallment.startDate}
                                  onChange={(e) => setNewInstallment({...newInstallment, startDate: e.target.value})}
                                />
                              </div>
                              
                              {installmentSettings.requireGuarantor && (
                                <>
                                  <div className="space-y-2">
                                    <Label htmlFor="guarantorName">
                                      Guarantor Name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                      id="guarantorName"
                                      value={newInstallment.guarantorName}
                                      onChange={(e) => setNewInstallment({...newInstallment, guarantorName: e.target.value})}
                                      placeholder="Guarantor Full Name"
                                      className={formErrors.installment.guarantorName ? 'border-red-500' : ''}
                                    />
                                    {formErrors.installment.guarantorName && (
                                      <p className="text-red-400 text-xs">{formErrors.installment.guarantorName}</p>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <Label htmlFor="guarantorPhone">
                                      Guarantor Phone <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                      id="guarantorPhone"
                                      value={newInstallment.guarantorPhone}
                                      onChange={(e) => setNewInstallment({...newInstallment, guarantorPhone: e.target.value})}
                                      placeholder="0999 999 999"
                                      className={formErrors.installment.guarantorPhone ? 'border-red-500' : ''}
                                    />
                                    {formErrors.installment.guarantorPhone && (
                                      <p className="text-red-400 text-xs">{formErrors.installment.guarantorPhone}</p>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            <div className="flex space-x-4">
                              <Button 
                                type="button"
                                onClick={handleCreateInstallment}
                                className="flex-1"
                              >
                                <MdPayments className="mr-2 h-4 w-4" />
                                Create Installment Plan
                              </Button>
                              <Button 
                                type="button"
                                variant="outline"
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
                                  setFormErrors(prev => ({ ...prev, installment: {} }));
                                }}
                              >
                                Clear Form
                              </Button>
                            </div>
                          </form>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Stocks Tab */}
              {activeTab === 'stocks' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Stock Management</h2>
                      <p className="text-gray-400">Manage your inventory and stock levels</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" onClick={generateStockBalanceReportPDF}>
                        <FiDownload className="mr-2 h-4 w-4" />
                        Export Report
                      </Button>
                      <Button onClick={() => {
                        document.getElementById('add-stock-tab').click();
                      }}>
                        <FiPlus className="mr-2 h-4 w-4" />
                        Add Stock
                      </Button>
                    </div>
                  </div>

                  <Tabs defaultValue="inventory" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="inventory" id="inventory-tab">
                        <MdViewList className="mr-2 h-4 w-4" />
                        Inventory
                      </TabsTrigger>
                      <TabsTrigger value="add" id="add-stock-tab">
                        <FiPlus className="mr-2 h-4 w-4" />
                        Add Stock
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="inventory" className="space-y-4">
                      {/* Stock Filters */}
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardContent className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor="search-stocks">Search Stocks</Label>
                              <div className="relative">
                                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-4 w-4" />
                                <Input
                                  id="search-stocks"
                                  placeholder="Search by brand, model, item code..."
                                  value={stockSearch}
                                  onChange={(e) => setStockSearch(e.target.value)}
                                  className="pl-9"
                                />
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="category-filter">Category</Label>
                              <Select 
                                value={reportFilters.category} 
                                onValueChange={(value) => setReportFilters({...reportFilters, category: value})}
                              >
                                <SelectTrigger id="category-filter">
                                  <SelectValue placeholder="Filter by category" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Categories</SelectItem>
                                  {CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>{category}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-end space-x-2">
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  setStockSearch('');
                                  setReportFilters({...reportFilters, category: 'all'});
                                }}
                              >
                                <FiX className="mr-2 h-4 w-4" />
                                Clear Filters
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Stock Table */}
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item Code</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Cost Price</TableHead>
                                <TableHead>Retail Price</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredStocks.slice(0, 20).map((stock) => (
                                <TableRow key={stock.id}>
                                  <TableCell className="font-mono text-sm">
                                    {stock.itemCode}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{stock.brand} {stock.model}</div>
                                    <div className="text-sm text-gray-400">{stock.category}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center">
                                      <MdLocationOn className="mr-1 h-4 w-4 text-gray-400" />
                                      {stock.location}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      stock.quantity <= 0 ? 'destructive' :
                                      stock.quantity <= (stock.minStockLevel || 5) ? 'secondary' :
                                      'default'
                                    }>
                                      {stock.quantity || 0}
                                      {stock.quantity <= (stock.minStockLevel || 5) && stock.quantity > 0 && ' (Low)'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {formatCurrency(stock.costPrice)}
                                  </TableCell>
                                  <TableCell className="font-medium">
                                    {formatCurrency(stock.retailPrice)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex space-x-2">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleEditStock(stock)}
                                            >
                                              <FiEdit className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Edit Stock</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleDeleteStock(stock.id)}
                                            >
                                              <FiTrash className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Delete Stock</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TabsContent>
                    
                    <TabsContent value="add">
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardHeader>
                          <CardTitle>{editingStock ? 'Edit Stock Item' : 'Add New Stock Item'}</CardTitle>
                          <CardDescription>
                            {editingStock ? 'Update existing stock item details' : 'Add new items to your inventory'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <form className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="brand">
                                  Brand <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="brand"
                                  value={stockForm.brand}
                                  onChange={(e) => setStockForm({...stockForm, brand: e.target.value})}
                                  placeholder="Samsung"
                                  className={formErrors.stock.brand ? 'border-red-500' : ''}
                                />
                                {formErrors.stock.brand && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.brand}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="model">
                                  Model <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="model"
                                  value={stockForm.model}
                                  onChange={(e) => setStockForm({...stockForm, model: e.target.value})}
                                  placeholder="Galaxy S23"
                                  className={formErrors.stock.model ? 'border-red-500' : ''}
                                />
                                {formErrors.stock.model && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.model}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="itemCode">
                                  Item Code <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="itemCode"
                                  value={stockForm.itemCode}
                                  onChange={(e) => setStockForm({...stockForm, itemCode: e.target.value})}
                                  placeholder="SAM-GS23-BLK-256"
                                  className={formErrors.stock.itemCode ? 'border-red-500' : ''}
                                />
                                {formErrors.stock.itemCode && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.itemCode}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Select
                                  value={stockForm.category}
                                  onValueChange={(value) => setStockForm({...stockForm, category: value})}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select category" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {CATEGORIES.map((category) => (
                                      <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="location">
                                  Location <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={stockForm.location}
                                  onValueChange={(value) => setStockForm({...stockForm, location: value})}
                                >
                                  <SelectTrigger className={formErrors.stock.location ? 'border-red-500' : ''}>
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LOCATIONS.map((location) => (
                                      <SelectItem key={location} value={location}>{location}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {formErrors.stock.location && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.location}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="quantity">
                                  Quantity <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="quantity"
                                  type="number"
                                  min="0"
                                  value={stockForm.quantity}
                                  onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})}
                                  placeholder="10"
                                  className={formErrors.stock.quantity ? 'border-red-500' : ''}
                                />
                                {formErrors.stock.quantity && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.quantity}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="costPrice">
                                  Cost Price (MK) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="costPrice"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={stockForm.costPrice}
                                  onChange={(e) => setStockForm({...stockForm, costPrice: e.target.value})}
                                  placeholder="500000"
                                  className={formErrors.stock.costPrice ? 'border-red-500' : ''}
                                />
                                {formErrors.stock.costPrice && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.costPrice}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="retailPrice">
                                  Retail Price (MK) <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                  id="retailPrice"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={stockForm.retailPrice}
                                  onChange={(e) => setStockForm({...stockForm, retailPrice: e.target.value})}
                                  placeholder="750000"
                                  className={formErrors.stock.retailPrice ? 'border-red-500' : ''}
                                />
                                {formErrors.stock.retailPrice && (
                                  <p className="text-red-400 text-xs">{formErrors.stock.retailPrice}</p>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <Label htmlFor="minStockLevel">Min Stock Level</Label>
                                <Input
                                  id="minStockLevel"
                                  type="number"
                                  min="1"
                                  value={stockForm.minStockLevel}
                                  onChange={(e) => setStockForm({...stockForm, minStockLevel: e.target.value})}
                                  placeholder="5"
                                />
                              </div>
                            </div>
                            
                            <div className="flex space-x-4">
                              {editingStock ? (
                                <>
                                  <Button 
                                    type="button"
                                    onClick={handleUpdateStock}
                                    className="flex-1"
                                  >
                                    <FiSave className="mr-2 h-4 w-4" />
                                    Update Stock
                                  </Button>
                                  <Button 
                                    type="button"
                                    variant="outline"
                                    onClick={handleCancelEdit}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <Button 
                                  type="button"
                                  onClick={handleAddStock}
                                  className="flex-1"
                                >
                                  <FiPlus className="mr-2 h-4 w-4" />
                                  Add Stock Item
                                </Button>
                              )}
                            </div>
                          </form>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Sales Tab */}
              {activeTab === 'sales' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Sales Management</h2>
                      <p className="text-gray-400">View and manage sales records</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" onClick={generateSalesReportPDF}>
                        <FiDownload className="mr-2 h-4 w-4" />
                        Export Report
                      </Button>
                    </div>
                  </div>

                  {/* Sales Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-blue-400">{filteredSales.length}</div>
                        <div className="text-sm text-gray-400">Total Sales</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-400">
                          {formatCurrency(filteredSales.reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0))}
                        </div>
                        <div className="text-sm text-gray-400">Total Revenue</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-orange-400">
                          {formatCurrency(filteredSales.reduce((sum, sale) => sum + (parseFloat(sale.profit) || 0), 0))}
                        </div>
                        <div className="text-sm text-gray-400">Total Profit</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-purple-400">
                          {filteredSales.filter(s => s.paymentMethod === 'installment').length}
                        </div>
                        <div className="text-sm text-gray-400">Installment Sales</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Sales Table */}
                  <Card className="border-gray-700 bg-gray-800/50">
                    <CardHeader>
                      <CardTitle>Sales Records</CardTitle>
                      <CardDescription>All sales transactions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Sales Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="search-sales">Search Sales</Label>
                            <div className="relative">
                              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-4 w-4" />
                              <Input
                                id="search-sales"
                                placeholder="Search by customer, receipt, item..."
                                value={salesSearch}
                                onChange={(e) => setSalesSearch(e.target.value)}
                                className="pl-9"
                              />
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="sales-location">Location</Label>
                            <Select
                              value={salesFilter.location}
                              onValueChange={(value) => setSalesFilter({...salesFilter, location: value})}
                            >
                              <SelectTrigger id="sales-location">
                                <SelectValue placeholder="All Locations" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Locations</SelectItem>
                                {LOCATIONS.map((location) => (
                                  <SelectItem key={location} value={location}>{location}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor="payment-method">Payment Method</Label>
                            <Select
                              value={salesFilter.paymentMethod}
                              onValueChange={(value) => setSalesFilter({...salesFilter, paymentMethod: value})}
                            >
                              <SelectTrigger id="payment-method">
                                <SelectValue placeholder="All Methods" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Methods</SelectItem>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                <SelectItem value="installment">Installment</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Sales Table */}
                        <div className="border rounded-lg border-gray-700">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Receipt No.</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Location</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredSales.slice(0, 15).map((sale) => (
                                <TableRow key={sale.id}>
                                  <TableCell className="font-mono text-sm">
                                    {sale.receiptNumber}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-medium">{sale.customerName}</div>
                                    <div className="text-sm text-gray-400">{sale.customerPhone}</div>
                                  </TableCell>
                                  <TableCell>
                                    <div>{sale.brand} {sale.model}</div>
                                    <div className="text-sm text-gray-400">{sale.itemCode}</div>
                                  </TableCell>
                                  <TableCell className="font-semibold">
                                    {formatCurrency(sale.finalSalePrice)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant={
                                      sale.paymentMethod === 'cash' ? 'default' :
                                      sale.paymentMethod === 'installment' ? 'secondary' :
                                      'outline'
                                    }>
                                      {sale.paymentMethod}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {sale.soldAt?.toDate?.().toLocaleDateString('en-MW') || 'N/A'}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center">
                                      <MdLocationOn className="mr-1 h-4 w-4 text-gray-400" />
                                      {sale.location}
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
                </div>
              )}

              {/* Payments Tab */}
              {activeTab === 'payments' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">Payment Records</h2>
                      <p className="text-gray-400">Record and view installment payments</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" onClick={() => generatePaymentHistoryPDF()}>
                        <FiDownload className="mr-2 h-4 w-4" />
                        Export Report
                      </Button>
                    </div>
                  </div>

                  {/* Payment Form and Recent Payments Side by Side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Payment Form */}
                    <Card className="border-gray-700 bg-gray-800/50">
                      <CardHeader>
                        <CardTitle>Record Payment</CardTitle>
                        <CardDescription>Record a new installment payment</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <form className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="installment-select">
                              Select Installment <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={paymentForm.installmentId}
                              onValueChange={(value) => {
                                const selected = installments.find(i => i.id === value);
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
                            >
                              <SelectTrigger id="installment-select" className={formErrors.payment.installmentId ? 'border-red-500' : ''}>
                                <SelectValue placeholder="Select installment" />
                              </SelectTrigger>
                              <SelectContent>
                                {installments
                                  .filter(i => i.status === 'active')
                                  .map((installment) => {
                                    const dueDate = installment.nextDueDate?.toDate ? installment.nextDueDate.toDate() : new Date(installment.nextDueDate);
                                    const isOverdue = dueDate && dueDate < new Date();
                                    
                                    return (
                                      <SelectItem key={installment.id} value={installment.id}>
                                        {installment.installmentNumber} - {installment.customerName} - 
                                        Pending: {formatCurrency(installment.totalPending || 0)}
                                        {isOverdue ? ' (OVERDUE)' : ''}
                                      </SelectItem>
                                    );
                                  })}
                              </SelectContent>
                            </Select>
                            {formErrors.payment.installmentId && (
                              <p className="text-red-400 text-xs">{formErrors.payment.installmentId}</p>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="payment-amount">
                                Amount (MK) <span className="text-red-500">*</span>
                              </Label>
                              <Input
                                id="payment-amount"
                                type="number"
                                step="0.01"
                                value={paymentForm.amount}
                                onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                                className={formErrors.payment.amount ? 'border-red-500' : ''}
                              />
                              {formErrors.payment.amount && (
                                <p className="text-red-400 text-xs">{formErrors.payment.amount}</p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="payment-date">Payment Date</Label>
                              <Input
                                id="payment-date"
                                type="date"
                                value={paymentForm.paymentDate}
                                onChange={(e) => setPaymentForm({...paymentForm, paymentDate: e.target.value})}
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="payment-type">Payment Type</Label>
                              <Select
                                value={paymentForm.paymentType}
                                onValueChange={(value) => setPaymentForm({...paymentForm, paymentType: value})}
                              >
                                <SelectTrigger id="payment-type">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="installment">Installment</SelectItem>
                                  <SelectItem value="final">Final Payment</SelectItem>
                                  <SelectItem value="penalty">Penalty/Late Fee</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="payment-method">Payment Method</Label>
                              <Select
                                value={paymentForm.paymentMethod}
                                onValueChange={(value) => setPaymentForm({...paymentForm, paymentMethod: value})}
                              >
                                <SelectTrigger id="payment-method">
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="cash">Cash</SelectItem>
                                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <Button 
                            type="button"
                            onClick={handleRecordPayment}
                            className="w-full"
                          >
                            <FiDollarSign className="mr-2 h-4 w-4" />
                            Record Payment
                          </Button>
                        </form>
                      </CardContent>
                    </Card>

                    {/* Recent Payments */}
                    <Card className="border-gray-700 bg-gray-800/50">
                      <CardHeader>
                        <CardTitle>Recent Payments</CardTitle>
                        <CardDescription>Latest payment transactions</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-400px">
                          {installmentPayments.slice(0, 20).map((payment, index) => (
                            <div key={index} className="flex items-center justify-between py-3 border-b border-gray-700/50 last:border-0">
                              <div className="flex items-center space-x-3">
                                <div className={`p-2 rounded-lg ${
                                  payment.isLate ? 'bg-orange-500/20' : 'bg-green-500/20'
                                }`}>
                                  {payment.isLate ? (
                                    <MdWarning className="h-4 w-4 text-orange-400" />
                                  ) : (
                                    <FiCheck className="h-4 w-4 text-green-400" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-white text-sm">
                                    {payment.customerName}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {payment.installmentNumber}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-green-400 text-sm">
                                  {formatCurrency(payment.amount)}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {payment.paymentDate?.toDate?.().toLocaleDateString('en-MW') || 'Today'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Reports Tab */}
              {activeTab === 'reports' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Reports</h2>
                    <p className="text-gray-400">Generate and download system reports</p>
                  </div>

                  <Tabs defaultValue="generate" className="space-y-6">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="generate">
                        <FiFileText className="mr-2 h-4 w-4" />
                        Generate Reports
                      </TabsTrigger>
                      <TabsTrigger value="history">
                        <MdHistory className="mr-2 h-4 w-4" />
                        Report History
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="generate" className="space-y-6">
                      {/* Report Type Selection */}
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardHeader>
                          <CardTitle>Select Report Type</CardTitle>
                          <CardDescription>Choose the type of report to generate</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Button
                              variant={reportType === 'installments' ? "default" : "outline"}
                              className="h-auto py-6 flex-col"
                              onClick={() => setReportType('installments')}
                            >
                              <MdPayments className="h-8 w-8 mb-2" />
                              <span className="text-sm">Installment Report</span>
                            </Button>
                            
                            <Button
                              variant={reportType === 'payments' ? "default" : "outline"}
                              className="h-auto py-6 flex-col"
                              onClick={() => setReportType('payments')}
                            >
                              <FiDollarSign className="h-8 w-8 mb-2" />
                              <span className="text-sm">Payment History</span>
                            </Button>
                            
                            <Button
                              variant={reportType === 'stocks' ? "default" : "outline"}
                              className="h-auto py-6 flex-col"
                              onClick={() => setReportType('stocks')}
                            >
                              <MdInventory className="h-8 w-8 mb-2" />
                              <span className="text-sm">Stock Report</span>
                            </Button>
                            
                            <Button
                              variant={reportType === 'sales' ? "default" : "outline"}
                              className="h-auto py-6 flex-col"
                              onClick={() => setReportType('sales')}
                            >
                              <MdShoppingCart className="h-8 w-8 mb-2" />
                              <span className="text-sm">Sales Report</span>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Report Filters */}
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardHeader>
                          <CardTitle>Report Filters</CardTitle>
                          <CardDescription>Customize your report parameters</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="start-date">Start Date</Label>
                              <Input
                                id="start-date"
                                type="date"
                                value={reportFilters.startDate}
                                onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <Label htmlFor="end-date">End Date</Label>
                              <Input
                                id="end-date"
                                type="date"
                                value={reportFilters.endDate}
                                onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                              />
                            </div>
                            
                            {reportType === 'installments' && (
                              <div className="space-y-2">
                                <Label htmlFor="status">Status</Label>
                                <Select
                                  value={reportFilters.status}
                                  onValueChange={(value) => setReportFilters({...reportFilters, status: value})}
                                >
                                  <SelectTrigger id="status">
                                    <SelectValue placeholder="All Statuses" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="defaulted">Defaulted</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            
                            {reportType === 'stocks' && (
                              <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Select
                                  value={reportFilters.category}
                                  onValueChange={(value) => setReportFilters({...reportFilters, category: value})}
                                >
                                  <SelectTrigger id="category">
                                    <SelectValue placeholder="All Categories" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {CATEGORIES.map((category) => (
                                      <SelectItem key={category} value={category}>{category}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Generate Report Button */}
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardContent className="p-6">
                          <Button
                            onClick={() => {
                              if (reportType === 'installments') generateInstallmentReportPDF();
                              else if (reportType === 'payments') generatePaymentHistoryPDF();
                              else if (reportType === 'stocks') generateStockBalanceReportPDF();
                              else if (reportType === 'sales') generateSalesReportPDF();
                            }}
                            disabled={isGeneratingReport}
                            className="w-full h-16 text-lg"
                          >
                            {isGeneratingReport ? (
                              <>
                                <FiRefreshCw className="mr-2 h-5 w-5 animate-spin" />
                                Generating Report...
                              </>
                            ) : (
                              <>
                                <FiFileText className="mr-2 h-5 w-5" />
                                Generate {reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report (PDF)
                              </>
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    </TabsContent>
                    
                    <TabsContent value="history">
                      <Card className="border-gray-700 bg-gray-800/50">
                        <CardHeader>
                          <CardTitle>Report History</CardTitle>
                          <CardDescription>Previously generated reports</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Report Type</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead>Generated By</TableHead>
                                <TableHead>File Name</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Downloads</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {generatedReports.slice(0, 10).map((report, index) => (
                                <TableRow key={index}>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {report.reportType}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{report.period}</TableCell>
                                  <TableCell>{report.generatedByName}</TableCell>
                                  <TableCell className="font-mono text-sm">
                                    {report.fileName}
                                  </TableCell>
                                  <TableCell>
                                    {report.createdAt?.toDate?.().toLocaleDateString('en-MW') || 'Unknown'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {report.downloadCount || 1}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">System Settings</h2>
                    <p className="text-gray-400">Configure installment system parameters</p>
                  </div>

                  <Card className="border-gray-700 bg-gray-800/50">
                    <CardHeader>
                      <CardTitle>Installment Settings</CardTitle>
                      <CardDescription>Configure how the installment system works</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Payment Settings */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Payment Settings</h3>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="initial-payment-percentage">
                              Initial Payment Percentage ({installmentSettings.initialPaymentPercentage}%)
                            </Label>
                            <span className="text-blue-400 font-semibold">
                              {installmentSettings.initialPaymentPercentage}%
                            </span>
                          </div>
                          <Slider
                            id="initial-payment-percentage"
                            min={10}
                            max={90}
                            step={5}
                            value={[installmentSettings.initialPaymentPercentage]}
                            onValueChange={([value]) => setInstallmentSettings({
                              ...installmentSettings,
                              initialPaymentPercentage: value
                            })}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="late-payment-fee">Late Payment Fee (% per month)</Label>
                          <Input
                            id="late-payment-fee"
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            value={installmentSettings.latePaymentFee}
                            onChange={(e) => setInstallmentSettings({
                              ...installmentSettings,
                              latePaymentFee: parseFloat(e.target.value)
                            })}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="grace-period">Grace Period (Days)</Label>
                          <Input
                            id="grace-period"
                            type="number"
                            min="0"
                            max="30"
                            value={installmentSettings.gracePeriodDays}
                            onChange={(e) => setInstallmentSettings({
                              ...installmentSettings,
                              gracePeriodDays: parseInt(e.target.value)
                            })}
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Installment Period Settings */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Installment Period Settings</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="min-installment-period">Minimum Installment Period (Months)</Label>
                            <Input
                              id="min-installment-period"
                              type="number"
                              min="1"
                              max="24"
                              value={installmentSettings.minInstallmentPeriod}
                              onChange={(e) => setInstallmentSettings({
                                ...installmentSettings,
                                minInstallmentPeriod: parseInt(e.target.value)
                              })}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="max-installment-period">Maximum Installment Period (Months)</Label>
                            <Input
                              id="max-installment-period"
                              type="number"
                              min="6"
                              max="36"
                              value={installmentSettings.maxInstallmentPeriod}
                              onChange={(e) => setInstallmentSettings({
                                ...installmentSettings,
                                maxInstallmentPeriod: parseInt(e.target.value)
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Customer Requirements */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Customer Requirements</h3>
                        
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Require Guarantor</Label>
                              <p className="text-sm text-gray-400">Customer must provide a guarantor</p>
                            </div>
                            <Switch
                              checked={installmentSettings.requireGuarantor}
                              onCheckedChange={(checked) => setInstallmentSettings({
                                ...installmentSettings,
                                requireGuarantor: checked
                              })}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Require National ID</Label>
                              <p className="text-sm text-gray-400">Customer must provide National ID</p>
                            </div>
                            <Switch
                              checked={installmentSettings.requireNationalId}
                              onCheckedChange={(checked) => setInstallmentSettings({
                                ...installmentSettings,
                                requireNationalId: checked
                              })}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Auto-generate Receipt Numbers</Label>
                              <p className="text-sm text-gray-400">Automatically generate unique receipt numbers</p>
                            </div>
                            <Switch
                              checked={installmentSettings.autoGenerateReceipt}
                              onCheckedChange={(checked) => setInstallmentSettings({
                                ...installmentSettings,
                                autoGenerateReceipt: checked
                              })}
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Allowed Categories */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Allowed Categories for Installments</h3>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {CATEGORIES.map((category, index) => (
                            <div key={index} className="flex items-center space-x-2">
                              <Checkbox
                                id={`category-${index}`}
                                checked={installmentSettings.allowedCategories.includes(category)}
                                onCheckedChange={(checked) => {
                                  const newCategories = checked
                                    ? [...installmentSettings.allowedCategories, category]
                                    : installmentSettings.allowedCategories.filter(c => c !== category);
                                  setInstallmentSettings({
                                    ...installmentSettings,
                                    allowedCategories: newCategories
                                  });
                                }}
                              />
                              <Label htmlFor={`category-${index}`} className="text-sm">
                                {category}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      {/* Save Button */}
                      <Button 
                        onClick={saveInstallmentSettings}
                        className="w-full"
                      >
                        <FiSave className="mr-2 h-4 w-4" />
                        Save Settings
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              )}
            </main>

            {/* Footer */}
            <footer className="border-t border-gray-800 bg-gray-900/95 backdrop-blur-lg py-4">
              <div className="px-4 md:px-6">
                <p className="text-center text-gray-400 text-sm">
                  © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
                </p>
              </div>
            </footer>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}