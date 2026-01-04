'use client'
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, getDoc,
  Timestamp, deleteDoc, writeBatch
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FaEdit, FaSave, FaTrash, FaFilePdf, FaFileExcel, 
  FaChartLine, FaMoneyBillWave, FaHistory, FaDownload,
  FaUserCog, FaWarehouse, FaCreditCard, FaChartBar,
  FaUsers, FaCog, FaBell, FaSearch, FaFilter,
  FaEye, FaPrint, FaFileCsv, FaDatabase
} from 'react-icons/fa';
import { FiPackage, FiDollarSign, FiTrendingUp, FiAlertCircle } from 'react-icons/fi';

// Available locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

// Product categories
const CATEGORIES = [
  'Smartphone', 'Tablet', 'Laptop', 'Accessory', 
  'TV', 'Audio', 'Gaming', 'Other'
];

// Safe key generator
const generateSafeKey = (prefix = 'item', index, id) => {
  if (id) {
    return `${prefix}-${id}`;
  }
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Theme colors
const THEMES = {
  dark: {
    primary: '#1e40af',
    secondary: '#7c3aed',
    success: '#059669',
    warning: '#d97706',
    danger: '#dc2626',
    info: '#0891b2'
  },
  blue: {
    primary: '#2563eb',
    secondary: '#4f46e5',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#0ea5e9'
  },
  purple: {
    primary: '#7c3aed',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#0ea5e9'
  }
};

export default function SuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('dark');
  const router = useRouter();

  // User Management State
  const [allUsers, setAllUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  // Stocks Management State
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [stockSearch, setStockSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // CRUD Stocks State
  const [editingStock, setEditingStock] = useState(null);
  const [stockForm, setStockForm] = useState({
    brand: '',
    model: '',
    storage: '',
    color: '',
    orderPrice: '',
    salePrice: '',
    discountPercentage: '',
    quantity: '',
    itemCode: '',
    location: '',
    category: 'Smartphone',
    costPrice: '',
    retailPrice: '',
    wholesalePrice: '',
    minStockLevel: 5,
    reorderQuantity: 10,
    supplier: '',
    warrantyPeriod: '12',
    description: ''
  });

  // Installments State
  const [installments, setInstallments] = useState([]);
  const [installmentPayments, setInstallmentPayments] = useState([]);
  const [filteredInstallments, setFilteredInstallments] = useState([]);
  const [installmentReport, setInstallmentReport] = useState({
    totalActiveInstallments: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0,
    overdueInstallments: 0,
    completedInstallments: 0,
    thisMonthPayments: 0,
    averageInstallmentAmount: 0
  });

  // New Installment Form
  const [newInstallment, setNewInstallment] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    itemId: '',
    itemName: '',
    totalAmount: '',
    initialPayment: '',
    totalInstallments: 12,
    installmentAmount: '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    status: 'active',
    paymentFrequency: 'monthly',
    guarantorName: '',
    guarantorPhone: '',
    notes: ''
  });

  // Payment Form
  const [paymentForm, setPaymentForm] = useState({
    installmentId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'cash',
    reference: '',
    receiptNumber: '',
    collectedBy: '',
    notes: ''
  });

  // Reports State
  const [reportType, setReportType] = useState('installments');
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: '',
    location: 'all',
    status: 'all',
    category: 'all',
    paymentMethod: 'all'
  });

  // Sales Analysis State
  const [sales, setSales] = useState([]);
  const [salesAnalysis, setSalesAnalysis] = useState({
    totalSales: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    topProducts: {},
    salesByUser: {},
    revenueByLocation: {},
    locationPerformance: {},
    dailySales: [],
    weeklyGrowth: 0
  });

  // Real-time Sales Report State
  const [realTimeSales, setRealTimeSales] = useState({
    todaySales: 0,
    todayRevenue: 0,
    hourlySales: {},
    liveSales: [],
    topSellingProducts: [],
    salesTrend: 'up'
  });

  // Dashboard Stats
  const [dashboardStats, setDashboardStats] = useState({
    totalStockValue: 0,
    totalRetailValue: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    pendingApprovals: 0,
    todayInstallments: 0
  });

  // Error and Success States
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Refs
  const stockTableRef = useRef(null);
  const installmentTableRef = useRef(null);

  // Performance Helpers
  const getPerformanceGrade = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Average';
    if (score >= 50) return 'Below Average';
    return 'Needs Attention';
  };

  const getPerformanceColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getPerformanceBadge = (score) => {
    if (score >= 80) return 'bg-green-500/20 text-green-300';
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-300';
    if (score >= 40) return 'bg-orange-500/20 text-orange-300';
    return 'bg-red-500/20 text-red-300';
  };

  const getTrendIcon = (trend) => {
    if (trend === 'up') return '↗';
    if (trend === 'down') return '↘';
    return '→';
  };

  const getTrendColor = (trend) => {
    if (trend === 'up') return 'text-green-400';
    if (trend === 'down') return 'text-red-400';
    return 'text-gray-400';
  };

  // Calculate installment start price (60% of retail price)
  const calculateInstallmentStartPrice = (retailPrice) => {
    return (retailPrice * 0.6).toFixed(2);
  };

  // Calculate installment amount
  const calculateInstallmentAmount = (totalAmount, totalInstallments, initialPayment = 0) => {
    const remaining = totalAmount - initialPayment;
    return (remaining / totalInstallments).toFixed(2);
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK'
    }).format(amount);
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-MW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Calculate due date
  const calculateDueDate = (startDate, months) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
  };

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    try {
      // Fetch stocks
      const stocksSnapshot = await getDocs(collection(db, 'stocks'));
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
      setFilteredStocks(stocksData);

      // Fetch installments
      const installmentsQuery = query(
        collection(db, 'installments'),
        orderBy('createdAt', 'desc')
      );
      const installmentsSnapshot = await getDocs(installmentsQuery);
      const installmentsData = installmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallments(installmentsData);
      setFilteredInstallments(installmentsData);

      // Fetch installment payments
      const paymentsQuery = query(
        collection(db, 'installmentPayments'),
        orderBy('paymentDate', 'desc')
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallmentPayments(paymentsData);

      // Calculate installment report
      calculateInstallmentReport(installmentsData, paymentsData);

      // Fetch sales
      const salesQuery = query(
        collection(db, 'sales'),
        orderBy('soldAt', 'desc')
      );
      const salesSnapshot = await getDocs(salesQuery);
      const salesData = salesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      calculateSalesAnalysis(salesData);

      // Fetch users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersData);

      // Calculate dashboard stats
      calculateDashboardStats(stocksData, installmentsData, salesData);

    } catch (error) {
      console.error('Fetch error:', error);
      setError('Failed to fetch data: ' + error.message);
    }
  }, []);

  // Calculate dashboard statistics
  const calculateDashboardStats = (stocksData, installmentsData, salesData) => {
    // Stock stats
    const totalStockValue = stocksData.reduce((sum, stock) => {
      return sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0));
    }, 0);

    const totalRetailValue = stocksData.reduce((sum, stock) => {
      return sum + ((parseFloat(stock.retailPrice) || parseFloat(stock.salePrice) || 0) * (parseInt(stock.quantity) || 0));
    }, 0);

    const lowStockItems = stocksData.filter(stock => 
      (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) &&
      (parseInt(stock.quantity) || 0) > 0
    ).length;

    const outOfStockItems = stocksData.filter(stock => 
      (parseInt(stock.quantity) || 0) === 0
    ).length;

    // Installment stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayInstallments = installmentsData.filter(installment => {
      const installmentDate = installment.startDate?.toDate ? 
        installment.startDate.toDate() : new Date(installment.startDate);
      return installmentDate >= today;
    }).length;

    setDashboardStats({
      totalStockValue,
      totalRetailValue,
      lowStockItems,
      outOfStockItems,
      pendingApprovals: 0, // You can calculate this based on your approval system
      todayInstallments
    });
  };

  // Calculate installment report
  const calculateInstallmentReport = (installmentsData, paymentsData) => {
    const totalActive = installmentsData.filter(i => i.status === 'active').length;
    const totalCompleted = installmentsData.filter(i => i.status === 'completed').length;
    
    // Calculate overdue installments
    const overdue = installmentsData.filter(i => {
      if (i.status === 'active' && i.dueDate) {
        const dueDate = i.dueDate.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
        return dueDate < new Date();
      }
      return false;
    }).length;

    const totalPaid = paymentsData.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
    
    const totalPending = installmentsData.reduce((sum, installment) => {
      if (installment.status === 'active') {
        const paid = paymentsData
          .filter(p => p.installmentId === installment.id)
          .reduce((paidSum, p) => paidSum + (parseFloat(p.amount) || 0), 0);
        return sum + (parseFloat(installment.totalAmount) || 0) - paid;
      }
      return sum;
    }, 0);

    // This month payments
    const thisMonth = new Date();
    thisMonth.setDate(1);
    const thisMonthPayments = paymentsData
      .filter(payment => {
        const paymentDate = payment.paymentDate?.toDate ? 
          payment.paymentDate.toDate() : new Date(payment.paymentDate);
        return paymentDate >= thisMonth;
      })
      .reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);

    // Average installment amount
    const averageInstallmentAmount = totalActive > 0 ? totalPending / totalActive : 0;

    setInstallmentReport({
      totalActiveInstallments: totalActive,
      totalPaidAmount: totalPaid,
      totalPendingAmount: totalPending,
      overdueInstallments: overdue,
      completedInstallments: totalCompleted,
      thisMonthPayments,
      averageInstallmentAmount
    });
  };

  // Calculate sales analysis
  const calculateSalesAnalysis = (salesData) => {
    const totalRevenue = salesData.reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0);
    const totalSales = salesData.length;

    // Monthly revenue
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyRevenue = salesData
      .filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
      })
      .reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0);

    // Top products
    const topProducts = {};
    salesData.forEach(sale => {
      const productKey = `${sale.brand || 'Unknown'} ${sale.model || ''}`.trim();
      topProducts[productKey] = (topProducts[productKey] || 0) + 1;
    });

    // Revenue by location
    const revenueByLocation = {};
    salesData.forEach(sale => {
      const location = sale.location || 'Unknown';
      revenueByLocation[location] = (revenueByLocation[location] || 0) + (parseFloat(sale.finalSalePrice) || 0);
    });

    // Daily sales for last 7 days
    const dailySales = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const daySales = salesData.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        return saleDate >= date && saleDate < nextDay;
      });
      
      dailySales.push({
        date: date.toLocaleDateString('en-MW', { weekday: 'short', month: 'short', day: 'numeric' }),
        sales: daySales.length,
        revenue: daySales.reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0)
      });
    }

    // Weekly growth
    const thisWeekRevenue = dailySales.slice(-7).reduce((sum, day) => sum + day.revenue, 0);
    const lastWeekRevenue = dailySales.slice(0, 6).reduce((sum, day) => sum + day.revenue, 0);
    const weeklyGrowth = lastWeekRevenue > 0 ? ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100 : 100;

    setSalesAnalysis({
      totalSales,
      totalRevenue,
      monthlyRevenue,
      topProducts,
      revenueByLocation,
      dailySales,
      weeklyGrowth,
      salesByUser: {}, // You can calculate this
      locationPerformance: {} // You can calculate this
    });

    // Calculate real-time sales
    calculateRealTimeSales(salesData);
  };

  // Calculate real-time sales
  const calculateRealTimeSales = (salesData) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySales = salesData.filter(sale => {
      const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
      return saleDate >= today;
    });

    const hourlySales = {};
    const liveSales = todaySales.slice(0, 5);

    todaySales.forEach(sale => {
      const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
      if (saleDate) {
        const hour = saleDate.getHours();
        hourlySales[hour] = (hourlySales[hour] || 0) + (parseFloat(sale.finalSalePrice) || 0);
      }
    });

    // Top selling products today
    const productSales = {};
    todaySales.forEach(sale => {
      const productKey = `${sale.brand || 'Unknown'} ${sale.model || ''}`.trim();
      productSales[productKey] = (productSales[productKey] || 0) + 1;
    });

    const topSellingProducts = Object.entries(productSales)
      .map(([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Sales trend
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdaySales = salesData.filter(sale => {
      const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
      return saleDate >= yesterday && saleDate < today;
    }).length;

    const salesTrend = todaySales.length > yesterdaySales ? 'up' : todaySales.length < yesterdaySales ? 'down' : 'stable';

    setRealTimeSales({
      todaySales: todaySales.length,
      todayRevenue: todaySales.reduce((sum, sale) => sum + (parseFloat(sale.finalSalePrice) || 0), 0),
      hourlySales,
      liveSales,
      topSellingProducts,
      salesTrend
    });
  };

  // Filter stocks based on search and filters
  useEffect(() => {
    let filtered = stocks;
    
    // Filter by location
    if (selectedLocation !== 'all') {
      filtered = filtered.filter(stock => stock.location === selectedLocation);
    }
    
    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(stock => stock.category === selectedCategory);
    }
    
    // Filter by search
    if (stockSearch) {
      const searchLower = stockSearch.toLowerCase();
      filtered = filtered.filter(stock =>
        stock.brand?.toLowerCase().includes(searchLower) ||
        stock.model?.toLowerCase().includes(searchLower) ||
        stock.itemCode?.toLowerCase().includes(searchLower) ||
        stock.color?.toLowerCase().includes(searchLower)
      );
    }
    
    setFilteredStocks(filtered);
  }, [stocks, selectedLocation, selectedCategory, stockSearch]);

  // Filter installments
  useEffect(() => {
    let filtered = installments;
    
    // Filter by status
    if (reportFilters.status !== 'all') {
      if (reportFilters.status === 'overdue') {
        filtered = filtered.filter(installment => {
          if (installment.status === 'active' && installment.dueDate) {
            const dueDate = installment.dueDate.toDate ? 
              installment.dueDate.toDate() : new Date(installment.dueDate);
            return dueDate < new Date();
          }
          return false;
        });
      } else {
        filtered = filtered.filter(installment => installment.status === reportFilters.status);
      }
    }
    
    // Filter by location
    if (reportFilters.location !== 'all') {
      filtered = filtered.filter(installment => installment.location === reportFilters.location);
    }
    
    // Filter by date range
    if (reportFilters.startDate) {
      const startDate = new Date(reportFilters.startDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(installment => {
        const installmentDate = installment.startDate?.toDate ? 
          installment.startDate.toDate() : new Date(installment.startDate);
        return installmentDate >= startDate;
      });
    }
    
    if (reportFilters.endDate) {
      const endDate = new Date(reportFilters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(installment => {
        const installmentDate = installment.startDate?.toDate ? 
          installment.startDate.toDate() : new Date(installment.startDate);
        return installmentDate <= endDate;
      });
    }
    
    setFilteredInstallments(filtered);
  }, [installments, reportFilters]);

  // CRUD Operations for Stocks
  const handleAddStock = async () => {
    try {
      if (!stockForm.brand || !stockForm.model || !stockForm.itemCode || !stockForm.quantity || !stockForm.location) {
        setError('Please fill in required fields: Brand, Model, Item Code, Quantity, and Location.');
        return;
      }

      const stockData = {
        ...stockForm,
        orderPrice: parseFloat(stockForm.orderPrice) || 0,
        salePrice: parseFloat(stockForm.salePrice) || 0,
        costPrice: parseFloat(stockForm.costPrice) || parseFloat(stockForm.orderPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || parseFloat(stockForm.salePrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.salePrice) * 0.8) || 0,
        discountPercentage: parseFloat(stockForm.discountPercentage) || 0,
        quantity: parseInt(stockForm.quantity) || 0,
        minStockLevel: parseInt(stockForm.minStockLevel) || 5,
        reorderQuantity: parseInt(stockForm.reorderQuantity) || 10,
        warrantyPeriod: parseInt(stockForm.warrantyPeriod) || 12,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        addedBy: user.uid,
        addedByName: user.displayName || user.email
      };

      await addDoc(collection(db, 'stocks'), stockData);
      
      // Reset form
      setStockForm({
        brand: '',
        model: '',
        storage: '',
        color: '',
        orderPrice: '',
        salePrice: '',
        discountPercentage: '',
        quantity: '',
        itemCode: '',
        location: '',
        category: 'Smartphone',
        costPrice: '',
        retailPrice: '',
        wholesalePrice: '',
        minStockLevel: 5,
        reorderQuantity: 10,
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
      storage: stock.storage || '',
      color: stock.color || '',
      orderPrice: stock.orderPrice || '',
      salePrice: stock.salePrice || '',
      discountPercentage: stock.discountPercentage || '',
      quantity: stock.quantity || '',
      itemCode: stock.itemCode || '',
      location: stock.location || '',
      category: stock.category || 'Smartphone',
      costPrice: stock.costPrice || stock.orderPrice || '',
      retailPrice: stock.retailPrice || stock.salePrice || '',
      wholesalePrice: stock.wholesalePrice || (stock.salePrice * 0.8) || '',
      minStockLevel: stock.minStockLevel || 5,
      reorderQuantity: stock.reorderQuantity || 10,
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
        orderPrice: parseFloat(stockForm.orderPrice) || 0,
        salePrice: parseFloat(stockForm.salePrice) || 0,
        costPrice: parseFloat(stockForm.costPrice) || parseFloat(stockForm.orderPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || parseFloat(stockForm.salePrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.salePrice) * 0.8) || 0,
        discountPercentage: parseFloat(stockForm.discountPercentage) || 0,
        quantity: parseInt(stockForm.quantity) || 0,
        minStockLevel: parseInt(stockForm.minStockLevel) || 5,
        reorderQuantity: parseInt(stockForm.reorderQuantity) || 10,
        warrantyPeriod: parseInt(stockForm.warrantyPeriod) || 12,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.displayName || user.email
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
    if (!window.confirm('Are you sure you want to delete this stock item? This action cannot be undone.')) return;

    try {
      await deleteDoc(doc(db, 'stocks', stockId));
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
      storage: '',
      color: '',
      orderPrice: '',
      salePrice: '',
      discountPercentage: '',
      quantity: '',
      itemCode: '',
      location: '',
      category: 'Smartphone',
      costPrice: '',
      retailPrice: '',
      wholesalePrice: '',
      minStockLevel: 5,
      reorderQuantity: 10,
      supplier: '',
      warrantyPeriod: '12',
      description: ''
    });
  };

  // Installment Management
  const handleCreateInstallment = async () => {
    try {
      if (!newInstallment.customerName || !newInstallment.customerPhone || !newInstallment.totalAmount) {
        setError('Please fill in required fields: Customer Name, Phone, and Total Amount.');
        return;
      }

      // Find the selected stock item
      const selectedStock = stocks.find(s => s.id === newInstallment.itemId);
      if (!selectedStock) {
        setError('Selected item not found');
        return;
      }

      // Calculate installment start price (60% of retail price)
      const startPrice = calculateInstallmentStartPrice(selectedStock.retailPrice || selectedStock.salePrice);
      
      // Calculate installment amount
      const initialPayment = parseFloat(newInstallment.initialPayment) || parseFloat(startPrice);
      const totalAmount = parseFloat(newInstallment.totalAmount);
      const installmentAmount = calculateInstallmentAmount(totalAmount, newInstallment.totalInstallments, initialPayment);

      // Calculate due date if not provided
      const dueDate = newInstallment.dueDate || calculateDueDate(newInstallment.startDate, newInstallment.totalInstallments);

      const installmentData = {
        ...newInstallment,
        customerName: newInstallment.customerName.trim(),
        customerPhone: newInstallment.customerPhone.trim(),
        customerEmail: newInstallment.customerEmail?.trim() || '',
        customerAddress: newInstallment.customerAddress?.trim() || '',
        itemId: newInstallment.itemId,
        itemName: selectedStock.brand + ' ' + selectedStock.model,
        itemCode: selectedStock.itemCode,
        itemCategory: selectedStock.category,
        location: selectedStock.location,
        totalAmount: totalAmount,
        initialPayment: initialPayment,
        installmentAmount: parseFloat(installmentAmount),
        remainingAmount: totalAmount - initialPayment,
        paidAmount: initialPayment,
        startDate: new Date(newInstallment.startDate),
        dueDate: new Date(dueDate),
        status: 'active',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: user.displayName || user.email,
        guarantorName: newInstallment.guarantorName?.trim() || '',
        guarantorPhone: newInstallment.guarantorPhone?.trim() || '',
        notes: newInstallment.notes?.trim() || ''
      };

      // Reduce stock quantity
      if (selectedStock.quantity > 0) {
        await updateDoc(doc(db, 'stocks', selectedStock.id), {
          quantity: parseInt(selectedStock.quantity) - 1,
          updatedAt: serverTimestamp(),
          lastSoldAt: serverTimestamp()
        });
      }

      const installmentRef = await addDoc(collection(db, 'installments'), installmentData);
      const installmentId = installmentRef.id;

      // Record initial payment
      const paymentData = {
        installmentId: installmentId,
        customerName: installmentData.customerName,
        customerPhone: installmentData.customerPhone,
        amount: initialPayment,
        paymentType: 'initial',
        paymentDate: new Date(),
        paymentMethod: 'cash',
        receiptNumber: `INIT-${Date.now()}`,
        recordedBy: user.uid,
        recordedByName: user.displayName || user.email,
        createdAt: serverTimestamp(),
        notes: 'Initial payment (60% of retail price)'
      };

      await addDoc(collection(db, 'installmentPayments'), paymentData);

      // Reset form
      setNewInstallment({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        customerAddress: '',
        itemId: '',
        itemName: '',
        totalAmount: '',
        initialPayment: '',
        totalInstallments: 12,
        installmentAmount: '',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        status: 'active',
        paymentFrequency: 'monthly',
        guarantorName: '',
        guarantorPhone: '',
        notes: ''
      });

      setSuccess('Installment plan created successfully!');
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
      const totalPaid = installmentPayments
        .filter(p => p.installmentId === paymentForm.installmentId)
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + paymentAmount;

      const paymentData = {
        installmentId: paymentForm.installmentId,
        customerName: installment.customerName,
        customerPhone: installment.customerPhone,
        amount: paymentAmount,
        paymentType: 'installment',
        paymentDate: new Date(paymentForm.paymentDate),
        paymentMethod: paymentForm.paymentMethod,
        reference: paymentForm.reference || '',
        receiptNumber: paymentForm.receiptNumber || `PAY-${Date.now()}`,
        collectedBy: paymentForm.collectedBy || user.displayName || user.email,
        recordedBy: user.uid,
        recordedByName: user.displayName || user.email,
        notes: paymentForm.notes || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'installmentPayments'), paymentData);

      // Update installment status if fully paid
      let newStatus = installment.status;
      if (totalPaid >= installment.totalAmount) {
        newStatus = 'completed';
      }

      await updateDoc(doc(db, 'installments', paymentForm.installmentId), {
        paidAmount: totalPaid,
        remainingAmount: installment.totalAmount - totalPaid,
        status: newStatus,
        lastPaymentDate: new Date(paymentForm.paymentDate),
        updatedAt: serverTimestamp()
      });

      // Reset form
      setPaymentForm({
        installmentId: '',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        reference: '',
        receiptNumber: '',
        collectedBy: '',
        notes: ''
      });

      setSuccess('Payment recorded successfully!');
      fetchAllData();
    } catch (error) {
      setError('Failed to record payment: ' + error.message);
    }
  };

  // Generate Reports
  const generateInstallmentReportPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Header with theme color
      doc.setFillColor(THEMES[theme].primary.replace('#', ''));
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Installment Processing Report', pageWidth / 2, 30, { align: 'center' });

      // Report Info
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${new Date().toLocaleString('en-MW')}`, 20, 50);
      doc.text(`Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`, 20, 57);
      doc.text(`Location: ${reportFilters.location === 'all' ? 'All Locations' : reportFilters.location}`, 20, 64);
      doc.text(`Status: ${reportFilters.status === 'all' ? 'All Statuses' : reportFilters.status}`, 20, 71);

      // Summary Stats Box
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(20, 80, pageWidth - 40, 40, 3, 3, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY STATISTICS', 30, 95);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const stats = [
        `Total Active: ${installmentReport.totalActiveInstallments}`,
        `Total Paid: ${formatCurrency(installmentReport.totalPaidAmount)}`,
        `Pending Amount: ${formatCurrency(installmentReport.totalPendingAmount)}`,
        `Overdue: ${installmentReport.overdueInstallments}`,
        `Completed: ${installmentReport.completedInstallments}`,
        `This Month: ${formatCurrency(installmentReport.thisMonthPayments)}`
      ];
      
      stats.forEach((stat, index) => {
        const x = 30 + (index % 3) * ((pageWidth - 60) / 3);
        const y = 110 + Math.floor(index / 3) * 10;
        doc.text(stat, x, y);
      });

      // Installment Details Table
      const tableData = filteredInstallments.map(installment => {
        const paidAmount = installmentPayments
          .filter(p => p.installmentId === installment.id)
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
        const isOverdue = installment.dueDate && 
          (installment.dueDate.toDate ? installment.dueDate.toDate() : new Date(installment.dueDate)) < new Date();
        
        return [
          installment.customerName,
          installment.customerPhone,
          installment.itemName,
          installment.location,
          formatCurrency(parseFloat(installment.totalAmount)),
          formatCurrency(paidAmount),
          formatCurrency(pendingAmount),
          installment.status + (isOverdue && installment.status === 'active' ? ' (Overdue)' : ''),
          installment.startDate.toDate ? 
            installment.startDate.toDate().toLocaleDateString('en-MW') : 
            new Date(installment.startDate).toLocaleDateString('en-MW')
        ];
      });

      autoTable(doc, {
        startY: 130,
        head: [['Customer', 'Phone', 'Item', 'Location', 'Total Amount', 'Paid', 'Pending', 'Status', 'Start Date']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: THEMES[theme].primary.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)),
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
        margin: { top: 130 },
        styles: {
          overflow: 'linebreak',
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 25 },
          2: { cellWidth: 40 },
          3: { cellWidth: 25 },
          4: { cellWidth: 30 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
          7: { cellWidth: 25 },
          8: { cellWidth: 25 }
        }
      });

      // Footer
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Confidential - For Internal Use Only', pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text(`Page 1 of 1`, pageWidth - 20, pageHeight - 10, { align: 'right' });

      // Save PDF
      const filename = `KM_Installment_Report_${new Date().getTime()}.pdf`;
      doc.save(filename);

      setSuccess('Installment report generated successfully!');
    } catch (error) {
      setError('Failed to generate PDF report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateStockBalanceReportPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Header
      doc.setFillColor(THEMES[theme].primary.replace('#', ''));
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Stock Balance Report', pageWidth / 2, 30, { align: 'center' });

      // Report Info
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${new Date().toLocaleString('en-MW')}`, 20, 50);
      doc.text(`Location: ${selectedLocation === 'all' ? 'All Locations' : selectedLocation}`, 20, 57);
      doc.text(`Category: ${selectedCategory === 'all' ? 'All Categories' : selectedCategory}`, 20, 64);

      // Summary Stats
      const totalValue = filteredStocks.reduce((sum, stock) => {
        return sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0));
      }, 0);

      const totalRetailValue = filteredStocks.reduce((sum, stock) => {
        return sum + ((parseFloat(stock.retailPrice) || parseFloat(stock.salePrice) || 0) * (parseInt(stock.quantity) || 0));
      }, 0);

      doc.setFillColor(245, 245, 245);
      doc.roundedRect(20, 75, pageWidth - 40, 25, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 30, 90);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Items: ${filteredStocks.length}`, 30, 100);
      doc.text(`Total Quantity: ${filteredStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)}`, 100, 100);
      doc.text(`Total Cost Value: ${formatCurrency(totalValue)}`, 180, 100);
      doc.text(`Total Retail Value: ${formatCurrency(totalRetailValue)}`, 260, 100);

      // Stock Table
      const tableData = filteredStocks.map(stock => [
        stock.location,
        stock.itemCode,
        `${stock.brand} ${stock.model}`,
        stock.category || 'N/A',
        stock.color || 'N/A',
        stock.storage || 'N/A',
        parseInt(stock.quantity) || 0,
        formatCurrency(parseFloat(stock.costPrice) || parseFloat(stock.orderPrice) || 0),
        formatCurrency(parseFloat(stock.retailPrice) || parseFloat(stock.salePrice) || 0),
        formatCurrency(parseFloat(stock.wholesalePrice) || ((parseFloat(stock.salePrice) || 0) * 0.8)),
        formatCurrency((parseFloat(stock.costPrice) || parseFloat(stock.orderPrice) || 0) * (parseInt(stock.quantity) || 0))
      ]);

      autoTable(doc, {
        startY: 110,
        head: [['Location', 'Item Code', 'Product', 'Category', 'Color', 'Storage', 'Qty', 'Cost', 'Retail', 'Wholesale', 'Total Value']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: THEMES[theme].primary.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)),
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8
        },
        bodyStyles: {
          fontSize: 7,
          textColor: 50
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { top: 110 },
        styles: {
          overflow: 'linebreak',
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 30 },
          2: { cellWidth: 35 },
          3: { cellWidth: 20 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 },
          6: { cellWidth: 15 },
          7: { cellWidth: 25 },
          8: { cellWidth: 25 },
          9: { cellWidth: 25 },
          10: { cellWidth: 30 }
        }
      });

      // Low Stock Warning
      const lowStockItems = filteredStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) &&
        (parseInt(stock.quantity) || 0) > 0
      );

      const outOfStockItems = filteredStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) === 0
      );

      if (lowStockItems.length > 0 || outOfStockItems.length > 0) {
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        
        if (lowStockItems.length > 0) {
          doc.setTextColor(255, 140, 0); // Orange
          doc.text('LOW STOCK ITEMS:', 20, finalY);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          lowStockItems.forEach((stock, index) => {
            doc.text(`${stock.itemCode} - ${stock.brand} ${stock.model}: ${stock.quantity} units (Min: ${stock.minStockLevel || 5})`, 
              20, finalY + 10 + (index * 5));
          });
        }

        if (outOfStockItems.length > 0) {
          const startY = finalY + 10 + (lowStockItems.length * 5);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 0, 0); // Red
          doc.text('OUT OF STOCK ITEMS:', 20, startY);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          outOfStockItems.forEach((stock, index) => {
            doc.text(`${stock.itemCode} - ${stock.brand} ${stock.model}`, 
              20, startY + 10 + (index * 5));
          });
        }
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Confidential - For Internal Use Only', pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text(`Page 1 of 1`, pageWidth - 20, pageHeight - 10, { align: 'right' });

      // Save PDF
      const filename = `KM_Stock_Balance_Report_${new Date().getTime()}.pdf`;
      doc.save(filename);

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
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(THEMES[theme].primary.replace('#', ''));
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('Sales Analysis Report', pageWidth / 2, 30, { align: 'center' });

      // Report Info
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${new Date().toLocaleString('en-MW')}`, 20, 50);

      // Sales Summary
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(20, 60, pageWidth - 40, 60, 3, 3, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SALES SUMMARY', 30, 75);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const summary = [
        `Total Sales: ${salesAnalysis.totalSales}`,
        `Total Revenue: ${formatCurrency(salesAnalysis.totalRevenue)}`,
        `Monthly Revenue: ${formatCurrency(salesAnalysis.monthlyRevenue)}`,
        `Today's Sales: ${realTimeSales.todaySales}`,
        `Today's Revenue: ${formatCurrency(realTimeSales.todayRevenue)}`,
        `Weekly Growth: ${salesAnalysis.weeklyGrowth.toFixed(1)}%`
      ];
      
      summary.forEach((item, index) => {
        const x = 30 + (index % 2) * ((pageWidth - 60) / 2);
        const y = 90 + Math.floor(index / 2) * 10;
        doc.text(item, x, y);
      });

      // Revenue by Location
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('REVENUE BY LOCATION', 20, 135);
      
      const locationData = Object.entries(salesAnalysis.revenueByLocation || {})
        .map(([location, revenue]) => [location, formatCurrency(revenue)]);
      
      autoTable(doc, {
        startY: 140,
        head: [['Location', 'Revenue']],
        body: locationData,
        theme: 'striped',
        headStyles: {
          fillColor: THEMES[theme].primary.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)),
          textColor: 255,
          fontStyle: 'bold'
        }
      });

      // Top Products
      const topProducts = Object.entries(salesAnalysis.topProducts || {})
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(item => [item.product, item.count.toString()]);

      if (topProducts.length > 0) {
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('TOP 10 PRODUCTS', 20, finalY);
        
        autoTable(doc, {
          startY: finalY + 5,
          head: [['Product', 'Sales Count']],
          body: topProducts,
          theme: 'striped',
          headStyles: {
            fillColor: THEMES[theme].primary.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)),
            textColor: 255,
            fontStyle: 'bold'
          }
        });
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('Confidential - For Internal Use Only', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

      // Save PDF
      const filename = `KM_Sales_Report_${new Date().getTime()}.pdf`;
      doc.save(filename);

      setSuccess('Sales report generated successfully!');
    } catch (error) {
      setError('Failed to generate sales report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateExcelReport = (type) => {
    try {
      const wb = XLSX.utils.book_new();
      
      if (type === 'stocks') {
        const stockData = filteredStocks.map(stock => ({
          'Location': stock.location,
          'Item Code': stock.itemCode,
          'Brand': stock.brand,
          'Model': stock.model,
          'Category': stock.category,
          'Color': stock.color,
          'Storage': stock.storage,
          'Quantity': parseInt(stock.quantity) || 0,
          'Cost Price': parseFloat(stock.costPrice) || 0,
          'Retail Price': parseFloat(stock.retailPrice) || 0,
          'Wholesale Price': parseFloat(stock.wholesalePrice) || 0,
          'Total Cost Value': (parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0),
          'Min Stock Level': parseInt(stock.minStockLevel) || 5,
          'Reorder Quantity': parseInt(stock.reorderQuantity) || 10,
          'Supplier': stock.supplier || '',
          'Warranty Period': stock.warrantyPeriod || '12 months',
          'Description': stock.description || ''
        }));
        
        const ws = XLSX.utils.json_to_sheet(stockData);
        XLSX.utils.book_append_sheet(wb, ws, 'Stock Inventory');
        
        // Add summary sheet
        const summaryData = [
          ['KM ELECTRONICS - STOCK INVENTORY REPORT'],
          ['Generated on:', new Date().toLocaleString('en-MW')],
          ['Location Filter:', selectedLocation === 'all' ? 'All Locations' : selectedLocation],
          ['Category Filter:', selectedCategory === 'all' ? 'All Categories' : selectedCategory],
          [],
          ['SUMMARY STATISTICS'],
          ['Total Items:', filteredStocks.length],
          ['Total Quantity:', filteredStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)],
          ['Total Cost Value:', filteredStocks.reduce((sum, stock) => sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0)],
          ['Low Stock Items:', dashboardStats.lowStockItems],
          ['Out of Stock Items:', dashboardStats.outOfStockItems]
        ];
        
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
        
        const filename = `KM_Stock_Report_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, filename);
        setSuccess('Excel stock report generated successfully!');
      }
      else if (type === 'installments') {
        const installmentData = filteredInstallments.map(installment => {
          const paidAmount = installmentPayments
            .filter(p => p.installmentId === installment.id)
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
          const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
          const isOverdue = installment.dueDate && 
            (installment.dueDate.toDate ? installment.dueDate.toDate() : new Date(installment.dueDate)) < new Date();
          
          return {
            'Customer Name': installment.customerName,
            'Customer Phone': installment.customerPhone,
            'Customer Email': installment.customerEmail || '',
            'Item': installment.itemName,
            'Item Code': installment.itemCode,
            'Location': installment.location,
            'Total Amount': parseFloat(installment.totalAmount) || 0,
            'Initial Payment': parseFloat(installment.initialPayment) || 0,
            'Paid Amount': paidAmount,
            'Pending Amount': pendingAmount,
            'Installment Amount': parseFloat(installment.installmentAmount) || 0,
            'Total Installments': installment.totalInstallments || 0,
            'Start Date': installment.startDate.toDate ? 
              installment.startDate.toDate().toLocaleDateString('en-MW') : 
              new Date(installment.startDate).toLocaleDateString('en-MW'),
            'Due Date': installment.dueDate ? 
              (installment.dueDate.toDate ? 
                installment.dueDate.toDate().toLocaleDateString('en-MW') : 
                new Date(installment.dueDate).toLocaleDateString('en-MW')) : '',
            'Status': installment.status + (isOverdue && installment.status === 'active' ? ' (Overdue)' : ''),
            'Guarantor Name': installment.guarantorName || '',
            'Guarantor Phone': installment.guarantorPhone || '',
            'Notes': installment.notes || ''
          };
        });
        
        const ws = XLSX.utils.json_to_sheet(installmentData);
        XLSX.utils.book_append_sheet(wb, ws, 'Installments');
        
        // Add payments sheet
        const paymentData = installmentPayments.map(payment => ({
          'Receipt Number': payment.receiptNumber || '',
          'Customer Name': payment.customerName,
          'Customer Phone': payment.customerPhone,
          'Amount': parseFloat(payment.amount) || 0,
          'Payment Type': payment.paymentType,
          'Payment Method': payment.paymentMethod,
          'Payment Date': payment.paymentDate.toDate ? 
            payment.paymentDate.toDate().toLocaleDateString('en-MW') : 
            new Date(payment.paymentDate).toLocaleDateString('en-MW'),
          'Reference': payment.reference || '',
          'Collected By': payment.collectedBy || '',
          'Recorded By': payment.recordedByName || '',
          'Notes': payment.notes || ''
        }));
        
        const paymentWs = XLSX.utils.json_to_sheet(paymentData);
        XLSX.utils.book_append_sheet(wb, paymentWs, 'Payments');
        
        const filename = `KM_Installment_Report_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, filename);
        setSuccess('Excel installment report generated successfully!');
      }
      
    } catch (error) {
      setError('Failed to generate Excel report: ' + error.message);
    }
  };

  // Export to CSV
  const exportToCSV = (type) => {
    try {
      let csvContent = '';
      let filename = '';
      
      if (type === 'stocks') {
        csvContent = 'Location,Item Code,Brand,Model,Category,Color,Storage,Quantity,Cost Price,Retail Price,Wholesale Price,Total Cost Value,Min Stock Level,Reorder Quantity,Supplier,Warranty Period,Description\n';
        
        filteredStocks.forEach(stock => {
          const row = [
            stock.location,
            stock.itemCode,
            stock.brand,
            stock.model,
            stock.category || '',
            stock.color || '',
            stock.storage || '',
            parseInt(stock.quantity) || 0,
            parseFloat(stock.costPrice) || 0,
            parseFloat(stock.retailPrice) || 0,
            parseFloat(stock.wholesalePrice) || 0,
            (parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0),
            parseInt(stock.minStockLevel) || 5,
            parseInt(stock.reorderQuantity) || 10,
            stock.supplier || '',
            stock.warrantyPeriod || '12',
            stock.description || ''
          ].map(field => `"${field}"`).join(',');
          
          csvContent += row + '\n';
        });
        
        filename = `KM_Stock_Report_${new Date().getTime()}.csv`;
      }
      else if (type === 'installments') {
        csvContent = 'Customer Name,Customer Phone,Customer Email,Item,Item Code,Location,Total Amount,Initial Payment,Paid Amount,Pending Amount,Installment Amount,Total Installments,Start Date,Due Date,Status,Guarantor Name,Guarantor Phone,Notes\n';
        
        filteredInstallments.forEach(installment => {
          const paidAmount = installmentPayments
            .filter(p => p.installmentId === installment.id)
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
          const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
          const isOverdue = installment.dueDate && 
            (installment.dueDate.toDate ? installment.dueDate.toDate() : new Date(installment.dueDate)) < new Date();
          
          const row = [
            installment.customerName,
            installment.customerPhone,
            installment.customerEmail || '',
            installment.itemName,
            installment.itemCode,
            installment.location,
            parseFloat(installment.totalAmount) || 0,
            parseFloat(installment.initialPayment) || 0,
            paidAmount,
            pendingAmount,
            parseFloat(installment.installmentAmount) || 0,
            installment.totalInstallments || 0,
            installment.startDate.toDate ? 
              installment.startDate.toDate().toLocaleDateString('en-MW') : 
              new Date(installment.startDate).toLocaleDateString('en-MW'),
            installment.dueDate ? 
              (installment.dueDate.toDate ? 
                installment.dueDate.toDate().toLocaleDateString('en-MW') : 
                new Date(installment.dueDate).toLocaleDateString('en-MW')) : '',
            installment.status + (isOverdue && installment.status === 'active' ? ' (Overdue)' : ''),
            installment.guarantorName || '',
            installment.guarantorPhone || '',
            installment.notes || ''
          ].map(field => `"${field}"`).join(',');
          
          csvContent += row + '\n';
        });
        
        filename = `KM_Installment_Report_${new Date().getTime()}.csv`;
      }
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setSuccess('CSV report generated successfully!');
    } catch (error) {
      setError('Failed to generate CSV report: ' + error.message);
    }
  };

  // Clear messages after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setError(null);
      setSuccess(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, success]);

  // Authentication and initial data fetch
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
              
              // Set up real-time listeners
              const stocksUnsubscribe = onSnapshot(collection(db, 'stocks'), () => {
                fetchAllData();
              });
              
              const installmentsUnsubscribe = onSnapshot(collection(db, 'installments'), () => {
                fetchAllData();
              });
              
              const paymentsUnsubscribe = onSnapshot(collection(db, 'installmentPayments'), () => {
                fetchAllData();
              });
              
              return () => {
                stocksUnsubscribe();
                installmentsUnsubscribe();
                paymentsUnsubscribe();
              };
            } else {
              router.push('/dashboard');
            }
          } else {
            router.push('/login');
          }
        } catch (error) {
          setError('Authentication error: ' + error.message);
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
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="text-white mt-4">Loading SuperAdmin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Messages */}
      {error && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <FiAlertCircle />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 text-white hover:text-gray-200">✕</button>
          </div>
        </div>
      )}
      
      {success && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <span>✅</span>
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-4 text-white hover:text-gray-200">✕</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/10 backdrop-blur-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="bg-red-500/20 p-2 rounded-lg">
                <FaDatabase className="text-2xl text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  KM ELECTRONICS <span className="text-red-500">SuperAdmin</span>
                </h1>
                <p className="text-white/70 text-sm">
                  Welcome, {user?.displayName || user?.email} | System Administrator
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white appearance-none pr-8"
                >
                  <option value="all">📍 All Locations</option>
                  {LOCATIONS.map((location, index) => (
                    <option key={generateSafeKey('location-option', index, location)} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              <div className="relative">
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white appearance-none pr-8"
                >
                  <option value="dark">🌙 Dark Theme</option>
                  <option value="blue">🔵 Blue Theme</option>
                  <option value="purple">🟣 Purple Theme</option>
                </select>
              </div>
              
              <button
                onClick={() => signOut(auth).then(() => router.push('/login'))}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>🚪</span>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-white/20">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {[
              { id: 'dashboard', name: 'Dashboard', icon: '📊' },
              { id: 'stocks', name: 'Stock Management', icon: '📦' },
              { id: 'installments', name: 'Installments', icon: '💰' },
              { id: 'reports', name: 'Reports', icon: '📄' },
              { id: 'sales', name: 'Sales Analytics', icon: '📈' },
              { id: 'personnel', name: 'Personnel', icon: '👥' },
              { id: 'settings', name: 'Settings', icon: '⚙️' }
            ].map((tab, index) => (
              <button
                key={generateSafeKey('tab', index, tab.id)}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.name}</span>
                {tab.id === 'installments' && installmentReport.totalActiveInstallments > 0 && (
                  <span className="ml-2 bg-red-500 text-white py-0.5 px-2 rounded-full text-xs">
                    {installmentReport.totalActiveInstallments}
                  </span>
                )}
                {tab.id === 'stocks' && dashboardStats.lowStockItems > 0 && (
                  <span className="ml-2 bg-orange-500 text-white py-0.5 px-2 rounded-full text-xs">
                    {dashboardStats.lowStockItems}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="py-6">
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-500/20 rounded-lg">
                      <FiPackage className="text-2xl text-blue-400" />
                    </div>
                    <span className={`text-sm font-semibold ${realTimeSales.salesTrend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                      {getTrendIcon(realTimeSales.salesTrend)} Today
                    </span>
                  </div>
                  <h3 className="text-white/70 text-sm mb-1">Total Stock Value</h3>
                  <p className="text-2xl font-bold text-blue-400">
                    {formatCurrency(dashboardStats.totalStockValue)}
                  </p>
                  <p className="text-white/50 text-sm mt-2">
                    {filteredStocks.length} items • {dashboardStats.lowStockItems} low stock
                  </p>
                </div>
                
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-500/20 rounded-lg">
                      <FaMoneyBillWave className="text-2xl text-green-400" />
                    </div>
                    <span className="text-sm font-semibold text-green-400">
                      {installmentReport.thisMonthPayments > 0 ? '↗' : '→'} This Month
                    </span>
                  </div>
                  <h3 className="text-white/70 text-sm mb-1">Active Installments</h3>
                  <p className="text-2xl font-bold text-green-400">
                    {installmentReport.totalActiveInstallments}
                  </p>
                  <p className="text-white/50 text-sm mt-2">
                    {formatCurrency(installmentReport.totalPendingAmount)} pending • {installmentReport.overdueInstallments} overdue
                  </p>
                </div>
                
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-purple-500/20 rounded-lg">
                      <FiTrendingUp className="text-2xl text-purple-400" />
                    </div>
                    <span className={`text-sm font-semibold ${salesAnalysis.weeklyGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {salesAnalysis.weeklyGrowth >= 0 ? '↗' : '↘'} {Math.abs(salesAnalysis.weeklyGrowth).toFixed(1)}%
                    </span>
                  </div>
                  <h3 className="text-white/70 text-sm mb-1">Today's Sales</h3>
                  <p className="text-2xl font-bold text-purple-400">
                    {realTimeSales.todaySales}
                  </p>
                  <p className="text-white/50 text-sm mt-2">
                    {formatCurrency(realTimeSales.todayRevenue)} revenue
                  </p>
                </div>
                
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-orange-500/20 rounded-lg">
                      <FiAlertCircle className="text-2xl text-orange-400" />
                    </div>
                    <span className="text-sm font-semibold text-orange-400">
                      ⚠️ Attention Needed
                    </span>
                  </div>
                  <h3 className="text-white/70 text-sm mb-1">Stock Alerts</h3>
                  <p className="text-2xl font-bold text-orange-400">
                    {dashboardStats.lowStockItems + dashboardStats.outOfStockItems}
                  </p>
                  <p className="text-white/50 text-sm mt-2">
                    {dashboardStats.lowStockItems} low • {dashboardStats.outOfStockItems} out of stock
                  </p>
                </div>
              </div>

              {/* Quick Actions & Live Feed */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Actions */}
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setActiveTab('stocks')}
                      className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg transition-all transform hover:scale-[1.02] flex flex-col items-center justify-center"
                    >
                      <FaEdit className="text-2xl mb-2" />
                      <span>Manage Stocks</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('installments')}
                      className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg transition-all transform hover:scale-[1.02] flex flex-col items-center justify-center"
                    >
                      <FaMoneyBillWave className="text-2xl mb-2" />
                      <span>Installments</span>
                    </button>
                    <button
                      onClick={generateStockBalanceReportPDF}
                      className="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg transition-all transform hover:scale-[1.02] flex flex-col items-center justify-center"
                    >
                      <FaFilePdf className="text-2xl mb-2" />
                      <span>Stock Report</span>
                    </button>
                    <button
                      onClick={generateInstallmentReportPDF}
                      className="bg-orange-600 hover:bg-orange-700 text-white p-4 rounded-lg transition-all transform hover:scale-[1.02] flex flex-col items-center justify-center"
                    >
                      <FaChartLine className="text-2xl mb-2" />
                      <span>Installment Report</span>
                    </button>
                  </div>
                </div>

                {/* Live Sales Feed */}
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-white">Live Sales Feed</h2>
                    <span className="text-green-400 text-sm flex items-center">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></div>
                      Live
                    </span>
                  </div>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {realTimeSales.liveSales.map((sale, index) => (
                      <div key={generateSafeKey('live-sale', index, sale.id)} className="flex justify-between items-center p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                        <div>
                          <div className="text-white font-medium">{sale.brand} {sale.model}</div>
                          <div className="text-white/70 text-sm">
                            {sale.location} • {sale.soldByName || sale.soldBy}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-semibold">{formatCurrency(sale.finalSalePrice || 0)}</div>
                          <div className="text-white/50 text-xs">
                            {sale.soldAt?.toDate ? 
                              sale.soldAt.toDate().toLocaleTimeString('en-MW', { hour: '2-digit', minute: '2-digit' }) : 
                              'Just now'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {realTimeSales.liveSales.length === 0 && (
                      <p className="text-white/70 text-center py-4">No sales today</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Selling Products & Installment Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Selling Products */}
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Top Selling Products Today</h2>
                  <div className="space-y-3">
                    {realTimeSales.topSellingProducts.map((product, index) => (
                      <div key={generateSafeKey('top-product', index, product.product)} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <span className="text-white/70 text-sm">#{index + 1}</span>
                          <span className="text-white font-medium truncate">{product.product}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-blue-300 font-semibold">{product.count} sales</div>
                        </div>
                      </div>
                    ))}
                    {realTimeSales.topSellingProducts.length === 0 && (
                      <p className="text-white/70 text-center py-4">No sales today</p>
                    )}
                  </div>
                </div>

                {/* Installment Overview */}
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h2 className="text-xl font-semibold text-white mb-4">Installment Overview</h2>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">Active Installments</span>
                      <span className="text-green-400 font-semibold">{installmentReport.totalActiveInstallments}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">Total Paid Amount</span>
                      <span className="text-green-400 font-semibold">{formatCurrency(installmentReport.totalPaidAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">Pending Amount</span>
                      <span className="text-orange-400 font-semibold">{formatCurrency(installmentReport.totalPendingAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">Overdue Installments</span>
                      <span className="text-red-400 font-semibold">{installmentReport.overdueInstallments}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/70">This Month Payments</span>
                      <span className="text-blue-400 font-semibold">{formatCurrency(installmentReport.thisMonthPayments)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Sales Chart */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Daily Sales (Last 7 Days)</h2>
                <div className="grid grid-cols-7 gap-2 h-40">
                  {salesAnalysis.dailySales.map((day, index) => {
                    const maxRevenue = Math.max(...salesAnalysis.dailySales.map(d => d.revenue));
                    const height = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                    
                    return (
                      <div key={generateSafeKey('day', index, day.date)} className="flex flex-col items-center justify-end">
                        <div className="text-white/70 text-xs mb-1 text-center">{day.date.split(' ')[0]}</div>
                        <div className="w-full flex flex-col items-center">
                          <div 
                            className="w-3/4 bg-linear-to-t from-blue-500 to-blue-600 rounded-t-lg transition-all hover:from-blue-400 hover:to-blue-500"
                            style={{ height: `${height}%` }}
                          ></div>
                          <div className="text-white/50 text-xs mt-1">{day.sales}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Stock Management Tab */}
          {activeTab === 'stocks' && (
            <div className="space-y-6">
              {/* Stock Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-400">{filteredStocks.length}</div>
                  <div className="text-white/70 text-sm">Total Items</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-400">
                    {filteredStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)}
                  </div>
                  <div className="text-white/70 text-sm">Total Quantity</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-400">
                    {formatCurrency(filteredStocks.reduce((sum, stock) => {
                      return sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0));
                    }, 0))}
                  </div>
                  <div className="text-white/70 text-sm">Total Cost Value</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-400">{dashboardStats.lowStockItems}</div>
                  <div className="text-white/70 text-sm">Low Stock Items</div>
                </div>
              </div>

              {/* Stock Filters */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Search Stocks</label>
                    <div className="relative">
                      <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" />
                      <input
                        type="text"
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-3 py-2 text-white placeholder-white/50"
                        placeholder="Search by brand, model, item code..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Filter by Category</label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="all">All Categories</option>
                      {CATEGORIES.map((category, index) => (
                        <option key={generateSafeKey('category', index, category)} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Actions</label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setStockSearch('')}
                        className="flex-1 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors"
                      >
                        Clear Filters
                      </button>
                      <button
                        onClick={generateStockBalanceReportPDF}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                      >
                        <FaFilePdf />
                        <span>Export PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Form */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">
                  {editingStock ? '✏️ Edit Stock Item' : '➕ Add New Stock'}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {/* Basic Information */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Basic Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Brand *</label>
                        <input
                          type="text"
                          value={stockForm.brand}
                          onChange={(e) => setStockForm({...stockForm, brand: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., Samsung"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Model *</label>
                        <input
                          type="text"
                          value={stockForm.model}
                          onChange={(e) => setStockForm({...stockForm, model: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., Galaxy S23"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Item Code *</label>
                        <input
                          type="text"
                          value={stockForm.itemCode}
                          onChange={(e) => setStockForm({...stockForm, itemCode: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., SAM-GS23-BLK-256"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Category *</label>
                        <select
                          value={stockForm.category}
                          onChange={(e) => setStockForm({...stockForm, category: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          required
                        >
                          {CATEGORIES.map((category, index) => (
                            <option key={generateSafeKey('form-category', index, category)} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Location & Quantity */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Location & Quantity</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Location *</label>
                        <select
                          value={stockForm.location}
                          onChange={(e) => setStockForm({...stockForm, location: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          required
                        >
                          <option value="">Select Location</option>
                          {LOCATIONS.map((location, index) => (
                            <option key={generateSafeKey('form-location', index, location)} value={location}>{location}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Quantity *</label>
                        <input
                          type="number"
                          min="0"
                          value={stockForm.quantity}
                          onChange={(e) => setStockForm({...stockForm, quantity: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 10"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Min Stock Level</label>
                        <input
                          type="number"
                          min="1"
                          value={stockForm.minStockLevel}
                          onChange={(e) => setStockForm({...stockForm, minStockLevel: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 5"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Reorder Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={stockForm.reorderQuantity}
                          onChange={(e) => setStockForm({...stockForm, reorderQuantity: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 10"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Pricing Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Cost Price (MK) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockForm.costPrice}
                          onChange={(e) => setStockForm({...stockForm, costPrice: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 500000"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Retail Price (MK) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockForm.retailPrice}
                          onChange={(e) => setStockForm({...stockForm, retailPrice: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 750000"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Wholesale Price (MK)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockForm.wholesalePrice}
                          onChange={(e) => setStockForm({...stockForm, wholesalePrice: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 600000"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Discount %</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={stockForm.discountPercentage}
                          onChange={(e) => setStockForm({...stockForm, discountPercentage: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 10"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional Details */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Color</label>
                        <input
                          type="text"
                          value={stockForm.color}
                          onChange={(e) => setStockForm({...stockForm, color: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., Black"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Storage</label>
                        <input
                          type="text"
                          value={stockForm.storage}
                          onChange={(e) => setStockForm({...stockForm, storage: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., 256GB"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Supplier</label>
                        <input
                          type="text"
                          value={stockForm.supplier}
                          onChange={(e) => setStockForm({...stockForm, supplier: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="e.g., Supplier Name"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Warranty Period</label>
                        <select
                          value={stockForm.warrantyPeriod}
                          onChange={(e) => setStockForm({...stockForm, warrantyPeriod: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="3">3 Months</option>
                          <option value="6">6 Months</option>
                          <option value="12">12 Months</option>
                          <option value="24">24 Months</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <label className="block text-white/70 text-sm mb-2">Description</label>
                      <textarea
                        value={stockForm.description}
                        onChange={(e) => setStockForm({...stockForm, description: e.target.value})}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                        placeholder="Additional details about the product..."
                        rows="2"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-4">
                  {editingStock ? (
                    <>
                      <button
                        onClick={handleUpdateStock}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <FaSave />
                        <span>Update Stock</span>
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleAddStock}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <span>+</span>
                      <span>Add Stock Item</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Stocks List */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-white">
                    Stock Inventory • {filteredStocks.length} items
                  </h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => generateExcelReport('stocks')}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFileExcel />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() => exportToCSV('stocks')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFileCsv />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={generateStockBalanceReportPDF}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFilePdf />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>
                
                {filteredStocks.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">No stock items found</div>
                    <p className="text-white/70">Try adjusting your search or filters</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto" ref={stockTableRef}>
                    <table className="w-full text-white">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left py-3 px-2">Item Code</th>
                          <th className="text-left py-3 px-2">Product</th>
                          <th className="text-left py-3 px-2">Category</th>
                          <th className="text-left py-3 px-2">Location</th>
                          <th className="text-left py-3 px-2">Quantity</th>
                          <th className="text-left py-3 px-2">Cost</th>
                          <th className="text-left py-3 px-2">Retail</th>
                          <th className="text-left py-3 px-2">Total Value</th>
                          <th className="text-left py-3 px-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStocks.map((stock, index) => {
                          const isLowStock = (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5);
                          const isOutOfStock = (parseInt(stock.quantity) || 0) === 0;
                          const totalValue = (parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0);
                          
                          return (
                            <tr 
                              key={generateSafeKey('stock', index, stock.id)} 
                              className={`border-b border-white/10 hover:bg-white/5 transition-colors ${
                                isOutOfStock ? 'bg-red-500/10' : isLowStock ? 'bg-orange-500/10' : ''
                              }`}
                            >
                              <td className="py-3 px-2">
                                <div className="font-mono text-sm">{stock.itemCode}</div>
                                <div className="text-white/50 text-xs">{stock.color} • {stock.storage}</div>
                              </td>
                              <td className="py-3 px-2">
                                <div className="font-medium">{stock.brand} {stock.model}</div>
                                {stock.description && (
                                  <div className="text-white/70 text-xs truncate max-w-xs">{stock.description}</div>
                                )}
                              </td>
                              <td className="py-3 px-2">
                                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                                  {stock.category || 'N/A'}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                                  {stock.location}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <div className={`font-semibold ${
                                  isOutOfStock ? 'text-red-400' : isLowStock ? 'text-orange-400' : 'text-white'
                                }`}>
                                  {stock.quantity || 0}
                                </div>
                                {isLowStock && !isOutOfStock && (
                                  <div className="text-orange-400 text-xs">Min: {stock.minStockLevel || 5}</div>
                                )}
                              </td>
                              <td className="py-3 px-2">{formatCurrency(parseFloat(stock.costPrice) || 0)}</td>
                              <td className="py-3 px-2">{formatCurrency(parseFloat(stock.retailPrice) || parseFloat(stock.salePrice) || 0)}</td>
                              <td className="py-3 px-2 font-semibold">{formatCurrency(totalValue)}</td>
                              <td className="py-3 px-2">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleEditStock(stock)}
                                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
                                  >
                                    <FaEdit size={12} />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStock(stock.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors flex items-center space-x-1"
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
                )}
              </div>
            </div>
          )}

          {/* Installments Tab */}
          {activeTab === 'installments' && (
            <div className="space-y-6">
              {/* Installment Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-400">{installmentReport.totalActiveInstallments}</div>
                  <div className="text-white/70 text-sm">Active</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-400">{formatCurrency(installmentReport.totalPaidAmount)}</div>
                  <div className="text-white/70 text-sm">Total Paid</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-400">{formatCurrency(installmentReport.totalPendingAmount)}</div>
                  <div className="text-white/70 text-sm">Pending</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-red-400">{installmentReport.overdueInstallments}</div>
                  <div className="text-white/70 text-sm">Overdue</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-400">{formatCurrency(installmentReport.thisMonthPayments)}</div>
                  <div className="text-white/70 text-sm">This Month</div>
                </div>
              </div>

              {/* Create Installment */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Create New Installment Plan</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {/* Customer Information */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Customer Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Customer Name *</label>
                        <input
                          type="text"
                          value={newInstallment.customerName}
                          onChange={(e) => setNewInstallment({...newInstallment, customerName: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="Full Name"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Customer Phone *</label>
                        <input
                          type="tel"
                          value={newInstallment.customerPhone}
                          onChange={(e) => setNewInstallment({...newInstallment, customerPhone: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="0999 999 999"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Customer Email</label>
                        <input
                          type="email"
                          value={newInstallment.customerEmail}
                          onChange={(e) => setNewInstallment({...newInstallment, customerEmail: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="email@example.com"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Address</label>
                        <input
                          type="text"
                          value={newInstallment.customerAddress}
                          onChange={(e) => setNewInstallment({...newInstallment, customerAddress: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="Physical Address"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Item Selection */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Item Selection</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-white/70 text-sm mb-2">Select Item *</label>
                        <select
                          value={newInstallment.itemId}
                          onChange={(e) => {
                            const selected = stocks.find(s => s.id === e.target.value);
                            if (selected) {
                              const retailPrice = parseFloat(selected.retailPrice) || parseFloat(selected.salePrice) || 0;
                              const startPrice = calculateInstallmentStartPrice(retailPrice);
                              setNewInstallment({
                                ...newInstallment,
                                itemId: e.target.value,
                                itemName: `${selected.brand} ${selected.model}`,
                                totalAmount: retailPrice.toString(),
                                initialPayment: startPrice
                              });
                            }
                          }}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          required
                        >
                          <option value="">Select Product</option>
                          {stocks
                            .filter(stock => (parseInt(stock.quantity) || 0) > 0)
                            .map((stock, index) => (
                              <option key={generateSafeKey('installment-item', index, stock.id)} value={stock.id}>
                                {stock.brand} {stock.model} - {formatCurrency(parseFloat(stock.retailPrice) || parseFloat(stock.salePrice) || 0)}
                              </option>
                            ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Total Amount (MK) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newInstallment.totalAmount}
                          onChange={(e) => setNewInstallment({...newInstallment, totalAmount: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="Total amount"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Initial Payment (60%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={newInstallment.initialPayment}
                          onChange={(e) => setNewInstallment({...newInstallment, initialPayment: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="Initial payment"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Installment Details */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Installment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Installment Period</label>
                        <select
                          value={newInstallment.totalInstallments}
                          onChange={(e) => setNewInstallment({...newInstallment, totalInstallments: parseInt(e.target.value)})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="6">6 Months</option>
                          <option value="12">12 Months</option>
                          <option value="18">18 Months</option>
                          <option value="24">24 Months</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Start Date *</label>
                        <input
                          type="date"
                          value={newInstallment.startDate}
                          onChange={(e) => setNewInstallment({...newInstallment, startDate: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Due Date</label>
                        <input
                          type="date"
                          value={newInstallment.dueDate}
                          onChange={(e) => setNewInstallment({...newInstallment, dueDate: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Payment Frequency</label>
                        <select
                          value={newInstallment.paymentFrequency}
                          onChange={(e) => setNewInstallment({...newInstallment, paymentFrequency: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Bi-weekly</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Guarantor Information */}
                  <div className="md:col-span-2 lg:col-span-3">
                    <h3 className="text-white font-medium mb-2">Guarantor Information (Optional)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Guarantor Name</label>
                        <input
                          type="text"
                          value={newInstallment.guarantorName}
                          onChange={(e) => setNewInstallment({...newInstallment, guarantorName: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="Full Name"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Guarantor Phone</label>
                        <input
                          type="tel"
                          value={newInstallment.guarantorPhone}
                          onChange={(e) => setNewInstallment({...newInstallment, guarantorPhone: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                          placeholder="0999 999 999"
                        />
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <label className="block text-white/70 text-sm mb-2">Notes</label>
                      <textarea
                        value={newInstallment.notes}
                        onChange={(e) => setNewInstallment({...newInstallment, notes: e.target.value})}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                        placeholder="Additional notes..."
                        rows="2"
                      />
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handleCreateInstallment}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <span>+</span>
                  <span>Create Installment Plan</span>
                </button>
              </div>

              {/* Record Payment */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Record Payment</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Select Installment *</label>
                    <select
                      value={paymentForm.installmentId}
                      onChange={(e) => setPaymentForm({...paymentForm, installmentId: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                      required
                    >
                      <option value="">Select Installment</option>
                      {installments
                        .filter(i => i.status === 'active')
                        .map((installment, index) => {
                          const paidAmount = installmentPayments
                            .filter(p => p.installmentId === installment.id)
                            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                          const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
                          return (
                            <option key={generateSafeKey('payment-installment', index, installment.id)} value={installment.id}>
                              {installment.customerName} - {installment.itemName} (Pending: {formatCurrency(pendingAmount)})
                            </option>
                          );
                        })}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Amount (MK) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="Payment amount"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Payment Date</label>
                    <input
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm({...paymentForm, paymentDate: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Payment Method</label>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={(e) => setPaymentForm({...paymentForm, paymentMethod: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Receipt Number</label>
                    <input
                      type="text"
                      value={paymentForm.receiptNumber}
                      onChange={(e) => setPaymentForm({...paymentForm, receiptNumber: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="e.g., REC-001"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Reference</label>
                    <input
                      type="text"
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="Transaction reference"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Collected By</label>
                    <input
                      type="text"
                      value={paymentForm.collectedBy}
                      onChange={(e) => setPaymentForm({...paymentForm, collectedBy: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="Collector's name"
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-white/70 text-sm mb-2">Notes</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50"
                      placeholder="Payment notes..."
                      rows="2"
                    />
                  </div>
                </div>
                
                <button
                  onClick={handleRecordPayment}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <FaMoneyBillWave />
                  <span>Record Payment</span>
                </button>
              </div>

              {/* Installments List */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-white">
                    All Installments • {filteredInstallments.length} records
                  </h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => generateExcelReport('installments')}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFileExcel />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() => exportToCSV('installments')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFileCsv />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={generateInstallmentReportPDF}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <FaFilePdf />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>
                
                {/* Installment Filters */}
                <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Status</label>
                    <select
                      value={reportFilters.status}
                      onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Location</label>
                    <select
                      value={reportFilters.location}
                      onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="all">All Locations</option>
                      {LOCATIONS.map((location, index) => (
                        <option key={generateSafeKey('filter-location', index, location)} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Start Date</label>
                    <input
                      type="date"
                      value={reportFilters.startDate}
                      onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white/70 text-sm mb-2">End Date</label>
                    <input
                      type="date"
                      value={reportFilters.endDate}
                      onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
                
                {filteredInstallments.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-white/50 text-lg mb-2">No installments found</div>
                    <p className="text-white/70">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto" ref={installmentTableRef}>
                    <table className="w-full text-white">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left py-3 px-2">Customer</th>
                          <th className="text-left py-3 px-2">Phone</th>
                          <th className="text-left py-3 px-2">Item</th>
                          <th className="text-left py-3 px-2">Total Amount</th>
                          <th className="text-left py-3 px-2">Paid</th>
                          <th className="text-left py-3 px-2">Pending</th>
                          <th className="text-left py-3 px-2">Status</th>
                          <th className="text-left py-3 px-2">Start Date</th>
                          <th className="text-left py-3 px-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInstallments.map((installment, index) => {
                          const paidAmount = installmentPayments
                            .filter(p => p.installmentId === installment.id)
                            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                          const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
                          const isOverdue = installment.dueDate && 
                            (installment.dueDate.toDate ? installment.dueDate.toDate() : new Date(installment.dueDate)) < new Date();
                          
                          return (
                            <tr 
                              key={generateSafeKey('installment', index, installment.id)} 
                              className={`border-b border-white/10 hover:bg-white/5 transition-colors ${
                                isOverdue && installment.status === 'active' ? 'bg-red-500/10' : ''
                              }`}
                            >
                              <td className="py-3 px-2">
                                <div className="font-medium">{installment.customerName}</div>
                                {installment.customerEmail && (
                                  <div className="text-white/70 text-xs">{installment.customerEmail}</div>
                                )}
                              </td>
                              <td className="py-3 px-2">{installment.customerPhone}</td>
                              <td className="py-3 px-2">
                                <div>{installment.itemName}</div>
                                <div className="text-white/70 text-xs">{installment.location}</div>
                              </td>
                              <td className="py-3 px-2 font-semibold">{formatCurrency(parseFloat(installment.totalAmount) || 0)}</td>
                              <td className="py-3 px-2 text-green-400">{formatCurrency(paidAmount)}</td>
                              <td className="py-3 px-2 text-orange-400">{formatCurrency(pendingAmount)}</td>
                              <td className="py-3 px-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  installment.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                                  installment.status === 'active' ? 
                                    (isOverdue ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300') :
                                    'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {installment.status} {isOverdue && installment.status === 'active' ? '(Overdue)' : ''}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                {installment.startDate.toDate ? 
                                  installment.startDate.toDate().toLocaleDateString('en-MW') : 
                                  new Date(installment.startDate).toLocaleDateString('en-MW')}
                              </td>
                              <td className="py-3 px-2">
                                <button
                                  onClick={() => {
                                    const selectedInstallment = installments.find(i => i.id === installment.id);
                                    if (selectedInstallment) {
                                      setPaymentForm({
                                        ...paymentForm,
                                        installmentId: selectedInstallment.id,
                                        amount: selectedInstallment.installmentAmount?.toString() || ''
                                      });
                                    }
                                  }}
                                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors"
                                >
                                  Record Payment
                                </button>
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

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Report Type Selection */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Generate Reports</h2>
                
                <div className="flex flex-wrap gap-4 mb-6">
                  <button
                    onClick={() => setReportType('installments')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center space-x-2 ${
                      reportType === 'installments' 
                        ? 'bg-blue-600 text-white shadow-lg' 
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    <FaMoneyBillWave />
                    <span>Installment Report</span>
                  </button>
                  
                  <button
                    onClick={() => setReportType('stocks')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center space-x-2 ${
                      reportType === 'stocks' 
                        ? 'bg-blue-600 text-white shadow-lg' 
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    <FaWarehouse />
                    <span>Stock Balance Report</span>
                  </button>
                  
                  <button
                    onClick={() => setReportType('sales')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center space-x-2 ${
                      reportType === 'sales' 
                        ? 'bg-blue-600 text-white shadow-lg' 
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    <FaChartBar />
                    <span>Sales Analysis Report</span>
                  </button>
                </div>

                {/* Report Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  {reportType === 'installments' && (
                    <>
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Start Date</label>
                        <input
                          type="date"
                          value={reportFilters.startDate}
                          onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">End Date</label>
                        <input
                          type="date"
                          value={reportFilters.endDate}
                          onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Location</label>
                        <select
                          value={reportFilters.location}
                          onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Locations</option>
                          {LOCATIONS.map((location, index) => (
                            <option key={generateSafeKey('report-location', index, location)} value={location}>{location}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Status</label>
                        <select
                          value={reportFilters.status}
                          onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Statuses</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </div>
                    </>
                  )}
                  
                  {reportType === 'stocks' && (
                    <>
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Location</label>
                        <select
                          value={reportFilters.location}
                          onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Locations</option>
                          {LOCATIONS.map((location, index) => (
                            <option key={generateSafeKey('stock-report-location', index, location)} value={location}>{location}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Category</label>
                        <select
                          value={reportFilters.category}
                          onChange={(e) => setReportFilters({...reportFilters, category: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Categories</option>
                          {CATEGORIES.map((category, index) => (
                            <option key={generateSafeKey('stock-report-category', index, category)} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="md:col-span-2">
                        <label className="block text-white/70 text-sm mb-2">Stock Status</label>
                        <div className="flex space-x-4">
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-white text-sm">Show Low Stock Only</span>
                          </label>
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-white text-sm">Show Out of Stock</span>
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {reportType === 'sales' && (
                    <>
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Start Date</label>
                        <input
                          type="date"
                          value={reportFilters.startDate}
                          onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">End Date</label>
                        <input
                          type="date"
                          value={reportFilters.endDate}
                          onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Location</label>
                        <select
                          value={reportFilters.location}
                          onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Locations</option>
                          {LOCATIONS.map((location, index) => (
                            <option key={generateSafeKey('sales-report-location', index, location)} value={location}>{location}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Payment Method</label>
                        <select
                          value={reportFilters.paymentMethod}
                          onChange={(e) => setReportFilters({...reportFilters, paymentMethod: e.target.value})}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        >
                          <option value="all">All Methods</option>
                          <option value="cash">Cash</option>
                          <option value="mobile_money">Mobile Money</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="card">Card</option>
                          <option value="installment">Installment</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {/* Generate Report Buttons */}
                <div className="flex flex-wrap gap-4">
                  {reportType === 'installments' && (
                    <>
                      <button
                        onClick={generateInstallmentReportPDF}
                        disabled={isGeneratingReport}
                        className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                          isGeneratingReport 
                            ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        <FaFilePdf />
                        <span>{isGeneratingReport ? 'Generating...' : 'Generate PDF Report'}</span>
                      </button>
                      <button
                        onClick={() => generateExcelReport('installments')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <FaFileExcel />
                        <span>Generate Excel Report</span>
                      </button>
                    </>
                  )}
                  
                  {reportType === 'stocks' && (
                    <>
                      <button
                        onClick={generateStockBalanceReportPDF}
                        disabled={isGeneratingReport}
                        className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                          isGeneratingReport 
                            ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        <FaFilePdf />
                        <span>{isGeneratingReport ? 'Generating...' : 'Generate PDF Report'}</span>
                      </button>
                      <button
                        onClick={() => generateExcelReport('stocks')}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                      >
                        <FaFileExcel />
                        <span>Generate Excel Report</span>
                      </button>
                    </>
                  )}
                  
                  {reportType === 'sales' && (
                    <button
                      onClick={generateSalesReportPDF}
                      disabled={isGeneratingReport}
                      className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center space-x-2 ${
                        isGeneratingReport 
                          ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      <FaFilePdf />
                      <span>{isGeneratingReport ? 'Generating...' : 'Generate Sales Report'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Report Preview */}
              {reportType === 'installments' && (
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Installment Report Preview</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">{installmentReport.totalActiveInstallments}</div>
                      <div className="text-white/70 text-sm">Active Installments</div>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">{formatCurrency(installmentReport.totalPaidAmount)}</div>
                      <div className="text-white/70 text-sm">Total Paid Amount</div>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-orange-400">{formatCurrency(installmentReport.totalPendingAmount)}</div>
                      <div className="text-white/70 text-sm">Total Pending Amount</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-white">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left py-2">Customer</th>
                          <th className="text-left py-2">Item</th>
                          <th className="text-left py-2">Total Amount</th>
                          <th className="text-left py-2">Paid</th>
                          <th className="text-left py-2">Pending</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Start Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInstallments.slice(0, 10).map((installment, index) => {
                          const paidAmount = installmentPayments
                            .filter(p => p.installmentId === installment.id)
                            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                          const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
                          
                          return (
                            <tr key={generateSafeKey('preview-installment', index, installment.id)} className="border-b border-white/10">
                              <td className="py-2">{installment.customerName}</td>
                              <td className="py-2">{installment.itemName}</td>
                              <td className="py-2">{formatCurrency(parseFloat(installment.totalAmount) || 0)}</td>
                              <td className="py-2 text-green-400">{formatCurrency(paidAmount)}</td>
                              <td className="py-2 text-orange-400">{formatCurrency(pendingAmount)}</td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  installment.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                                  installment.status === 'active' ? 'bg-blue-500/20 text-blue-300' :
                                  'bg-gray-500/20 text-gray-300'
                                }`}>
                                  {installment.status}
                                </span>
                              </td>
                              <td className="py-2">
                                {installment.startDate.toDate ? 
                                  installment.startDate.toDate().toLocaleDateString('en-MW') : 
                                  new Date(installment.startDate).toLocaleDateString('en-MW')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportType === 'stocks' && (
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Stock Balance Report Preview</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">{filteredStocks.length}</div>
                      <div className="text-white/70 text-sm">Total Items</div>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">
                        {filteredStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)}
                      </div>
                      <div className="text-white/70 text-sm">Total Quantity</div>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-400">
                        {formatCurrency(filteredStocks.reduce((sum, stock) => {
                          return sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0));
                        }, 0))}
                      </div>
                      <div className="text-white/70 text-sm">Total Value</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-white">
                      <thead>
                        <tr className="border-b border-white/20">
                          <th className="text-left py-2">Item Code</th>
                          <th className="text-left py-2">Product</th>
                          <th className="text-left py-2">Location</th>
                          <th className="text-left py-2">Quantity</th>
                          <th className="text-left py-2">Cost Price</th>
                          <th className="text-left py-2">Retail Price</th>
                          <th className="text-left py-2">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStocks.slice(0, 10).map((stock, index) => (
                          <tr key={generateSafeKey('preview-stock', index, stock.id)} className="border-b border-white/10">
                            <td className="py-2 font-mono text-sm">{stock.itemCode}</td>
                            <td className="py-2">{stock.brand} {stock.model}</td>
                            <td className="py-2">{stock.location}</td>
                            <td className="py-2">{stock.quantity || 0}</td>
                            <td className="py-2">{formatCurrency(parseFloat(stock.costPrice) || 0)}</td>
                            <td className="py-2">{formatCurrency(parseFloat(stock.retailPrice) || parseFloat(stock.salePrice) || 0)}</td>
                            <td className="py-2 font-semibold">
                              {formatCurrency((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportType === 'sales' && (
                <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Sales Analysis Report Preview</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">{salesAnalysis.totalSales}</div>
                      <div className="text-white/70 text-sm">Total Sales</div>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">{formatCurrency(salesAnalysis.totalRevenue)}</div>
                      <div className="text-white/70 text-sm">Total Revenue</div>
                    </div>
                    
                    <div className="bg-white/5 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-400">{formatCurrency(salesAnalysis.monthlyRevenue)}</div>
                      <div className="text-white/70 text-sm">Monthly Revenue</div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-white font-medium mb-2">Daily Sales (Last 7 Days)</h4>
                    <div className="grid grid-cols-7 gap-2">
                      {salesAnalysis.dailySales.map((day, index) => (
                        <div key={generateSafeKey('sales-day', index, day.date)} className="bg-white/5 rounded p-2 text-center">
                          <div className="text-white/70 text-xs">{day.date.split(' ')[0]}</div>
                          <div className="text-white font-semibold">{day.sales}</div>
                          <div className="text-green-400 text-xs">{formatCurrency(day.revenue)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-white font-medium mb-2">Top 5 Products</h4>
                      <div className="space-y-2">
                        {Object.entries(salesAnalysis.topProducts || {})
                          .map(([product, count]) => ({ product, count }))
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 5)
                          .map((item, index) => (
                            <div key={generateSafeKey('top-product', index, item.product)} className="flex justify-between items-center p-2 bg-white/5 rounded">
                              <span className="text-white text-sm">{item.product}</span>
                              <span className="text-blue-300 font-semibold">{item.count} sales</span>
                            </div>
                          ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-white font-medium mb-2">Revenue by Location</h4>
                      <div className="space-y-2">
                        {Object.entries(salesAnalysis.revenueByLocation || {})
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([location, revenue], index) => (
                            <div key={generateSafeKey('revenue-location', index, location)} className="flex justify-between items-center p-2 bg-white/5 rounded">
                              <span className="text-white text-sm">{location}</span>
                              <span className="text-green-300 font-semibold">{formatCurrency(revenue)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sales Analytics Tab */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              {/* Sales Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white/5 rounded-xl p-6">
                  <div className="text-2xl font-bold text-blue-400">{salesAnalysis.totalSales}</div>
                  <div className="text-white/70 text-sm">Total Sales</div>
                </div>
                <div className="bg-white/5 rounded-xl p-6">
                  <div className="text-2xl font-bold text-green-400">{formatCurrency(salesAnalysis.totalRevenue)}</div>
                  <div className="text-white/70 text-sm">Total Revenue</div>
                </div>
                <div className="bg-white/5 rounded-xl p-6">
                  <div className="text-2xl font-bold text-purple-400">{formatCurrency(salesAnalysis.monthlyRevenue)}</div>
                  <div className="text-white/70 text-sm">Monthly Revenue</div>
                </div>
                <div className="bg-white/5 rounded-xl p-6">
                  <div className="text-2xl font-bold text-orange-400">
                    {salesAnalysis.weeklyGrowth >= 0 ? '+' : ''}{salesAnalysis.weeklyGrowth.toFixed(1)}%
                  </div>
                  <div className="text-white/70 text-sm">Weekly Growth</div>
                </div>
              </div>

              {/* Today's Performance */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Today's Performance</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-3xl font-bold text-green-400 mb-2">{realTimeSales.todaySales}</div>
                    <div className="text-white/70">Today's Sales</div>
                    <div className="text-green-300 text-sm mt-1">{formatCurrency(realTimeSales.todayRevenue)} revenue</div>
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-2">Top Selling Products Today</h4>
                    <div className="space-y-2">
                      {realTimeSales.topSellingProducts.map((product, index) => (
                        <div key={generateSafeKey('today-product', index, product.product)} className="flex justify-between items-center">
                          <span className="text-white text-sm">{product.product}</span>
                          <span className="text-blue-300">{product.count} sales</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sales Trends */}
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white">Sales Trends</h2>
                  <button
                    onClick={generateSalesReportPDF}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <FaFilePdf />
                    <span>Generate Report</span>
                  </button>
                </div>
                
                <div className="mb-6">
                  <h4 className="text-white font-medium mb-2">Daily Sales (Last 7 Days)</h4>
                  <div className="grid grid-cols-7 gap-2 h-40">
                    {salesAnalysis.dailySales.map((day, index) => {
                      const maxRevenue = Math.max(...salesAnalysis.dailySales.map(d => d.revenue));
                      const height = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                      
                      return (
                        <div key={generateSafeKey('sales-day', index, day.date)} className="flex flex-col items-center justify-end">
                          <div className="text-white/70 text-xs mb-1 text-center">{day.date.split(' ')[0]}</div>
                          <div className="w-full flex flex-col items-center">
                            <div 
                              className="w-3/4 bg-linear-to-t from-green-500 to-green-600 rounded-t-lg"
                              style={{ height: `${height}%` }}
                            ></div>
                            <div className="text-white/50 text-xs mt-1">{day.sales}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-white font-medium mb-2">Top 10 Products</h4>
                    <div className="space-y-2">
                      {Object.entries(salesAnalysis.topProducts || {})
                        .map(([product, count]) => ({ product, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 10)
                        .map((item, index) => (
                          <div key={generateSafeKey('sales-product', index, item.product)} className="flex justify-between items-center p-2 bg-white/5 rounded">
                            <span className="text-white text-sm truncate">{item.product}</span>
                            <span className="text-blue-300 font-semibold">{item.count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-white font-medium mb-2">Revenue by Location</h4>
                    <div className="space-y-2">
                      {Object.entries(salesAnalysis.revenueByLocation || {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([location, revenue], index) => (
                          <div key={generateSafeKey('sales-location', index, location)} className="flex justify-between items-center p-2 bg-white/5 rounded">
                            <span className="text-white text-sm">{location}</span>
                            <span className="text-green-300 font-semibold">{formatCurrency(revenue)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Personnel Management Tab */}
          {activeTab === 'personnel' && (
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Personnel Management</h2>
                
                <div className="mb-6">
                  <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg pl-10 pr-3 py-2 text-white placeholder-white/50"
                      placeholder="Search users by name, email, or role..."
                    />
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-3 px-2">Name</th>
                        <th className="text-left py-3 px-2">Email</th>
                        <th className="text-left py-3 px-2">Role</th>
                        <th className="text-left py-3 px-2">Location</th>
                        <th className="text-left py-3 px-2">Status</th>
                        <th className="text-left py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers
                        .filter(user => {
                          if (!userSearch) return true;
                          const searchLower = userSearch.toLowerCase();
                          return (
                            user.displayName?.toLowerCase().includes(searchLower) ||
                            user.email?.toLowerCase().includes(searchLower) ||
                            user.role?.toLowerCase().includes(searchLower) ||
                            user.location?.toLowerCase().includes(searchLower)
                          );
                        })
                        .map((userItem, index) => (
                          <tr key={generateSafeKey('user', index, userItem.id)} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-3 px-2">
                              <div className="font-medium">{userItem.displayName || 'N/A'}</div>
                              <div className="text-white/70 text-xs">{userItem.phone || 'No phone'}</div>
                            </td>
                            <td className="py-3 px-2">{userItem.email}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                userItem.role === 'superadmin' ? 'bg-red-500/20 text-red-300' :
                                userItem.role === 'admin' ? 'bg-purple-500/20 text-purple-300' :
                                userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300' :
                                userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300' :
                                userItem.role === 'data_entry' ? 'bg-green-500/20 text-green-300' :
                                'bg-gray-500/20 text-gray-300'
                              }`}>
                                {userItem.role || 'user'}
                              </span>
                            </td>
                            <td className="py-3 px-2">{userItem.location || 'Not assigned'}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                userItem.status === 'active' ? 'bg-green-500/20 text-green-300' :
                                userItem.status === 'inactive' ? 'bg-red-500/20 text-red-300' :
                                'bg-yellow-500/20 text-yellow-300'
                              }`}>
                                {userItem.status || 'pending'}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => setSelectedUser(userItem)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to ${userItem.status === 'active' ? 'deactivate' : 'activate'} this user?`)) {
                                      // Implement user status toggle
                                      setSuccess('User status updated');
                                    }
                                  }}
                                  className={`px-3 py-1 rounded text-sm transition-colors ${
                                    userItem.status === 'active' 
                                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                                      : 'bg-green-600 hover:bg-green-700 text-white'
                                  }`}
                                >
                                  {userItem.status === 'active' ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-400">
                    {allUsers.filter(u => u.role === 'superadmin').length}
                  </div>
                  <div className="text-white/70 text-sm">Super Admins</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-400">
                    {allUsers.filter(u => u.role === 'admin').length}
                  </div>
                  <div className="text-white/70 text-sm">Admins</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-400">
                    {allUsers.filter(u => u.role === 'manager').length}
                  </div>
                  <div className="text-white/70 text-sm">Managers</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-400">
                    {allUsers.filter(u => u.role === 'sales').length}
                  </div>
                  <div className="text-white/70 text-sm">Sales Staff</div>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Dashboard Settings</h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-white font-medium mb-2">Theme Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <button
                        onClick={() => setTheme('dark')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          theme === 'dark' 
                            ? 'border-blue-500 bg-blue-500/10' 
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-blue-500 rounded"></div>
                          <span className="text-white">Dark Theme</span>
                        </div>
                      </button>
                      
                      <button
                        onClick={() => setTheme('blue')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          theme === 'blue' 
                            ? 'border-blue-500 bg-blue-500/10' 
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-blue-400 rounded"></div>
                          <span className="text-white">Blue Theme</span>
                        </div>
                      </button>
                      
                      <button
                        onClick={() => setTheme('purple')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          theme === 'purple' 
                            ? 'border-purple-500 bg-purple-500/10' 
                            : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-purple-500 rounded"></div>
                          <span className="text-white">Purple Theme</span>
                        </div>
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-white font-medium mb-2">Installment Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Default Initial Payment Percentage</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value="60"
                            className="w-full"
                            disabled
                          />
                          <span className="text-white font-semibold">60%</span>
                        </div>
                        <p className="text-white/50 text-xs mt-1">Installments start with 60% of retail price</p>
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Default Installment Period</label>
                        <select className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white">
                          <option value="12">12 Months</option>
                          <option value="6">6 Months</option>
                          <option value="18">18 Months</option>
                          <option value="24">24 Months</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-white font-medium mb-2">Stock Alert Settings</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Default Minimum Stock Level</label>
                        <input
                          type="number"
                          min="1"
                          defaultValue="5"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-white/70 text-sm mb-2">Default Reorder Quantity</label>
                        <input
                          type="number"
                          min="1"
                          defaultValue="10"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-white/10">
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-semibold">
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 border-t border-white/10 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-white/70 text-sm">
              © {new Date().getFullYear()} KM ELECTRONICS. All rights reserved.
            </div>
            <div className="flex items-center space-x-4 mt-2 md:mt-0">
              <span className="text-white/50 text-sm">Version 1.0.0</span>
              <span className="text-white/50 text-sm">•</span>
              <span className="text-white/50 text-sm">Last updated: {new Date().toLocaleDateString('en-MW')}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}