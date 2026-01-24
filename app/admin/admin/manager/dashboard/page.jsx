'use client'
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot,
  writeBatch, getDoc, Timestamp
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Available locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

// Safe key generator to prevent duplicate key errors
const generateSafeKey = (prefix = 'item', index, id) => {
  if (id) {
    return `${prefix}-${id}`;
  }
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Faulty phone constants
const FAULTY_STATUS = ['Reported', 'In Repair', 'Fixed', 'EOS (End of Service)', 'Scrapped'];
const SPARES_OPTIONS = ['Screen', 'Battery', 'Charging Port', 'Camera', 'Motherboard', 'Speaker', 'Microphone', 'Other'];

export default function ManagerDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Tables from Admin Dashboard
  const [stocksTable, setStocksTable] = useState([]);
  const [salesTable, setSalesTable] = useState([]);
  const [faultyTable, setFaultyTable] = useState([]);
  const [usersTable, setUsersTable] = useState([]);
  const [transfersTable, setTransfersTable] = useState([]);
  const [installmentsTable, setInstallmentsTable] = useState([]);
  const [repairsTable, setRepairsTable] = useState([]);

  // User Management State
  const [allUsers, setAllUsers] = useState([]);

  // Stocks & Locations State
  const [allStocks, setAllStocks] = useState([]);
  const [locationStocks, setLocationStocks] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  
  // Stock Transfer State
  const [stockRequests, setStockRequests] = useState([]);
  const [transferStock, setTransferStock] = useState({
    itemCode: '',
    quantity: '',
    fromLocation: '',
    toLocation: ''
  });
  const [transferErrors, setTransferErrors] = useState({});
  const [isTransferValidating, setIsTransferValidating] = useState(false);

  // Sales Analysis State
  const [sales, setSales] = useState([]);
  const [salesAnalysis, setSalesAnalysis] = useState({
    totalSales: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    topProducts: {},
    salesByUser: {},
    revenueByLocation: {},
    locationPerformance: {}
  });

  // Real-time Sales Report State
  const [realTimeSales, setRealTimeSales] = useState({
    todaySales: 0,
    todayRevenue: 0,
    hourlySales: {},
    liveSales: []
  });

  // New Stock State (updated for compatibility with superadmin)
  const [newStock, setNewStock] = useState({
    brand: '',
    model: '',
    category: 'Smartphone',
    color: '',
    storage: '',
    itemCode: '',
    quantity: '',
    costPrice: '',
    retailPrice: '',
    wholesalePrice: '',
    discountPercentage: '',
    minStockLevel: '5',
    reorderQuantity: '10',
    location: '',
    supplier: '',
    warrantyPeriod: '12',
    description: ''
  });
  const [stockErrors, setStockErrors] = useState({});

  // Sales Report Download State - UPDATED: Removed location filter
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: ''
  });
  const [reportData, setReportData] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Manager-specific states
  const [processingRequest, setProcessingRequest] = useState(null);
  const [timePeriod, setTimePeriod] = useState('today');
  
  // Quick Sale State for Manager
  const [quickSale, setQuickSale] = useState({
    itemCode: '',
    quantity: 1,
    customPrice: ''
  });

  // Faulty Phone State for Manager
  const [faultyPhones, setFaultyPhones] = useState([]);
  const [reportModal, setReportModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [selectedFaulty, setSelectedFaulty] = useState(null);
  const [faultyReport, setFaultyReport] = useState({
    itemCode: '',
    stockId: '',
    brand: '',
    model: '',
    imei: '',
    faultDescription: '',
    reportedCost: 0,
    status: 'Reported',
    sparesNeeded: [],
    otherSpares: '',
    customerName: '',
    customerPhone: '',
    estimatedRepairCost: 0,
    images: [],
    notes: ''
  });

  // Installment State
  const [installmentModal, setInstallmentModal] = useState(false);
  const [selectedSaleForInstallment, setSelectedSaleForInstallment] = useState(null);
  const [installmentData, setInstallmentData] = useState({
    saleId: '',
    customerName: '',
    phoneNumber: '',
    totalAmount: 0,
    downPayment: 0,
    remainingAmount: 0,
    installmentPlan: '1',
    monthlyPayment: 0,
    nextPaymentDate: '',
    notes: ''
  });

  // Search and Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Suppress React key warnings
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0] && typeof args[0] === 'string' && 
          (args[0].includes('Encountered two children with the same key') || 
           args[0].includes('Each child in a list should have a unique "key" prop'))) {
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  // Error handling function
  const handleFirestoreError = useCallback((error, context) => {
    if (error.code === 'permission-denied') {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setTimeout(() => router.push('/login'), 100);
        return;
      }
      return;
    }
  }, [router]);

  // Fetch all tables from Admin Dashboard
  const fetchAllTables = useCallback(async (managerLocation) => {
    try {
      // Fetch stocks table
      const stocksQuery = query(collection(db, 'stocks'));
      const stocksSnapshot = await getDocs(stocksQuery);
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocksTable(stocksData);

      // Fetch sales table - ALL sales data
      const salesQuery = query(
        collection(db, 'sales'),
        orderBy('soldAt', 'desc')
      );
      const salesSnapshot = await getDocs(salesQuery);
      const salesData = salesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSalesTable(salesData);

      // Fetch faulty phones table for manager's location
      const faultyQuery = query(
        collection(db, 'faultyPhones'),
        where('location', '==', managerLocation),
        orderBy('reportedAt', 'desc')
      );
      const faultySnapshot = await getDocs(faultyQuery);
      const faultyData = faultySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFaultyTable(faultyData);

      // Fetch users table (excluding managers/admins)
      const usersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['sales', 'dataEntry', 'user'])
      );
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUsersTable(usersData);

      // Fetch stock transfers
      const transfersQuery = query(
        collection(db, 'stockTransfers'),
        orderBy('transferredAt', 'desc')
      );
      const transfersSnapshot = await getDocs(transfersQuery);
      const transfersData = transfersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransfersTable(transfersData);

      // Fetch installments
      const installmentsQuery = query(
        collection(db, 'installments'),
        where('location', '==', managerLocation),
        orderBy('createdAt', 'desc')
      );
      const installmentsSnapshot = await getDocs(installmentsQuery);
      const installmentsData = installmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallmentsTable(installmentsData);

      // Fetch repairs
      const repairsQuery = query(
        collection(db, 'repairs'),
        where('location', '==', managerLocation),
        orderBy('repairedAt', 'desc')
      );
      const repairsSnapshot = await getDocs(repairsQuery);
      const repairsData = repairsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRepairsTable(repairsData);

    } catch (error) {
      handleFirestoreError(error, 'fetch-all-tables');
    }
  }, [handleFirestoreError]);

  // Performance Helpers
  const getPerformanceGrade = useCallback((score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Very Good';
    if (score >= 70) return 'Good';
    if (score >= 60) return 'Average';
    if (score >= 50) return 'Below Average';
    return 'Needs Attention';
  }, []);

  const getPerformanceColor = useCallback((score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  }, []);

  const getPerformanceBadge = useCallback((score) => {
    if (score >= 80) return 'bg-green-500/20 text-green-300';
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-300';
    if (score >= 40) return 'bg-orange-500/20 text-orange-300';
    return 'bg-red-500/20 text-red-300';
  }, []);

  const getTrendIcon = useCallback((trend) => {
    if (trend === 'up') return '↗';
    if (trend === 'down') return '↘';
    return '→';
  }, []);

  const getTrendColor = useCallback((trend) => {
    if (trend === 'up') return 'text-green-400';
    if (trend === 'down') return 'text-red-400';
    return 'text-gray-400';
  }, []);

  // Core Data Fetching Functions
  const fetchAllUsers = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const users = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(users);
    } catch (error) {
      handleFirestoreError(error, 'fetch-users');
      setAllUsers([]);
    }
  }, [handleFirestoreError]);

  const fetchAllStocks = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'stocks'));
      const stocksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllStocks(stocksData);
    } catch (error) {
      handleFirestoreError(error, 'fetch-stocks');
      setAllStocks([]);
    }
  }, [handleFirestoreError]);

  const fetchLocationStocks = useCallback(async (location) => {
    try {
      if (!location) {
        setLocationStocks([]);
        return;
      }
      
      const q = query(
        collection(db, 'stocks'),
        where('location', '==', location)
      );
      const querySnapshot = await getDocs(q);
      const stocksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLocationStocks(stocksData);
    } catch (error) {
      handleFirestoreError(error, 'fetch-location-stocks');
      setLocationStocks([]);
    }
  }, [handleFirestoreError]);

  const fetchAllStockRequests = useCallback(async () => {
    try {
      const q = query(
        collection(db, 'stockRequests'),
        orderBy('requestedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const requestsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStockRequests(requestsData);
    } catch (error) {
      handleFirestoreError(error, 'fetch-stock-requests');
      setStockRequests([]);
    }
  }, [handleFirestoreError]);

  // Fetch faulty phones for manager's location
  const fetchFaultyPhones = useCallback(async (location) => {
    try {
      if (!location) return;

      const q = query(
        collection(db, 'faultyPhones'),
        where('location', '==', location),
        orderBy('reportedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const faultyData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFaultyPhones(faultyData);
      setFaultyTable(faultyData);
    } catch (error) {
      handleFirestoreError(error, 'faulty-fetch');
      setFaultyPhones([]);
    }
  }, [handleFirestoreError]);

  const calculateSalesAnalysis = useCallback((salesData) => {
    const analysis = {
      totalSales: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      topProducts: {},
      salesByUser: {},
      revenueByLocation: {},
      locationPerformance: salesAnalysis.locationPerformance
    };

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    salesData.forEach(sale => {
      analysis.totalRevenue += sale.finalSalePrice || 0;
      analysis.totalSales++;

      const saleDate = sale.soldAt?.toDate();
      if (saleDate && saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
        analysis.monthlyRevenue += sale.finalSalePrice || 0;
      }

      const productKey = `${sale.brand}-${sale.model}`;
      analysis.topProducts[productKey] = (analysis.topProducts[productKey] || 0) + 1;

      const userName = sale.soldByName || sale.soldBy;
      analysis.salesByUser[userName] = (analysis.salesByUser[userName] || 0) + (sale.finalSalePrice || 0);

      const location = sale.location || 'Unknown';
      analysis.revenueByLocation[location] = (analysis.revenueByLocation[location] || 0) + (sale.finalSalePrice || 0);
    });

    setSalesAnalysis(analysis);
  }, [salesAnalysis.locationPerformance]);

  const fetchAllSalesAnalysis = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'sales'));
      const salesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      setSalesTable(salesData);
      calculateSalesAnalysis(salesData);
    } catch (error) {
      handleFirestoreError(error, 'fetch-sales-analysis');
      setSales([]);
    }
  }, [calculateSalesAnalysis, handleFirestoreError]);

  // Real-time Sales Calculations
  const calculateRealTimeSales = useCallback((salesData) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySales = salesData.filter(sale => {
      const saleDate = sale.soldAt?.toDate();
      return saleDate && saleDate >= today;
    });

    const hourlySales = {};
    const liveSales = todaySales.slice(0, 10);

    todaySales.forEach(sale => {
      const saleDate = sale.soldAt?.toDate();
      if (saleDate) {
        const hour = saleDate.getHours();
        hourlySales[hour] = (hourlySales[hour] || 0) + (sale.finalSalePrice || 0);
      }
    });

    setRealTimeSales({
      todaySales: todaySales.length,
      todayRevenue: todaySales.reduce((total, sale) => total + (sale.finalSalePrice || 0), 0),
      hourlySales,
      liveSales
    });
  }, []);

  const setupRealtimeListeners = useCallback((managerLocation) => {
    // Cleanup function for listeners
    const cleanupFunctions = [];

    // Real-time stocks updates
    const stocksQuery = query(collection(db, 'stocks'));
    
    const unsubscribeStocks = onSnapshot(stocksQuery, (snapshot) => {
      const stocksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllStocks(stocksData);
      setStocksTable(stocksData);
      
      // Filter for manager's location
      if (managerLocation) {
        const locationStocks = stocksData.filter(stock => stock.location === managerLocation);
        setLocationStocks(locationStocks);
      }
    }, (error) => {
      handleFirestoreError(error, 'stocks-listener');
    });

    cleanupFunctions.push(unsubscribeStocks);

    // Real-time sales updates
    const salesQuery = query(collection(db, 'sales'), orderBy('soldAt', 'desc'));

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      setSalesTable(salesData);
      calculateSalesAnalysis(salesData);
      calculateRealTimeSales(salesData);
    }, (error) => {
      handleFirestoreError(error, 'sales-listener');
    });

    cleanupFunctions.push(unsubscribeSales);

    // Real-time faulty phones for manager's location
    if (managerLocation) {
      const faultyQuery = query(
        collection(db, 'faultyPhones'),
        where('location', '==', managerLocation),
        orderBy('reportedAt', 'desc')
      );

      const unsubscribeFaulty = onSnapshot(faultyQuery, (snapshot) => {
        const faultyData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setFaultyPhones(faultyData);
        setFaultyTable(faultyData);
      }, (error) => {
        handleFirestoreError(error, 'faulty-listener');
      });

      cleanupFunctions.push(unsubscribeFaulty);
    }

    // Real-time stock requests
    const requestsQuery = query(
      collection(db, 'stockRequests'),
      orderBy('requestedAt', 'desc')
    );

    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStockRequests(requestsData);
    }, (error) => {
      handleFirestoreError(error, 'requests-listener');
    });

    cleanupFunctions.push(unsubscribeRequests);

    // Real-time users updates
    const usersQuery = query(
      collection(db, 'users'),
      where('role', 'in', ['sales', 'dataEntry', 'user'])
    );

    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersData);
      setUsersTable(usersData);
    }, (error) => {
      handleFirestoreError(error, 'users-listener');
    });

    cleanupFunctions.push(unsubscribeUsers);

    return () => {
      cleanupFunctions.forEach(unsubscribe => {
        try {
          if (unsubscribe && typeof unsubscribe === 'function') {
            unsubscribe();
          }
        } catch (error) {
          // Silent fail on unsubscribe errors
        }
      });
    };
  }, [calculateSalesAnalysis, calculateRealTimeSales, handleFirestoreError]);

  const initializeDashboard = useCallback(async (userData) => {
    try {
      setSelectedLocation(userData.location);
      await Promise.all([
        fetchAllUsers(),
        fetchAllStocks(),
        fetchLocationStocks(userData.location),
        fetchAllSalesAnalysis(),
        fetchAllStockRequests(),
        fetchFaultyPhones(userData.location)
      ]);
      setupRealtimeListeners(userData.location);
    } catch (error) {
      handleFirestoreError(error, 'initialize-dashboard');
    }
  }, [fetchAllUsers, fetchAllStocks, fetchLocationStocks, fetchAllSalesAnalysis, fetchAllStockRequests, fetchFaultyPhones, setupRealtimeListeners, handleFirestoreError]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDocs(
            query(collection(db, 'users'), where('uid', '==', user.uid))
          );
          
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            if (userData.role === 'manager') {
              setUser(userData);
              await initializeDashboard(userData);
            } else {
              router.push('/dashboard');
            }
          } else {
            router.push('/login');
          }
        } catch (error) {
          handleFirestoreError(error, 'authentication');
          router.push('/login');
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, initializeDashboard, handleFirestoreError]);

  // User Management Functions with Manager Restrictions
  const handleAssignRole = async (userId, role, currentUserRole) => {
    const restrictedRoles = ['manager', 'admin', 'superadmin'];
    if (restrictedRoles.includes(role)) {
      alert('You are not authorized to assign manager, admin, or superadmin roles.');
      return;
    }

    if (userId === user.uid) {
      alert('You cannot change your own role.');
      return;
    }

    if (restrictedRoles.includes(currentUserRole)) {
      alert('You are not authorized to modify roles of managers, admins, or superadmins.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        role: role,
        lastRoleUpdate: serverTimestamp(),
        updatedBy: user.uid
      });
      fetchAllUsers();
      alert(`Role updated to ${role} successfully!`);
    } catch (error) {
      handleFirestoreError(error, 'assign-role');
      alert('Error updating role. Please try again.');
    }
  };

  const handleUpdateUserLocation = async (userId, newLocation, currentUserRole) => {
    const restrictedRoles = ['manager', 'admin', 'superadmin'];
    if (restrictedRoles.includes(currentUserRole)) {
      alert('You are not authorized to update locations of managers, admins, or superadmins.');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', userId), {
        location: newLocation,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      fetchAllUsers();
      alert('User location updated successfully!');
    } catch (error) {
      handleFirestoreError(error, 'update-user-location');
      alert('Error updating user location. Please try again.');
    }
  };

  // Stock Management Functions - UPDATED for compatibility with superadmin
  const validateStockForm = () => {
    const errors = {};
    if (!newStock.brand.trim()) errors.brand = 'Brand is required';
    if (!newStock.model.trim()) errors.model = 'Model is required';
    if (!newStock.itemCode.trim()) errors.itemCode = 'Item Code is required';
    if (!newStock.quantity || parseInt(newStock.quantity) <= 0) errors.quantity = 'Quantity must be greater than 0';
    if (!newStock.location) errors.location = 'Location is required';
    if (!newStock.costPrice || parseFloat(newStock.costPrice) <= 0) errors.costPrice = 'Cost Price must be greater than 0';
    if (!newStock.retailPrice || parseFloat(newStock.retailPrice) <= 0) errors.retailPrice = 'Retail Price must be greater than 0';

    setStockErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddStock = async () => {
    if (!validateStockForm()) {
      alert('Please fix the validation errors in the form');
      return;
    }

    try {
      const stockData = {
        ...newStock,
        costPrice: parseFloat(newStock.costPrice) || 0,
        retailPrice: parseFloat(newStock.retailPrice) || 0,
        wholesalePrice: parseFloat(newStock.wholesalePrice) || (parseFloat(newStock.retailPrice) * 0.8) || 0,
        discountPercentage: parseFloat(newStock.discountPercentage) || 0,
        quantity: parseInt(newStock.quantity) || 0,
        minStockLevel: parseInt(newStock.minStockLevel) || 5,
        reorderQuantity: parseInt(newStock.reorderQuantity) || 10,
        warrantyPeriod: parseInt(newStock.warrantyPeriod) || 12,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        addedBy: user.uid,
        addedByName: user.fullName,
        isActive: true
      };

      await addDoc(collection(db, 'stocks'), stockData);

      setNewStock({
        brand: '',
        model: '',
        category: 'Smartphone',
        color: '',
        storage: '',
        itemCode: '',
        quantity: '',
        costPrice: '',
        retailPrice: '',
        wholesalePrice: '',
        discountPercentage: '',
        minStockLevel: '5',
        reorderQuantity: '10',
        location: '',
        supplier: '',
        warrantyPeriod: '12',
        description: ''
      });
      setStockErrors({});

      alert('Stock added successfully!');
    } catch (error) {
      handleFirestoreError(error, 'add-stock');
      alert('Error adding stock. Please try again.');
    }
  };

  const handleUpdateStock = async (stockId, updates) => {
    try {
      await updateDoc(doc(db, 'stocks', stockId), {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      alert('Stock updated successfully!');
    } catch (error) {
      handleFirestoreError(error, 'update-stock');
      alert('Error updating stock. Please try again.');
    }
  };

  // SALES FUNCTIONS FOR MANAGER
  const handleQuickSale = async () => {
  if (!quickSale.itemCode) {
    alert('Please enter an item code.');
    return;
  }

  try {
    const stockQuery = query(
      collection(db, 'stocks'),
      where('itemCode', '==', quickSale.itemCode),
      where('location', '==', user.location)
    );
    
    const stockSnapshot = await getDocs(stockQuery);
    
    if (stockSnapshot.empty) {
      alert(`Item "${quickSale.itemCode}" not found in ${user.location}! You can only sell items from your assigned location.`);
      return;
    }

    const stockDoc = stockSnapshot.docs[0];
    const stock = stockDoc.data();

    if (stock.quantity < quickSale.quantity) {
      alert(`Insufficient stock! Only ${stock.quantity} units available.`);
      return;
    }

    // ✅ FIX: Define these variables BEFORE the if-else block
    const retailPrice = parseFloat(stock.retailPrice) || 0;
    const discountPercentage = parseFloat(stock.discountPercentage) || 0;
    
    let finalPrice;
    if (quickSale.customPrice) {
      finalPrice = parseFloat(quickSale.customPrice);
      if (isNaN(finalPrice) || finalPrice <= 0) {
        alert('Please enter a valid custom price.');
        return;
      }
    } else {
      finalPrice = retailPrice * (1 - discountPercentage / 100) * quickSale.quantity;
    }

    const batch = writeBatch(db);

    const newQuantity = stock.quantity - quickSale.quantity;
    const stockRef = doc(db, 'stocks', stockDoc.id);
    batch.update(stockRef, {
      quantity: newQuantity,
      updatedAt: serverTimestamp(),
      lastSold: serverTimestamp()
    });

    const costPrice = parseFloat(stock.costPrice) || 0;
    const profit = finalPrice - (costPrice * quickSale.quantity);

    const saleData = {
      itemCode: stock.itemCode,
      brand: stock.brand,
      model: stock.model,
      category: stock.category || 'Smartphone',
      color: stock.color,
      storage: stock.storage,
      quantity: quickSale.quantity,
      costPrice: costPrice,
      retailPrice: retailPrice,  // ✅ Now this is defined in all cases
      discountPercentage: discountPercentage,  // ✅ Now this is defined in all cases
      finalSalePrice: finalPrice,
      profit: profit,
      paymentMethod: 'cash',
      location: user.location,
      soldBy: user.uid,
      soldByName: user.fullName,
      soldAt: serverTimestamp(),
      receiptNumber: `RCP-${Date.now()}`,
      notes: quickSale.customPrice ? `Custom price sale: MK ${quickSale.customPrice}` : 'Standard sale'
    };

    const salesRef = doc(collection(db, 'sales'));
    batch.set(salesRef, saleData);

    await batch.commit();

    setQuickSale({ itemCode: '', quantity: 1, customPrice: '' });
    alert('Sale completed successfully!');
    
  } catch (error) {
    let errorMessage = 'Error processing sale. Please try again.';
    
    if (error.code === 'permission-denied') {
      errorMessage = 'Permission denied. Please check if you have sales permissions.';
      handleFirestoreError(error, 'quick-sale');
    } else if (error.code === 'failed-precondition') {
      errorMessage = 'Stock was modified by another user. Please try again.';
    }
    
    alert(errorMessage);
  }
};

  const handleSellItem = async (stockId, stockData, quantity = 1) => {
    try {
      if (stockData.location !== user.location) {
        alert('You can only sell items from your assigned location!');
        return;
      }

      if (!stockData.quantity && stockData.quantity !== 0) {
        alert('Invalid stock data. Please contact administrator.');
        return;
      }

      if (stockData.quantity < quantity) {
        alert(`Insufficient stock! Only ${stockData.quantity} units available.`);
        return;
      }

      if (quantity <= 0) {
        alert('Please enter a valid quantity.');
        return;
      }

      const retailPrice = parseFloat(stockData.retailPrice) || 0;
      const discountPercentage = parseFloat(stockData.discountPercentage) || 0;
      const finalPrice = retailPrice * (1 - discountPercentage / 100) * quantity;

      const batch = writeBatch(db);

      const newQuantity = stockData.quantity - quantity;
      const stockRef = doc(db, 'stocks', stockId);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp()
      });

      const costPrice = parseFloat(stockData.costPrice) || 0;
      const profit = finalPrice - (costPrice * quantity);

      const saleData = {
        itemCode: stockData.itemCode,
        brand: stockData.brand,
        model: stockData.model,
        category: stockData.category || 'Smartphone',
        color: stockData.color,
        storage: stockData.storage,
        quantity: quantity,
        costPrice: costPrice,
        retailPrice: retailPrice,
        discountPercentage: discountPercentage,
        finalSalePrice: finalPrice,
        profit: profit,
        paymentMethod: 'cash',
        location: user.location,
        soldBy: user.uid,
        soldByName: user.fullName,
        soldAt: serverTimestamp(),
        receiptNumber: `RCP-${Date.now()}`,
        notes: 'Standard sale'
      };

      const salesRef = doc(collection(db, 'sales'));
      batch.set(salesRef, saleData);

      await batch.commit();

      alert('Item sold successfully!');
      
    } catch (error) {
      let errorMessage = 'Error selling item. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check if you have sales permissions.';
        handleFirestoreError(error, 'sell-item');
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'Stock was modified by another user. Please try again.';
      }
      
      alert(errorMessage);
    }
  };

  // FAULTY PHONE FUNCTIONS FOR MANAGER
  const handleReportFaulty = async () => {
    try {
      if (!faultyReport.itemCode || !faultyReport.faultDescription) {
        alert('Please fill in required fields: Item Code and Fault Description');
        return;
      }

      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', faultyReport.itemCode),
        where('location', '==', user.location)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        alert('Item not found in stock for your location!');
        return;
      }

      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();

      if (stock.quantity < 1) {
        alert('Item out of stock!');
        return;
      }

      const batch = writeBatch(db);

      const newQuantity = stock.quantity - 1;
      const stockRef = doc(db, 'stocks', stockDoc.id);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp()
      });

      const faultyData = {
        itemCode: faultyReport.itemCode,
        stockId: stockDoc.id,
        brand: stock.brand || faultyReport.brand,
        model: stock.model || faultyReport.model,
        imei: faultyReport.imei,
        faultDescription: faultyReport.faultDescription,
        reportedCost: parseFloat(faultyReport.reportedCost) || 0,
        estimatedRepairCost: parseFloat(faultyReport.estimatedRepairCost) || 0,
        status: faultyReport.status,
        sparesNeeded: faultyReport.sparesNeeded,
        otherSpares: faultyReport.otherSpares,
        customerName: faultyReport.customerName,
        customerPhone: faultyReport.customerPhone,
        images: faultyReport.images,
        notes: faultyReport.notes,
        reportedAt: serverTimestamp(),
        reportedBy: user.uid,
        reportedByName: user.fullName,
        location: user.location,
        lastUpdated: serverTimestamp()
      };

      const faultyRef = doc(collection(db, 'faultyPhones'));
      batch.set(faultyRef, faultyData);

      await batch.commit();

      setFaultyReport({
        itemCode: '',
        stockId: '',
        brand: '',
        model: '',
        imei: '',
        faultDescription: '',
        reportedCost: 0,
        status: 'Reported',
        sparesNeeded: [],
        otherSpares: '',
        customerName: '',
        customerPhone: '',
        estimatedRepairCost: 0,
        images: [],
        notes: ''
      });

      setReportModal(false);
      alert('Faulty phone reported successfully! Stock has been updated.');
      
    } catch (error) {
      console.error('Error reporting faulty phone:', error);
      alert('Error reporting faulty phone. Please try again.');
    }
  };

  const handleUpdateFaultyStatus = async (faultyId, updates) => {
    try {
      const batch = writeBatch(db);
      const faultyRef = doc(db, 'faultyPhones', faultyId);
      
      const faultyDoc = await getDoc(faultyRef);
      if (!faultyDoc.exists()) {
        alert('Faulty phone record not found!');
        return;
      }

      const faultyData = faultyDoc.data();
      const newStatus = updates.status;

      if (newStatus === 'Fixed' && faultyData.status !== 'Fixed') {
        const stockRef = doc(db, 'stocks', faultyData.stockId);
        const stockDoc = await getDoc(stockRef);
        
        if (stockDoc.exists()) {
          const stockData = stockDoc.data();
          batch.update(stockRef, {
            quantity: (stockData.quantity || 0) + 1,
            updatedAt: serverTimestamp(),
            isRepaired: true,
            repairDate: serverTimestamp()
          });

          const repairData = {
            faultyId: faultyId,
            stockId: faultyData.stockId,
            itemCode: faultyData.itemCode,
            brand: faultyData.brand,
            model: faultyData.model,
            repairCost: updates.repairCost || faultyData.estimatedRepairCost,
            sparesUsed: faultyData.sparesNeeded,
            repairedAt: serverTimestamp(),
            repairedBy: user.uid,
            repairedByName: user.fullName,
            location: user.location
          };

          const repairRef = doc(collection(db, 'repairs'));
          batch.set(repairRef, repairData);
        }
      }

      batch.update(faultyRef, {
        ...updates,
        lastUpdated: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName
      });

      await batch.commit();
      alert('Status updated successfully!');
      setEditModal(false);
      setSelectedFaulty(null);
      
    } catch (error) {
      console.error('Error updating faulty status:', error);
      alert('Error updating status. Please try again.');
    }
  };

  // ENHANCED FAULTY PHONE PDF REPORT
  const generateFaultyPhonePDFReport = (faultyData) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Add linear background
    doc.setFillColor(30, 41, 59); // slate-900
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Add header with logo
    doc.setFontSize(24);
    doc.setTextColor(139, 92, 246); // purple-500
    doc.setFont('helvetica', 'bold');
    doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.text('FAULTY PHONE REPORT', pageWidth / 2, 30, { align: 'center' });
    
    // Report ID and Date
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text(`Report ID: ${faultyData.id}`, 20, 40);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 20, 40, { align: 'right' });
    
    // Device Information Section
    doc.setFontSize(14);
    doc.setTextColor(139, 92, 246);
    doc.text('DEVICE INFORMATION', 20, 55);
    
    doc.setFillColor(55, 65, 81);
    doc.roundedRect(20, 60, pageWidth - 40, 35, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    
    const deviceInfo = [
      [`Item Code: ${faultyData.itemCode}`, `Brand: ${faultyData.brand || 'N/A'}`],
      [`Model: ${faultyData.model || 'N/A'}`, `IMEI: ${faultyData.imei || 'N/A'}`],
      [`Location: ${faultyData.location}`, `Status: ${faultyData.status}`],
      [`Reported Cost: MK ${faultyData.reportedCost?.toLocaleString() || '0'}`, `Estimated Repair: MK ${faultyData.estimatedRepairCost?.toLocaleString() || '0'}`]
    ];
    
    let yPos = 70;
    deviceInfo.forEach(([left, right]) => {
      doc.text(left, 25, yPos);
      doc.text(right, pageWidth / 2 + 10, yPos);
      yPos += 8;
    });
    
    // Customer Information Section
    doc.setFontSize(14);
    doc.setTextColor(139, 92, 246);
    doc.text('CUSTOMER INFORMATION', 20, yPos + 5);
    
    doc.setFillColor(55, 65, 81);
    doc.roundedRect(20, yPos + 10, pageWidth - 40, 20, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    
    if (faultyData.customerName || faultyData.customerPhone) {
      doc.text(`Customer Name: ${faultyData.customerName || 'N/A'}`, 25, yPos + 20);
      doc.text(`Phone: ${faultyData.customerPhone || 'N/A'}`, pageWidth / 2 + 10, yPos + 20);
    } else {
      doc.text('No customer information provided', 25, yPos + 20);
    }
    
    yPos += 35;
    
    // Fault Details Section
    doc.setFontSize(14);
    doc.setTextColor(139, 92, 246);
    doc.text('FAULT DETAILS', 20, yPos);
    
    doc.setFillColor(55, 65, 81);
    const faultHeight = 40;
    doc.roundedRect(20, yPos + 5, pageWidth - 40, faultHeight, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    
    // Split fault description into multiple lines
    const faultDescription = faultyData.faultDescription || 'No description provided';
    const splitFault = doc.splitTextToSize(faultDescription, pageWidth - 50);
    doc.text(splitFault, 25, yPos + 15);
    
    yPos += faultHeight + 15;
    
    // Spares Needed Section
    if (faultyData.sparesNeeded?.length > 0 || faultyData.otherSpares) {
      doc.setFontSize(14);
      doc.setTextColor(139, 92, 246);
      doc.text('SPARES REQUIRED', 20, yPos);
      
      doc.setFillColor(55, 65, 81);
      doc.roundedRect(20, yPos + 5, pageWidth - 40, 20, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      
      const sparesList = [...(faultyData.sparesNeeded || [])];
      if (faultyData.otherSpares) {
        sparesList.push(faultyData.otherSpares);
      }
      
      doc.text(sparesList.join(', '), 25, yPos + 15);
      yPos += 30;
    }
    
    // Timeline Section
    doc.setFontSize(14);
    doc.setTextColor(139, 92, 246);
    doc.text('TIMELINE', 20, yPos);
    
    const timelineData = [
      ['Event', 'Date', 'Responsible Person'],
      ['Reported', faultyData.reportedAt?.toDate().toLocaleDateString() || 'N/A', faultyData.reportedByName || 'N/A'],
      ['Last Updated', faultyData.lastUpdated?.toDate().toLocaleDateString() || 'N/A', faultyData.updatedByName || 'N/A']
    ];
    
    if (faultyData.status === 'Fixed') {
      timelineData.push(['Repaired', faultyData.repairedAt?.toDate().toLocaleDateString() || 'N/A', faultyData.repairedByName || 'N/A']);
    }
    
    autoTable(doc, {
      startY: yPos + 10,
      head: timelineData.slice(0, 1),
      body: timelineData.slice(1),
      theme: 'grid',
      headStyles: { 
        fillColor: [139, 92, 246], 
        textColor: [255, 255, 255], 
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: { 
        textColor: [255, 255, 255], 
        fontSize: 9 
      },
      alternateRowStyles: { fillColor: [55, 65, 81] },
      margin: { left: 20, right: 20 },
      tableWidth: 'auto'
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    // Notes Section
    if (faultyData.notes) {
      doc.setFontSize(14);
      doc.setTextColor(139, 92, 246);
      doc.text('ADDITIONAL NOTES', 20, yPos);
      
      doc.setFillColor(55, 65, 81);
      doc.roundedRect(20, yPos + 5, pageWidth - 40, 30, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      
      const splitNotes = doc.splitTextToSize(faultyData.notes, pageWidth - 50);
      doc.text(splitNotes, 25, yPos + 15);
      
      yPos += 45;
    }
    
    // Status Badge
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    const statusColor = {
      'Reported': [234, 179, 8], // yellow-500
      'In Repair': [59, 130, 246], // blue-500
      'Fixed': [34, 197, 94], // green-500
      'EOS (End of Service)': [239, 68, 68], // red-500
      'Scrapped': [107, 114, 128] // gray-500
    };
    
    const color = statusColor[faultyData.status] || [107, 114, 128];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(pageWidth - 60, yPos + 5, 40, 15, 3, 3, 'F');
    doc.text(faultyData.status, pageWidth - 40, yPos + 12, { align: 'center' });
    
    // Add footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('Generated by KM Electronics Manager Dashboard', pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Page 1 of 1`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    
    // Save PDF
    const filename = `Faulty_Report_${faultyData.itemCode}_${faultyData.id || Date.now()}.pdf`;
    doc.save(filename);
  };

  // STYLISH SALES PDF REPORT
  const generateStylishPDFReport = (data, type = 'sales') => {
    if (!data) {
      alert('No report data available. Please generate a report first.');
      return;
    }

    try {
      if (type === 'sales') {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        
        // Add linear background
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        
        // Add header with logo
        doc.setFontSize(24);
        doc.setTextColor(139, 92, 246);
        doc.setFont('helvetica', 'bold');
        doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
        
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'normal');
        doc.text('SALES ANALYSIS REPORT', pageWidth / 2, 30, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text(`Report Period: ${data.period.startDate} to ${data.period.endDate}`, pageWidth / 2, 38, { align: 'center' });
        doc.text(`Location: ${data.period.location}`, pageWidth / 2, 44, { align: 'center' });
        
        // Summary Box
        doc.setFillColor(55, 65, 81);
        doc.roundedRect(20, 50, pageWidth - 40, 30, 3, 3, 'F');
        
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.text('REPORT SUMMARY', pageWidth / 2, 58, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(`Total Sales: ${data.summary.totalSales}`, 30, 68);
        doc.text(`Total Revenue: MK ${data.summary.totalRevenue.toLocaleString()}`, 80, 68);
        doc.text(`Avg.Sale Value: MK ${data.summary.averageSaleValue.toFixed(2)}`, 140, 68);
        
        let yPos = 90;
        
        // Sales by Location Table
        doc.setFontSize(12);
        doc.setTextColor(139, 92, 246);
        doc.text('SALES BY LOCATION', 20, yPos);
        yPos += 10;
        
        const locationData = Object.entries(data.salesByLocation).map(([location, metrics]) => [
          location,
          metrics.count.toString(),
          `MK ${metrics.revenue.toFixed(2)}`,
          data.summary.totalRevenue > 0 ? `${((metrics.revenue / data.summary.totalRevenue) * 100).toFixed(1)}%` : '0%'
        ]);
        
        if (locationData.length > 0) {
          autoTable(doc, {
            startY: yPos,
            head: [['Location', 'Sales Count', 'Revenue', 'Percentage']],
            body: locationData,
            theme: 'grid',
            headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontSize: 10 },
            bodyStyles: { textColor: [255, 255, 255], fontSize: 9 },
            alternateRowStyles: { fillColor: [55, 65, 81] },
            margin: { left: 20, right: 20 }
          });
          
          yPos = doc.lastAutoTable.finalY + 10;
        }
        
        // Top Products Table
        if (data.topProducts.length > 0) {
          doc.setFontSize(12);
          doc.setTextColor(139, 92, 246);
          doc.text('TOP PRODUCTS', 20, yPos);
          yPos += 10;
          
          const productData = data.topProducts.map(product => [
            product.product,
            product.count.toString(),
            `MK ${product.revenue.toFixed(2)}`,
            data.summary.totalRevenue > 0 ? `${((product.revenue / data.summary.totalRevenue) * 100).toFixed(1)}%` : '0%'
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Product', 'Sales Count', 'Revenue', 'Percentage']],
            body: productData,
            theme: 'grid',
            headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255], fontSize: 10 },
            bodyStyles: { textColor: [255, 255, 255], fontSize: 9 },
            alternateRowStyles: { fillColor: [55, 65, 81] },
            margin: { left: 20, right: 20 }
          });
        }
        
        // Add footer
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text('Generated by KM Electronics Manager Dashboard', pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
        
        // Save PDF
        const filename = `Sales_Report_${data.period.startDate}_to_${data.period.endDate}.pdf`;
        doc.save(filename);
      } else if (type === 'faulty') {
        generateFaultyPhonePDFReport(data);
      }
    } catch (error) {
      alert('Error generating PDF report. Please try again.', );
    }
  };

  // INSTALLMENT FUNCTIONS
  const openInstallmentModal = (sale) => {
    setSelectedSaleForInstallment(sale);
    setInstallmentData({
      saleId: sale.id,
      customerName: '',
      phoneNumber: '',
      totalAmount: sale.finalSalePrice,
      downPayment: 0,
      remainingAmount: sale.finalSalePrice,
      installmentPlan: '1',
      monthlyPayment: sale.finalSalePrice,
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: ''
    });
    setInstallmentModal(true);
  };

  const handleProcessInstallment = async () => {
    try {
      if (!installmentData.saleId || !installmentData.customerName || !installmentData.totalAmount) {
        alert('Please fill in required fields');
        return;
      }

      const installmentDataToSave = {
        ...installmentData,
        saleId: installmentData.saleId,
        customerName: installmentData.customerName,
        phoneNumber: installmentData.phoneNumber,
        totalAmount: parseFloat(installmentData.totalAmount),
        downPayment: parseFloat(installmentData.downPayment) || 0,
        remainingAmount: parseFloat(installmentData.totalAmount) - (parseFloat(installmentData.downPayment) || 0),
        installmentPlan: installmentData.installmentPlan,
        monthlyPayment: parseFloat(installmentData.monthlyPayment) || 0,
        nextPaymentDate: installmentData.nextPaymentDate,
        notes: installmentData.notes,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: user.fullName,
        location: user.location,
        status: 'active',
        payments: installmentData.downPayment > 0 ? [{
          amount: parseFloat(installmentData.downPayment),
          date: new Date().toISOString().split('T')[0],
          type: 'down_payment'
        }] : []
      };

      await addDoc(collection(db, 'installments'), installmentDataToSave);

      const saleRef = doc(db, 'sales', installmentData.saleId);
      await updateDoc(saleRef, {
        paymentType: 'installment',
        installmentId: (await addDoc(collection(db, 'installments'), installmentDataToSave)).id,
        updatedAt: serverTimestamp()
      });

      alert('Installment plan created successfully!');
      setInstallmentModal(false);
      setSelectedSaleForInstallment(null);
      setInstallmentData({
        saleId: '',
        customerName: '',
        phoneNumber: '',
        totalAmount: 0,
        downPayment: 0,
        remainingAmount: 0,
        installmentPlan: '1',
        monthlyPayment: 0,
        nextPaymentDate: '',
        notes: ''
      });

    } catch (error) {
      console.error('Error processing installment:', error);
      alert('Error creating installment plan. Please try again.');
    }
  };

  // Stock Request Functions - Manager can only INITIATE, cannot approve
  const handleRequestStock = async () => {
    // Clear previous errors
    setTransferErrors({});
    setIsTransferValidating(true);
    
    try {
      // Validate all fields
      if (!transferStock.itemCode.trim()) {
        setTransferErrors({ itemCode: 'Item Code is required' });
        setIsTransferValidating(false);
        return;
      }
      
      if (!transferStock.quantity) {
        setTransferErrors({ quantity: 'Quantity is required' });
        setIsTransferValidating(false);
        return;
      }
      
      const quantity = parseInt(transferStock.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        setTransferErrors({ quantity: 'Quantity must be greater than 0' });
        setIsTransferValidating(false);
        return;
      }
      
      if (!transferStock.fromLocation) {
        setTransferErrors({ fromLocation: 'Source location is required' });
        setIsTransferValidating(false);
        return;
      }
      
      if (!transferStock.toLocation) {
        setTransferErrors({ toLocation: 'Destination location is required' });
        setIsTransferValidating(false);
        return;
      }
      
      if (transferStock.fromLocation === transferStock.toLocation) {
        setTransferErrors({ toLocation: 'Source and destination locations must be different' });
        setIsTransferValidating(false);
        return;
      }
      
      // Validate stock availability in source location
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', transferStock.itemCode.trim()),
        where('location', '==', transferStock.fromLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        setTransferErrors({ itemCode: `Item not found in ${transferStock.fromLocation}` });
        setIsTransferValidating(false);
        return;
      }
      
      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();
      
      if (!stock.quantity || stock.quantity < quantity) {
        setTransferErrors({ quantity: `Insufficient stock! Only ${stock.quantity || 0} units available in ${transferStock.fromLocation}` });
        setIsTransferValidating(false);
        return;
      }
      
      // All validations passed, create the request
      const requestData = {
        itemCode: transferStock.itemCode.trim(),
        quantity: quantity,
        fromLocation: transferStock.fromLocation,
        toLocation: transferStock.toLocation,
        status: 'pending',
        requestedBy: user.uid,
        requestedByName: user.fullName,
        requestedByLocation: user.location,
        requestedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'stockRequests'), requestData);
      
      // Reset form
      setTransferStock({
        itemCode: '',
        quantity: '',
        fromLocation: '',
        toLocation: ''
      });
      setTransferErrors({});
      
      alert('Stock transfer request submitted successfully! Awaiting approval from admin/superadmin.');
    } catch (error) {
      console.error('Error requesting stock:', error);
      alert('Error submitting request. Please try again.');
    } finally {
      setIsTransferValidating(false);
    }
  };

  // UPDATED: Sales Report Functions - Fixed for manager permissions
  const generateSalesReport = useCallback(async () => {
    if (!reportFilters.startDate || !reportFilters.endDate) {
      alert('Please select both start and end dates.');
      return;
    }

    setGeneratingReport(true);
    try {
      const startDate = new Date(reportFilters.startDate);
      const endDate = new Date(reportFilters.endDate);
      endDate.setHours(23, 59, 59, 999);

      // Managers can only generate reports for their location
      const managerLocation = user?.location;
      
      // Build query - ALWAYS filter by manager's location
      const salesQuery = query(
        collection(db, 'sales'),
        where('location', '==', managerLocation),
        orderBy('soldAt', 'desc')
      );

      const querySnapshot = await getDocs(salesQuery);
      const allSales = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter sales by date range
      const filteredSales = allSales.filter(sale => {
        const saleDate = sale.soldAt?.toDate();
        if (!saleDate) return false;
        return saleDate >= startDate && saleDate <= endDate;
      });

      // Calculate report data
      const report = {
        period: {
          startDate: reportFilters.startDate,
          endDate: reportFilters.endDate,
          location: managerLocation // Always use manager's location
        },
        summary: {
          totalSales: filteredSales.length,
          totalRevenue: filteredSales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0),
          averageSaleValue: filteredSales.length > 0 
            ? filteredSales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0) / filteredSales.length 
            : 0
        },
        salesByLocation: {},
        salesByProduct: {},
        salesBySeller: {},
        dailySales: {},
        topProducts: [],
        topSellers: []
      };

      // Analyze data
      filteredSales.forEach(sale => {
        // Sales by location (will only be manager's location)
        const location = sale.location || 'Unknown';
        report.salesByLocation[location] = report.salesByLocation[location] || { count: 0, revenue: 0 };
        report.salesByLocation[location].count += 1;
        report.salesByLocation[location].revenue += sale.finalSalePrice || 0;

        // Sales by product
        const productKey = `${sale.brand} ${sale.model}`;
        report.salesByProduct[productKey] = report.salesByProduct[productKey] || { count: 0, revenue: 0 };
        report.salesByProduct[productKey].count += 1;
        report.salesByProduct[productKey].revenue += sale.finalSalePrice || 0;

        // Sales by seller
        const seller = sale.soldByName || sale.soldBy || 'Unknown';
        report.salesBySeller[seller] = report.salesBySeller[seller] || { count: 0, revenue: 0 };
        report.salesBySeller[seller].count += 1;
        report.salesBySeller[seller].revenue += sale.finalSalePrice || 0;

        // Daily sales
        const saleDate = sale.soldAt?.toDate();
        if (saleDate) {
          const dateKey = saleDate.toISOString().split('T')[0];
          report.dailySales[dateKey] = report.dailySales[dateKey] || { count: 0, revenue: 0 };
          report.dailySales[dateKey].count += 1;
          report.dailySales[dateKey].revenue += sale.finalSalePrice || 0;
        }
      });

      // Calculate top products (limit to 10)
      report.topProducts = Object.entries(report.salesByProduct)
        .map(([product, data]) => ({ product, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Calculate top sellers (limit to 10)
      report.topSellers = Object.entries(report.salesBySeller)
        .map(([seller, data]) => ({ seller, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      setReportData(report);
      alert('Report generated successfully!');
    } catch (error) {
      console.error('Error generating sales report:', error);
      if (error.code === 'failed-precondition') {
        alert('Report query requires an index. Please contact administrator to create the required index.');
      } else if (error.code === 'permission-denied') {
        alert('You do not have permission to generate this report. Please contact administrator.');
      } else {
        alert('Error generating report. Please try again.');
      }
    } finally {
      setGeneratingReport(false);
    }
  }, [reportFilters, user?.location]); // Added user location dependency

  // Filter Functions using tables
  const getFilteredAllStocks = () => {
    let filtered = stocksTable;
    
    if (searchTerm) {
      filtered = filtered.filter(stock => 
        stock.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.model?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterBrand) {
      filtered = filtered.filter(stock => stock.brand === filterBrand);
    }
    
    if (selectedLocation && selectedLocation !== 'all') {
      filtered = filtered.filter(stock => stock.location === selectedLocation);
    }
    
    return filtered;
  };

  const getFilteredLocationStocks = () => {
    let filtered = locationStocks;
    
    if (searchTerm) {
      filtered = filtered.filter(stock => 
        stock.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stock.model?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterBrand) {
      filtered = filtered.filter(stock => stock.brand === filterBrand);
    }
    
    return filtered;
  };

  const getFilteredFaultyPhones = () => {
    let filtered = faultyTable;
    
    if (searchTerm) {
      filtered = filtered.filter(faulty => 
        faulty.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faulty.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faulty.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        faulty.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterStatus) {
      filtered = filtered.filter(faulty => faulty.status === filterStatus);
    }
    
    return filtered;
  };

  const getFilteredSales = () => {
    if (selectedLocation === 'all') {
      return salesTable;
    }
    return salesTable.filter(sale => sale.location === selectedLocation);
  };

  const getFilteredStockRequests = () => {
    if (selectedLocation === 'all') {
      return stockRequests;
    }
    return stockRequests.filter(request => 
      request.fromLocation === selectedLocation || 
      request.toLocation === selectedLocation ||
      request.requestedByLocation === selectedLocation
    );
  };

  const calculateTotalStockValue = (stocksArray) => {
    return stocksArray.reduce((total, stock) => {
      return total + ((stock.costPrice || 0) * (stock.quantity || 0));
    }, 0);
  };

  // Filter users to exclude managers, admins, and superadmins from role/location changes
  const getFilteredUsers = () => {
    return usersTable;
  };

  // Helper functions
  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-300';
      case 'approved': return 'bg-green-500/20 text-green-300';
      case 'rejected': return 'bg-red-500/20 text-red-300';
      case 'failed': return 'bg-red-500/20 text-red-300';
      case 'completed': return 'bg-blue-500/20 text-blue-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  const getRoleBadgeColor = (role) => {
    return role === 'sales' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300';
  };

  const getStockStatusBadge = (quantity) => {
    return quantity > 10 ? 'bg-green-500/20 text-green-300' :
           quantity > 0 ? 'bg-orange-500/20 text-orange-300' :
           'bg-red-500/20 text-red-300';
  };

  const getUniqueBrands = () => {
    return [...new Set(stocksTable.map(stock => stock.brand).filter(Boolean))];
  };

  if (loading) {
    return (
      <div className={'min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center'}>
        <div className={'text-white'}>Loading Manager Dashboard...</div>
      </div>
    );
  }

  return (
    <div className={'min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900'}>
      {/* Header */}
      <header className={'bg-white/10 backdrop-blur-lg border-b border-white/20'}>
        <div className={'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
          <div className={'flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 space-y-4 sm:space-y-0'}>
            <div>
              <h1 className={'text-xl sm:text-2xl font-bold text-white'}>
                KM ELECTRONICS <span className={'text-orange-500'}>MANAGEMENT</span>
              </h1>
              <p className={'text-white/70 text-sm'}>
                Welcome, {user?.fullName} | Assigned Location: {user?.location}
              </p>
            </div>
            
            <div className={'flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-4'}>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className={'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm'}
              >
                <option value={'all'}>All Locations (View Only)</option>
                <option value={user?.location}>My Location: {user?.location} (Sell)</option>
                {LOCATIONS.map((location, index) => (
                  <option key={generateSafeKey('location-option', index, location)} value={location}>{location}</option>
                ))}
              </select>
              
              <button
                onClick={() => signOut(auth).then(() => router.push('/login'))}
                className={'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm'}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className={'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
        <div className={'border-b border-white/20'}>
          <nav className={'-mb-px flex flex-wrap space-x-4 sm:space-x-8 overflow-x-auto'}>
            {[
              { id: 'dashboard', name: 'Dashboard', mobileName: 'Dashboard' },
              { id: 'allStocks', name: 'View All Stocks', mobileName: 'All Stocks' },
              { id: 'myStocks', name: 'My Location Stocks', mobileName: 'My Stocks' },
              { id: 'quickSale', name: 'Quick Sale', mobileName: 'Quick Sale' },
              { id: 'salesHistory', name: 'Sales History', mobileName: 'Sales Hist.' },
              { id: 'faultyPhones', name: 'Faulty Phones', mobileName: 'Faulty' },
              { id: 'installments', name: 'Installments', mobileName: 'Installments' },
              { id: 'salesAnalysis', name: 'Sales Analysis', mobileName: 'Analysis' },
              { id: 'transfer', name: 'Stock Transfer', mobileName: 'Transfer' },
              { id: 'personnel', name: 'Personnel', mobileName: 'Personnel' },
              { id: 'requests', name: 'Requests', mobileName: 'Requests', count: getFilteredStockRequests().filter(r => r.status === 'pending').length }
            ].map((tab, index) => (
              <button
                key={generateSafeKey('tab', index, tab.id)}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-400'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                <span className="hidden sm:inline">{tab.name}</span>
                <span className="sm:hidden">{tab.mobileName}</span>
                {tab.count > 0 && (
                  <span className={'ml-1 sm:ml-2 bg-orange-500 text-white py-0.5 px-1 sm:px-2 rounded-full text-xs'}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className={'py-6'}>
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className={'space-y-6'}>
              {/* Analytics Cards */}
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6'>
                <div className='bg-white/5 rounded-lg p-4 sm:p-6 border border-white/10'>
                  <h3 className='text-white/70 text-xs sm:text-sm'>Total Stock Value (All Locations)</h3>
                  <p className='text-xl sm:text-2xl font-bold text-green-400'>
                    MK {calculateTotalStockValue(stocksTable).toLocaleString()}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-4 sm:p-6 border border-white/10'>
                  <h3 className='text-white/70 text-xs sm:text-sm'>My Location Stock Value</h3>
                  <p className='text-xl sm:text-2xl font-bold text-blue-400'>
                    MK {calculateTotalStockValue(locationStocks).toLocaleString()}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-4 sm:p-6 border border-white/10'>
                  <h3 className='text-white/70 text-xs sm:text-sm'>Total Sales (All)</h3>
                  <p className='text-xl sm:text-2xl font-bold text-purple-400'>
                    {salesAnalysis.totalSales}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-4 sm:p-6 border border-white/10'>
                  <h3 className='text-white/70 text-xs sm:text-sm'>Faulty Phones (My Location)</h3>
                  <p className='text-xl sm:text-2xl font-bold text-orange-400'>
                    {faultyTable.length}
                  </p>
                </div>
              </div>

              <div className={'grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6'}>
                {/* Live Sales Feed */}
                <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-4 sm:p-6'}>
                  <h2 className={'text-lg sm:text-xl font-semibold text-white mb-4'}>Live Sales Feed</h2>
                  <div className={'space-y-3 max-h-80 overflow-y-auto'}>
                    {realTimeSales.liveSales.slice(0, 5).map((sale, index) => (
                      <div key={generateSafeKey('live-sale', index, sale.id)} className={'flex flex-col sm:flex-row sm:justify-between sm:items-center p-3 bg-white/5 rounded-lg space-y-2 sm:space-y-0'}>
                        <div>
                          <div className={'text-white font-medium text-sm sm:text-base'}>{sale.brand} {sale.model}</div>
                          <div className={'text-white/70 text-xs sm:text-sm'}>
                            {sale.location} • {sale.soldByName}
                          </div>
                        </div>
                        <div className={'text-left sm:text-right'}>
                          <div className={'text-green-400 font-semibold text-sm sm:text-base'}>MK {sale.finalSalePrice || 0}</div>
                          <div className={'text-white/50 text-xs'}>
                            {sale.soldAt?.toDate().toLocaleTimeString() || 'Just now'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {realTimeSales.liveSales.length === 0 && (
                      <p className={'text-white/70 text-center py-4'}>No sales today</p>
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-4 sm:p-6'>
                  <h2 className='text-lg sm:text-xl font-semibold text-white mb-4'>Quick Actions</h2>
                  <div className='space-y-3'>
                    <button
                      onClick={() => setActiveTab('quickSale')}
                      className='w-full bg-blue-600 hover:bg-blue-700 text-blue-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold text-sm sm:text-base'>Quick Sale</div>
                      <div className='text-xs sm:text-sm'>Process a sale from your location</div>
                    </button>
                    <button
                      onClick={() => setActiveTab('myStocks')}
                      className='w-full bg-green-600 hover:bg-green-700 text-green-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold text-sm sm:text-base'>Sell from My Location</div>
                      <div className='text-xs sm:text-sm'>Browse and sell items from {user?.location}</div>
                    </button>
                    <button
                      onClick={() => setReportModal(true)}
                      className='w-full bg-orange-600 hover:bg-orange-700 text-orange-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold text-sm sm:text-base'>Report Faulty Phone</div>
                      <div className='text-xs sm:text-sm'>Report a faulty device from your location</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Stock Overview - My Location */}
              <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
                <h2 className={'text-xl font-semibold text-white mb-4'}>Stock Overview - {user?.location} (Your Location)</h2>
                <div className={'overflow-x-auto'}>
                  <table className={'w-full text-white'}>
                    <thead>
                      <tr className={'border-b border-white/20'}>
                        <th className={'text-left py-2'}>Item Code</th>
                        <th className={'text-left py-2'}>Brand & Model</th>
                        <th className={'text-left py-2 hidden sm:table-cell'}>Retail Price</th>
                        <th className={'text-left py-2'}>Available</th>
                        <th className={'text-left py-2'}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationStocks.slice(0, 5).map((stock, index) => {
                        return (
                          <tr key={generateSafeKey('stock', index, stock.id)} className={'border-b border-white/10'}>
                            <td className={'py-2 font-mono'}>{stock.itemCode}</td>
                            <td className={'py-2'}>
                              <div className={'font-semibold'}>{stock.brand} {stock.model}</div>
                              {stock.storage && <div className={'text-white/70 text-sm'}>Storage: {stock.storage}</div>}
                              {stock.color && <div className={'text-white/70 text-sm'}>Color: {stock.color}</div>}
                            </td>
                            <td className={'py-2 hidden sm:table-cell'}>
                              <div className={'text-green-400'}>MK {stock.retailPrice || 0}</div>
                              {stock.discountPercentage > 0 && (
                                <div className={'text-orange-400 text-sm'}>
                                  After discount: MK {(stock.retailPrice * (1 - (stock.discountPercentage || 0) / 100)).toFixed(2)}
                                </div>
                              )}
                            </td>
                            <td className={'py-2'}>
                              <span className={`px-2 py-1 rounded-full text-xs ${getStockStatusBadge(stock.quantity)}`}>
                                {stock.quantity || 0} units
                              </span>
                            </td>
                            <td className={'py-2'}>
                              <button
                                onClick={() => handleSellItem(stock.id, stock, 1)}
                                disabled={!stock.quantity || stock.quantity === 0}
                                className={'bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors'}
                              >
                                Sell 1
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {locationStocks.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-white/70">
                            No stocks available in your location
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* View All Stocks Tab */}
          {activeTab === 'allStocks' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>
                  All Stocks - {selectedLocation === 'all' ? 'All Locations' : selectedLocation}
                </h2>
                <div className={'text-white'}>
                  Total Value: MK {calculateTotalStockValue(getFilteredAllStocks()).toLocaleString()}
                  <div className="text-sm text-white/70">(View Only - Cannot Sell)</div>
                </div>
              </div>

              {/* Search and Filter */}
              <div className={'flex flex-col md:flex-row gap-4 mb-6'}>
                <input
                  type={'text'}
                  placeholder={'Search by item code, brand, or model...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={'flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                />
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className={'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                >
                  <option value={''}>All Brands</option>
                  {getUniqueBrands().map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setSearchTerm(''); setFilterBrand(''); }}
                  className={'bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors'}
                >
                  Clear
                </button>
              </div>

              {/* Stocks Table - View Only */}
              <div className={'overflow-x-auto'}>
                <table className={'w-full text-white'}>
                  <thead>
                    <tr className={'border-b border-white/20'}>
                      <th className={'text-left py-2'}>Location</th>
                      <th className={'text-left py-2'}>Item Code</th>
                      <th className={'text-left py-2'}>Brand & Model</th>
                      <th className={'text-left py-2'}>Retail Price</th>
                      <th className={'text-left py-2'}>Quantity</th>
                      <th className={'text-left py-2'}>Min Level</th>
                      <th className={'text-left py-2'}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAllStocks().map((stock, index) => (
                      <tr key={generateSafeKey('all-stock', index, stock.id)} className={'border-b border-white/10'}>
                        <td className={'py-2'}>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            stock.location === user?.location 
                              ? 'bg-green-500/20 text-green-300' 
                              : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {stock.location}
                            {stock.location === user?.location && ' (Yours)'}
                          </span>
                        </td>
                        <td className={'py-2 font-mono'}>{stock.itemCode}</td>
                        <td className={'py-2'}>{stock.brand} {stock.model}</td>
                        <td className={'py-2'}>MK {stock.retailPrice || 0}</td>
                        <td className={'py-2'}>{stock.quantity || 0}</td>
                        <td className={'py-2'}>{stock.minStockLevel || 0}</td>
                        <td className={'py-2'}>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            stock.location === user?.location 
                              ? 'bg-green-500/20 text-green-300' 
                              : 'bg-gray-500/20 text-gray-300'
                          }`}>
                            {stock.location === user?.location ? 'Can Sell' : 'View Only'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {getFilteredAllStocks().length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-white/70">
                          No stocks found matching your search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* My Location Stocks Tab */}
          {activeTab === 'myStocks' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>
                  My Location Stocks - {user?.location}
                </h2>
                <div className={'text-white'}>
                  Total Value: MK {calculateTotalStockValue(locationStocks).toLocaleString()}
                  <div className="text-sm text-green-400">(Can Sell)</div>
                </div>
              </div>

              {/* Search and Filter */}
              <div className={'flex flex-col md:flex-row gap-4 mb-6'}>
                <input
                  type={'text'}
                  placeholder={'Search by item code, brand, or model...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={'flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                />
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className={'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                >
                  <option value={''}>All Brands</option>
                  {[...new Set(locationStocks.map(stock => stock.brand).filter(Boolean))].map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setSearchTerm(''); setFilterBrand(''); }}
                  className={'bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors'}
                >
                  Clear
                </button>
              </div>

              {/* Stocks Table - Can Sell */}
              <div className={'overflow-x-auto'}>
                <table className={'w-full text-white'}>
                  <thead>
                    <tr className={'border-b border-white/20'}>
                      <th className={'text-left py-2'}>Item Code</th>
                      <th className={'text-left py-2'}>Brand & Model</th>
                      <th className={'text-left py-2 hidden sm:table-cell'}>Retail Price</th>
                      <th className={'text-left py-2 hidden md:table-cell'}>Discount</th>
                      <th className={'text-left py-2'}>Available</th>
                      <th className={'text-left py-2'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredLocationStocks().map((stock, index) => {
                      return (
                        <tr key={generateSafeKey('my-stock', index, stock.id)} className={'border-b border-white/10'}>
                          <td className={'py-2 font-mono'}>{stock.itemCode}</td>
                          <td className={'py-2'}>
                            <div className={'font-semibold'}>{stock.brand} {stock.model}</div>
                            {stock.storage && <div className={'text-white/70 text-sm'}>Storage: {stock.storage}</div>}
                            {stock.color && <div className={'text-white/70 text-sm'}>Color: {stock.color}</div>}
                          </td>
                          <td className={'py-2 hidden sm:table-cell'}>
                            <div className={'text-green-400'}>MK {stock.retailPrice || 0}</div>
                            {stock.discountPercentage > 0 && (
                              <div className={'text-orange-400 text-sm'}>
                                After discount: MK {(stock.retailPrice * (1 - (stock.discountPercentage || 0) / 100)).toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td className={'py-2 hidden md:table-cell'}>
                            {stock.discountPercentage > 0 ? (
                              <span className={'text-orange-400'}>{stock.discountPercentage}% OFF</span>
                            ) : (
                              <span className={'text-white/50'}>No discount</span>
                            )}
                          </td>
                          <td className={'py-2'}>
                            <span className={`px-2 py-1 rounded-full text-xs ${getStockStatusBadge(stock.quantity)}`}>
                              {stock.quantity || 0} units
                            </span>
                          </td>
                          <td className={'py-2'}>
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                              <button
                                onClick={() => handleSellItem(stock.id, stock, 1)}
                                disabled={!stock.quantity || stock.quantity === 0}
                                className={'bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors'}
                              >
                                Sell 1
                              </button>
                              {stock.quantity > 1 && (
                                <button
                                  onClick={() => {
                                    const quantity = prompt(`Enter quantity to sell (Available: ${stock.quantity}):`, '1');
                                    if (quantity && !isNaN(quantity) && parseInt(quantity) > 0) {
                                      handleSellItem(stock.id, stock, parseInt(quantity));
                                    }
                                  }}
                                  className={'bg-blue-600 hover:bg-blue-700 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors'}
                                >
                                  Sell Multiple
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {getFilteredLocationStocks().length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-8 text-white/70">
                          No stocks available in your location matching your search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quick Sale Tab */}
          {activeTab === 'quickSale' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>Quick Sale - {user?.location}</h2>
              
              <div className='max-w-md mx-auto space-y-6'>
                {/* Quick Sale Form */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Process Sale from Your Location</h3>
                  <div className='space-y-4'>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>Item Code</label>
                      <input
                        type='text'
                        placeholder='Enter item code...'
                        value={quickSale.itemCode}
                        onChange={(e) => setQuickSale({...quickSale, itemCode: e.target.value})}
                        className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                      />
                      <p className="text-xs text-orange-300 mt-1">Only items from {user?.location} can be sold</p>
                    </div>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>Quantity</label>
                      <input
                        type='number'
                        min='1'
                        value={quickSale.quantity}
                        onChange={(e) => setQuickSale({...quickSale, quantity: parseInt(e.target.value) || 1})}
                        className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                      />
                    </div>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>
                        Custom Price (Optional)
                        <span className='text-white/50 text-xs ml-1'>- Leave empty for standard price</span>
                      </label>
                      <input
                        type='number'
                        placeholder='Enter custom price...'
                        value={quickSale.customPrice}
                        onChange={(e) => setQuickSale({...quickSale, customPrice: e.target.value})}
                        className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                      />
                    </div>
                    <button
                      onClick={handleQuickSale}
                      disabled={!quickSale.itemCode}
                      className='w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors font-semibold'
                    >
                      Process Sale
                    </button>
                  </div>
                </div>

                {/* Recent Items from Your Location */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Available Items in {user?.location}</h3>
                  <div className='space-y-2'>
                    {locationStocks.slice(0, 5).map((stock) => (
                      <div 
                        key={stock.id} 
                        className='flex justify-between items-center p-2 hover:bg-white/5 rounded cursor-pointer'
                        onClick={() => setQuickSale(prev => ({...prev, itemCode: stock.itemCode}))}
                      >
                        <div>
                          <div className='text-white font-mono text-sm'>{stock.itemCode}</div>
                          <div className='text-white/70 text-xs'>{stock.brand} {stock.model}</div>
                        </div>
                        <div className='text-right'>
                          <div className='text-green-400 text-sm'>MK {stock.retailPrice || 0}</div>
                          <div className='text-white/50 text-xs'>{stock.quantity} available</div>
                        </div>
                      </div>
                    ))}
                    {locationStocks.length === 0 && (
                      <div className="text-center py-4 text-white/70">
                        No stocks available in your location
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sales History Tab */}
          {activeTab === 'salesHistory' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>Sales History</h2>
              
              <div className="flex items-center space-x-4 mb-6">
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className='bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                >
                  <option value='all'>All Locations</option>
                  <option value={user?.location}>My Location: {user?.location}</option>
                  {LOCATIONS.map((location, index) => (
                    <option key={generateSafeKey('sales-loc', index, location)} value={location}>{location}</option>
                  ))}
                </select>
              </div>
              
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Date</th>
                      <th className='text-left py-2'>Item</th>
                      <th className='text-left py-2'>Location</th>
                      <th className='text-left py-2'>Quantity</th>
                      <th className='text-left py-2'>Price</th>
                      <th className='text-left py-2'>Sold By</th>
                      <th className='text-left py-2'>Type</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredSales().map((sale) => (
                      <tr key={sale.id} className='border-b border-white/10'>
                        <td className='py-2'>
                          {sale.soldAt?.toDate().toLocaleDateString() || 'Unknown date'}
                        </td>
                        <td className='py-2'>
                          <div className='font-semibold'>{sale.brand} {sale.model}</div>
                          <div className='text-white/70 text-sm'>{sale.itemCode}</div>
                        </td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            sale.location === user?.location 
                              ? 'bg-green-500/20 text-green-300' 
                              : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {sale.location}
                          </span>
                        </td>
                        <td className='py-2'>{sale.quantity}</td>
                        <td className='py-2 text-green-400'>MK {sale.finalSalePrice || 0}</td>
                        <td className='py-2'>{sale.soldByName}</td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            sale.saleType === 'custom_price' 
                              ? 'bg-purple-500/20 text-purple-300' 
                              : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {sale.saleType === 'custom_price' ? 'Custom Price' : 'Standard'}
                          </span>
                        </td>
                        <td className='py-2 space-x-2'>
                          <button
                            onClick={() => openInstallmentModal(sale)}
                            className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                          >
                            Process Installment
                          </button>
                        </td>
                      </tr>
                    ))}
                    {getFilteredSales().length === 0 && (
                      <tr>
                        <td colSpan='8' className='text-center py-8 text-white/70'>
                          No sales history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Faulty Phones Tab */}
          {activeTab === 'faultyPhones' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Faulty Phones - {user?.location}</h2>
                <div className='space-x-2'>
                  <button
                    onClick={() => setReportModal(true)}
                    className='bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-colors'
                  >
                    + Report New Faulty
                  </button>
                </div>
              </div>

              {/* Search and Filter */}
              <div className={'flex flex-col md:flex-row gap-4 mb-6'}>
                <input
                  type='text'
                  placeholder='Search by item code, brand, model, or customer...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className='bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                >
                  <option value=''>All Status</option>
                  {FAULTY_STATUS.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setSearchTerm(''); setFilterStatus(''); }}
                  className='bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors'
                >
                  Clear
                </button>
              </div>

              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Item Code</th>
                      <th className='text-left py-2'>Brand & Model</th>
                      <th className='text-left py-2 hidden sm:table-cell'>Fault Description</th>
                      <th className='text-left py-2'>Status</th>
                      <th className='text-left py-2 hidden md:table-cell'>Cost</th>
                      <th className='text-left py-2 hidden lg:table-cell'>Reported Date</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredFaultyPhones().map((faulty, index) => (
                      <tr key={generateSafeKey('faulty', index, faulty.id)} className='border-b border-white/10 hover:bg-white/5'>
                        <td className='py-2 font-mono'>{faulty.itemCode}</td>
                        <td className='py-2'>
                          <div className='font-semibold'>{faulty.brand} {faulty.model}</div>
                          {faulty.imei && <div className='text-white/70 text-sm'>IMEI: {faulty.imei}</div>}
                        </td>
                        <td className='py-2 hidden sm:table-cell'>{faulty.faultDescription}</td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(faulty.status)}`}>
                            {faulty.status}
                          </span>
                        </td>
                        <td className='py-2 hidden md:table-cell'>
                          <div className='text-orange-400'>MK {faulty.reportedCost?.toLocaleString() || 0}</div>
                          {faulty.estimatedRepairCost > 0 && (
                            <div className='text-white/70 text-sm'>Est. Repair: MK {faulty.estimatedRepairCost}</div>
                          )}
                        </td>
                        <td className='py-2 hidden lg:table-cell'>
                          {faulty.reportedAt?.toDate().toLocaleDateString() || 'Unknown'}
                        </td>
                        <td className='py-2'>
                          <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
                            <button
                              onClick={() => generateFaultyPhonePDFReport(faulty)}
                              className='bg-blue-600 hover:bg-blue-700 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors'
                              title='Generate PDF Report'
                            >
                              PDF
                            </button>
                            <button
                              onClick={() => {
                                setSelectedFaulty(faulty);
                                setEditModal(true);
                              }}
                              className='bg-green-600 hover:bg-green-700 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm transition-colors'
                              title='Update Status'
                            >
                              Update
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {getFilteredFaultyPhones().length === 0 && (
                      <tr>
                        <td colSpan='4' className='text-center py-8 text-white/70'>
                          No faulty phones found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Installments Tab */}
          {activeTab === 'installments' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>Installment Plans - {user?.location}</h2>
              
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6'>
                {getFilteredSales().filter(sale => !sale.paymentType || sale.paymentType === 'full').slice(0, 6).map((sale) => (
                  <div key={sale.id} className='bg-white/5 rounded-lg p-4 border border-white/10'>
                    <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 space-y-2 sm:space-y-0'>
                      <div>
                        <div className='font-semibold text-white text-sm sm:text-base'>{sale.brand} {sale.model}</div>
                        <div className='text-white/70 text-xs sm:text-sm'>{sale.itemCode}</div>
                      </div>
                      <div className='text-green-400 font-semibold text-sm sm:text-base'>MK {sale.finalSalePrice}</div>
                    </div>
                    <div className='text-white/70 text-xs sm:text-sm mb-3'>
                      Sold on: {sale.soldAt?.toDate().toLocaleDateString()}
                    </div>
                    <button
                      onClick={() => openInstallmentModal(sale)}
                      className='w-full bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors text-sm'
                    >
                      Create Installment Plan
                    </button>
                  </div>
                ))}
                {getFilteredSales().filter(sale => !sale.paymentType || sale.paymentType === 'full').length === 0 && (
                  <div className='col-span-3 text-center py-8 text-white/70'>
                    No sales available for installment plans.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* UPDATED: Sales Analysis Report Tab */}
          {activeTab === 'salesAnalysis' && (
            <div className="bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-6">
                Sales Analysis Report - {user?.location}
              </h2>
              
              {/* Report Filters */}
              <div className="bg-white/5 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Report Filters</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Start Date *</label>
                    <input
                      type="date"
                      value={reportFilters.startDate}
                      onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm mb-2">End Date *</label>
                    <input
                      type="date"
                      value={reportFilters.endDate}
                      onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm mb-2">Location</label>
                    <div className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white">
                      {user?.location} (Your Location)
                    </div>
                    <p className="text-xs text-orange-300 mt-1">
                      Managers can only generate reports for their assigned location
                    </p>
                  </div>
                </div>
                
                <div className="flex space-x-4">
                  <button
                    onClick={generateSalesReport}
                    disabled={generatingReport || !reportFilters.startDate || !reportFilters.endDate}
                    className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <span>{generatingReport ? 'Generating...' : 'Generate Report'}</span>
                    {generatingReport && (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                  </button>
                  
                  <button
                    onClick={() => reportData && generateStylishPDFReport(reportData, 'sales')}
                    disabled={!reportData}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <span>Download PDF Report</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Report Preview */}
              {reportData && (
                <div className="space-y-6">
                  {/* Report Summary */}
                  <div className="bg-white/5 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Report Summary</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-blue-400">{reportData.summary.totalSales}</div>
                        <div className="text-white/70 text-sm">Total Sales</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-green-400">
                          MK {reportData.summary.totalRevenue.toLocaleString()}
                        </div>
                        <div className="text-white/70 text-sm">Total Revenue</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-purple-400">
                          MK {reportData.summary.averageSaleValue.toFixed(2)}
                        </div>
                        <div className="text-white/70 text-sm">Average Sale Value</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-orange-400">
                          {Object.keys(reportData.salesByProduct).length}
                        </div>
                        <div className="text-white/70 text-sm">Unique Products Sold</div>
                      </div>
                    </div>
                  </div>

                  {/* Top Products */}
                  <div className="bg-white/5 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Top Products</h3>
                    {reportData.topProducts.length > 0 ? (
                      <div className="space-y-2">
                        {reportData.topProducts.slice(0, 5).map((product, index) => (
                          <div key={`top-product-${index}`} className="flex justify-between items-center p-3 bg-white/5 rounded">
                            <div>
                              <div className="font-semibold text-white">{product.product}</div>
                              <div className="text-white/70 text-sm">{product.count} units sold</div>
                            </div>
                            <div className="text-green-400 font-semibold">
                              MK {product.revenue.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/70 text-center py-4">No sales data available for the selected period.</p>
                    )}
                  </div>

                  {/* Top Sellers */}
                  <div className="bg-white/5 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Top Performers</h3>
                    {reportData.topSellers.length > 0 ? (
                      <div className="space-y-2">
                        {reportData.topSellers.slice(0, 5).map((seller, index) => (
                          <div key={`top-seller-${index}`} className="flex justify-between items-center p-3 bg-white/5 rounded">
                            <div>
                              <div className="font-semibold text-white">{seller.seller}</div>
                              <div className="text-white/70 text-sm">{seller.count} sales</div>
                            </div>
                            <div className="text-purple-400 font-semibold">
                              MK {seller.revenue.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/70 text-center py-4">No sales data available for the selected period.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stock Transfer Tab */}
          {activeTab === 'transfer' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-4'}>Request Stock Transfer</h2>
              <p className="text-white/70 mb-6">Managers can initiate transfer requests. All fields are required and will be validated before submission.</p>
              
              <div className={'grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6'}>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Item Code *</label>
                  <input
                    type={'text'}
                    placeholder={'Enter item code'}
                    value={transferStock.itemCode}
                    onChange={(e) => setTransferStock({...transferStock, itemCode: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.itemCode ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                  />
                  {transferErrors.itemCode && (
                    <p className="text-red-400 text-sm mt-1">{transferErrors.itemCode}</p>
                  )}
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Quantity *</label>
                  <input
                    type={'number'}
                    min="1"
                    placeholder={'Enter quantity'}
                    value={transferStock.quantity}
                    onChange={(e) => setTransferStock({...transferStock, quantity: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.quantity ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                  />
                  {transferErrors.quantity && (
                    <p className="text-red-400 text-sm mt-1">{transferErrors.quantity}</p>
                  )}
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Source Location *</label>
                  <select
                    value={transferStock.fromLocation}
                    onChange={(e) => setTransferStock({...transferStock, fromLocation: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.fromLocation ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                  >
                    <option value={''}>Select Source Location</option>
                    {LOCATIONS.map((location, index) => (
                      <option key={generateSafeKey('from-location', index, location)} value={location}>{location}</option>
                    ))}
                  </select>
                  {transferErrors.fromLocation && (
                    <p className="text-red-400 text-sm mt-1">{transferErrors.fromLocation}</p>
                  )}
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Destination Location *</label>
                  <select
                    value={transferStock.toLocation}
                    onChange={(e) => setTransferStock({...transferStock, toLocation: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.toLocation ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                  >
                    <option value={''}>Select Destination Location</option>
                    {LOCATIONS.map((location, index) => (
                      <option key={generateSafeKey('to-location', index, location)} value={location}>{location}</option>
                    ))}
                  </select>
                  {transferErrors.toLocation && (
                    <p className="text-red-400 text-sm mt-1">{transferErrors.toLocation}</p>
                  )}
                </div>
                
                {transferErrors.submission && (
                  <div className="col-span-2">
                    <p className="text-red-400 text-sm">{transferErrors.submission}</p>
                  </div>
                )}
                
                <button
                  onClick={handleRequestStock}
                  disabled={isTransferValidating}
                  className={'bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 text-white px-6 py-3 rounded-lg transition-colors col-span-2 font-semibold'}
                >
                  {isTransferValidating ? 'Validating...' : 'Request Stock Transfer'}
                </button>
                <p className="text-white/50 text-sm col-span-2 text-center">
                  Note: All transfer requests require approval from Admin/SuperAdmin
                </p>
              </div>

              {/* Recent Transfer Requests */}
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-white mb-4">Recent Transfer Requests</h3>
                {getFilteredStockRequests().length > 0 ? (
                  <div className="space-y-4">
                    {getFilteredStockRequests().slice(0, 5).map((request, index) => (
                      <div key={generateSafeKey('request', index, request.id)} className="bg-white/5 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-white">Item: {request.itemCode}</div>
                            <div className="text-white/70 text-sm">
                              From: {request.fromLocation} → To: {request.toLocation}
                            </div>
                            <div className="text-white/70 text-sm">Quantity: {request.quantity}</div>
                            <div className="text-white/70 text-sm">Requested by: {request.requestedByName}</div>
                            <div className="text-white/70 text-sm mt-1">
                              Status: <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(request.status)}`}>
                                {request.status}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white/50 text-sm">
                              {request.requestedAt?.toDate().toLocaleDateString()}
                            </div>
                            <div className="text-white/70 text-sm">
                              {request.status === 'pending' ? 'Awaiting Approval' : 
                               request.status === 'approved' ? 'Approved' : 
                               request.status === 'rejected' ? 'Rejected' : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/70">No transfer requests found.</p>
                )}
              </div>
            </div>
          )}

          {/* Personnel Management Tab */}
          {activeTab === 'personnel' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-4'}>Personnel Management</h2>
              
              <div className={'overflow-x-auto'}>
                <table className={'w-full text-white'}>
                  <thead>
                    <tr className={'border-b border-white/20'}>
                      <th className={'text-left py-2 text-xs sm:text-sm'}>Name</th>
                      <th className={'text-left py-2 hidden sm:table-cell text-xs sm:text-sm'}>Email</th>
                      <th className={'text-left py-2 text-xs sm:text-sm'}>Role</th>
                      <th className={'text-left py-2 text-xs sm:text-sm'}>Location</th>
                      <th className={'text-left py-2 text-xs sm:text-sm'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredUsers().map((userItem, index) => (
                      <tr key={generateSafeKey('user', index, userItem.id)} className={'border-b border-white/10'}>
                        <td className={'py-2'}>
                          <div className="font-medium text-sm sm:text-base">{userItem.fullName}</div>
                          <div className="text-white/70 text-xs sm:hidden">{userItem.email}</div>
                        </td>
                        <td className={'py-2 hidden sm:table-cell text-sm'}>{userItem.email}</td>
                        <td className={'py-2'}>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300' :
                            userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300' :
                            userItem.role === 'dataEntry' ? 'bg-green-500/20 text-green-300' :
                            'bg-gray-500/20 text-gray-300'
                          }`}>
                            {userItem.role}
                          </span>
                        </td>
                        <td className={'py-2 text-sm'}>{userItem.location || 'Not assigned'}</td>
                        <td className={'py-2'}>
                          <div className="flex flex-col gap-2">
                            <select
                              value={userItem.role}
                              onChange={(e) => handleAssignRole(userItem.id, e.target.value, userItem.role)}
                              className={'bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs sm:text-sm w-full'}
                            >
                              <option value={'sales'}>Sales Personnel</option>
                              <option value={'dataEntry'}>Data Entry Clerk</option>
                              <option value={'user'}>Regular User</option>
                            </select>
                            <select
                              value={userItem.location || ''}
                              onChange={(e) => handleUpdateUserLocation(userItem.id, e.target.value, userItem.role)}
                              className={'bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs sm:text-sm w-full'}
                            >
                              <option value={''}>Select Location</option>
                              {LOCATIONS.map((location, index) => (
                                <option key={generateSafeKey('user-location', index, location)} value={location}>{location}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Requests Tab (View Only - Cannot Approve) */}
          {activeTab === 'requests' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-4'}>
                Stock Transfer Requests (View Only)
              </h2>
              <p className="text-white/70 mb-6">You can view all transfer requests. Only Admin/SuperAdmin can approve requests.</p>
              
              {getFilteredStockRequests().length === 0 ? (
                <p className={'text-white/70'}>No stock transfer requests found.</p>
              ) : (
                <div className={'space-y-4'}>
                  {getFilteredStockRequests().map((request, index) => (
                    <div key={generateSafeKey('stock-request', index, request.id)} className={'bg-white/5 rounded-lg p-4 border border-white/10'}>
                      <div className={'flex justify-between items-start'}>
                        <div className={'flex-1'}>
                          <div className={'flex items-center space-x-3 mb-2'}>
                            <h3 className={'font-semibold text-white'}>Item: {request.itemCode}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(request.status)}`}>
                              {request.status}
                            </span>
                          </div>
                          <div className={'grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm'}>
                            <div>
                              <span className={'text-white/70'}>Quantity: </span>
                              <span className={'text-white'}>{request.quantity}</span>
                            </div>
                            <div>
                              <span className={'text-white/70'}>From: </span>
                              <span className={'text-blue-300'}>{request.fromLocation}</span>
                            </div>
                            <div>
                              <span className={'text-white/70'}>To: </span>
                              <span className={'text-green-300'}>{request.toLocation}</span>
                            </div>
                            <div>
                              <span className={'text-white/70'}>Requested by: </span>
                              <span className={'text-white'}>{request.requestedByName}</span>
                            </div>
                            <div>
                              <span className={'text-white/70'}>Requested at: </span>
                              <span className={'text-white/50'}>
                                {request.requestedAt?.toDate().toLocaleString() || 'Unknown date'}
                              </span>
                            </div>
                            {request.validatedAt && (
                              <div>
                                <span className={'text-white/70'}>Validated by Manager: </span>
                                <span className={'text-white'}>{request.validatedByName || 'N/A'}</span>
                              </div>
                            )}
                            {request.approvedByName && (
                              <div>
                                <span className={'text-white/70'}>Approved by: </span>
                                <span className={'text-green-300'}>{request.approvedByName}</span>
                              </div>
                            )}
                            {request.rejectedByName && (
                              <div>
                                <span className={'text-white/70'}>Rejected by: </span>
                                <span className={'text-red-300'}>{request.rejectedByName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={'text-right'}>
                          <div className={'text-white/50 text-sm mb-2'}>
                            {request.status === 'pending' ? '⏳ Pending Approval' : 
                             request.status === 'approved' ? '✅ Approved' : 
                             request.status === 'rejected' ? '❌ Rejected' : 
                             request.status === 'failed' ? '⚠️ Failed' : ''}
                          </div>
                          {request.status === 'pending' && (
                            <div className="text-orange-300 text-sm font-semibold">
                              Awaiting Admin/SuperAdmin
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Report Faulty Phone Modal */}
      {reportModal && (
        <div className='fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4'>
          <div className='bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
            <div className='p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Report Faulty Phone - {user?.location}</h2>
                <button
                  onClick={() => setReportModal(false)}
                  className='text-white/70 hover:text-white'
                >
                  ✕
                </button>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-white/70 text-sm mb-2'>Item Code *</label>
                  <input
                    type='text'
                    value={faultyReport.itemCode}
                    onChange={(e) => setFaultyReport({...faultyReport, itemCode: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter item code'
                  />
                  <p className="text-xs text-orange-300 mt-1">Only items from {user?.location} can be reported</p>
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>IMEI (Optional)</label>
                  <input
                    type='text'
                    value={faultyReport.imei}
                    onChange={(e) => setFaultyReport({...faultyReport, imei: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter IMEI number'
                  />
                </div>

                <div className='sm:col-span-2'>
                  <label className='block text-white/70 text-sm mb-2'>Fault Description *</label>
                  <textarea
                    value={faultyReport.faultDescription}
                    onChange={(e) => setFaultyReport({...faultyReport, faultDescription: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white h-24'
                    placeholder='Describe the fault in detail...'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Reported Cost (MWK)</label>
                  <input
                    type='number'
                    value={faultyReport.reportedCost}
                    onChange={(e) => setFaultyReport({...faultyReport, reportedCost: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='0'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Estimated Repair Cost (MWK)</label>
                  <input
                    type='number'
                    value={faultyReport.estimatedRepairCost}
                    onChange={(e) => setFaultyReport({...faultyReport, estimatedRepairCost: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='0'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Status</label>
                  <select
                    value={faultyReport.status}
                    onChange={(e) => setFaultyReport({...faultyReport, status: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                  >
                    {FAULTY_STATUS.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                <div className='sm:col-span-2'>
                  <label className='block text-white/70 text-sm mb-2'>Spares Needed</label>
                  <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
                    {SPARES_OPTIONS.map(spare => (
                      <label key={spare} className='flex items-center'>
                        <input
                          type='checkbox'
                          checked={faultyReport.sparesNeeded.includes(spare)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFaultyReport({
                                ...faultyReport,
                                sparesNeeded: [...faultyReport.sparesNeeded, spare]
                              });
                            } else {
                              setFaultyReport({
                                ...faultyReport,
                                sparesNeeded: faultyReport.sparesNeeded.filter(s => s !== spare)
                              });
                            }
                          }}
                          className='mr-2'
                        />
                        <span className='text-white/80 text-sm'>{spare}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className='md:col-span-2'>
                  <label className='block text-white/70 text-sm mb-2'>Other Spares (Specify)</label>
                  <input
                    type='text'
                    value={faultyReport.otherSpares}
                    onChange={(e) => setFaultyReport({...faultyReport, otherSpares: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Specify other spares needed...'
                  />
                </div>

                <div className='md:col-span-2'>
                  <label className='block text-white/70 text-sm mb-2'>Notes</label>
                  <textarea
                    value={faultyReport.notes}
                    onChange={(e) => setFaultyReport({...faultyReport, notes: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white h-20'
                    placeholder='Additional notes...'
                  />
                </div>
              </div>

              <div className='flex justify-end space-x-3 mt-6'>
                <button
                  onClick={() => setReportModal(false)}
                  className='px-4 py-2 text-white/70 hover:text-white'
                >
                  Cancel
                </button>
                <button
                  onClick={handleReportFaulty}
                  className='bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg transition-colors'
                >
                  Report Faulty
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installment Modal */}
      {installmentModal && selectedSaleForInstallment && (
        <div className='fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4'>
          <div className='bg-slate-800 rounded-lg max-w-md w-full'>
            <div className='p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Create Installment Plan</h2>
                <button
                  onClick={() => {
                    setInstallmentModal(false);
                    setSelectedSaleForInstallment(null);
                  }}
                  className='text-white/70 hover:text-white'
                >
                  ✕
                </button>
              </div>

              <div className='space-y-4'>
                <div>
                  <label className='block text-white/70 text-sm mb-2'>Customer Name *</label>
                  <input
                    type='text'
                    value={installmentData.customerName}
                    onChange={(e) => setInstallmentData({...installmentData, customerName: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter customer name'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Phone Number</label>
                  <input
                    type='tel'
                    value={installmentData.phoneNumber}
                    onChange={(e) => setInstallmentData({...installmentData, phoneNumber: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter phone number'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Total Amount (MWK)</label>
                  <input
                    type='number'
                    value={installmentData.totalAmount}
                    onChange={(e) => setInstallmentData({...installmentData, totalAmount: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    readOnly
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Down Payment (MWK)</label>
                  <input
                    type='number'
                    value={installmentData.downPayment}
                    onChange={(e) => {
                      const downPayment = parseFloat(e.target.value) || 0;
                      setInstallmentData({
                        ...installmentData,
                        downPayment: downPayment,
                        remainingAmount: installmentData.totalAmount - downPayment
                      });
                    }}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter down payment'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Installment Plan (Months)</label>
                  <select
                    value={installmentData.installmentPlan}
                    onChange={(e) => {
                      const months = parseInt(e.target.value);
                      const monthlyPayment = (installmentData.totalAmount - installmentData.downPayment) / months;
                      setInstallmentData({
                        ...installmentData,
                        installmentPlan: e.target.value,
                        monthlyPayment: monthlyPayment
                      });
                    }}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                  >
                    <option value='1'>1 Month</option>
                    <option value='2'>2 Months</option>
                    <option value='3'>3 Months</option>
                    <option value='4'>4 Months</option>
                    <option value='5'>5 Months</option>
                    <option value='6'>6 Months</option>
                  </select>
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Monthly Payment (MWK)</label>
                  <input
                    type='number'
                    value={installmentData.monthlyPayment}
                    onChange={(e) => setInstallmentData({...installmentData, monthlyPayment: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    readOnly
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Next Payment Date</label>
                  <input
                    type='date'
                    value={installmentData.nextPaymentDate}
                    onChange={(e) => setInstallmentData({...installmentData, nextPaymentDate: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Note</label>
                  <textarea
                    value={installmentData.notes}
                    onChange={(e) => setInstallmentData({...installmentData, notes: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white h-20'
                    placeholder='Additional notes...'
                  />
                </div>
              </div>

              <div className='flex justify-end space-x-3 mt-6'>
                <button
                  onClick={() => {
                    setInstallmentModal(false);
                    setSelectedSaleForInstallment(null);
                  }}
                  className='px-4 py-2 text-white/70 hover:text-white'
                >
                  Cancel
                </button>
                <button
                  onClick={handleProcessInstallment}
                  className='bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors'
                >
                  Create Installment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full fixed bottom-0 left-0 z-10 bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-200 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
        </div>
      </footer>
    </div>
  );
}