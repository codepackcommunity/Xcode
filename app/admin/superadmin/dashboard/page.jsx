'use client'
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, getDoc,
  Timestamp, deleteDoc, setDoc, writeBatch
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ==================== DATABASE STRUCTURE ====================
/*
ALL COLLECTIONS MUST HAVE THESE EXACT STRUCTURES:

1. users (User Management)
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

2. stocks (Inventory Management) - COMPATIBLE WITH INSTALLMENT SYSTEM
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

3. sales (Sales Records)
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

4. stockRequests (Stock Transfers)
   - id (auto)
   - itemCode: string
   - brand: string
   - model: string
   - quantity: number
   - fromLocation: string
   - toLocation: string
   - requestedBy: uid
   - requestedByName: string
   - requestedAt: timestamp
   - status: 'pending' | 'approved' | 'rejected' | 'failed'
   - approvedBy: uid
   - approvedByName: string
   - approvedAt: timestamp
   - rejectedBy: uid
   - rejectedByName: string
   - rejectedAt: timestamp
   - rejectionReason: string
   - sourceStockId: string (reference to stocks.id)

5. stockTransfers (Transfer History)
   - id (auto)
   - requestId: string (reference to stockRequests.id)
   - itemCode: string
   - brand: string
   - model: string
   - quantity: number
   - fromLocation: string
   - toLocation: string
   - transferredBy: uid
   - transferredByName: string
   - transferredAt: timestamp
   - type: 'approved_transfer' | 'rejected_transfer'
   - sourceStockBefore: number
   - sourceStockAfter: number

6. approvalSettings (System Settings)
   - id: 'system_settings' (single document)
   - requireApproval: boolean
   - autoApproveBelow: number
   - allowedLocations: array
   - updatedAt: timestamp
   - updatedBy: uid

7. userApprovalHistory (Audit Log)
   - id (auto)
   - userId: string
   - userEmail: string
   - userName: string
   - action: 'approved' | 'rejected'
   - previousRole: string
   - newRole: string
   - previousLocation: string
   - newLocation: string
   - processedBy: uid
   - processedByName: string
   - processedAt: timestamp
   - notes: string

8. installmentPayments (for compatibility with installment system)
   - id (auto)
   - installmentId: string (reference to installments collection)
   - customerName: string
   - customerPhone: string
   - amount: number
   - paymentType: 'initial' | 'installment' | 'full_payment'
   - paymentDate: timestamp
   - paymentMethod: 'cash' | 'mobile_money' | 'bank_transfer'
   - receiptNumber: string
   - recordedBy: uid
   - recordedByName: string
   - notes: string
   - createdAt: timestamp

9. installments (for compatibility - can be added later)
   - Will use same structure as installment system
*/

// Available locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'TV', 'Audio', 'Other'];

// Safe key generator that prevents duplicate key errors
const generateSafeKey = (prefix = 'item', index, id) => {
  // Use the document ID if available, otherwise create a unique key
  if (id) {
    return `${prefix}-${id}`;
  }
  // Fallback: use index with timestamp to ensure uniqueness
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Initialize database collections if they don't exist
const initializeDatabaseCollections = async (user) => {
  try {
    // Check and create approval settings if not exists
    const settingsRef = doc(db, 'approvalSettings', 'system_settings');
    const settingsDoc = await getDoc(settingsRef);
    
    if (!settingsDoc.exists()) {
      await setDoc(settingsRef, {
        requireApproval: true,
        autoApproveBelow: 10,
        allowedLocations: LOCATIONS,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName || user.email
      });
    }

    // Check and create user if not in users collection
    const userQuery = query(collection(db, 'users'), where('uid', '==', user.uid));
    const userDocs = await getDocs(userQuery);
    
    if (userDocs.empty) {
      await addDoc(collection(db, 'users'), {
        uid: user.uid,
        email: user.email,
        fullName: user.displayName || user.email.split('@')[0],
        role: 'superadmin',
        location: 'Lilongwe',
        status: 'approved',
        phone: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        approvedBy: user.uid,
        approvedByName: 'System',
        approvedAt: serverTimestamp()
      });
    }

    return true;
  } catch (error) {
    console.error('Database initialization error:', error);
    return false;
  }
};

export default function SuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // User Management State
  const [allUsers, setAllUsers] = useState([]);

  // Stocks & Locations State
  const [stocks, setStocks] = useState([]);
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

  // New Stock State (updated for compatibility)
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

  // Approval System State
  const [approvalSettings, setApprovalSettings] = useState({
    requireApproval: true,
    autoApproveBelow: 10,
    allowedLocations: LOCATIONS
  });

  // User Approvals State
  const [userApprovals, setUserApprovals] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);

  const [processingRequest, setProcessingRequest] = useState(null);
  const [processingUser, setProcessingUser] = useState(null);
  const [timePeriod, setTimePeriod] = useState('today');

  // Sales Report State
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: '',
    location: 'all',
    reportType: 'detailed'
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [generatedReport, setGeneratedReport] = useState(null);

  // Error State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Format currency for consistency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // Performance Helpers (moved outside to prevent dependency issues)
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

  // Calculate real-time sales
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

  // Calculate location performance
  const calculateLocationPerformance = useCallback((salesData) => {
    try {
      const locationMetrics = {};
      const today = new Date();
      const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      LOCATIONS.forEach(location => {
        locationMetrics[location] = {
          totalRevenue: 0,
          todayRevenue: 0,
          weeklyRevenue: 0,
          monthlyRevenue: 0,
          salesCount: 0,
          averageSaleValue: 0,
          peakHours: {},
          topSellers: {}
        };
      });

      salesData.forEach(sale => {
        const location = sale.location || 'Unknown';
        if (locationMetrics[location]) {
          const saleDate = sale.soldAt?.toDate();
          const revenue = sale.finalSalePrice || 0;
          
          locationMetrics[location].totalRevenue += revenue;
          locationMetrics[location].salesCount += 1;

          if (saleDate && saleDate >= new Date(today.setHours(0, 0, 0, 0))) {
            locationMetrics[location].todayRevenue += revenue;
          }

          if (saleDate && saleDate >= oneWeekAgo) {
            locationMetrics[location].weeklyRevenue += revenue;
          }

          if (saleDate && saleDate >= oneMonthAgo) {
            locationMetrics[location].monthlyRevenue += revenue;
          }

          if (saleDate) {
            const hour = saleDate.getHours();
            locationMetrics[location].peakHours[hour] = (locationMetrics[location].peakHours[hour] || 0) + 1;
          }

          const seller = sale.soldByName || sale.soldBy;
          locationMetrics[location].topSellers[seller] = (locationMetrics[location].topSellers[seller] || 0) + revenue;
        }
      });

      const locationPerformance = {};
      const allRevenues = Object.values(locationMetrics).map(metric => metric.totalRevenue);
      const maxRevenue = Math.max(...allRevenues);
      const minRevenue = Math.min(...allRevenues);

      Object.keys(locationMetrics).forEach(location => {
        const metric = locationMetrics[location];
        
        const revenueScore = maxRevenue > minRevenue 
          ? ((metric.totalRevenue - minRevenue) / (maxRevenue - minRevenue)) * 40
          : 20;

        const growthRate = metric.monthlyRevenue > 0 
          ? ((metric.weeklyRevenue / metric.monthlyRevenue) * 4) - 1
          : 0;
        const growthScore = Math.min(Math.max(growthRate * 30, 0), 30);

        const efficiency = metric.salesCount > 0 
          ? (metric.totalRevenue / metric.salesCount) / 1000
          : 0;
        const efficiencyScore = Math.min(efficiency * 20, 20);

        const todayActivity = metric.todayRevenue > 0 ? 10 : 0;

        const totalScore = revenueScore + growthScore + efficiencyScore + todayActivity;
        
        locationPerformance[location] = {
          score: Math.round(totalScore),
          grade: getPerformanceGrade(totalScore),
          metrics: metric,
          trend: growthRate > 0.1 ? 'up' : growthRate < -0.1 ? 'down' : 'stable'
        };
      });

      setSalesAnalysis(prev => ({
        ...prev,
        locationPerformance
      }));
    } catch (error) {
      setError('Error calculating location performance');
    }
  }, []);

  // Calculate sales analysis
  const calculateSalesAnalysis = useCallback((salesData) => {
    try {
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
    } catch (error) {
      setError('Error calculating sales analysis');
    }
  }, [salesAnalysis.locationPerformance]);

  // Fetch all data functions
  const fetchAllUsers = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const users = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(users);
    } catch (error) {
      setError('Failed to fetch users');
    }
  }, []);

  const fetchAllStocks = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'stocks'));
      const stocksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
    } catch (error) {
      setError('Failed to fetch stocks');
    }
  }, []);

  const fetchAllSalesAnalysis = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'sales'));
      const salesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      calculateSalesAnalysis(salesData);
    } catch (error) {
      setError('Failed to fetch sales data');
    }
  }, [calculateSalesAnalysis]);

  const fetchAllStockRequests = useCallback(async () => {
    try {
      const q = query(
        collection(db, 'stockRequests'),
        where('status', '==', 'pending')
      );
      const querySnapshot = await getDocs(q);
      const requestsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStockRequests(requestsData);
    } catch (error) {
      setError('Failed to fetch stock requests');
    }
  }, []);

  const fetchApprovalSettings = useCallback(async () => {
    try {
      const settingsRef = doc(db, 'approvalSettings', 'system_settings');
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const settings = settingsDoc.data();
        setApprovalSettings(settings);
      }
    } catch (error) {
      // Silently fail for settings
      return;
    }
  }, []);

  const fetchUserApprovals = useCallback(async () => {
    try {
      // Fetch pending users
      const q = query(
        collection(db, 'users'),
        where('status', '==', 'pending')
      );
      const querySnapshot = await getDocs(q);
      const pendingUsersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingUsers(pendingUsersData);
      
      // Fetch recently approved/rejected users for history
      const historyQ = query(
        collection(db, 'users'),
        where('status', 'in', ['approved', 'rejected'])
      );
      const historySnapshot = await getDocs(historyQ);
      const historyData = historySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUserApprovals(historyData);
      
    } catch (error) {
      setError('Failed to fetch user approvals');
      router.push('/login');
    }
  }, [router]);

  // Setup realtime listeners
  const setupRealtimeListeners = useCallback(() => {
    if (!user) return;

    // Real-time stock updates
    const stocksQuery = query(collection(db, 'stocks'));
    
    const unsubscribeStocks = onSnapshot(stocksQuery, (snapshot) => {
      const stocksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
    }, (error) => {
      setError('Failed to listen to stock updates');
    });

    // Real-time sales updates
    const salesQuery = query(
      collection(db, 'sales'),
      orderBy('soldAt', 'desc')
    );

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const salesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      calculateSalesAnalysis(salesData);
      calculateRealTimeSales(salesData);
      calculateLocationPerformance(salesData);
    }, (error) => {
      setError('Failed to listen to sales updates');
    });

    // Real-time stock requests
    const requestsQuery = query(
      collection(db, 'stockRequests'),
      where('status', '==', 'pending')
    );

    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStockRequests(requestsData);
    }, (error) => {
      setError('Failed to listen to stock requests');
    });

    // Real-time user approvals
    const pendingUsersQuery = query(
      collection(db, 'users'),
      where('status', '==', 'pending')
    );

    const unsubscribeUsers = onSnapshot(pendingUsersQuery, (snapshot) => {
      const pendingUsersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPendingUsers(pendingUsersData);
    }, (error) => {
      setError('Failed to listen to user approvals');
    });

    return () => {
      unsubscribeStocks();
      unsubscribeSales();
      unsubscribeRequests();
      unsubscribeUsers();
    };
  }, [user, calculateSalesAnalysis, calculateRealTimeSales, calculateLocationPerformance]);

  const initializeDashboard = useCallback(async () => {
    try {
      await Promise.all([
        fetchAllUsers(),
        fetchAllStocks(),
        fetchAllSalesAnalysis(),
        fetchAllStockRequests(),
        fetchApprovalSettings(),
        fetchUserApprovals()
      ]);
      setupRealtimeListeners();
    } catch (error) {
      setError('Failed to initialize dashboard');
    }
  }, [
    fetchAllUsers,
    fetchAllStocks,
    fetchAllSalesAnalysis,
    fetchAllStockRequests,
    fetchApprovalSettings,
    fetchUserApprovals,
    setupRealtimeListeners
  ]);

  // Stock Management Download Functions
  const downloadStockListExcel = () => {
    try {
      const filteredStocks = getFilteredStocks();
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Stock List Sheet
      const stockRows = filteredStocks.map(stock => ({
        'Location': stock.location,
        'Item Code': stock.itemCode,
        'Brand': stock.brand || 'N/A',
        'Model': stock.model || 'N/A',
        'Category': stock.category || 'N/A',
        'Color': stock.color || 'N/A',
        'Storage': stock.storage || 'N/A',
        'Quantity': stock.quantity || 0,
        'Cost Price': stock.costPrice || 0,
        'Retail Price': stock.retailPrice || 0,
        'Wholesale Price': stock.wholesalePrice || 0,
        'Discount (%)': stock.discountPercentage || 0,
        'Total Value': (stock.costPrice || 0) * (stock.quantity || 0),
        'Added By': stock.addedByName || 'System',
        'Added Date': stock.createdAt?.toDate().toLocaleDateString() || 'Unknown',
        'Last Updated': stock.updatedAt?.toDate().toLocaleDateString() || 'Unknown'
      }));
      
      const stockWs = XLSX.utils.json_to_sheet(stockRows);
      XLSX.utils.book_append_sheet(wb, stockWs, 'Stock List');
      
      // Summary Sheet
      const summaryData = [
        ['KM ELECTRONICS - STOCK INVENTORY REPORT'],
        ['Generated on:', new Date().toLocaleString()],
        ['Location Filter:', selectedLocation === 'all' ? 'All Locations' : selectedLocation],
        [],
        ['SUMMARY STATISTICS'],
        ['Total Items:', filteredStocks.length],
        ['Total Quantity:', filteredStocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0)],
        ['Total Cost Value:', filteredStocks.reduce((sum, stock) => sum + ((stock.costPrice || 0) * (stock.quantity || 0)), 0)],
        ['Total Retail Value:', filteredStocks.reduce((sum, stock) => sum + ((stock.retailPrice || 0) * (stock.quantity || 0)), 0)],
        [],
        ['LOCATION-WISE SUMMARY']
      ];
      
      // Group by location
      const locationSummary = {};
      filteredStocks.forEach(stock => {
        const location = stock.location;
        if (!locationSummary[location]) {
          locationSummary[location] = {
            count: 0,
            quantity: 0,
            costValue: 0,
            retailValue: 0
          };
        }
        locationSummary[location].count++;
        locationSummary[location].quantity += stock.quantity || 0;
        locationSummary[location].costValue += (stock.costPrice || 0) * (stock.quantity || 0);
        locationSummary[location].retailValue += (stock.retailPrice || 0) * (stock.quantity || 0);
      });
      
      Object.entries(locationSummary).forEach(([location, data]) => {
        summaryData.push([
          `${location}:`,
          `Items: ${data.count}, Quantity: ${data.quantity}, Cost Value: ${formatCurrency(data.costValue)}, Retail Value: ${formatCurrency(data.retailValue)}`
        ]);
      });
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
      
      // Generate filename
      const locationText = selectedLocation === 'all' ? 'all_locations' : selectedLocation;
      const filename = `KM_Stock_Inventory_${locationText}_${new Date().getTime()}.xlsx`;
      
      // Download
      XLSX.writeFile(wb, filename);
      return true;
    } catch (error) {
      setError('Failed to generate Excel stock list');
      return false;
    }
  };

  const downloadStockListPDF = () => {
    try {
      const filteredStocks = getFilteredStocks();
      
      // Initialize PDF
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Add KM ELECTRONICS header
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('Stock Inventory Report', pageWidth / 2, 28, { align: 'center' });
      
      // Report details
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 38);
      doc.text(`Location: ${selectedLocation === 'all' ? 'All Locations' : selectedLocation}`, 20, 45);
      doc.text(`Total Items: ${filteredStocks.length}`, pageWidth - 20, 38, { align: 'right' });
      doc.text(`Total Quantity: ${filteredStocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0)}`, pageWidth - 20, 45, { align: 'right' });
      
      // Prepare table data
      const tableData = filteredStocks.map(stock => [
        stock.location || 'N/A',
        stock.itemCode || 'N/A',
        `${stock.brand || ''} ${stock.model || ''}`.trim(),
        stock.category || 'N/A',
        stock.quantity || 0,
        formatCurrency(stock.costPrice || 0),
        formatCurrency(stock.retailPrice || 0),
        `${stock.discountPercentage || 0}%`,
        formatCurrency((stock.costPrice || 0) * (stock.quantity || 0))
      ]);
      
      // Add table
      autoTable(doc, {
        startY: 55,
        head: [['Location', 'Item Code', 'Product', 'Category', 'Qty', 'Cost Price', 'Retail Price', 'Discount', 'Total Value']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
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
        margin: { top: 55 },
        styles: {
          overflow: 'linebreak',
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 30 },
          2: { cellWidth: 40 },
          3: { cellWidth: 25 },
          4: { cellWidth: 15 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
          7: { cellWidth: 20 },
          8: { cellWidth: 30 }
        }
      });
      
      // Add summary section
      const finalY = doc.lastAutoTable.finalY + 10;
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 20, finalY);
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      
      const totalCostValue = filteredStocks.reduce((sum, stock) => sum + ((stock.costPrice || 0) * (stock.quantity || 0)), 0);
      const totalRetailValue = filteredStocks.reduce((sum, stock) => sum + ((stock.retailPrice || 0) * (stock.quantity || 0)), 0);
      const potentialProfit = totalRetailValue - totalCostValue;
      
      doc.text(`Total Cost Value: ${formatCurrency(totalCostValue)}`, 20, finalY + 8);
      doc.text(`Total Retail Value: ${formatCurrency(totalRetailValue)}`, 20, finalY + 16);
      doc.text(`Potential Profit: ${formatCurrency(potentialProfit)}`, 20, finalY + 24);
      
      // Add footer with timestamp
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      const footerY = pageHeight - 10;
      doc.text(`Report generated on ${new Date().toLocaleString()}`, pageWidth / 2, footerY, { align: 'center' });
      doc.text(`Page 1 of 1`, pageWidth - 10, footerY, { align: 'right' });
      
      // Save PDF
      const locationText = selectedLocation === 'all' ? 'all_locations' : selectedLocation;
      const filename = `KM_Stock_Inventory_${locationText}_${new Date().getTime()}.pdf`;
      doc.save(filename);
      
      return true;
    } catch (error) {
      setError('Failed to generate PDF stock list');
      return false;
    }
  };

  const handleDownloadStockList = () => {
    const filteredStocks = getFilteredStocks();
    
    if (filteredStocks.length === 0) {
      alert('No stock data available for download.');
      return;
    }
    
    const format = window.confirm('Download stock list as PDF?\nClick OK for PDF, Cancel for Excel.');
    
    let success = false;
    if (format) {
      success = downloadStockListPDF();
    } else {
      success = downloadStockListExcel();
    }
    
    if (success) {
      setSuccess(`Stock list downloaded successfully!\n\nTotal Items: ${filteredStocks.length}\nTotal Quantity: ${filteredStocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0)}`);
    } else {
      setError('Failed to download stock list. Please try again.');
    }
  };

  // Sales Report Functions
  const filterSalesByDateAndLocation = (salesData) => {
    let filtered = [...salesData];
    
    // Filter by date range
    if (reportFilters.startDate) {
      const start = new Date(reportFilters.startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(sale => {
        const saleDate = sale.soldAt?.toDate();
        return saleDate && saleDate >= start;
      });
    }
    
    if (reportFilters.endDate) {
      const end = new Date(reportFilters.endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(sale => {
        const saleDate = sale.soldAt?.toDate();
        return saleDate && saleDate <= end;
      });
    }
    
    // Filter by location
    if (reportFilters.location !== 'all') {
      filtered = filtered.filter(sale => sale.location === reportFilters.location);
    }
    
    return filtered;
  };

  const generateLocationSummary = (filteredSales) => {
    const summary = {};
    
    filteredSales.forEach(sale => {
      const location = sale.location || 'Unknown';
      if (!summary[location]) {
        summary[location] = {
          totalSales: 0,
          totalRevenue: 0,
          productCount: {},
          sellerCount: {},
          averageSaleValue: 0
        };
      }
      
      summary[location].totalSales++;
      summary[location].totalRevenue += sale.finalSalePrice || 0;
      
      // Track products
      const productKey = `${sale.brand || 'Unknown'} - ${sale.model || 'Unknown'}`;
      summary[location].productCount[productKey] = (summary[location].productCount[productKey] || 0) + 1;
      
      // Track sellers
      const seller = sale.soldByName || sale.soldBy || 'Unknown';
      summary[location].sellerCount[seller] = (summary[location].sellerCount[seller] || 0) + 1;
    });
    
    // Calculate averages
    Object.keys(summary).forEach(location => {
      if (summary[location].totalSales > 0) {
        summary[location].averageSaleValue = summary[location].totalRevenue / summary[location].totalSales;
      }
    });
    
    return summary;
  };

  const generateReportData = () => {
    try {
      const filteredSales = filterSalesByDateAndLocation(sales);
      const locationSummary = generateLocationSummary(filteredSales);
      
      // Calculate top products
      const allProducts = {};
      filteredSales.forEach(sale => {
        const productKey = `${sale.brand || 'Unknown'} - ${sale.model || 'Unknown'}`;
        allProducts[productKey] = (allProducts[productKey] || 0) + 1;
      });
      const topProducts = Object.entries(allProducts)
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      // Calculate top sellers
      const allSellers = {};
      filteredSales.forEach(sale => {
        const seller = sale.soldByName || sale.soldBy || 'Unknown';
        allSellers[seller] = (allSellers[seller] || 0) + 1;
      });
      const topSellers = Object.entries(allSellers)
        .map(([seller, count]) => ({ seller, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      // Calculate daily sales
      const dailySales = {};
      filteredSales.forEach(sale => {
        const saleDate = sale.soldAt?.toDate();
        if (saleDate) {
          const dateKey = saleDate.toISOString().split('T')[0];
          dailySales[dateKey] = dailySales[dateKey] || { count: 0, revenue: 0 };
          dailySales[dateKey].count += 1;
          dailySales[dateKey].revenue += sale.finalSalePrice || 0;
        }
      });
      
      return {
        filteredSales,
        locationSummary,
        topProducts,
        topSellers,
        dailySales,
        totalSales: filteredSales.length,
        totalRevenue: filteredSales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0),
        averageSaleValue: filteredSales.length > 0 ? 
          filteredSales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0) / filteredSales.length : 0
      };
    } catch (error) {
      setError('Failed to generate report data');
      return null;
    }
  };

  const downloadExcelReport = (reportData) => {
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Detailed Sales Sheet
      const detailedRows = reportData.filteredSales.map(sale => ({
        'Date': sale.soldAt?.toDate().toLocaleDateString() || 'Unknown',
        'Time': sale.soldAt?.toDate().toLocaleTimeString() || 'Unknown',
        'Location': sale.location || 'Unknown',
        'Item Code': sale.itemCode || 'N/A',
        'Brand': sale.brand || 'Unknown',
        'Model': sale.model || 'Unknown',
        'Category': sale.category || 'Unknown',
        'Color': sale.color || 'N/A',
        'Storage': sale.storage || 'N/A',
        'Sold By': sale.soldByName || sale.soldBy || 'Unknown',
        'Cost Price': sale.costPrice || 0,
        'Sale Price': sale.salePrice || 0,
        'Discount (%)': sale.discountPercentage || 0,
        'Final Price': sale.finalSalePrice || 0,
        'Profit': (sale.finalSalePrice || 0) - (sale.costPrice || 0),
        'Payment Method': sale.paymentMethod || 'Cash',
        'Customer Name': sale.customerName || 'N/A',
        'Customer Contact': sale.customerPhone || 'N/A'
      }));
      
      const detailedWs = XLSX.utils.json_to_sheet(detailedRows);
      XLSX.utils.book_append_sheet(wb, detailedWs, 'Detailed Sales');
      
      // Summary Sheet
      const summaryRows = Object.entries(reportData.locationSummary).map(([location, data]) => ({
        'Location': location,
        'Total Sales': data.totalSales,
        'Total Revenue': data.totalRevenue,
        'Average Sale Value': data.averageSaleValue,
        'Top Product': Object.entries(data.productCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
        'Top Seller': Object.entries(data.sellerCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'
      }));
      
      const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary by Location');
      
      // Analysis Sheet
      const analysisRows = [
        ['KM ELECTRONICS - SALES ANALYSIS REPORT'],
        ['Generated on:', new Date().toLocaleString()],
        ['Report Period:', `${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`],
        ['Location Filter:', reportFilters.location === 'all' ? 'All Locations' : reportFilters.location],
        [],
        ['TOTAL SUMMARY'],
        ['Total Sales:', reportData.totalSales],
        ['Total Revenue:', reportData.totalRevenue],
        ['Average Sale Value:', reportData.averageSaleValue],
        [],
        ['LOCATION BREAKDOWN']
      ];
      
      Object.entries(reportData.locationSummary).forEach(([location, data]) => {
        analysisRows.push([`${location}:`, `Sales: ${data.totalSales}, Revenue: ${formatCurrency(data.totalRevenue)}`]);
      });
      
      analysisRows.push([]);
      analysisRows.push(['TOP 10 PRODUCTS']);
      reportData.topProducts.forEach(item => {
        analysisRows.push([item.product, `Sales: ${item.count}`]);
      });
      
      analysisRows.push([]);
      analysisRows.push(['TOP 10 SELLERS']);
      reportData.topSellers.forEach(item => {
        analysisRows.push([item.seller, `Sales: ${item.count}`]);
      });
      
      const analysisWs = XLSX.utils.aoa_to_sheet(analysisRows);
      XLSX.utils.book_append_sheet(wb, analysisWs, 'Analysis');
      
      // Generate filename
      const dateRange = reportFilters.startDate && reportFilters.endDate 
        ? `${reportFilters.startDate}_to_${reportFilters.endDate}`
        : 'full_report';
      const locationText = reportFilters.location === 'all' ? 'all_locations' : reportFilters.location;
      const filename = `KM_Sales_Report_${locationText}_${dateRange}_${new Date().getTime()}.xlsx`;
      
      // Download
      XLSX.writeFile(wb, filename);
      return true;
    } catch (error) {
      setError('Failed to generate Excel report');
      return false;
    }
  };

  const downloadCSVReport = (reportData) => {
    try {
      // Create CSV content
      let csvContent = 'KM ELECTRONICS - SALES ANALYSIS REPORT\n';
      csvContent += `Generated on: ${new Date().toLocaleString()}\n`;
      csvContent += `Report Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}\n`;
      csvContent += `Location Filter: ${reportFilters.location === 'all' ? 'All Locations' : reportFilters.location}\n\n`;
      
      // Summary section
      csvContent += 'SUMMARY\n';
      csvContent += `Total Sales:,${reportData.totalSales}\n`;
      csvContent += `Total Revenue:,${formatCurrency(reportData.totalRevenue)}\n`;
      csvContent += `Average Sale Value:,${formatCurrency(reportData.averageSaleValue)}\n\n`;
      
      // Location Summary
      csvContent += 'LOCATION-WISE SUMMARY\n';
      csvContent += 'Location,Total Sales,Total Revenue,Average Sale Value,Top Product,Top Seller\n';
      
      Object.entries(reportData.locationSummary).forEach(([location, data]) => {
        const topProduct = Object.entries(data.productCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
        const topSeller = Object.entries(data.sellerCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
        csvContent += `${location},${data.totalSales},${data.totalRevenue},${data.averageSaleValue},"${topProduct}","${topSeller}"\n`;
      });
      
      csvContent += '\n';
      
      // Top Products
      csvContent += 'TOP 10 PRODUCTS\n';
      csvContent += 'Product,Sales Count\n';
      reportData.topProducts.forEach(item => {
        csvContent += `${item.product},${item.count}\n`;
      });
      
      csvContent += '\n';
      
      // Top Sellers
      csvContent += 'TOP 10 SELLERS\n';
      csvContent += 'Seller,Sales Count\n';
      reportData.topSellers.forEach(item => {
        csvContent += `${item.seller},${item.count}\n`;
      });
      
      csvContent += '\n';
      
      // Detailed section if needed
      if (reportFilters.reportType === 'detailed') {
        csvContent += 'DETAILED SALES RECORDS\n';
        csvContent += 'Date,Time,Location,Item Code,Brand,Model,Category,Color,Storage,Sold By,Cost Price,Sale Price,Discount (%),Final Price,Profit,Payment Method,Customer Name,Customer Contact\n';
        
        reportData.filteredSales.forEach(sale => {
          const profit = (sale.finalSalePrice || 0) - (sale.costPrice || 0);
          csvContent += `"${sale.soldAt?.toDate().toLocaleDateString() || 'Unknown'}","${sale.soldAt?.toDate().toLocaleTimeString() || 'Unknown'}","${sale.location || 'Unknown'}","${sale.itemCode || 'N/A'}","${sale.brand || 'Unknown'}","${sale.model || 'Unknown'}","${sale.category || 'Unknown'}","${sale.color || 'N/A'}","${sale.storage || 'N/A'}","${sale.soldByName || sale.soldBy || 'Unknown'}",${sale.costPrice || 0},${sale.salePrice || 0},${sale.discountPercentage || 0},${sale.finalSalePrice || 0},${profit},"${sale.paymentMethod || 'Cash'}","${sale.customerName || 'N/A'}","${sale.customerPhone || 'N/A'}"\n`;
        });
      }
      
      // Generate filename
      const dateRange = reportFilters.startDate && reportFilters.endDate 
        ? `${reportFilters.startDate}_to_${reportFilters.endDate}`
        : 'full_report';
      const locationText = reportFilters.location === 'all' ? 'all_locations' : reportFilters.location;
      const filename = `KM_Sales_Report_${locationText}_${dateRange}_${new Date().getTime()}.csv`;
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return true;
    } catch (error) {
      setError('Failed to generate CSV report');
      return false;
    }
  };

  const handleGenerateReport = async () => {
    if (!reportFilters.startDate && !reportFilters.endDate) {
      const confirm = window.confirm('No date range selected. Generate report for all sales data?');
      if (!confirm) return;
    }
    
    setIsGeneratingReport(true);
    setError(null);
    
    try {
      // Generate report data
      const reportData = generateReportData();
      
      if (!reportData) {
        alert('Failed to generate report data');
        return;
      }
      
      if (reportData.filteredSales.length === 0) {
        alert('No sales data found for the selected filters.');
        setIsGeneratingReport(false);
        return;
      }
      
      // Store the generated report data
      setGeneratedReport(reportData);
      
      // Ask for format preference
      const format = window.confirm('Download as Excel (XLSX) file?\nClick OK for Excel, Cancel for CSV.');
      
      let success = false;
      if (format) {
        success = downloadExcelReport(reportData);
      } else {
        success = downloadCSVReport(reportData);
      }
      
      if (success) {
        setSuccess(`Report downloaded successfully!\n\nTotal Records: ${reportData.totalSales}\nTotal Revenue: ${formatCurrency(reportData.totalRevenue)}\nLocations: ${Object.keys(reportData.locationSummary).length}`);
      } else {
        setError('Failed to generate report. Please try again.');
      }
    } catch (error) {
      setError('Error generating report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleGenerateAndDisplayReport = () => {
    if (!reportFilters.startDate && !reportFilters.endDate) {
      const confirm = window.confirm('No date range selected. Generate report for all sales data?');
      if (!confirm) return;
    }
    
    setIsGeneratingReport(true);
    setError(null);
    
    try {
      // Generate report data
      const reportData = generateReportData();
      
      if (!reportData) {
        setError('Failed to generate report data');
        return;
      }
      
      if (reportData.filteredSales.length === 0) {
        alert('No sales data found for the selected filters.');
        setIsGeneratingReport(false);
        return;
      }
      
      // Store the generated report data
      setGeneratedReport(reportData);
      
      setSuccess(`Report generated successfully!\n\nTotal Records: ${reportData.totalSales}\nTotal Revenue: ${formatCurrency(reportData.totalRevenue)}\nLocations: ${Object.keys(reportData.locationSummary).length}`);
      
    } catch (error) {
      setError('Error generating report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Approval System Functions
  const saveApprovalSettings = async () => {
    try {
      const settingsRef = doc(db, 'approvalSettings', 'system_settings');
      await setDoc(settingsRef, {
        ...approvalSettings,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName || user.email
      });
      setSuccess('Approval settings saved successfully!');
    } catch (error) {
      setError('Failed to save approval settings');
    }
  };

  // User Approval Functions
  const handleApproveUser = async (userId, userData) => {
    if (!userId || !userData) {
      setError('Invalid user data provided.');
      return;
    }

    setProcessingUser(userId);
    setError(null);

    try {
      const userDocRef = doc(db, 'users', userId);
      
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        setError('User document not found.');
        return;
      }

      await updateDoc(userDocRef, {
        status: 'approved',
        approvedBy: user.uid,
        approvedByName: user.fullName || user.email,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Record in history
      try {
        await addDoc(collection(db, 'userApprovalHistory'), {
          userId: userId,
          userEmail: userData.email,
          userName: userData.fullName,
          action: 'approved',
          previousRole: userData.role,
          newRole: userData.role,
          previousLocation: userData.location,
          newLocation: userData.location,
          processedBy: user.uid,
          processedByName: user.fullName || user.email,
          processedAt: serverTimestamp(),
          notes: 'User approved by superadmin'
        });
      } catch (historyError) {
        console.error('Failed to record approval history:', historyError);
      }

      setSuccess('User approved successfully!');
      await fetchUserApprovals();
      
    } catch (error) {
      setError('Failed to approve user');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleRejectUser = async (userId, userData) => {
    const reason = prompt('Please enter rejection reason:', 'Application rejected');
    
    if (reason === null) return;

    setProcessingUser(userId);
    setError(null);

    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        setError('User document not found.');
        return;
      }

      await updateDoc(userDocRef, {
        status: 'rejected',
        rejectionReason: reason || 'No reason provided',
        rejectedBy: user.uid,
        rejectedByName: user.fullName || user.email,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Record in history
      try {
        await addDoc(collection(db, 'userApprovalHistory'), {
          userId: userId,
          userEmail: userData.email,
          userName: userData.fullName,
          action: 'rejected',
          previousRole: userData.role,
          newRole: userData.role,
          previousLocation: userData.location,
          newLocation: userData.location,
          rejectionReason: reason,
          processedBy: user.uid,
          processedByName: user.fullName || user.email,
          processedAt: serverTimestamp()
        });
      } catch (historyError) {
        console.error('Failed to record rejection history:', historyError);
      }

      setSuccess('User rejected successfully!');
      await fetchUserApprovals();
    } catch (error) {
      setError('Failed to reject user');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleBulkApproveUsers = async (users) => {
    const confirmed = confirm(`Are you sure you want to approve ${users.length} users?`);
    if (!confirmed) return;

    for (const userItem of users) {
      await handleApproveUser(userItem.id, userItem);
    }
  };

  // Stock Request Approval - Subtract from source, add to destination
  const handleApproveStockRequest = async (requestId, requestData) => {
    if (processingRequest === requestId) return;
    
    setProcessingRequest(requestId);
    setError(null);
    
    try {
      if (!requestData.itemCode || !requestData.quantity || !requestData.fromLocation || !requestData.toLocation) {
        setError('Invalid request data. Missing required fields.');
        return;
      }

      // Check quantity > 1 as per requirement
      if (requestData.quantity <= 1) {
        setError('Cannot approve: Quantity must be greater than 1');
        return;
      }

      // Find stock in source location
      const sourceStockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', requestData.itemCode),
        where('location', '==', requestData.fromLocation)
      );
      
      const sourceStockSnapshot = await getDocs(sourceStockQuery);
      
      if (sourceStockSnapshot.empty) {
        await updateDoc(doc(db, 'stockRequests', requestId), {
          status: 'rejected',
          rejectionReason: 'Item not found in source location',
          rejectedBy: user.uid,
          rejectedByName: user.fullName || user.email,
          rejectedAt: serverTimestamp()
        });
        setError('Request rejected: Item not found in source location!');
        return;
      }

      const sourceStockDoc = sourceStockSnapshot.docs[0];
      const sourceStock = sourceStockDoc.data();

      // Check if source has enough quantity
      if (sourceStock.quantity < requestData.quantity) {
        await updateDoc(doc(db, 'stockRequests', requestId), {
          status: 'rejected',
          rejectionReason: 'Insufficient stock in source location',
          rejectedBy: user.uid,
          rejectedByName: user.fullName || user.email,
          rejectedAt: serverTimestamp()
        });
        setError('Request rejected: Insufficient stock in source location!');
        return;
      }

      if (!approvalSettings.allowedLocations.includes(requestData.toLocation)) {
        await updateDoc(doc(db, 'stockRequests', requestId), {
          status: 'rejected',
          rejectionReason: 'Destination location not allowed',
          rejectedBy: user.uid,
          rejectedByName: user.fullName || user.email,
          rejectedAt: serverTimestamp()
        });
        setError('Request rejected: Destination location not allowed!');
        return;
      }

      // Use batch write for atomic operations to maintain database consistency
      const batch = writeBatch(db);

      // Subtract quantity from source location
      batch.update(doc(db, 'stocks', sourceStockDoc.id), {
        quantity: sourceStock.quantity - requestData.quantity,
        updatedAt: serverTimestamp(),
        lastTransferOut: {
          toLocation: requestData.toLocation,
          quantity: requestData.quantity,
          transferredAt: serverTimestamp(),
          transferredBy: user.uid,
          transferredByName: user.fullName || user.email,
          requestId: requestId
        }
      });

      // Find or create stock in destination location
      const destStockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', requestData.itemCode),
        where('location', '==', requestData.toLocation)
      );

      const destStockSnapshot = await getDocs(destStockQuery);

      if (destStockSnapshot.empty) { 
        // Create new stock entry in destination
        const newStockRef = doc(collection(db, 'stocks'));
        batch.set(newStockRef, {
          brand: sourceStock.brand,
          model: sourceStock.model,
          category: sourceStock.category || 'Smartphone',
          color: sourceStock.color,
          storage: sourceStock.storage,
          itemCode: sourceStock.itemCode,
          costPrice: sourceStock.costPrice,
          retailPrice: sourceStock.retailPrice,
          wholesalePrice: sourceStock.wholesalePrice,
          discountPercentage: sourceStock.discountPercentage || 0,
          quantity: requestData.quantity,
          minStockLevel: sourceStock.minStockLevel || 5,
          reorderQuantity: sourceStock.reorderQuantity || 10,
          location: requestData.toLocation,
          supplier: sourceStock.supplier || '',
          warrantyPeriod: sourceStock.warrantyPeriod || 12,
          description: sourceStock.description || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          addedBy: user.uid,
          addedByName: user.fullName || user.email,
          transferredFrom: requestData.fromLocation,
          originalStockId: sourceStockDoc.id,
          lastTransferIn: {
            fromLocation: requestData.fromLocation,
            quantity: requestData.quantity,
            transferredAt: serverTimestamp(),
            transferredBy: user.uid,
            transferredByName: user.fullName || user.email,
            requestId: requestId
          }
        });
      } else {
        // Add quantity to existing stock in destination
        const destStockDoc = destStockSnapshot.docs[0];
        const destStock = destStockDoc.data();
        batch.update(doc(db, 'stocks', destStockDoc.id), {
          quantity: destStock.quantity + requestData.quantity,
          updatedAt: serverTimestamp(),
          lastTransferIn: {
            fromLocation: requestData.fromLocation,
            quantity: requestData.quantity,
            transferredAt: serverTimestamp(),
            transferredBy: user.uid,
            transferredByName: user.fullName || user.email,
            requestId: requestId
          }
        });
      }

      // Update request status
      batch.update(doc(db, 'stockRequests', requestId), {
        status: 'approved',
        approvedBy: user.uid,
        approvedByName: user.fullName || user.email,
        approvedAt: serverTimestamp(),
        sourceStockId: sourceStockDoc.id,
        processedAt: serverTimestamp()
      });

      // Record the transfer
      const transferRef = doc(collection(db, 'stockTransfers'));
      batch.set(transferRef, {
        requestId: requestId,
        itemCode: requestData.itemCode,
        brand: sourceStock.brand,
        model: sourceStock.model,
        quantity: requestData.quantity,
        fromLocation: requestData.fromLocation,
        toLocation: requestData.toLocation,
        transferredBy: user.uid,
        transferredByName: user.fullName || user.email,
        transferredAt: serverTimestamp(),
        type: 'approved_transfer',
        sourceStockBefore: sourceStock.quantity,
        sourceStockAfter: sourceStock.quantity - requestData.quantity
      });

      // Commit all operations atomically
      await batch.commit();

      setSuccess('Stock request approved and quantities updated successfully!');
    } catch (error) {
      console.error('Stock approval error:', error);
      setError('Failed to approve stock request: ' + error.message);
      
      try {
        await updateDoc(doc(db, 'stockRequests', requestId), {
          status: 'failed',
          error: error.message,
          failedAt: serverTimestamp()
        });
      } catch (updateError) {
        console.error('Failed to update request status:', updateError);
      }
    } finally {
      setProcessingRequest(null);
    }
  };

  const handleRejectStockRequest = async (requestId, requestData) => {
    const reason = prompt('Please enter rejection reason:', 'Insufficient stock');
    
    if (reason === null) return;

    setError(null);

    try {
      await updateDoc(doc(db, 'stockRequests', requestId), {
        status: 'rejected',
        rejectionReason: reason || 'No reason provided',
        rejectedBy: user.uid,
        rejectedByName: user.fullName || user.email,
        rejectedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'stockTransfers'), {
        requestId: requestId,
        itemCode: requestData.itemCode,
        quantity: requestData.quantity,
        fromLocation: requestData.fromLocation,
        toLocation: requestData.toLocation,
        rejectedBy: user.uid,
        rejectedByName: user.fullName || user.email,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        type: 'rejected_transfer'
      });

      setSuccess('Stock request rejected!');
    } catch (error) {
      setError('Failed to reject stock request');
    }
  };

  const handleBulkApprove = async (requests) => {
    const confirmed = confirm(`Are you sure you want to approve ${requests.length} stock requests?`);
    if (!confirmed) return;

    for (const request of requests) {
      await handleApproveStockRequest(request.id, request);
    }
  };

  const handleAutoApprove = async () => {
    const requestsToAutoApprove = stockRequests.filter(request => 
      request.quantity <= approvalSettings.autoApproveBelow && request.quantity > 1
    );

    if (requestsToAutoApprove.length === 0) {
      alert('No requests eligible for auto-approval.');
      return;
    }

    const confirmed = confirm(`Auto-approve ${requestsToAutoApprove.length} requests with quantity ≤ ${approvalSettings.autoApproveBelow} and > 1?`);
    if (!confirmed) return;

    for (const request of requestsToAutoApprove) {
      await handleApproveStockRequest(request.id, request);
    }
  };

  // User Management Functions
  const handleAssignRole = async (userId, role) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.data();
      
      await updateDoc(userDocRef, {
        role: role,
        lastRoleUpdate: serverTimestamp(),
        updatedBy: user.uid,
        updatedAt: serverTimestamp()
      });

      // Record role change
      await addDoc(collection(db, 'userApprovalHistory'), {
        userId: userId,
        userEmail: userData.email,
        userName: userData.fullName,
        action: 'role_change',
        previousRole: userData.role,
        newRole: role,
        previousLocation: userData.location,
        newLocation: userData.location,
        processedBy: user.uid,
        processedByName: user.fullName || user.email,
        processedAt: serverTimestamp(),
        notes: `Role changed from ${userData.role} to ${role}`
      });

      fetchAllUsers();
      setSuccess(`Role updated to ${role} successfully!`);
    } catch (error) {
      setError('Failed to assign role');
    }
  };

  const handleUpdateUserLocation = async (userId, newLocation) => {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.data();
      
      await updateDoc(userDocRef, {
        location: newLocation,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });

      // Record location change
      await addDoc(collection(db, 'userApprovalHistory'), {
        userId: userId,
        userEmail: userData.email,
        userName: userData.fullName,
        action: 'location_change',
        previousRole: userData.role,
        newRole: userData.role,
        previousLocation: userData.location,
        newLocation: newLocation,
        processedBy: user.uid,
        processedByName: user.fullName || user.email,
        processedAt: serverTimestamp(),
        notes: `Location changed from ${userData.location} to ${newLocation}`
      });

      fetchAllUsers();
      setSuccess('User location updated successfully!');
    } catch (error) {
      setError('Failed to update user location');
    }
  };

  // Stock Management Functions - UPDATED for compatibility
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
      setError('Please fix the validation errors in the form');
      return;
    }

    setError(null);

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
        addedByName: user.fullName || user.email,
        isActive: true
      };

      await addDoc(collection(db, 'stocks'), stockData);
      
      // Reset form
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
      
      setSuccess('Stock added successfully!');
    } catch (error) {
      setError('Failed to add stock: ' + error.message);
    }
  };

  const handleUpdateStock = async (stockId, updates) => {
    try {
      await updateDoc(doc(db, 'stocks', stockId), {
        ...updates,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      setSuccess('Stock updated successfully!');
    } catch (error) {
      setError('Failed to update stock');
    }
  };

  const handleDeleteStock = async (stockId) => {
    if (!window.confirm('Are you sure you want to delete this stock item?')) return;

    try {
      await deleteDoc(doc(db, 'stocks', stockId));
      setSuccess('Stock deleted successfully!');
      fetchAllStocks();
    } catch (error) {
      setError('Failed to delete stock');
    }
  };

  const validateTransferForm = () => {
    const errors = {};
    if (!transferStock.itemCode.trim()) errors.itemCode = 'Item Code is required';
    if (!transferStock.quantity || parseInt(transferStock.quantity) <= 1) errors.quantity = 'Quantity must be greater than 1';
    if (!transferStock.fromLocation) errors.fromLocation = 'Source Location is required';
    if (!transferStock.toLocation) errors.toLocation = 'Destination Location is required';
    if (transferStock.fromLocation === transferStock.toLocation) errors.toLocation = 'Source and Destination cannot be the same';
    
    setTransferErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRequestStock = async () => {
    if (!validateTransferForm()) {
      setError('Please fix the validation errors in the form');
      return;
    }

    setError(null);

    try {
      const requestData = {
        ...transferStock,
        quantity: parseInt(transferStock.quantity),
        status: 'pending',
        requestedBy: user.uid,
        requestedByName: user.fullName || user.email,
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
      
      setSuccess('Stock request sent successfully!');
    } catch (error) {
      setError('Failed to request stock: ' + error.message);
    }
  };

  // Filter Functions
  const getFilteredStocks = () => {
    if (selectedLocation === 'all') {
      return stocks;
    }
    return stocks.filter(stock => stock.location === selectedLocation);
  };

  const getFilteredSales = () => {
    if (selectedLocation === 'all') {
      return sales;
    }
    return sales.filter(sale => sale.location === selectedLocation);
  };

  const calculateTotalStockValue = () => {
    const filteredStocks = getFilteredStocks();
    return filteredStocks.reduce((total, stock) => {
      return total + ((stock.costPrice || 0) * (stock.quantity || 0));
    }, 0);
  };

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
            if (userData.role === 'superadmin') {
              setUser(userData);
              // Initialize database collections
              await initializeDatabaseCollections(userData);
              await initializeDashboard();
            } else {
              router.push('/dashboard');
            }
          } else {
            // Create user if doesn't exist
            await initializeDatabaseCollections({
              uid: authUser.uid,
              email: authUser.email,
              displayName: authUser.displayName || authUser.email.split('@')[0],
              fullName: authUser.displayName || authUser.email.split('@')[0]
            });
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
  }, [router, initializeDashboard]);

  // Clear messages after 5 seconds
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
      <div className={'min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center'}>
        <div className={'text-white'}>Loading SuperAdmin Dashboard...</div>
      </div>
    );
  }

  return (
    <div className={'w-full min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900'}>
      {/* Error Display */}
      {error && (
        <div className={'fixed top-4 right-4 z-50'}>
          <div className={'bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2'}>
            <span>⚠️</span>
            <span>{error}</span>
            <button 
              onClick={() => setError(null)}
              className={'ml-4 text-white hover:text-gray-200'}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* Success Display */}
      {success && (
        <div className={'fixed top-4 right-4 z-50'}>
          <div className={'bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2'}>
            <span>✅</span>
            <span>{success}</span>
            <button 
              onClick={() => setSuccess(null)}
              className={'ml-4 text-white hover:text-gray-200'}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className={'bg-white/10 backdrop-blur-lg border-b border-white/20'}>
        <div className={'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'}>
          <div className={'flex justify-between items-center py-4'}>
            <div>
              <h1 className={'text-2xl font-bold text-white'}>
                KM ELECTRONICS <span className={'text-red-500'}>SuperAdmin</span>
              </h1>
              <p className={'text-white/70 text-sm'}>
                Welcome, {user?.fullName} | System Administrator
              </p>
            </div>
            
            <div className={'flex items-center space-x-4'}>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className={'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                required
              >
                <option value={'all'}>All Locations</option>
                {LOCATIONS.map((location, index) => (
                  <option key={generateSafeKey('location-option', index, location)} value={location}>{location}</option>
                ))}
              </select>
              
              <button
                onClick={() => signOut(auth).then(() => router.push('/login'))}
                className={'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors'}
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
          <nav className={'-mb-px flex space-x-8 overflow-x-auto'}>
            {[
              { id: 'dashboard', name: 'Dashboard' },
              { id: 'salesReport', name: 'Sales Report' },
              { id: 'locationPerformance', name: 'Location Performance' },
              { id: 'stocks', name: 'Stock Management' },
              { id: 'sales', name: 'Sales Analysis Report' },
              { id: 'transfer', name: 'Stock Transfer' },
              { id: 'personnel', name: 'Personnel Management' },
              { id: 'approvals', name: 'User Approvals', count: pendingUsers.length },
              { id: 'requests', name: 'Stock Requests', count: stockRequests.length },
              { id: 'approvalSettings', name: 'Approval Settings' }
            ].map((tab, index) => (
              <button
                key={generateSafeKey('tab', index, tab.id)}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                {tab.name}
                {tab.count > 0 && (
                  <span className={'ml-2 bg-red-500 text-white py-0.5 px-2 rounded-full text-xs'}>
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
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'}>
                <div className={'bg-white/5 rounded-lg p-6 border border-white/10'}>
                  <h3 className={'text-white/70 text-sm'}>Today's Sales</h3>
                  <p className={'text-2xl font-bold text-green-400'}>
                    {realTimeSales.todaySales}
                  </p>
                  <p className={'text-white/50 text-sm mt-1'}>
                    {formatCurrency(realTimeSales.todayRevenue)}
                  </p>
                </div>
                <div className={'bg-white/5 rounded-lg p-6 border border-white/10'}>
                  <h3 className={'text-white/70 text-sm'}>Total Revenue</h3>
                  <p className={'text-2xl font-bold text-blue-400'}>
                    {formatCurrency(salesAnalysis.totalRevenue)}
                  </p>
                </div>
                <div className={'bg-white/5 rounded-lg p-6 border border-white/10'}>
                  <h3 className={'text-white/70 text-sm'}>Monthly Revenue</h3>
                  <p className={'text-2xl font-bold text-purple-400'}>
                    {formatCurrency(salesAnalysis.monthlyRevenue)}
                  </p>
                </div>
                <div className={'bg-white/5 rounded-lg p-6 border border-white/10'}>
                  <h3 className={'text-white/70 text-sm'}>Pending Requests</h3>
                  <p className={'text-2xl font-bold text-orange-400'}>
                    {stockRequests.length + pendingUsers.length}
                  </p>
                </div>
              </div>

              <div className={'grid grid-cols-1 lg:grid-cols-2 gap-6'}>
                {/* Location Performance Overview */}
                <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
                  <h2 className={'text-xl font-semibold text-white mb-4'}>Location Performance</h2>
                  <div className={'space-y-3'}>
                    {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data], index) => (
                      <div key={generateSafeKey('location-perf', index, location)} className={'flex items-center justify-between p-3 bg-white/5 rounded-lg'}>
                        <div className={'flex items-center space-x-3'}>
                          <div className={`w-3 h-3 rounded-full ${
                            data.score >= 80 ? 'bg-green-500' :
                            data.score >= 60 ? 'bg-yellow-500' :
                            data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                          }`}></div>
                          <span className={'text-white font-medium'}>{location}</span>
                        </div>
                        <div className={'flex items-center space-x-2'}>
                          <span className={`text-sm ${getTrendColor(data.trend)}`}>
                            {getTrendIcon(data.trend)}
                          </span>
                          <span className={`text-lg font-bold ${getPerformanceColor(data.score)}`}>
                            {data.score}%
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${getPerformanceBadge(data.score)}`}>
                            {data.grade}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Sales Feed */}
                <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
                  <h2 className={'text-xl font-semibold text-white mb-4'}>Live Sales Feed</h2>
                  <div className={'space-y-3 max-h-80 overflow-y-auto'}>
                    {realTimeSales.liveSales.map((sale, index) => (
                      <div key={generateSafeKey('live-sale', index, sale.id)} className={'flex justify-between items-center p-3 bg-white/5 rounded-lg'}>
                        <div>
                          <div className={'text-white font-medium'}>{sale.brand} {sale.model}</div>
                          <div className={'text-white/70 text-sm'}>
                            {sale.location} • {sale.soldByName}
                          </div>
                        </div>
                        <div className={'text-right'}>
                          <div className={'text-green-400 font-semibold'}>{formatCurrency(sale.finalSalePrice)}</div>
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
              </div>

              {/* Revenue by Location */}
              <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
                <h2 className={'text-xl font-semibold text-white mb-4'}>Revenue by Location</h2>
                <div className={'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'}>
                  {Object.entries(salesAnalysis.revenueByLocation).map(([location, revenue], index) => (
                    <div key={generateSafeKey('revenue-loc', index, location)} className={'bg-white/5 rounded-lg p-4 text-center'}>
                      <h3 className={'text-white/70 text-sm'}>{location}</h3>
                      <p className={'text-lg font-bold text-green-400'}>
                        {formatCurrency(revenue)}
                      </p>
                      {salesAnalysis.locationPerformance?.[location] && (
                        <p className={`text-xs mt-1 ${getPerformanceColor(salesAnalysis.locationPerformance[location].score)}`}>
                          {salesAnalysis.locationPerformance[location].score}%
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sales Report Tab */}
          {activeTab === 'salesReport' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>Real-time Sales Report</h2>
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className={'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                  required
                >
                  <option value={'today'}>Today</option>
                  <option value={'week'}>This Week</option>
                  <option value={'month'}>This Month</option>
                  <option value={'year'}>This Year</option>
                </select>
              </div>

              {/* Sales Summary */}
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6'}>
                <div className={'bg-white/5 rounded-lg p-6 text-center'}>
                  <div className={'text-2xl font-bold text-green-400'}>{realTimeSales.todaySales}</div>
                  <div className={'text-white/70 text-sm'}>Today's Sales</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-6 text-center'}>
                  <div className={'text-2xl font-bold text-blue-400'}>
                    {formatCurrency(realTimeSales.todayRevenue)}
                  </div>
                  <div className={'text-white/70 text-sm'}>Today's Revenue</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-6 text-center'}>
                  <div className={'text-2xl font-bold text-purple-400'}>
                    {salesAnalysis.totalSales}
                  </div>
                  <div className={'text-white/70 text-sm'}>Total Sales</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-6 text-center'}>
                  <div className={'text-2xl font-bold text-orange-400'}>
                    {formatCurrency(salesAnalysis.totalRevenue)}
                  </div>
                  <div className={'text-white/70 text-sm'}>Total Revenue</div>
                </div>
              </div>

              {/* Hourly Sales Chart */}
              <div className={'bg-white/5 rounded-lg p-6 mb-6'}>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Today's Hourly Sales</h3>
                <div className={'grid grid-cols-6 md:grid-cols-12 gap-2'}>
                  {Array.from({ length: 12 }, (_, i) => i + 8).map((hour, index) => (
                    <div key={generateSafeKey('hour', index, hour.toString())} className={'text-center'}>
                      <div className={'text-white/70 text-xs mb-1'}>{hour}:00</div>
                      <div className={'bg-blue-500/20 rounded-lg p-2'}>
                        <div className={'text-blue-300 text-sm font-semibold'}>
                          {formatCurrency((realTimeSales.hourlySales[hour] || 0) / 1000)}K
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Location-wise Breakdown */}
              <div className={'bg-white/5 rounded-lg p-6'}>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Location Performance Breakdown</h3>
                <div className={'overflow-x-auto'}>
                  <table className={'w-full text-white'}>
                    <thead>
                      <tr className={'border-b border-white/20'}>
                        <th className={'text-left py-2'}>Location</th>
                        <th className={'text-left py-2'}>Today's Revenue</th>
                        <th className={'text-left py-2'}>Weekly Revenue</th>
                        <th className={'text-left py-2'}>Performance</th>
                        <th className={'text-left py-2'}>Grade</th>
                        <th className={'text-left py-2'}>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data], index) => (
                        <tr key={generateSafeKey('loc-breakdown', index, location)} className={'border-b border-white/10'}>
                          <td className={'py-2 font-medium'}>{location}</td>
                          <td className={'py-2'}>{formatCurrency(data.metrics.todayRevenue)}</td>
                          <td className={'py-2'}>{formatCurrency(data.metrics.weeklyRevenue)}</td>
                          <td className={'py-2'}>
                            <div className={'flex items-center space-x-2'}>
                              <div className={'w-24 bg-gray-700 rounded-full h-2'}>
                                <div 
                                  className={`h-2 rounded-full ${
                                    data.score >= 80 ? 'bg-green-500' :
                                    data.score >= 60 ? 'bg-yellow-500' :
                                    data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${data.score}%` }}
                                ></div>
                              </div>
                              <span className={`font-semibold ${getPerformanceColor(data.score)}`}>
                                {data.score}%
                              </span>
                            </div>
                          </td>
                          <td className={'py-2'}>
                            <span className={`px-2 py-1 rounded-full text-xs ${getPerformanceBadge(data.score)}`}>
                              {data.grade}
                            </span>
                          </td>
                          <td className={'py-2'}>
                            <span className={`text-lg ${getTrendColor(data.trend)}`}>
                              {getTrendIcon(data.trend)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Location Performance Tab */}
          {activeTab === 'locationPerformance' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-6'}>Location Performance Analytics</h2>
              
              <div className={'grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6'}>
                {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data], index) => (
                  <div key={generateSafeKey('loc-analytics', index, location)} className={'bg-white/5 rounded-lg p-6 border border-white/10'}>
                    <div className={'flex justify-between items-start mb-4'}>
                      <h3 className={'text-lg font-semibold text-white'}>{location}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm ${getPerformanceBadge(data.score)}`}>
                        {data.grade}
                      </span>
                    </div>
                    
                    <div className={'space-y-3'}>
                      <div className={'flex justify-between items-center'}>
                        <span className={'text-white/70'}>Performance Score</span>
                        <span className={`text-xl font-bold ${getPerformanceColor(data.score)}`}>
                          {data.score}%
                        </span>
                      </div>
                      
                      <div className={'flex justify-between items-center'}>
                        <span className={'text-white/70'}>Today's Revenue</span>
                        <span className={'text-green-400 font-semibold'}>
                          {formatCurrency(data.metrics.todayRevenue)}
                        </span>
                      </div>
                      
                      <div className={'flex justify-between items-center'}>
                        <span className={'text-white/70'}>Weekly Revenue</span>
                        <span className={'text-blue-400 font-semibold'}>
                          {formatCurrency(data.metrics.weeklyRevenue)}
                        </span>
                      </div>
                      
                      <div className={'flex justify-between items-center'}>
                        <span className={'text-white/70'}>Total Sales</span>
                        <span className={'text-white font-semibold'}>
                          {data.metrics.salesCount}
                        </span>
                      </div>
                      
                      <div className={'flex justify-between items-center'}>
                        <span className={'text-white/70'}>Avg. Sale Value</span>
                        <span className={'text-purple-400 font-semibold'}>
                          {formatCurrency(data.metrics.salesCount > 0 ? data.metrics.totalRevenue / data.metrics.salesCount : 0)}
                        </span>
                      </div>
                      
                      <div className={'flex justify-between items-center'}>
                        <span className={'text-white/70'}>Trend</span>
                        <span className={`text-lg ${getTrendColor(data.trend)}`}>
                          {getTrendIcon(data.trend)} {data.trend}
                        </span>
                      </div>
                    </div>
                    
                    {/* Performance Progress Bar */}
                    <div className={'mt-4'}>
                      <div className={'w-full bg-gray-700 rounded-full h-3'}>
                        <div 
                          className={`h-3 rounded-full ${
                            data.score >= 80 ? 'bg-green-500' :
                            data.score >= 60 ? 'bg-yellow-500' :
                            data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${data.score}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Performance Summary */}
              <div className={'bg-white/5 rounded-lg p-6'}>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Performance Summary</h3>
                <div className={'grid grid-cols-2 md:grid-cols-4 gap-4'}>
                  <div className={'text-center'}>
                    <div className={'text-2xl font-bold text-green-400'}>
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 80).length}
                    </div>
                    <div className={'text-white/70 text-sm'}>Excellent</div>
                  </div>
                  <div className={'text-center'}>
                    <div className={'text-2xl font-bold text-yellow-400'}>
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 60 && p.score < 80).length}
                    </div>
                    <div className={'text-white/70 text-sm'}>Good</div>
                  </div>
                  <div className={'text-center'}>
                    <div className={'text-2xl font-bold text-orange-400'}>
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 40 && p.score < 60).length}
                    </div>
                    <div className={'text-white/70 text-sm'}>Average</div>
                  </div>
                  <div className={'text-center'}>
                    <div className={'text-2xl font-bold text-red-400'}>
                      {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score < 40).length}
                    </div>
                    <div className={'text-white/70 text-sm'}>Needs Attention</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock Management Tab */}
          {activeTab === 'stocks' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>
                  Stock Management - {selectedLocation === 'all' ? 'All Locations' : selectedLocation}
                </h2>
                <div className={'flex items-center space-x-4'}>
                  <div className={'text-white'}>
                    Total Value: {formatCurrency(calculateTotalStockValue())}
                  </div>
                  <button
                    onClick={handleDownloadStockList}
                    className={'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center space-x-2'}
                  >
                    <span>📥</span>
                    <span>Download Stock List</span>
                  </button>
                </div>
              </div>

              {/* Add Stock Form */}
              <div className={'bg-white/5 rounded-lg p-4 mb-6'}>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Add New Stock</h3>
                <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'}>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Brand *'}
                      value={newStock.brand}
                      onChange={(e) => setNewStock({...newStock, brand: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.brand ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      required
                    />
                    {stockErrors.brand && <p className="text-red-400 text-xs mt-1">{stockErrors.brand}</p>}
                  </div>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Model *'}
                      value={newStock.model}
                      onChange={(e) => setNewStock({...newStock, model: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.model ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      required
                    />
                    {stockErrors.model && <p className="text-red-400 text-xs mt-1">{stockErrors.model}</p>}
                  </div>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Item Code *'}
                      value={newStock.itemCode}
                      onChange={(e) => setNewStock({...newStock, itemCode: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.itemCode ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      required
                    />
                    {stockErrors.itemCode && <p className="text-red-400 text-xs mt-1">{stockErrors.itemCode}</p>}
                  </div>
                  <div>
                    <select
                      value={newStock.category}
                      onChange={(e) => setNewStock({...newStock, category: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                      required
                    >
                      {CATEGORIES.map((category, index) => (
                        <option key={generateSafeKey('category', index, category)} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <select
                      value={newStock.location}
                      onChange={(e) => setNewStock({...newStock, location: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.location ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                      required
                    >
                      <option value={''}>Select Location *</option>
                      {LOCATIONS.map((location, index) => (
                        <option key={generateSafeKey('newstock-location', index, location)} value={location}>{location}</option>
                      ))}
                    </select>
                    {stockErrors.location && <p className="text-red-400 text-xs mt-1">{stockErrors.location}</p>}
                  </div>
                  <div>
                    <input
                      type={'number'}
                      placeholder={'Quantity *'}
                      value={newStock.quantity}
                      onChange={(e) => setNewStock({...newStock, quantity: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.quantity ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      required
                      min="1"
                    />
                    {stockErrors.quantity && <p className="text-red-400 text-xs mt-1">{stockErrors.quantity}</p>}
                  </div>
                  <div>
                    <input
                      type={'number'}
                      placeholder={'Cost Price (MK) *'}
                      value={newStock.costPrice}
                      onChange={(e) => setNewStock({...newStock, costPrice: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.costPrice ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      required
                      min="0"
                      step="0.01"
                    />
                    {stockErrors.costPrice && <p className="text-red-400 text-xs mt-1">{stockErrors.costPrice}</p>}
                  </div>
                  <div>
                    <input
                      type={'number'}
                      placeholder={'Retail Price (MK) *'}
                      value={newStock.retailPrice}
                      onChange={(e) => setNewStock({...newStock, retailPrice: e.target.value})}
                      className={`w-full bg-white/10 border ${stockErrors.retailPrice ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      required
                      min="0"
                      step="0.01"
                    />
                    {stockErrors.retailPrice && <p className="text-red-400 text-xs mt-1">{stockErrors.retailPrice}</p>}
                  </div>
                  <div>
                    <input
                      type={'number'}
                      placeholder={'Wholesale Price (MK)'}
                      value={newStock.wholesalePrice}
                      onChange={(e) => setNewStock({...newStock, wholesalePrice: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <input
                      type={'number'}
                      placeholder={'Discount %'}
                      value={newStock.discountPercentage}
                      onChange={(e) => setNewStock({...newStock, discountPercentage: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <input
                      type={'number'}
                      placeholder={'Min Stock Level'}
                      value={newStock.minStockLevel}
                      onChange={(e) => setNewStock({...newStock, minStockLevel: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                      min="0"
                    />
                  </div>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Supplier'}
                      value={newStock.supplier}
                      onChange={(e) => setNewStock({...newStock, supplier: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                    />
                  </div>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Color'}
                      value={newStock.color}
                      onChange={(e) => setNewStock({...newStock, color: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                    />
                  </div>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Storage'}
                      value={newStock.storage}
                      onChange={(e) => setNewStock({...newStock, storage: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                    />
                  </div>
                  <div>
                    <input
                      type={'text'}
                      placeholder={'Description'}
                      value={newStock.description}
                      onChange={(e) => setNewStock({...newStock, description: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'}
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddStock}
                  className={'mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors'}
                >
                  Add Stock
                </button>
                 <button
                  onClick={() => router.push('/operations')}
                  className={'mt-4 ml-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors'}
                >
                  Operations
                </button>
                <button
                  onClick={() => router.push('/manage')}
                  className={'mt-4 ml-4 bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors'}
                >
                  Manage
                </button>
                <button
                  onClick={() => router.push('/shops')}
                  className={'mt-4 ml-4 bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors'}
                >
                  Shops
                </button>
              </div>

              {/* Stocks Table */}
              <div className={'overflow-x-auto'}>
                <table className={'w-full text-white'}>
                  <thead>
                    <tr className={'border-b border-white/20'}>
                      <th className={'text-left py-2'}>Location</th>
                      <th className={'text-left py-2'}>Item Code</th>
                      <th className={'text-left py-2'}>Brand & Model</th>
                      <th className={'text-left py-2'}>Category</th>
                      <th className={'text-left py-2'}>Cost Price</th>
                      <th className={'text-left py-2'}>Retail Price</th>
                      <th className={'text-left py-2'}>Quantity</th>
                      <th className={'text-left py-2'}>Total Value</th>
                      <th className={'text-left py-2'}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredStocks().map((stock, index) => {
                      const isLowStock = (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) && (parseInt(stock.quantity) || 0) > 0;
                      
                      return (
                        <tr key={generateSafeKey('stock', index, stock.id)} className={`border-b border-white/10 ${isLowStock ? 'bg-orange-900/20' : ''}`}>
                          <td className={'py-2'}>
                            <span className={'bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs'}>
                              {stock.location}
                            </span>
                          </td>
                          <td className={'py-2 font-mono'}>{stock.itemCode}</td>
                          <td className={'py-2'}>{stock.brand} {stock.model}</td>
                          <td className={'py-2'}>{stock.category || 'N/A'}</td>
                          <td className={'py-2'}>{formatCurrency(stock.costPrice || 0)}</td>
                          <td className={'py-2'}>{formatCurrency(stock.retailPrice || 0)}</td>
                          <td className={'py-2'}>
                            <div className={`${isLowStock ? 'text-orange-400 font-semibold' : ''}`}>
                              {stock.quantity || 0}
                              {isLowStock && <span className="text-xs text-orange-300 ml-1">Low</span>}
                            </div>
                          </td>
                          <td className={'py-2'}>{formatCurrency((stock.costPrice || 0) * (stock.quantity || 0))}</td>
                          <td className={'py-2 space-x-2'}>
                            <button
                              onClick={() => handleUpdateStock(stock.id, { quantity: (stock.quantity || 0) + 1 })}
                              className={'bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'}
                            >
                              +1
                            </button>
                            <button
                              onClick={() => handleUpdateStock(stock.id, { quantity: Math.max(0, (stock.quantity || 0) - 1)})}
                              className={'bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors'}
                            >
                              -1
                            </button>
                            <button
                              onClick={() => handleDeleteStock(stock.id)}
                              className={'bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm transition-colors'}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sales Analysis Report Tab */}
          {activeTab === 'sales' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>
                  Sales Analysis Report Generator
                </h2>
                <div className={'flex space-x-4'}>
                  <button
                    onClick={handleGenerateAndDisplayReport}
                    disabled={isGeneratingReport}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                      isGeneratingReport 
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isGeneratingReport ? 'Generating...' : 'Generate Report'}
                  </button>
                  <button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport || !generatedReport}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                      isGeneratingReport || !generatedReport
                        ? 'bg-gray-600 text-gray-300 cursor-not-allowed' 
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    Download Report
                  </button>
                </div>
              </div>

              {/* Report Filters */}
              <div className={'bg-white/5 rounded-lg p-6 mb-6'}>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Report Filters</h3>
                
                <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4'}>
                  <div>
                    <label className={'block text-white/70 text-sm mb-2'}>Start Date *</label>
                    <input
                      type={'date'}
                      value={reportFilters.startDate}
                      onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className={'block text-white/70 text-sm mb-2'}>End Date *</label>
                    <input
                      type={'date'}
                      value={reportFilters.endDate}
                      onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className={'block text-white/70 text-sm mb-2'}>Location *</label>
                    <select
                      value={reportFilters.location}
                      onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                      required
                    >
                      <option value={'all'}>All Locations</option>
                      {LOCATIONS.map((location, index) => (
                        <option key={generateSafeKey('filter-location', index, location)} value={location}>{location}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className={'block text-white/70 text-sm mb-2'}>Report Type *</label>
                    <select
                      value={reportFilters.reportType}
                      onChange={(e) => setReportFilters({...reportFilters, reportType: e.target.value})}
                      className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                      required
                    >
                      <option value={'detailed'}>Detailed Report</option>
                      <option value={'summary'}>Summary Only</option>
                    </select>
                  </div>
                </div>
                
                <div className={'flex items-center space-x-2 text-white/70 text-sm'}>
                  <span className={'text-green-400'}>✓</span>
                  <span>Report includes sales data categorized by location</span>
                </div>
                <div className={'flex items-center space-x-2 text-white/70 text-sm'}>
                  <span className={'text-green-400'}>✓</span>
                  <span>Available formats: Excel (.xlsx) and CSV (.csv)</span>
                </div>
              </div>

              {/* Generated Report Display */}
              {generatedReport && (
                <div className={'bg-white/5 rounded-lg p-6 mb-6'}>
                  <div className={'flex justify-between items-center mb-6'}>
                    <h3 className={'text-lg font-semibold text-white'}>Generated Report</h3>
                    <div className={'flex items-center space-x-2'}>
                      <span className={'text-green-400 text-sm'}>
                        Generated on: {new Date().toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  {/* Report Summary Stats */}
                  <div className={'grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'}>
                    <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                      <div className={'text-2xl font-bold text-white'}>{generatedReport.totalSales}</div>
                      <div className={'text-white/70 text-sm'}>Total Sales</div>
                    </div>
                    
                    <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                      <div className={'text-2xl font-bold text-green-400'}>
                        {formatCurrency(generatedReport.totalRevenue)}
                      </div>
                      <div className={'text-white/70 text-sm'}>Total Revenue</div>
                    </div>
                    
                    <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                      <div className={'text-2xl font-bold text-blue-400'}>
                        {formatCurrency(generatedReport.averageSaleValue)}
                      </div>
                      <div className={'text-white/70 text-sm'}>Average Sale Value</div>
                    </div>
                    
                    <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                      <div className={'text-2xl font-bold text-purple-400'}>
                        {Object.keys(generatedReport.locationSummary).length}
                      </div>
                      <div className={'text-white/70 text-sm'}>Locations</div>
                    </div>
                  </div>
                  
                  {/* Location-wise Breakdown */}
                  <div className={'mb-6'}>
                    <h4 className={'text-md font-semibold text-white mb-4'}>Location-wise Breakdown</h4>
                    <div className={'overflow-x-auto'}>
                      <table className={'w-full text-white'}>
                        <thead>
                          <tr className={'border-b border-white/20'}>
                            <th className={'text-left py-2'}>Location</th>
                            <th className={'text-left py-2'}>Sales</th>
                            <th className={'text-left py-2'}>Revenue</th>
                            <th className={'text-left py-2'}>Avg. Sale Value</th>
                            <th className={'text-left py-2'}>Top Product</th>
                            <th className={'text-left py-2'}>Top Seller</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(generatedReport.locationSummary).map(([location, data], index) => {
                            const topProduct = Object.entries(data.productCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
                            const topSeller = Object.entries(data.sellerCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
                            return (
                              <tr key={generateSafeKey('report-loc', index, location)} className={'border-b border-white/10'}>
                                <td className={'py-2 font-medium'}>{location}</td>
                                <td className={'py-2'}>{data.totalSales}</td>
                                <td className={'py-2 text-green-400'}>{formatCurrency(data.totalRevenue)}</td>
                                <td className={'py-2'}>{formatCurrency(data.averageSaleValue)}</td>
                                <td className={'py-2 text-sm'}>{topProduct}</td>
                                <td className={'py-2 text-sm'}>{topSeller}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  
                  {/* Top Products & Sellers */}
                  <div className={'grid grid-cols-1 md:grid-cols-2 gap-6'}>
                    {/* Top Products */}
                    <div className={'bg-white/5 rounded-lg p-4'}>
                      <h4 className={'text-md font-semibold text-white mb-3'}>Top 10 Products</h4>
                      <div className={'space-y-2'}>
                        {generatedReport.topProducts.map((item, index) => (
                          <div key={generateSafeKey('top-product', index, item.product)} className={'flex justify-between items-center p-2 bg-white/5 rounded'}>
                            <span className={'text-white text-sm truncate'}>{item.product}</span>
                            <span className={'text-blue-300 font-semibold'}>{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Top Sellers */}
                    <div className={'bg-white/5 rounded-lg p-4'}>
                      <h4 className={'text-md font-semibold text-white mb-3'}>Top 10 Sellers</h4>
                      <div className={'space-y-2'}>
                        {generatedReport.topSellers.map((item, index) => (
                          <div key={generateSafeKey('top-seller', index, item.seller)} className={'flex justify-between items-center p-2 bg-white/5 rounded'}>
                            <span className={'text-white text-sm truncate'}>{item.seller}</span>
                            <span className={'text-green-300 font-semibold'}>{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* Report Period Info */}
                  <div className={'mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg'}>
                    <div className={'flex items-center space-x-2 text-sm text-white/70'}>
                      <span className={'text-blue-400'}>📊</span>
                      <div>
                        <p>Report Period: <span className={'text-white'}>
                          {reportFilters.startDate || 'Start'} to {reportFilters.endDate || 'End'}
                        </span></p>
                        <p>Location Filter: <span className={'text-white'}>
                          {reportFilters.location === 'all' ? 'All Locations' : reportFilters.location}
                        </span></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Stats */}
              <div className={'grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'}>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-white'}>
                    {getFilteredSales().length}
                  </div>
                  <div className={'text-white/70 text-sm'}>Total Sales Records</div>
                </div>
                
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-green-400'}>
                    {formatCurrency(getFilteredSales().reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0))}
                  </div>
                  <div className={'text-white/70 text-sm'}>Total Revenue</div>
                </div>
                
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-blue-400'}>
                    {new Set(getFilteredSales().map(s => s.location)).size}
                  </div>
                  <div className={'text-white/70 text-sm'}>Locations Covered</div>
                </div>
                
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-purple-400'}>
                    {new Set(getFilteredSales().map(s => s.soldByName || s.soldBy)).size}
                  </div>
                  <div className={'text-white/70 text-sm'}>Sales Personnel</div>
                </div>
              </div>

              {/* Report Information */}
              <div className={'mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4'}>
                <div className={'flex items-start space-x-3'}>
                  <div className={'text-blue-400 text-xl'}>ℹ️</div>
                  <div>
                    <h4 className={'font-semibold text-white mb-2'}>Report Features:</h4>
                    <ul className={'text-white/70 text-sm space-y-1'}>
                      <li>• Comprehensive sales data categorized by location</li>
                      <li>• Date-range filtering for custom analysis periods</li>
                      <li>• Excel format includes multiple sheets: Detailed Sales, Location Summary, and Analysis</li>
                      <li>• CSV format provides clean, importable data</li>
                      <li>• Includes profit calculations and performance metrics</li>
                      <li>• All monetary values in Malawian Kwacha (MK)</li>
                      <li>• Generate report first to preview, then download in your preferred format</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock Transfer Tab */}
          {activeTab === 'transfer' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-4'}>Stock Transfer (SuperAdmin)</h2>
              
              <div className={'grid grid-cols-1 md:grid-cols-2 gap-4 mb-6'}>
                <div>
                  <input
                    type={'text'}
                    placeholder={'Item Code *'}
                    value={transferStock.itemCode}
                    onChange={(e) => setTransferStock({...transferStock, itemCode: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.itemCode ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                    required
                  />
                  {transferErrors.itemCode && <p className="text-red-400 text-xs mt-1">{transferErrors.itemCode}</p>}
                </div>
                <div>
                  <input
                    type={'number'}
                    placeholder={'Quantity * (must be > 1)'}
                    value={transferStock.quantity}
                    onChange={(e) => setTransferStock({...transferStock, quantity: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.quantity ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                    required
                    min="2"
                  />
                  {transferErrors.quantity && <p className="text-red-400 text-xs mt-1">{transferErrors.quantity}</p>}
                </div>
                <div>
                  <select
                    value={transferStock.fromLocation}
                    onChange={(e) => setTransferStock({...transferStock, fromLocation: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.fromLocation ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    required
                  >
                    <option value={''}>Select Source Location *</option>
                    {LOCATIONS.map((location, index) => (
                      <option key={generateSafeKey('from-location', index, location)} value={location}>{location}</option>
                    ))}
                  </select>
                  {transferErrors.fromLocation && <p className="text-red-400 text-xs mt-1">{transferErrors.fromLocation}</p>}
                </div>
                <div>
                  <select
                    value={transferStock.toLocation}
                    onChange={(e) => setTransferStock({...transferStock, toLocation: e.target.value})}
                    className={`w-full bg-white/10 border ${transferErrors.toLocation ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    required
                  >
                    <option value={''}>Select Destination Location *</option>
                    {LOCATIONS.map((location, index) => (
                      <option key={generateSafeKey('to-location', index, location)} value={location}>{location}</option>
                    ))}
                  </select>
                  {transferErrors.toLocation && <p className="text-red-400 text-xs mt-1">{transferErrors.toLocation}</p>}
                </div>
                <button
                  onClick={handleRequestStock}
                  className={'bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors col-span-2'}
                >
                  Initiate Stock Transfer
                </button>
              </div>
            </div>
          )}

          {/* Personnel Management Tab */}
          {activeTab === 'personnel' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-4'}>Personnel Management (All Users)</h2>
              
              <div className={'overflow-x-auto'}>
                <table className={'w-full text-white'}>
                  <thead>
                    <tr className={'border-b border-white/20'}>
                      <th className={'text-left py-2'}>Name</th>
                      <th className={'text-left py-2'}>Email</th>
                      <th className={'text-left py-2'}>Current Role</th>
                      <th className={'text-left py-2'}>Location</th>
                      <th className={'text-left py-2'}>Assign Role</th>
                      <th className={'text-left py-2'}>Update Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map((userItem, index) => (
                      <tr key={generateSafeKey('user', index, userItem.id)} className={'border-b border-white/10'}>
                        <td className={'py-2'}>{userItem.fullName}</td>
                        <td className={'py-2'}>{userItem.email}</td>
                        <td className={'py-2'}>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            userItem.role === 'superadmin' ? 'bg-red-500/20 text-red-300' :
                            userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300' :
                            userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300' :
                            userItem.role === 'dataEntry' ? 'bg-green-500/20 text-green-300' :
                            'bg-gray-500/20 text-gray-300'
                          }`}>
                            {userItem.role}
                          </span>
                        </td>
                        <td className={'py-2'}>{userItem.location || 'Not assigned'}</td>
                        <td className={'py-2'}>
                          <select
                            value={userItem.role}
                            onChange={(e) => handleAssignRole(userItem.id, e.target.value)}
                            className={'w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm'}
                            required
                          >
                            <option value={'superadmin'}>Super Admin</option>
                            <option value={'manager'}>Manager</option>
                            <option value={'sales'}>Sales Personnel</option>
                            <option value={'dataEntry'}>Data Entry Clerk</option>
                            <option value={'user'}>Regular User</option>
                          </select>
                        </td>
                        <td className={'py-2'}>
                          <select
                            value={userItem.location || ''}
                            onChange={(e) => handleUpdateUserLocation(userItem.id, e.target.value)}
                            className={'w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm'}
                            required
                          >
                            <option value={''}>Select Location</option>
                            {LOCATIONS.map((location, index) => (
                              <option key={generateSafeKey('user-location', index, location)} value={location}>{location}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User Approvals Tab */}
          {activeTab === 'approvals' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>User Access Approvals</h2>
                {pendingUsers.length > 0 && (
                  <button
                    onClick={() => handleBulkApproveUsers(pendingUsers)}
                    className={'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors'}
                  >
                    Bulk Approve All ({pendingUsers.length})
                  </button>
                )}
              </div>

              {/* Pending Approvals */}
              <div className={'mb-8'}>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Pending User Approvals</h3>
                {pendingUsers.length === 0 ? (
                  <div className={'bg-white/5 rounded-lg p-6 text-center'}>
                    <p className={'text-white/70'}>No pending user approvals.</p>
                  </div>
                ) : (
                  <div className={'grid gap-4'}>
                    {pendingUsers.map((userItem, index) => (
                      <div key={generateSafeKey('pending-user', index, userItem.id)} className={'bg-white/5 rounded-lg p-4 border border-white/10'}>
                        <div className={'flex justify-between items-start'}>
                          <div className={'flex-1'}>
                            <div className={'flex items-center space-x-3 mb-2'}>
                              <h4 className={'font-semibold text-white'}>{userItem.fullName}</h4>
                              <span className={'bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded text-xs'}>
                                Pending Approval
                              </span>
                            </div>
                            <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-sm'}>
                              <div>
                                <span className={'text-white/70'}>Email: </span>
                                <span className={'text-white'}>{userItem.email}</span>
                              </div>
                              <div>
                                <span className={'text-white/70'}>Requested Role: </span>
                                <span className={'text-blue-300 capitalize'}>{userItem.role}</span>
                              </div>
                              <div>
                                <span className={'text-white/70'}>Location: </span>
                                <span className={'text-green-300'}>{userItem.location || 'Not specified'}</span>
                              </div>
                              <div>
                                <span className={'text-white/70'}>Registered: </span>
                                <span className={'text-white/50'}>
                                  {userItem.createdAt?.toDate().toLocaleDateString() || 'Unknown date'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className={'flex space-x-2 ml-4'}>
                            
                            <button
                              onClick={() => handleApproveUser(userItem.id, userItem)}
                              disabled={processingUser === userItem.id}
                              className={'bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors'}
                            >
                              {processingUser === userItem.id ? 'Approving...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleRejectUser(userItem.id, userItem)}
                              disabled={processingUser === userItem.id}
                              className={'bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-lg transition-colors'}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Approval History */}
              <div>
                <h3 className={'text-lg font-semibold text-white mb-4'}>Approval History</h3>
                {userApprovals.length === 0 ? (
                  <div className={'bg-white/5 rounded-lg p-6 text-center'}>
                    <p className={'text-white/70'}>No approval history found.</p>
                  </div>
                ) : (
                  <div className={'overflow-x-auto'}>
                    <table className={'w-full text-white'}>
                      <thead>
                        <tr className={'border-b border-white/20'}>
                          <th className={'text-left py-2'}>User</th>
                          <th className={'text-left py-2'}>Email</th>
                          <th className={'text-left py-2'}>Role</th>
                          <th className={'text-left py-2'}>Location</th>
                          <th className={'text-left py-2'}>Status</th>
                          <th className={'text-left py-2'}>Processed By</th>
                          <th className={'text-left py-2'}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userApprovals.map((userItem, index) => (
                          <tr key={generateSafeKey('history-user', index, userItem.id)} className={'border-b border-white/10'}>
                            <td className={'py-2'}>{userItem.fullName}</td>
                            <td className={'py-2'}>{userItem.email}</td>
                            <td className={'py-2'}>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                userItem.role === 'superadmin' ? 'bg-red-500/20 text-red-300' :
                                userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300' :
                                userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300' :
                                userItem.role === 'dataEntry' ? 'bg-green-500/20 text-green-300' :
                                'bg-gray-500/20 text-gray-300'
                              }`}>
                                {userItem.role}
                              </span>
                            </td>
                            <td className={'py-2'}>{userItem.location || 'Not assigned'}</td>
                            <td className={'py-2'}>
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                userItem.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                                userItem.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                                'bg-yellow-500/20 text-yellow-300'
                              }`}>
                                {userItem.status}
                              </span>
                            </td>
                            <td className={'py-2'}>
                              {userItem.approvedByName || userItem.rejectedByName || 'System'}
                            </td>
                            <td className={'py-2'}>
                              {userItem.approvedAt?.toDate().toLocaleDateString() || 
                              userItem.rejectedAt?.toDate().toLocaleDateString() || 
                              'Unknown date'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Statistics */}
              <div className={'mt-6 grid grid-cols-1 md:grid-cols-3 gap-4'}>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-yellow-400'}>{pendingUsers.length}</div>
                  <div className={'text-white/70 text-sm'}>Pending Approvals</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-green-400'}>
                    {userApprovals.filter(u => u.status === 'approved').length}
                  </div>
                  <div className={'text-white/70 text-sm'}>Approved Users</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-red-400'}>
                    {userApprovals.filter(u => u.status === 'rejected').length}
                  </div>
                  <div className={'text-white/70 text-sm'}>Rejected Users</div>
                </div>
              </div>
            </div>
          )}

          {/* Stock Requests Tab */}
          {activeTab === 'requests' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <div className={'flex justify-between items-center mb-6'}>
                <h2 className={'text-xl font-semibold text-white'}>Stock Request Approval System</h2>
                <div className={'flex space-x-2'}>
                  {stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length > 0 && (
                    <button
                      onClick={handleAutoApprove}
                      className={'bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors'}
                    >
                      Auto-Approve ({stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length})
                    </button>
                  )}
                  <button
                    onClick={() => handleBulkApprove(stockRequests.filter(req => req.quantity > 1))}
                    className={'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors'}
                  >
                    Bulk Approve All
                  </button>
                </div>
              </div>

              {stockRequests.length === 0 ? (
                <p className={'text-white/70'}>No pending stock requests.</p>
              ) : (
                <div className={'space-y-4'}>
                  {stockRequests.map((request, index) => (
                    <div key={generateSafeKey('stock-request', index, request.id)} className={'bg-white/5 rounded-lg p-4 border border-white/10'}>
                      <div className={'flex justify-between items-start'}>
                        <div className={'flex-1'}>
                          <div className={'flex items-center space-x-3 mb-2'}>
                            <h3 className={'font-semibold text-white'}>Item: {request.itemCode}</h3>
                            {request.quantity <= approvalSettings.autoApproveBelow && request.quantity > 1 && (
                              <span className={'bg-green-500/20 text-green-300 px-2 py-1 rounded text-xs'}>
                                Auto-Approval Eligible
                              </span>
                            )}
                            {request.quantity <= 1 && (
                              <span className={'bg-red-500/20 text-red-300 px-2 py-1 rounded text-xs'}>
                                Requires Manual Review (Quantity ≤ 1)
                              </span>
                            )}
                          </div>
                          <div className={'grid grid-cols-1 md:grid-cols-2 gap-2 text-sm'}>
                            <div>
                              <span className={'text-white/70'}>Quantity: </span>
                              <span className={`${request.quantity > 1 ? 'text-white' : 'text-red-400 font-semibold'}`}>
                                {request.quantity}
                                {request.quantity <= 1 && <span className="text-xs ml-1">Out of stock</span>}
                              </span>
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
                          </div>
                        </div>
                        <div className={'flex space-x-2'}>
                          <button
                            onClick={() => handleApproveStockRequest(request.id, request)}
                            disabled={processingRequest === request.id || request.quantity <= 1}
                            className={`${request.quantity <= 1 ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors`}
                            title={request.quantity <= 1 ? 'Quantity must be greater than 1 to approve' : 'Approve request'}
                          >
                            {processingRequest === request.id ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleRejectStockRequest(request.id, request)}
                            className={'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors'}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Request Statistics */}
              <div className={'mt-6 grid grid-cols-1 md:grid-cols-4 gap-4'}>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-white'}>{stockRequests.length}</div>
                  <div className={'text-white/70 text-sm'}>Total Pending</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-green-400'}>
                    {stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length}
                  </div>
                  <div className={'text-white/70 text-sm'}>Auto-Approval Eligible</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-orange-400'}>
                    {stockRequests.filter(req => req.quantity > approvalSettings.autoApproveBelow).length}
                  </div>
                  <div className={'text-white/70 text-sm'}>Manual Review Needed</div>
                </div>
                <div className={'bg-white/5 rounded-lg p-4 text-center'}>
                  <div className={'text-2xl font-bold text-red-400'}>
                    {stockRequests.filter(req => req.quantity <= 1).length}
                  </div>
                  <div className={'text-white/70 text-sm'}>Quantity ≤ 1</div>
                </div>
              </div>
            </div>
          )}

          {/* Approval Settings Tab */}
          {activeTab === 'approvalSettings' && (
            <div className={'bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'}>
              <h2 className={'text-xl font-semibold text-white mb-6'}>Approval System Settings</h2>
              
              <div className={'max-w-2xl space-y-6'}>
                <div className={'bg-white/5 rounded-lg p-6'}>
                  <h3 className={'text-lg font-semibold text-white mb-4'}>Stock Request Approval</h3>
                  
                  <div className={'space-y-4'}>
                    <div className={'flex items-center justify-between'}>
                      <label className={'text-white'}>Require Approval for Stock Transfers</label>
                      <input
                        type={'checkbox'}
                        checked={approvalSettings.requireApproval}
                        onChange={(e) => setApprovalSettings({
                          ...approvalSettings,
                          requireApproval: e.target.checked
                        })}
                        className={'w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500'}
                      />
                    </div>
                    
                    <div>
                      <label className={'block text-white/70 text-sm mb-2'}>
                        Auto-Approve Quantity Limit
                        <span className={'text-white/50 text-xs ml-1'}>- Requests below this quantity will be auto-approved (0)</span>
                      </label>
                      <input
                        type={'number'}
                        min={'2'}
                        value={approvalSettings.autoApproveBelow}
                        onChange={(e) => setApprovalSettings({
                          ...approvalSettings,
                          autoApproveBelow: parseInt(e.target.value) || 2
                        })}
                        className={'w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'}
                        required
                      />
                    </div>
                    
                    <div>
                      <label className={'block text-white/70 text-sm mb-2'}>Allowed Transfer Locations *</label>
                      <div className={'grid grid-cols-2 md:grid-cols-3 gap-2'}>
                        {LOCATIONS.map((location, index) => (
                          <label key={generateSafeKey('location-option', index, location)} className={'flex items-center space-x-2'}>
                            <input
                              type={'checkbox'}
                              checked={approvalSettings.allowedLocations.includes(location)}
                              onChange={(e) => {
                                const newLocations = e.target.checked
                                  ? [...approvalSettings.allowedLocations, location]
                                  : approvalSettings.allowedLocations.filter(loc => loc !== location);
                                setApprovalSettings({
                                  ...approvalSettings,
                                  allowedLocations: newLocations
                                });
                              }}
                              className={'w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500'}
                              required={approvalSettings.allowedLocations.length === 1 && !e.target.checked}
                            />
                            <span className={'text-white text-sm'}>{location}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={saveApprovalSettings}
                      className={'w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors font-semibold'}
                    >
                      Save Approval Settings
                    </button>
                  </div>
                </div>

                <div className={'bg-white/5 rounded-lg p-6'}>
                  <h3 className={'text-lg font-semibold text-white mb-4'}>Approval Statistics</h3>
                  <div className={'grid grid-cols-2 gap-4'}>
                    <div className={'text-center'}>
                      <div className={'text-2xl font-bold text-green-400'}>
                        {stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length}
                      </div>
                      <div className={'text-white/70 text-sm'}>Auto-Approval Eligible</div>
                    </div>
                    <div className={'text-center'}>
                      <div className={'text-2xl font-bold text-orange-400'}>
                        {stockRequests.filter(req => req.quantity > approvalSettings.autoApproveBelow).length}
                      </div>
                      <div className={'text-white/70 text-sm'}>Manual Review Needed</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full fixed bottom-0 left-0 z-10 bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-200 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
        </div>
      </footer>
    </div>
  );
}