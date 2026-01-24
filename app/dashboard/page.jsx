'use client'
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db, storage } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, writeBatch,
  deleteDoc, getDoc, Timestamp, limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const FAULTY_STATUS = ['Reported', 'In Repair', 'Fixed', 'EOS (End of Service)', 'Scrapped'];
const SPARES_OPTIONS = ['Screen', 'Battery', 'Charging Port', 'Camera', 'Motherboard', 'Speaker', 'Microphone', 'Other'];

// Safe key generator
const generateSafeKey = (prefix = 'item', index, id) => {
  if (id) return `${prefix}-${id}`;
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Database Tables
  const [stocksTable, setStocksTable] = useState([]);
  const [salesTable, setSalesTable] = useState([]);
  const [faultyTable, setFaultyTable] = useState([]);
  const [installmentsTable, setInstallmentsTable] = useState([]);
  const [repairsTable, setRepairsTable] = useState([]);
  
  // Current location
  const [currentLocation, setCurrentLocation] = useState('');
  
  // Analytics states
  const [salesAnalysis, setSalesAnalysis] = useState({
    totalSales: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    topProducts: {},
    todaySales: 0,
    todayRevenue: 0
  });

  // Quick sale state
  const [quickSale, setQuickSale] = useState({
    itemCode: '',
    quantity: 1,
    customPrice: ''
  });
  const [quickSaleErrors, setQuickSaleErrors] = useState({});
  const [isQuickSaleValidating, setIsQuickSaleValidating] = useState(false);

  // Faulty phone reporting state
  const [reportModal, setReportModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [selectedFaulty, setSelectedFaulty] = useState(null);
  const [installmentModal, setInstallmentModal] = useState(false);
  const [selectedSaleForInstallment, setSelectedSaleForInstallment] = useState(null);
  
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
  const [faultyReportErrors, setFaultyReportErrors] = useState({});
  const [isFaultyValidating, setIsFaultyValidating] = useState(false);

  // Installment state
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
  const [installmentErrors, setInstallmentErrors] = useState({});
  const [isInstallmentValidating, setIsInstallmentValidating] = useState(false);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSaleType, setFilterSaleType] = useState('');
  
  // Report filter states
  const [reportFilters, setReportFilters] = useState({
    startDate: '',
    endDate: '',
    location: 'all',
    reportType: 'summary'
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [generatedReport, setGeneratedReport] = useState(null);
  
  // Stock transfer states
  const [stockRequests, setStockRequests] = useState([]);
  const [stockRequestModal, setStockRequestModal] = useState(false);
  const [stockRequestForm, setStockRequestForm] = useState({
    itemCode: '',
    quantity: '',
    toLocation: ''
  });
  const [processingRequest, setProcessingRequest] = useState(null);

  // Refs
  const unsubscribeRefs = useRef([]);

  // Cleanup listeners
  const cleanupListeners = useCallback(() => {
    if (unsubscribeRefs.current.length > 0) {
      unsubscribeRefs.current.forEach(unsubscribe => {
        try {
          if (unsubscribe && typeof unsubscribe === 'function') {
            unsubscribe();
          }
        } catch (err) {
          // Silent fail
        }
      });
      unsubscribeRefs.current = [];
    }
  }, []);

  // Error handling
  const handleFirestoreError = useCallback((error, context) => {
    console.error(`Firestore Error in ${context}:`, error);
    
    if (error.code === 'permission-denied') {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setTimeout(() => router.push('/login'), 100);
      }
      return;
    }
  }, [router]);

  // Initialize dashboard
  const initializeDashboard = useCallback(async (userData) => {
    try {
      await Promise.all([
        fetchAllTables(userData.location, userData.uid),
        setupRealtimeListeners(userData.location, userData.uid)
      ]);
    } catch (error) {
      handleFirestoreError(error, 'initialize-dashboard');
    }
  }, [handleFirestoreError]);

  // Fetch all tables
  const fetchAllTables = useCallback(async (location, userId) => {
    try {
      // Stocks table
      const stocksQuery = query(
        collection(db, 'stocks'),
        where('location', '==', location)
      );
      const stocksSnapshot = await getDocs(stocksQuery);
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocksTable(stocksData);

      // Sales table (user's sales only)
      const salesQuery = query(
        collection(db, 'sales'),
        where('location', '==', location),
        where('soldBy', '==', userId),
        orderBy('soldAt', 'desc'),
        limit(100)
      );
      const salesSnapshot = await getDocs(salesQuery);
      const salesData = salesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSalesTable(salesData);
      calculateSalesAnalysis(salesData);

      // Faulty phones table (user's reports only)
      const faultyQuery = query(
        collection(db, 'faultyPhones'),
        where('location', '==', location),
        where('reportedBy', '==', userId),
        orderBy('reportedAt', 'desc')
      );
      const faultySnapshot = await getDocs(faultyQuery);
      const faultyData = faultySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFaultyTable(faultyData);

      // Installments table (user's installments only)
      const installmentsQuery = query(
        collection(db, 'installments'),
        where('location', '==', location),
        where('createdBy', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const installmentsSnapshot = await getDocs(installmentsQuery);
      const installmentsData = installmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallmentsTable(installmentsData);

      // Repairs table (user's repairs only)
      const repairsQuery = query(
        collection(db, 'repairs'),
        where('location', '==', location),
        where('repairedBy', '==', userId),
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

  // Fetch stock requests (called separately as it depends on currentLocation)
  useEffect(() => {
    if (currentLocation) {
      fetchStockRequests();
    }
  }, [currentLocation]);

  // Setup realtime listeners
  const setupRealtimeListeners = useCallback((location, userId) => {
    cleanupListeners();
    
    if (!location || !userId) return () => {};

    // Real-time stocks listener
    const stocksQuery = query(
      collection(db, 'stocks'),
      where('location', '==', location)
    );
    
    const unsubscribeStocks = onSnapshot(stocksQuery, 
      (snapshot) => {
        const stocksData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStocksTable(stocksData);
      }, 
      (error) => handleFirestoreError(error, 'stocks-listener')
    );

    // Real-time sales listener
    const salesQuery = query(
      collection(db, 'sales'),
      where('location', '==', location),
      where('soldBy', '==', userId),
      orderBy('soldAt', 'desc')
    );

    const unsubscribeSales = onSnapshot(salesQuery, 
      (snapshot) => {
        const salesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSalesTable(salesData);
        calculateSalesAnalysis(salesData);
      }, 
      (error) => handleFirestoreError(error, 'sales-listener')
    );

    // Real-time faulty phones listener
    const faultyQuery = query(
      collection(db, 'faultyPhones'),
      where('location', '==', location),
      where('reportedBy', '==', userId),
      orderBy('reportedAt', 'desc')
    );

    const unsubscribeFaulty = onSnapshot(faultyQuery,
      (snapshot) => {
        const faultyData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setFaultyTable(faultyData);
      },
      (error) => handleFirestoreError(error, 'faulty-listener')
    );

    // Real-time installments listener
    const installmentsQuery = query(
      collection(db, 'installments'),
      where('location', '==', location),
      where('createdBy', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeInstallments = onSnapshot(installmentsQuery,
      (snapshot) => {
        const installmentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setInstallmentsTable(installmentsData);
      },
      (error) => handleFirestoreError(error, 'installments-listener')
    );

    // Real-time repairs listener
    const repairsQuery = query(
      collection(db, 'repairs'),
      where('location', '==', location),
      where('repairedBy', '==', userId),
      orderBy('repairedAt', 'desc')
    );

    const unsubscribeRepairs = onSnapshot(repairsQuery,
      (snapshot) => {
        const repairsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRepairsTable(repairsData);
      },
      (error) => handleFirestoreError(error, 'repairs-listener')
    );

    unsubscribeRefs.current.push(
      unsubscribeStocks, 
      unsubscribeSales, 
      unsubscribeFaulty,
      unsubscribeInstallments,
      unsubscribeRepairs
    );

    return cleanupListeners;
  }, [cleanupListeners, handleFirestoreError]);

  // Calculate sales analysis
  const calculateSalesAnalysis = useCallback((salesData) => {
    const analysis = {
      totalSales: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      topProducts: {},
      todaySales: 0,
      todayRevenue: 0
    };

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    salesData.forEach(sale => {
      const salePrice = sale.finalSalePrice || 0;
      analysis.totalRevenue += salePrice;
      analysis.totalSales++;

      const saleDate = sale.soldAt?.toDate();
      if (saleDate) {
        if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
          analysis.monthlyRevenue += salePrice;
        }
        if (saleDate >= today) {
          analysis.todaySales++;
          analysis.todayRevenue += salePrice;
        }
      }

      const productKey = `${sale.brand}-${sale.model}`;
      analysis.topProducts[productKey] = (analysis.topProducts[productKey] || 0) + 1;
    });

    setSalesAnalysis(analysis);
  }, []);

  // Format currency helper
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'MK 0';
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Format date helper
  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      if (date.toDate) return date.toDate().toLocaleDateString();
      return new Date(date).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  };

  // Report Generation Functions (based on superadmin dashboard)
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
    
    // Filter by location (already filtered by user location, but for consistency)
    if (reportFilters.location !== 'all') {
      filtered = filtered.filter(sale => sale.location === reportFilters.location);
    }
    
    return filtered;
  };

  const generateReportData = () => {
    try {
      const filteredSales = filterSalesByDateAndLocation(salesTable);
      
      // Calculate summary statistics
      const totalSales = filteredSales.length;
      const totalRevenue = filteredSales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0);
      const averageSaleValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      
      // Calculate top products
      const productCounts = {};
      filteredSales.forEach(sale => {
        const productKey = `${sale.brand || 'Unknown'} - ${sale.model || 'Unknown'}`;
        productCounts[productKey] = (productCounts[productKey] || 0) + 1;
      });
      const topProducts = Object.entries(productCounts)
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      return {
        filteredSales,
        totalSales,
        totalRevenue,
        averageSaleValue,
        topProducts
      };
    } catch (error) {
      console.error('Error generating report data:', error);
      return null;
    }
  };

  const downloadExcelReport = (reportData) => {
    try {
      const wb = XLSX.utils.book_new();
      
      // Detailed Sales Sheet
      const detailedRows = reportData.filteredSales.map(sale => ({
        'Date': sale.soldAt?.toDate().toLocaleDateString() || 'Unknown',
        'Time': sale.soldAt?.toDate().toLocaleTimeString() || 'Unknown',
        'Item Code': sale.itemCode || 'N/A',
        'Brand': sale.brand || 'Unknown',
        'Model': sale.model || 'Unknown',
        'Category': sale.category || 'Unknown',
        'Quantity': sale.quantity || 0,
        'Cost Price': sale.costPrice || 0,
        'Sale Price': sale.salePrice || 0,
        'Discount (%)': sale.discountPercentage || 0,
        'Final Price': sale.finalSalePrice || 0,
        'Profit': (sale.finalSalePrice || 0) - (sale.costPrice || 0),
        'Payment Method': sale.paymentMethod || 'Cash',
        'Customer Name': sale.customerName || 'N/A',
        'Customer Phone': sale.customerPhone || 'N/A'
      }));
      
      const detailedWs = XLSX.utils.json_to_sheet(detailedRows);
      XLSX.utils.book_append_sheet(wb, detailedWs, 'Detailed Sales');
      
      // Summary Sheet
      const summaryRows = [
        ['KM ELECTRONICS - SALES REPORT'],
        ['Generated on:', new Date().toLocaleString()],
        ['Report Period:', `${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`],
        [],
        ['SUMMARY'],
        ['Total Sales:', reportData.totalSales],
        ['Total Revenue:', reportData.totalRevenue],
        ['Average Sale Value:', reportData.averageSaleValue],
        [],
        ['TOP 10 PRODUCTS']
      ];
      
      reportData.topProducts.forEach(item => {
        summaryRows.push([item.product, `Sales: ${item.count}`]);
      });
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
      
      // Generate filename
      const dateRange = reportFilters.startDate && reportFilters.endDate 
        ? `${reportFilters.startDate}_to_${reportFilters.endDate}`
        : 'full_report';
      const filename = `KM_Sales_Report_${dateRange}_${new Date().getTime()}.xlsx`;
      
      XLSX.writeFile(wb, filename);
      return true;
    } catch (error) {
      console.error('Error generating Excel report:', error);
      return false;
    }
  };

  const downloadCSVReport = (reportData) => {
    try {
      let csvContent = 'KM ELECTRONICS - SALES REPORT\n';
      csvContent += `Generated on: ${new Date().toLocaleString()}\n`;
      csvContent += `Report Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}\n\n`;
      csvContent += 'SUMMARY\n';
      csvContent += `Total Sales:,${reportData.totalSales}\n`;
      csvContent += `Total Revenue:,${formatCurrency(reportData.totalRevenue)}\n`;
      csvContent += `Average Sale Value:,${formatCurrency(reportData.averageSaleValue)}\n\n`;
      csvContent += 'DETAILED SALES RECORDS\n';
      csvContent += 'Date,Time,Item Code,Brand,Model,Category,Quantity,Cost Price,Sale Price,Discount (%),Final Price,Profit,Payment Method,Customer Name,Customer Phone\n';
      
      reportData.filteredSales.forEach(sale => {
        const profit = (sale.finalSalePrice || 0) - (sale.costPrice || 0);
        csvContent += `"${sale.soldAt?.toDate().toLocaleDateString() || 'Unknown'}","${sale.soldAt?.toDate().toLocaleTimeString() || 'Unknown'}","${sale.itemCode || 'N/A'}","${sale.brand || 'Unknown'}","${sale.model || 'Unknown'}","${sale.category || 'Unknown'}",${sale.quantity || 0},${sale.costPrice || 0},${sale.salePrice || 0},${sale.discountPercentage || 0},${sale.finalSalePrice || 0},${profit},"${sale.paymentMethod || 'Cash'}","${sale.customerName || 'N/A'}","${sale.customerPhone || 'N/A'}"\n`;
      });
      
      const dateRange = reportFilters.startDate && reportFilters.endDate 
        ? `${reportFilters.startDate}_to_${reportFilters.endDate}`
        : 'full_report';
      const filename = `KM_Sales_Report_${dateRange}_${new Date().getTime()}.csv`;
      
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
      console.error('Error generating CSV report:', error);
      return false;
    }
  };

  const handleGenerateReport = async () => {
    if (!reportFilters.startDate && !reportFilters.endDate) {
      const confirm = window.confirm('No date range selected. Generate report for all sales data?');
      if (!confirm) return;
    }
    
    setIsGeneratingReport(true);
    
    try {
      const reportData = generateReportData();
      
      if (!reportData || reportData.filteredSales.length === 0) {
        alert('No sales data found for the selected filters.');
        setIsGeneratingReport(false);
        return;
      }
      
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
        alert(`Report downloaded successfully!\n\nTotal Records: ${reportData.totalSales}\nTotal Revenue: ${formatCurrency(reportData.totalRevenue)}`);
      } else {
        alert('Failed to generate report. Please try again.');
      }
    } catch (error) {
      alert('Error generating report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Stock Transfer Functions
  const handleCreateStockRequest = async () => {
    if (!stockRequestForm.itemCode || !stockRequestForm.quantity || !stockRequestForm.toLocation) {
      alert('Please fill all required fields');
      return;
    }

    try {
      // Check if item exists in current location
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', stockRequestForm.itemCode.trim()),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        alert(`Item ${stockRequestForm.itemCode} not found in ${currentLocation}`);
        return;
      }

      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();
      const requestedQuantity = parseInt(stockRequestForm.quantity);

      if (stock.quantity < requestedQuantity) {
        alert(`Insufficient stock! Only ${stock.quantity} units available`);
        return;
      }

      // Create stock request
      const requestData = {
        itemCode: stockRequestForm.itemCode.trim(),
        brand: stock.brand,
        model: stock.model,
        quantity: requestedQuantity,
        fromLocation: currentLocation,
        toLocation: stockRequestForm.toLocation,
        requestedBy: user.uid,
        requestedByName: user.fullName || user.email,
        requestedAt: serverTimestamp(),
        status: 'pending',
        sourceStockId: stockDoc.id
      };

      await addDoc(collection(db, 'stockRequests'), requestData);

      alert('Stock transfer request created successfully!');
      setStockRequestModal(false);
      setStockRequestForm({
        itemCode: '',
        quantity: '',
        toLocation: ''
      });

      // Refresh stock requests
      await fetchStockRequests();

    } catch (error) {
      console.error('Error creating stock request:', error);
      alert('Error creating stock request. Please try again.');
    }
  };

  const fetchStockRequests = async () => {
    try {
      const requestsQuery = query(
        collection(db, 'stockRequests'),
        where('fromLocation', '==', currentLocation),
        orderBy('requestedAt', 'desc')
      );
      
      const requestsSnapshot = await getDocs(requestsQuery);
      const requestsData = requestsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setStockRequests(requestsData);
    } catch (error) {
      console.error('Error fetching stock requests:', error);
    }
  };

  // Authentication and initialization
  const handleUserAuth = useCallback(async (firebaseUser) => {
    try {
      const userDoc = await getDocs(
        query(collection(db, 'users'), where('uid', '==', firebaseUser.uid))
      );
      
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        
        if (userData.role === 'sales' || userData.role === 'dataEntry') {
          setUser(userData);
          const userLocation = userData.location || 'Lilongwe';
          setCurrentLocation(userLocation);
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
  }, [router, initializeDashboard, handleFirestoreError]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await handleUserAuth(firebaseUser);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => {
      cleanupListeners();
      unsubscribe();
    };
  }, [router, handleUserAuth, cleanupListeners]);

  // VALIDATION FUNCTIONS

  // Validate quick sale
  const validateQuickSale = async () => {
    const errors = {};
    
    // Check required fields
    if (!quickSale.itemCode.trim()) {
      errors.itemCode = 'Item Code is required';
    }
    
    if (!quickSale.quantity) {
      errors.quantity = 'Quantity is required';
    } else if (parseInt(quickSale.quantity) <= 0) {
      errors.quantity = 'Quantity must be greater than 0';
    } else if (!Number.isInteger(Number(quickSale.quantity))) {
      errors.quantity = 'Quantity must be a whole number';
    }
    
    if (quickSale.customPrice) {
      const customPrice = parseFloat(quickSale.customPrice);
      if (isNaN(customPrice) || customPrice <= 0) {
        errors.customPrice = 'Custom price must be a positive number';
      }
    }
    
    // If basic validation fails, return early
    if (Object.keys(errors).length > 0) {
      return { errors, isValid: false };
    }
    
    // Validate stock availability
    try {
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', quickSale.itemCode.trim()),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        errors.itemCode = `Item not found in ${currentLocation}`;
        return { errors, isValid: false };
      }
      
      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();
      const requestedQuantity = parseInt(quickSale.quantity);
      
      // Validate stock data
      if (stock.quantity === undefined || stock.quantity === null) {
        errors.stock = 'Invalid stock data. Please contact administrator.';
        return { errors, isValid: false };
      }
      
      if (stock.quantity < requestedQuantity) {
        errors.quantity = `Insufficient stock! Only ${stock.quantity} units available`;
        return { errors, isValid: false };
      }
      
      // Validate sale price
      if (quickSale.customPrice) {
        const customPrice = parseFloat(quickSale.customPrice);
        const salePrice = parseFloat(stock.salePrice) || 0;
        const maxDiscount = salePrice * 0.5; // Allow up to 50% discount
        
        if (customPrice < salePrice * 0.5) {
          errors.customPrice = `Custom price too low! Minimum price: MK ${(salePrice * 0.5).toFixed(2)}`;
          return { errors, isValid: false };
        }
        
        if (customPrice > salePrice * 2) {
          errors.customPrice = `Custom price too high! Maximum price: MK ${(salePrice * 2).toFixed(2)}`;
          return { errors, isValid: false };
        }
      }
      
      return { errors, isValid: true };
      
    } catch (error) {
      console.error('Quick sale validation error:', error);
      errors.validation = 'Error validating stock. Please try again.';
      return { errors, isValid: false };
    }
  };

  // Validate faulty phone report
  const validateFaultyReport = async () => {
    const errors = {};
    
    // Required fields
    if (!faultyReport.itemCode.trim()) {
      errors.itemCode = 'Item Code is required';
    }
    
    if (!faultyReport.faultDescription.trim()) {
      errors.faultDescription = 'Fault Description is required';
    }
    
    // Numeric field validation
    if (faultyReport.reportedCost && (isNaN(parseFloat(faultyReport.reportedCost)) || parseFloat(faultyReport.reportedCost) < 0)) {
      errors.reportedCost = 'Reported cost must be a positive number';
    }
    
    if (faultyReport.estimatedRepairCost && (isNaN(parseFloat(faultyReport.estimatedRepairCost)) || parseFloat(faultyReport.estimatedRepairCost) < 0)) {
      errors.estimatedRepairCost = 'Estimated repair cost must be a positive number';
    }
    
    // Phone number validation
    if (faultyReport.customerPhone) {
      const phoneRegex = /^(\+?265|0)(\d{9})$/;
      if (!phoneRegex.test(faultyReport.customerPhone.replace(/\s+/g, ''))) {
        errors.customerPhone = 'Please enter a valid Malawi phone number';
      }
    }
    
    // If basic validation fails, return early
    if (Object.keys(errors).length > 0) {
      return { errors, isValid: false };
    }
    
    // Validate stock availability
    try {
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', faultyReport.itemCode.trim()),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        errors.itemCode = `Item not found in ${currentLocation}`;
        return { errors, isValid: false };
      }
      
      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();
      
      if (stock.quantity < 1) {
        errors.itemCode = 'Item is out of stock';
        return { errors, isValid: false };
      }
      
      // Check if item is already marked as faulty
      const existingFaultyQuery = query(
        collection(db, 'faultyPhones'),
        where('itemCode', '==', faultyReport.itemCode.trim()),
        where('status', 'in', ['Reported', 'In Repair']),
        where('location', '==', currentLocation)
      );
      
      const existingFaultySnapshot = await getDocs(existingFaultyQuery);
      if (!existingFaultySnapshot.empty) {
        errors.itemCode = 'This item is already reported as faulty';
        return { errors, isValid: false };
      }
      
      return { errors, isValid: true };
      
    } catch (error) {
      console.error('Faulty report validation error:', error);
      errors.validation = 'Error validating stock. Please try again.';
      return { errors, isValid: false };
    }
  };

  // Validate installment plan
  const validateInstallmentPlan = () => {
    const errors = {};
    
    // Required fields
    if (!installmentData.customerName.trim()) {
      errors.customerName = 'Customer Name is required';
    }
    
    if (!installmentData.totalAmount || parseFloat(installmentData.totalAmount) <= 0) {
      errors.totalAmount = 'Total Amount must be greater than 0';
    }
    
    // Phone number validation
    if (installmentData.phoneNumber) {
      const phoneRegex = /^(\+?265|0)(\d{9})$/;
      if (!phoneRegex.test(installmentData.phoneNumber.replace(/\s+/g, ''))) {
        errors.phoneNumber = 'Please enter a valid Malawi phone number';
      }
    }
    
    // Down payment validation
    if (installmentData.downPayment) {
      const downPayment = parseFloat(installmentData.downPayment);
      const totalAmount = parseFloat(installmentData.totalAmount);
      
      if (isNaN(downPayment) || downPayment < 0) {
        errors.downPayment = 'Down payment must be a positive number';
      } else if (downPayment > totalAmount) {
        errors.downPayment = 'Down payment cannot exceed total amount';
      }
    }
    
    // Installment plan validation
    const plan = parseInt(installmentData.installmentPlan);
    if (isNaN(plan) || plan < 1 || plan > 12) {
      errors.installmentPlan = 'Installment plan must be between 1 and 12 months';
    }
    
    // Next payment date validation
    if (!installmentData.nextPaymentDate) {
      errors.nextPaymentDate = 'Next payment date is required';
    } else {
      const nextPayment = new Date(installmentData.nextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (nextPayment < today) {
        errors.nextPaymentDate = 'Next payment date cannot be in the past';
      }
    }
    
    // Monthly payment calculation
    const totalAmount = parseFloat(installmentData.totalAmount);
    const downPayment = parseFloat(installmentData.downPayment) || 0;
    const remainingAmount = totalAmount - downPayment;
    
    if (remainingAmount <= 0 && plan > 1) {
      errors.downPayment = 'Down payment already covers full amount. Select 1 month plan.';
    }
    
    const monthlyPayment = remainingAmount / plan;
    if (monthlyPayment < 1000 && remainingAmount > 0) {
      errors.installmentPlan = 'Monthly payment too small. Choose shorter plan.';
    }
    
    return { errors, isValid: Object.keys(errors).length === 0 };
  };

  // ENHANCED SALES FUNCTIONS WITH VALIDATION
  const handleQuickSale = async () => {
    // Clear previous errors
    setQuickSaleErrors({});
    setIsQuickSaleValidating(true);
    
    try {
      // Validate all fields
      const validation = await validateQuickSale();
      
      if (!validation.isValid) {
        setQuickSaleErrors(validation.errors);
        setIsQuickSaleValidating(false);
        return;
      }
      
      // All validations passed, process sale
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', quickSale.itemCode.trim()),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();

      let finalPrice;
      if (quickSale.customPrice) {
        finalPrice = parseFloat(quickSale.customPrice);
      } else {
        const salePrice = parseFloat(stock.salePrice) || 0;
        const discountPercentage = parseFloat(stock.discountPercentage) || 0;
        finalPrice = salePrice * (1 - discountPercentage / 100) * quickSale.quantity;
      }

      const batch = writeBatch(db);

      const newQuantity = stock.quantity - parseInt(quickSale.quantity);
      const stockRef = doc(db, 'stocks', stockDoc.id);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp(),
        lastSoldBy: user.uid,
        lastSoldByName: user.fullName
      });

      const saleData = {
        itemCode: stock.itemCode,
        brand: stock.brand,
        model: stock.model,
        storage: stock.storage,
        color: stock.color,
        stockId: stockDoc.id,
        quantity: parseInt(quickSale.quantity),
        originalPrice: parseFloat(stock.salePrice) || 0,
        finalSalePrice: finalPrice,
        customPrice: quickSale.customPrice ? parseFloat(quickSale.customPrice) : null,
        discountPercentage: parseFloat(stock.discountPercentage) || 0,
        soldAt: serverTimestamp(),
        soldBy: user.uid,
        soldByName: user.fullName,
        location: currentLocation,
        saleType: quickSale.customPrice ? 'custom_price' : 'standard',
        status: 'completed',
        paymentType: 'full',
        validatedAt: serverTimestamp(),
        validatedBy: user.uid,
        validatedByName: user.fullName
      };

      const salesRef = doc(collection(db, 'sales'));
      batch.set(salesRef, saleData);

      await batch.commit();

      // Reset form
      setQuickSale({ itemCode: '', quantity: 1, customPrice: '' });
      setQuickSaleErrors({});
      
      alert('Sale completed successfully!');
      
    } catch (error) {
      let errorMessage = 'Error processing sale. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check if you have sales permissions.';
        handleFirestoreError(error, 'quick-sale');
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'Stock was modified by another user. Please try again.';
      }
      
      setQuickSaleErrors({ submission: errorMessage });
      alert(errorMessage);
    } finally {
      setIsQuickSaleValidating(false);
    }
  };

  const handleSellItem = async (stockId, stockData, quantity = 1) => {
    try {
      // Validate stock data
      if (!stockData.quantity && stockData.quantity !== 0) {
        alert('Invalid stock data. Please contact administrator.');
        return;
      }

      // Validate quantity
      if (stockData.quantity < quantity) {
        alert(`Insufficient stock! Only ${stockData.quantity} units available.`);
        return;
      }

      if (quantity <= 0) {
        alert('Please enter a valid quantity.');
        return;
      }

      if (!Number.isInteger(quantity)) {
        alert('Quantity must be a whole number.');
        return;
      }

      const salePrice = parseFloat(stockData.salePrice) || 0;
      const discountPercentage = parseFloat(stockData.discountPercentage) || 0;
      const finalPrice = salePrice * (1 - discountPercentage / 100) * quantity;

      const batch = writeBatch(db);

      const newQuantity = stockData.quantity - quantity;
      const stockRef = doc(db, 'stocks', stockId);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp(),
        lastSoldBy: user.uid,
        lastSoldByName: user.fullName
      });

      const saleData = {
        itemCode: stockData.itemCode,
        brand: stockData.brand,
        model: stockData.model,
        storage: stockData.storage,
        color: stockData.color,
        stockId: stockId,
        quantity: quantity,
        originalPrice: salePrice,
        finalSalePrice: finalPrice,
        discountPercentage: discountPercentage,
        soldAt: serverTimestamp(),
        soldBy: user.uid,
        soldByName: user.fullName,
        location: currentLocation,
        saleType: 'standard',
        status: 'completed',
        paymentType: 'full',
        validatedAt: serverTimestamp(),
        validatedBy: user.uid,
        validatedByName: user.fullName
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

  // ENHANCED FAULTY PHONE FUNCTIONS WITH VALIDATION
  const handleReportFaulty = async () => {
    // Clear previous errors
    setFaultyReportErrors({});
    setIsFaultyValidating(true);
    
    try {
      // Validate all fields
      const validation = await validateFaultyReport();
      
      if (!validation.isValid) {
        setFaultyReportErrors(validation.errors);
        setIsFaultyValidating(false);
        return;
      }
      
      // All validations passed, report faulty
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', faultyReport.itemCode.trim()),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();

      const batch = writeBatch(db);

      const newQuantity = stock.quantity - 1;
      const stockRef = doc(db, 'stocks', stockDoc.id);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        markedFaulty: true,
        faultyAt: serverTimestamp()
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
        location: currentLocation,
        lastUpdated: serverTimestamp(),
        validatedAt: serverTimestamp(),
        validatedBy: user.uid,
        validatedByName: user.fullName
      };

      const faultyRef = doc(collection(db, 'faultyPhones'));
      batch.set(faultyRef, faultyData);

      await batch.commit();

      // Reset form
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
      setFaultyReportErrors({});

      setReportModal(false);
      alert('Faulty phone reported successfully! Stock has been updated.');
      
    } catch (error) {
      console.error('Error reporting faulty phone:', error);
      setFaultyReportErrors({ submission: 'Error reporting faulty phone. Please try again.' });
      alert('Error reporting faulty phone. Please try again.');
    } finally {
      setIsFaultyValidating(false);
    }
  };

  const handleUpdateFaultyStatus = async (faultyId, updates) => {
    // Validate updates
    if (!updates.status || !FAULTY_STATUS.includes(updates.status)) {
      alert('Invalid status selected.');
      return;
    }
    
    if (updates.repairCost && (isNaN(parseFloat(updates.repairCost)) || parseFloat(updates.repairCost) < 0)) {
      alert('Repair cost must be a positive number.');
      return;
    }

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
            sparesUsed: updates.sparesUsed || faultyData.sparesNeeded,
            repairedAt: serverTimestamp(),
            repairedBy: user.uid,
            repairedByName: user.fullName,
            location: currentLocation,
            notes: updates.updateNotes,
            validatedAt: serverTimestamp(),
            validatedBy: user.uid,
            validatedByName: user.fullName
          };

          const repairRef = doc(collection(db, 'repairs'));
          batch.set(repairRef, repairData);
        }
      }

      batch.update(faultyRef, {
        ...updates,
        lastUpdated: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.fullName,
        validatedAt: serverTimestamp(),
        validatedBy: user.uid,
        validatedByName: user.fullName
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

  const handleDeleteFaulty = async (faultyId) => {
    if (!confirm('Are you sure you want to delete this faulty phone record? This action cannot be undone.')) {
      return;
    }

    try {
      const faultyRef = doc(db, 'faultyPhones', faultyId);
      await deleteDoc(faultyRef);
      alert('Faulty phone record deleted successfully!');
    } catch (error) {
      console.error('Error deleting faulty phone:', error);
      alert('Error deleting record. Please try again.');
    }
  };

  // ENHANCED FAULTY PHONE PDF REPORT
  const generateFaultyPhonePDFReport = (faultyPhone) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Add linear background
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Add header with logo
    doc.setFontSize(24);
    doc.setTextColor(59, 130, 246); // blue-500
    doc.setFont('helvetica', 'bold');
    doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.text('FAULTY PHONE REPORT', pageWidth / 2, 30, { align: 'center' });
    
    // Report ID and Date
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175);
    doc.text(`Report ID: ${faultyPhone.id}`, 20, 40);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 20, 40, { align: 'right' });
    
    // Device Information Section
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text('DEVICE INFORMATION', 20, 55);
    
    doc.setFillColor(55, 65, 81);
    doc.roundedRect(20, 60, pageWidth - 40, 35, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    
    const deviceInfo = [
      [`Item Code: ${faultyPhone.itemCode}`, `Brand: ${faultyPhone.brand || 'N/A'}`],
      [`Model: ${faultyPhone.model || 'N/A'}`, `IMEI: ${faultyPhone.imei || 'N/A'}`],
      [`Location: ${faultyPhone.location}`, `Status: ${faultyPhone.status}`],
      [`Reported Cost: MK ${faultyPhone.reportedCost?.toLocaleString() || '0'}`, `Estimated Repair: MK ${faultyPhone.estimatedRepairCost?.toLocaleString() || '0'}`]
    ];
    
    let yPos = 70;
    deviceInfo.forEach(([left, right]) => {
      doc.text(left, 25, yPos);
      doc.text(right, pageWidth / 2 + 10, yPos);
      yPos += 8;
    });
    
    // Customer Information Section
    if (faultyPhone.customerName) {
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text('CUSTOMER INFORMATION', 20, yPos + 5);
      
      doc.setFillColor(55, 65, 81);
      doc.roundedRect(20, yPos + 10, pageWidth - 40, 20, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      
      doc.text(`Customer Name: ${faultyPhone.customerName || 'N/A'}`, 25, yPos + 20);
      doc.text(`Phone: ${faultyPhone.customerPhone || 'N/A'}`, pageWidth / 2 + 10, yPos + 20);
      yPos += 35;
    } else {
      yPos += 15;
    }
    
    // Fault Details Section
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text('FAULT DETAILS', 20, yPos);
    
    doc.setFillColor(55, 65, 81);
    const faultHeight = 40;
    doc.roundedRect(20, yPos + 5, pageWidth - 40, faultHeight, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    
    const faultDescription = faultyPhone.faultDescription || 'No description provided';
    const splitFault = doc.splitTextToSize(faultDescription, pageWidth - 50);
    doc.text(splitFault, 25, yPos + 15);
    yPos += faultHeight + 15;
    
    // Spares Needed Section
    if (faultyPhone.sparesNeeded?.length > 0 || faultyPhone.otherSpares) {
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text('SPARES REQUIRED', 20, yPos);
      
      doc.setFillColor(55, 65, 81);
      doc.roundedRect(20, yPos + 5, pageWidth - 40, 20, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      
      const sparesList = [...(faultyPhone.sparesNeeded || [])];
      if (faultyPhone.otherSpares) sparesList.push(faultyPhone.otherSpares);
      doc.text(sparesList.join(', '), 25, yPos + 15);
      yPos += 30;
    }
    
    // Timeline Section
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text('TIMELINE', 20, yPos);
    
    const timelineData = [
      ['Event', 'Date', 'Responsible Person'],
      ['Reported', faultyPhone.reportedAt?.toDate().toLocaleDateString() || 'N/A', faultyPhone.reportedByName || 'N/A']
    ];
    
    if (faultyPhone.lastUpdated) {
      timelineData.push(['Last Updated', faultyPhone.lastUpdated?.toDate().toLocaleDateString() || 'N/A', faultyPhone.updatedByName || 'N/A']);
    }
    
    autoTable(doc, {
      startY: yPos + 10,
      head: timelineData.slice(0, 1),
      body: timelineData.slice(1),
      theme: 'grid',
      headStyles: { 
        fillColor: [59, 130, 246], 
        textColor: [255, 255, 255], 
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: { 
        textColor: [255, 255, 255], 
        fontSize: 9 
      },
      alternateRowStyles: { fillColor: [55, 65, 81] },
      margin: { left: 20, right: 20 }
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
    
    // Notes Section
    if (faultyPhone.notes) {
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text('ADDITIONAL NOTES', 20, yPos);
      
      doc.setFillColor(55, 65, 81);
      doc.roundedRect(20, yPos + 5, pageWidth - 40, 30, 3, 3, 'F');
      
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      
      const splitNotes = doc.splitTextToSize(faultyPhone.notes, pageWidth - 50);
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
    
    const color = statusColor[faultyPhone.status] || [107, 114, 128];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(pageWidth - 60, yPos + 5, 40, 15, 3, 3, 'F');
    doc.text(faultyPhone.status, pageWidth - 40, yPos + 12, { align: 'center' });
    
    // Add footer
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('Generated by KM Electronics User Dashboard', pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text(`Page 1 of 1`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    
    // Save PDF
    const filename = `Faulty_Report_${faultyPhone.itemCode}_${faultyPhone.id || Date.now()}.pdf`;
    doc.save(filename);
  };

  // Enhanced Sales PDF Report
  const generateSalesPDFReport = (sale) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    
    // Add header
    doc.setFontSize(24);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('SALES RECEIPT', pageWidth / 2, 30, { align: 'center' });
    
    // Sale details
    doc.setFontSize(10);
    doc.text(`Receipt ID: ${sale.id}`, 20, 45);
    doc.text(`Date: ${sale.soldAt?.toDate().toLocaleDateString()}`, 20, 50);
    doc.text(`Sold By: ${sale.soldByName}`, 20, 55);
    doc.text(`Location: ${sale.location}`, 20, 60);
    
    // Item details table
    autoTable(doc, {
      startY: 70,
      head: [['Item Code', 'Brand', 'Model', 'Quantity', 'Unit Price', 'Total']],
      body: [[
        sale.itemCode,
        sale.brand,
        sale.model,
        sale.quantity.toString(),
        `MK ${sale.originalPrice?.toFixed(2)}`,
        `MK ${sale.finalSalePrice?.toFixed(2)}`
      ]],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    // Payment details
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text(`Total Amount: MK ${sale.finalSalePrice?.toFixed(2)}`, pageWidth - 20, finalY, { align: 'right' });
    
    if (sale.discountPercentage > 0) {
      doc.text(`Discount: ${sale.discountPercentage}%`, pageWidth - 20, finalY + 8, { align: 'right' });
    }
    
    if (sale.saleType === 'custom_price') {
      doc.text(`Sale Type: Custom Price`, pageWidth - 20, finalY + 16, { align: 'right' });
    }
    
    // Add footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('Thank you for your business!', pageWidth / 2, pageHeight - 10, { align: 'center' });
    doc.text('This is an automated sales receipt', pageWidth / 2, pageHeight - 5, { align: 'center' });
    
    // Save PDF
    doc.save(`Sales_Receipt_${sale.itemCode}_${Date.now()}.pdf`);
  };

  // ENHANCED INSTALLMENT FUNCTIONS WITH VALIDATION
  const handleProcessInstallment = async () => {
    // Clear previous errors
    setInstallmentErrors({});
    setIsInstallmentValidating(true);
    
    try {
      // Validate all fields
      const validation = validateInstallmentPlan();
      
      if (!validation.isValid) {
        setInstallmentErrors(validation.errors);
        setIsInstallmentValidating(false);
        return;
      }
      
      // Check if sale exists and is not already on installment
      const saleRef = doc(db, 'sales', installmentData.saleId);
      const saleDoc = await getDoc(saleRef);
      
      if (!saleDoc.exists()) {
        setInstallmentErrors({ saleId: 'Sale record not found' });
        setIsInstallmentValidating(false);
        return;
      }
      
      const saleData = saleDoc.data();
      if (saleData.paymentType === 'installment') {
        setInstallmentErrors({ saleId: 'This sale already has an installment plan' });
        setIsInstallmentValidating(false);
        return;
      }
      
      // All validations passed, create installment
      const installmentDataToSave = {
        saleId: installmentData.saleId,
        customerName: installmentData.customerName.trim(),
        phoneNumber: installmentData.phoneNumber.trim(),
        totalAmount: parseFloat(installmentData.totalAmount),
        downPayment: parseFloat(installmentData.downPayment) || 0,
        remainingAmount: parseFloat(installmentData.totalAmount) - (parseFloat(installmentData.downPayment) || 0),
        installmentPlan: parseInt(installmentData.installmentPlan),
        monthlyPayment: parseFloat(installmentData.monthlyPayment) || 0,
        nextPaymentDate: installmentData.nextPaymentDate,
        notes: installmentData.notes,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: user.fullName,
        location: currentLocation,
        status: 'active',
        payments: installmentData.downPayment > 0 ? [{
          amount: parseFloat(installmentData.downPayment),
          date: new Date().toISOString().split('T')[0],
          type: 'down_payment',
          receivedBy: user.uid,
          receivedByName: user.fullName
        }] : [],
        validatedAt: serverTimestamp(),
        validatedBy: user.uid,
        validatedByName: user.fullName
      };

      const installmentRef = await addDoc(collection(db, 'installments'), installmentDataToSave);

      await updateDoc(saleRef, {
        paymentType: 'installment',
        installmentId: installmentRef.id,
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
      setInstallmentErrors({});

    } catch (error) {
      console.error('Error processing installment:', error);
      setInstallmentErrors({ submission: 'Error creating installment plan. Please try again.' });
      alert('Error creating installment plan. Please try again.');
    } finally {
      setIsInstallmentValidating(false);
    }
  };

  const openInstallmentModal = (sale) => {
    setSelectedSaleForInstallment(sale);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    
    setInstallmentData({
      saleId: sale.id,
      customerName: '',
      phoneNumber: '',
      totalAmount: sale.finalSalePrice,
      downPayment: 0,
      remainingAmount: sale.finalSalePrice,
      installmentPlan: '3',
      monthlyPayment: sale.finalSalePrice / 3,
      nextPaymentDate: nextMonth.toISOString().split('T')[0],
      notes: ''
    });
    setInstallmentErrors({});
    setInstallmentModal(true);
  };

  // Utility functions
  const getFilteredStocks = () => {
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
    
    return filtered;
  };

  const getFilteredSales = () => {
    let filtered = salesTable;
    
    if (searchTerm) {
      filtered = filtered.filter(sale => 
        sale.itemCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterSaleType) {
      filtered = filtered.filter(sale => sale.saleType === filterSaleType);
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

  const getUniqueBrands = () => {
    return [...new Set(stocksTable.map(stock => stock.brand).filter(Boolean))];
  };

  const calculateTotalStockValue = () => {
    return stocksTable.reduce((total, stock) => {
      return total + ((parseFloat(stock.orderPrice) || 0) * (parseInt(stock.quantity) || 0));
    }, 0);
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'Reported': return 'bg-yellow-500/20 text-yellow-300';
      case 'In Repair': return 'bg-blue-500/20 text-blue-300';
      case 'Fixed': return 'bg-green-500/20 text-green-300';
      case 'EOS (End of Service)': return 'bg-red-500/20 text-red-300';
      case 'Scrapped': return 'bg-gray-500/20 text-gray-300';
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

  if (loading) {
    return (
      <div className='min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center'>
        <div className='text-white'>Loading User Dashboard...</div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900'>
      {/* Header */}
      <header className='bg-white/10 backdrop-blur-lg border-b border-white/20'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center py-4'>
            <div>
              <h1 className='text-2xl font-bold text-white'>
                KM ELECTRONICS <span className='text-blue-500'>User</span>
              </h1>
              <p className='text-white/70 text-sm'>
                Welcome, {user?.fullName} | Location: {currentLocation}
                <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getRoleBadgeColor(user?.role)}`}>
                  {user?.role === 'sales' ? 'Sales Personnel' : 'Data Entry Clerk'}
                </span>
              </p>
            </div>
            
            <button
              onClick={() => signOut(auth).then(() => router.push('/login'))}
              className='bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors'
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <nav className='border-b border-white/20'>
          <div className='flex space-x-8 overflow-x-auto'>
            {[
              { id: 'dashboard', name: 'Dashboard' },
              { id: 'stocks', name: 'Stock & Sales' },
              { id: 'quickSale', name: 'Quick Sale' },
              { id: 'salesHistory', name: 'My Sales' },
              { id: 'stockTransfer', name: 'Stock Transfer' },
              { id: 'faultyPhones', name: 'Faulty Phones' },
              { id: 'installments', name: 'Installments' },
              { id: 'myRepairs', name: 'My Repairs' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <div className='py-6'>
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <div className='space-y-6'>
              {/* Analytics Cards */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Available Stock Value</h3>
                  <p className='text-2xl font-bold text-green-400'>
                    MK {calculateTotalStockValue().toLocaleString()}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Today's Sales</h3>
                  <p className='text-2xl font-bold text-blue-400'>
                    {salesAnalysis.todaySales} (MK {salesAnalysis.todayRevenue?.toLocaleString()})
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Total Sales</h3>
                  <p className='text-2xl font-bold text-purple-400'>
                    {salesAnalysis.totalSales} (MK {salesAnalysis.totalRevenue?.toLocaleString()})
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Faulty Phones</h3>
                  <p className='text-2xl font-bold text-orange-400'>
                    {faultyTable.length}
                  </p>
                </div>
              </div>

              {/* Quick Actions & Recent Sales */}
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Quick Actions */}
                <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Quick Actions</h2>
                  <div className='space-y-3'>
                    <button
                      onClick={() => setActiveTab('quickSale')}
                      className='w-full bg-blue-600 hover:bg-blue-700 text-blue-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold'>Quick Sale</div>
                      <div className='text-sm'>Process a sale by item code</div>
                    </button>
                    <button
                      onClick={() => setActiveTab('stocks')}
                      className='w-full bg-green-600 hover:bg-green-700 text-green-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold'>View Stock</div>
                      <div className='text-sm'>Browse and sell available items</div>
                    </button>
                    <button
                      onClick={() => setReportModal(true)}
                      className='w-full bg-orange-600 hover:bg-orange-700 text-orange-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold'>Report Faulty Phone</div>
                      <div className='text-sm'>Report and track faulty devices</div>
                    </button>
                  </div>
                </div>

                {/* Recent Sales */}
                <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Recent Sales</h2>
                  <div className='space-y-3 max-h-80 overflow-y-auto'>
                    {salesTable.slice(0, 5).map((sale) => (
                      <div key={sale.id} className='bg-white/5 rounded-lg p-3 border border-white/10'>
                        <div className='flex justify-between items-start'>
                          <div>
                            <div className='font-semibold text-white'>{sale.brand} {sale.model}</div>
                            <div className='text-white/70 text-sm'>Qty: {sale.quantity}</div>
                            <div className='text-white/70 text-sm'>{sale.itemCode}</div>
                          </div>
                          <div className='text-right'>
                            <div className='text-green-400 font-semibold'>MK {sale.finalSalePrice || 0}</div>
                            <div className='text-white/50 text-xs'>
                              {sale.soldAt?.toDate().toLocaleDateString() || 'Unknown date'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {salesTable.length === 0 && (
                      <div className='text-center py-8 text-white/70'>No sales yet</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stock Overview */}
              <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
                <h2 className='text-xl font-semibold text-white mb-4'>Stock Overview - {currentLocation}</h2>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {stocksTable.slice(0, 6).map((stock) => (
                    <div key={stock.id} className='bg-white/5 rounded-lg p-4 border border-white/10'>
                      <div className='flex justify-between items-start'>
                        <div>
                          <div className='font-semibold text-white'>{stock.brand} {stock.model}</div>
                          <div className='text-white/70 text-sm'>{stock.itemCode}</div>
                          {stock.storage && <div className='text-white/70 text-sm'>Storage: {stock.storage}</div>}
                        </div>
                        <div className='text-right'>
                          <div className='text-green-400 font-semibold'>MK {stock.salePrice || 0}</div>
                          <div className='text-white/50 text-xs'>{stock.quantity} available</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSellItem(stock.id, stock, 1)}
                        disabled={!stock.quantity || stock.quantity === 0}
                        className='w-full mt-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors'
                      >
                        Sell 1 Unit
                      </button>
                    </div>
                  ))}
                  {stocksTable.length === 0 && (
                    <div className="col-span-3 text-center py-8 text-white/70">
                      No stock available in your location
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Stock & Sales Tab */}
          {activeTab === 'stocks' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Available Stock - {currentLocation}</h2>
                <div className='text-white'>Total Value: MK {calculateTotalStockValue().toLocaleString()}</div>
              </div>

              {/* Search and Filter */}
              <div className='flex flex-col md:flex-row gap-4 mb-6'>
                <input
                  type='text'
                  placeholder='Search by item code, brand, or model...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                />
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className='bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                >
                  <option value=''>All Brands</option>
                  {getUniqueBrands().map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setSearchTerm(''); setFilterBrand(''); }}
                  className='bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors'
                >
                  Clear
                </button>
              </div>

              {/* Stocks Table */}
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Item Code</th>
                      <th className='text-left py-2'>Brand & Model</th>
                      <th className='text-left py-2'>Sale Price</th>
                      <th className='text-left py-2'>Discount</th>
                      <th className='text-left py-2'>Available</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredStocks().map((stock, index) => (
                      <tr key={generateSafeKey('stock', index, stock.id)} className='border-b border-white/10'>
                        <td className='py-2 font-mono'>{stock.itemCode}</td>
                        <td className='py-2'>
                          <div className='font-semibold'>{stock.brand} {stock.model}</div>
                          {stock.storage && <div className='text-white/70 text-sm'>Storage: {stock.storage}</div>}
                          {stock.color && <div className='text-white/70 text-sm'>Color: {stock.color}</div>}
                        </td>
                        <td className='py-2'>
                          <div className='text-green-400'>MK {stock.salePrice || 0}</div>
                          {stock.discountPercentage > 0 && (
                            <div className='text-orange-400 text-sm'>
                              After discount: MK {(stock.salePrice * (1 - (stock.discountPercentage || 0) / 100)).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className='py-2'>
                          {stock.discountPercentage > 0 ? (
                            <span className='text-orange-400'>{stock.discountPercentage}% OFF</span>
                          ) : (
                            <span className='text-white/50'>No discount</span>
                          )}
                        </td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${getStockStatusBadge(stock.quantity)}`}>
                            {stock.quantity || 0} units
                          </span>
                        </td>
                        <td className='py-2 space-x-2'>
                          <button
                            onClick={() => handleSellItem(stock.id, stock, 1)}
                            disabled={!stock.quantity || stock.quantity === 0}
                            className='bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors'
                          >
                            Sell 1
                          </button>
                          {stock.quantity > 1 && (
                            <button
                              onClick={() => {
                                const quantity = prompt(`Enter quantity to sell (Available: ${stock.quantity}):`, '1');
                                if (quantity && !isNaN(quantity) && parseInt(quantity) > 0 && Number.isInteger(Number(quantity))) {
                                  handleSellItem(stock.id, stock, parseInt(quantity));
                                } else {
                                  alert('Please enter a valid whole number quantity.');
                                }
                              }}
                              className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            >
                              Sell Multiple
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {getFilteredStocks().length === 0 && (
                      <tr>
                        <td colSpan='6' className='text-center py-8 text-white/70'>
                          No stock items found matching your search criteria.
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
              <h2 className='text-xl font-semibold text-white mb-6'>Quick Sale - {currentLocation}</h2>
              <p className="text-white/70 mb-6">All fields are required and will be validated before processing.</p>
              
              <div className='max-w-md mx-auto space-y-6'>
                {/* Quick Sale Form */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Process Sale</h3>
                  <div className='space-y-4'>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>Item Code *</label>
                      <input
                        type='text'
                        placeholder='Enter item code...'
                        value={quickSale.itemCode}
                        onChange={(e) => setQuickSale({...quickSale, itemCode: e.target.value})}
                        className={`w-full bg-white/10 border ${quickSaleErrors.itemCode ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      />
                      {quickSaleErrors.itemCode && (
                        <p className="text-red-400 text-sm mt-1">{quickSaleErrors.itemCode}</p>
                      )}
                    </div>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>Quantity *</label>
                      <input
                        type='number'
                        min='1'
                        value={quickSale.quantity}
                        onChange={(e) => setQuickSale({...quickSale, quantity: parseInt(e.target.value) || 1})}
                        className={`w-full bg-white/10 border ${quickSaleErrors.quantity ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                      />
                      {quickSaleErrors.quantity && (
                        <p className="text-red-400 text-sm mt-1">{quickSaleErrors.quantity}</p>
                      )}
                    </div>
                    <div>
                      <label className='block text-white/70 text-sm mb-2'>
                        Custom Price (Optional)
                        <span className='text-white/50 text-xs ml-1'>- Enter to override standard price</span>
                      </label>
                      <input
                        type='number'
                        min='0'
                        step='0.01'
                        placeholder='Enter custom price...'
                        value={quickSale.customPrice}
                        onChange={(e) => setQuickSale({...quickSale, customPrice: e.target.value})}
                        className={`w-full bg-white/10 border ${quickSaleErrors.customPrice ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white placeholder-white/50`}
                      />
                      {quickSaleErrors.customPrice && (
                        <p className="text-red-400 text-sm mt-1">{quickSaleErrors.customPrice}</p>
                      )}
                    </div>
                    
                    {quickSaleErrors.submission && (
                      <div className="p-3 bg-red-500/20 border border-red-500/50 rounded">
                        <p className="text-red-300 text-sm">{quickSaleErrors.submission}</p>
                      </div>
                    )}
                    
                    <button
                      onClick={handleQuickSale}
                      disabled={isQuickSaleValidating || !quickSale.itemCode}
                      className='w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-6 py-3 rounded-lg transition-colors font-semibold'
                    >
                      {isQuickSaleValidating ? 'Validating...' : 'Process Sale'}
                    </button>
                  </div>
                </div>

                {/* Recent Items */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Available Items in {currentLocation}</h3>
                  <div className='space-y-2'>
                    {stocksTable.slice(0, 5).map((stock, index) => (
                      <div 
                        key={generateSafeKey('recent-stock', index, stock.id)}
                        className='flex justify-between items-center p-2 hover:bg-white/5 rounded cursor-pointer'
                        onClick={() => setQuickSale(prev => ({...prev, itemCode: stock.itemCode}))}
                      >
                        <div>
                          <div className='text-white font-mono text-sm'>{stock.itemCode}</div>
                          <div className='text-white/70 text-xs'>{stock.brand} {stock.model}</div>
                          <div className='text-white/50 text-xs'>{stock.quantity} available</div>
                        </div>
                        <div className='text-right'>
                          <div className='text-green-400 text-sm'>MK {stock.salePrice || 0}</div>
                          {stock.discountPercentage > 0 && (
                            <div className='text-orange-400 text-xs'>
                              Save {stock.discountPercentage}%
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {stocksTable.length === 0 && (
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
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>My Sales History</h2>
                <div className='flex gap-2'>
                  <button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className='bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2'
                  >
                    {isGeneratingReport ? 'Generating...' : 'Generate Report'}
                  </button>
                </div>
              </div>

              {/* Report Filters */}
              <div className='bg-white/5 rounded-lg p-4 mb-6 border border-white/10'>
                <h3 className='text-white font-semibold mb-3'>Report Filters</h3>
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <div>
                    <label className='block text-white/70 text-sm mb-2'>Start Date</label>
                    <input
                      type='date'
                      value={reportFilters.startDate}
                      onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                      className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    />
                  </div>
                  <div>
                    <label className='block text-white/70 text-sm mb-2'>End Date</label>
                    <input
                      type='date'
                      value={reportFilters.endDate}
                      onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                      className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    />
                  </div>
                  <div>
                    <label className='block text-white/70 text-sm mb-2'>Location</label>
                    <select
                      value={reportFilters.location}
                      onChange={(e) => setReportFilters({...reportFilters, location: e.target.value})}
                      className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    >
                      <option value='all'>All Locations</option>
                      {LOCATIONS.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Search and Filter */}
              <div className='flex flex-col md:flex-row gap-4 mb-6'>
                <input
                  type='text'
                  placeholder='Search by item code, brand, model, or customer...'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className='flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                />
                <select
                  value={filterSaleType}
                  onChange={(e) => setFilterSaleType(e.target.value)}
                  className='bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                >
                  <option value=''>All Sale Types</option>
                  <option value='standard'>Standard</option>
                  <option value='custom_price'>Custom Price</option>
                  <option value='installment'>Installment</option>
                </select>
                <button
                  onClick={() => { setSearchTerm(''); setFilterSaleType(''); }}
                  className='bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors'
                >
                  Clear
                </button>
              </div>
              
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Date</th>
                      <th className='text-left py-2'>Item</th>
                      <th className='text-left py-2'>Quantity</th>
                      <th className='text-left py-2'>Price</th>
                      <th className='text-left py-2'>Type</th>
                      <th className='text-left py-2'>Payment</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredSales().map((sale, index) => (
                      <tr key={generateSafeKey('sale', index, sale.id)} className='border-b border-white/10'>
                        <td className='py-2'>
                          {sale.soldAt?.toDate().toLocaleDateString() || 'Unknown date'}
                        </td>
                        <td className='py-2'>
                          <div className='font-semibold'>{sale.brand} {sale.model}</div>
                          <div className='text-white/70 text-sm'>{sale.itemCode}</div>
                        </td>
                        <td className='py-2'>{sale.quantity}</td>
                        <td className='py-2 text-green-400'>MK {sale.finalSalePrice || 0}</td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            sale.saleType === 'custom_price' 
                              ? 'bg-purple-500/20 text-purple-300' 
                              : sale.saleType === 'installment'
                              ? 'bg-orange-500/20 text-orange-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {sale.saleType === 'custom_price' ? 'Custom Price' : 
                             sale.saleType === 'installment' ? 'Installment' : 'Standard'}
                          </span>
                        </td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            sale.paymentType === 'installment' 
                              ? 'bg-orange-500/20 text-orange-300' 
                              : 'bg-green-500/20 text-green-300'
                          }`}>
                            {sale.paymentType === 'installment' ? 'Installment' : 'Full Payment'}
                          </span>
                        </td>
                        <td className='py-2 space-x-2'>
                          <button
                            onClick={() => generateSalesPDFReport(sale)}
                            className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            title='Generate PDF Receipt'
                          >
                            Receipt
                          </button>
                          {(!sale.paymentType || sale.paymentType === 'full') && (
                            <button
                              onClick={() => openInstallmentModal(sale)}
                              className='bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            >
                              Installment
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {getFilteredSales().length === 0 && (
                      <tr>
                        <td colSpan='7' className='text-center py-8 text-white/70'>
                          No sales history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Transfer Tab */}
          {activeTab === 'stockTransfer' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Stock Transfer Requests</h2>
                <button
                  onClick={() => setStockRequestModal(true)}
                  className='bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors'
                >
                  + New Transfer Request
                </button>
              </div>

              {/* Stock Requests Table */}
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Date</th>
                      <th className='text-left py-2'>Item Code</th>
                      <th className='text-left py-2'>Item Details</th>
                      <th className='text-left py-2'>Quantity</th>
                      <th className='text-left py-2'>From</th>
                      <th className='text-left py-2'>To</th>
                      <th className='text-left py-2'>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockRequests.map((request, index) => (
                      <tr key={generateSafeKey('request', index, request.id)} className='border-b border-white/10'>
                        <td className='py-2'>
                          {request.requestedAt?.toDate().toLocaleDateString() || 'N/A'}
                        </td>
                        <td className='py-2 font-mono'>{request.itemCode}</td>
                        <td className='py-2'>
                          <div className='font-semibold'>{request.brand} {request.model}</div>
                        </td>
                        <td className='py-2'>{request.quantity}</td>
                        <td className='py-2'>{request.fromLocation}</td>
                        <td className='py-2'>{request.toLocation}</td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            request.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                            request.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                            'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {request.status || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {stockRequests.length === 0 && (
                      <tr>
                        <td colSpan='7' className='text-center py-8 text-white/70'>
                          No stock transfer requests found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stock Request Modal */}
          {stockRequestModal && (
            <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4'>
              <div className='bg-white/10 backdrop-blur-lg rounded-lg border border-white/20 p-6 max-w-md w-full'>
                <h3 className='text-xl font-semibold text-white mb-4'>Create Stock Transfer Request</h3>
                
                <div className='space-y-4'>
                  <div>
                    <label className='block text-white/70 text-sm mb-2'>Item Code *</label>
                    <input
                      type='text'
                      value={stockRequestForm.itemCode}
                      onChange={(e) => setStockRequestForm({...stockRequestForm, itemCode: e.target.value})}
                      placeholder='Enter item code...'
                      className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                    />
                  </div>
                  
                  <div>
                    <label className='block text-white/70 text-sm mb-2'>Quantity *</label>
                    <input
                      type='number'
                      min='1'
                      value={stockRequestForm.quantity}
                      onChange={(e) => setStockRequestForm({...stockRequestForm, quantity: e.target.value})}
                      placeholder='Enter quantity...'
                      className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50'
                    />
                  </div>
                  
                  <div>
                    <label className='block text-white/70 text-sm mb-2'>To Location *</label>
                    <select
                      value={stockRequestForm.toLocation}
                      onChange={(e) => setStockRequestForm({...stockRequestForm, toLocation: e.target.value})}
                      className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    >
                      <option value=''>Select location...</option>
                      {LOCATIONS.filter(loc => loc !== currentLocation).map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className='flex justify-end space-x-3 mt-6'>
                  <button
                    onClick={() => {
                      setStockRequestModal(false);
                      setStockRequestForm({ itemCode: '', quantity: '', toLocation: '' });
                    }}
                    className='px-4 py-2 text-white/70 hover:text-white'
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateStockRequest}
                    className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors'
                  >
                    Create Request
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Faulty Phones Tab */}
          {activeTab === 'faultyPhones' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Faulty Phones - {currentLocation}</h2>
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
              <div className='flex flex-col md:flex-row gap-4 mb-6'>
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

              {/* Faulty Phones Table */}
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Item Code</th>
                      <th className='text-left py-2'>Brand & Model</th>
                      <th className='text-left py-2'>Fault Description</th>
                      <th className='text-left py-2'>Status</th>
                      <th className='text-left py-2'>Cost</th>
                      <th className='text-left py-2'>Reported Date</th>
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
                        <td className='py-2'>{faulty.faultDescription}</td>
                        <td className='py-2'>
                          <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadgeColor(faulty.status)}`}>
                            {faulty.status}
                          </span>
                        </td>
                        <td className='py-2'>
                          <div className='text-orange-400'>MK {faulty.reportedCost?.toLocaleString() || 0}</div>
                          {faulty.estimatedRepairCost > 0 && (
                            <div className='text-white/70 text-sm'>Est. Repair: MK {faulty.estimatedRepairCost}</div>
                          )}
                        </td>
                        <td className='py-2'>
                          {faulty.reportedAt?.toDate().toLocaleDateString() || 'Unknown'}
                        </td>
                        <td className='py-2 space-x-2'>
                          <button
                            onClick={() => generateFaultyPhonePDFReport(faulty)}
                            className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            title='Generate PDF Report'
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => {
                              setSelectedFaulty(faulty);
                              setEditModal(true);
                            }}
                            className='bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            title='Update Status'
                          >
                            Update
                          </button>
                          <button
                            onClick={() => handleDeleteFaulty(faulty.id)}
                            className='bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors'
                            title='Delete Record'
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {getFilteredFaultyPhones().length === 0 && (
                      <tr>
                        <td colSpan='7' className='text-center py-8 text-white/70'>
                          No faulty phones found matching your search criteria.
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
              <h2 className='text-xl font-semibold text-white mb-6'>My Installment Plans</h2>
              
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {installmentsTable.map((installment, index) => (
                  <div key={generateSafeKey('installment', index, installment.id)} className='bg-white/5 rounded-lg p-4 border border-white/10'>
                    <div className='flex justify-between items-start mb-3'>
                      <div>
                        <div className='font-semibold text-white'>{installment.customerName}</div>
                        <div className='text-white/70 text-sm'>Phone: {installment.phoneNumber}</div>
                      </div>
                      <div className='text-green-400 font-semibold'>MK {installment.totalAmount}</div>
                    </div>
                    <div className='space-y-2 mb-3'>
                      <div className='text-white/70 text-sm'>
                        Down Payment: MK {installment.downPayment}
                      </div>
                      <div className='text-white/70 text-sm'>
                        Monthly: MK {installment.monthlyPayment} for {installment.installmentPlan} months
                      </div>
                      <div className='text-white/70 text-sm'>
                        Next Payment: {installment.nextPaymentDate}
                      </div>
                      <div className='text-white/70 text-sm'>
                        Status: <span className={`px-2 py-1 rounded-full text-xs ${
                          installment.status === 'active' ? 'bg-green-500/20 text-green-300' :
                          installment.status === 'overdue' ? 'bg-red-500/20 text-red-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {installment.status}
                        </span>
                      </div>
                    </div>
                    <div className='text-white/50 text-xs'>
                      Created: {installment.createdAt?.toDate().toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {installmentsTable.length === 0 && (
                  <div className='col-span-3 text-center py-8 text-white/70'>
                    No installment plans created yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* My Repairs Tab */}
          {activeTab === 'myRepairs' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>My Repairs - {currentLocation}</h2>
              
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Item Code</th>
                      <th className='text-left py-2'>Brand & Model</th>
                      <th className='text-left py-2'>Repair Cost</th>
                      <th className='text-left py-2'>Spares Used</th>
                      <th className='text-left py-2'>Repaired Date</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repairsTable.map((repair, index) => (
                      <tr key={generateSafeKey('repair', index, repair.id)} className='border-b border-white/10 hover:bg-white/5'>
                        <td className='py-2 font-mono'>{repair.itemCode}</td>
                        <td className='py-2'>
                          <div className='font-semibold'>{repair.brand} {repair.model}</div>
                        </td>
                        <td className='py-2'>
                          <div className='text-green-400'>MK {repair.repairCost?.toLocaleString() || 0}</div>
                        </td>
                        <td className='py-2'>
                          {repair.sparesUsed?.join(', ') || 'None'}
                        </td>
                        <td className='py-2'>
                          {repair.repairedAt?.toDate().toLocaleDateString() || 'Unknown'}
                        </td>
                        <td className='py-2'>
                          <button
                            onClick={() => {
                              const repairReport = {
                                ...repair,
                                status: 'Fixed',
                                reportedAt: repair.repairedAt,
                                reportedByName: repair.repairedByName
                              };
                              generateFaultyPhonePDFReport(repairReport);
                            }}
                            className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                    {repairsTable.length === 0 && (
                      <tr>
                        <td colSpan='6' className='text-center py-8 text-white/70'>
                          No repair records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                <h2 className='text-xl font-semibold text-white'>Report Faulty Phone - {currentLocation}</h2>
                <button
                  onClick={() => setReportModal(false)}
                  className='text-white/70 hover:text-white'
                >
                  ✕
                </button>
              </div>
              
              <p className="text-white/70 mb-4">Fields marked with * are required.</p>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-white/70 text-sm mb-2'>Item Code *</label>
                  <input
                    type='text'
                    value={faultyReport.itemCode}
                    onChange={(e) => setFaultyReport({...faultyReport, itemCode: e.target.value})}
                    className={`w-full bg-white/10 border ${faultyReportErrors.itemCode ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='Enter item code'
                  />
                  {faultyReportErrors.itemCode && (
                    <p className="text-red-400 text-sm mt-1">{faultyReportErrors.itemCode}</p>
                  )}
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

                <div className='md:col-span-2'>
                  <label className='block text-white/70 text-sm mb-2'>Fault Description *</label>
                  <textarea
                    value={faultyReport.faultDescription}
                    onChange={(e) => setFaultyReport({...faultyReport, faultDescription: e.target.value})}
                    className={`w-full bg-white/10 border ${faultyReportErrors.faultDescription ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white h-24`}
                    placeholder='Describe the fault in detail...'
                  />
                  {faultyReportErrors.faultDescription && (
                    <p className="text-red-400 text-sm mt-1">{faultyReportErrors.faultDescription}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Reported Cost (MWK)</label>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={faultyReport.reportedCost}
                    onChange={(e) => setFaultyReport({...faultyReport, reportedCost: e.target.value})}
                    className={`w-full bg-white/10 border ${faultyReportErrors.reportedCost ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='0'
                  />
                  {faultyReportErrors.reportedCost && (
                    <p className="text-red-400 text-sm mt-1">{faultyReportErrors.reportedCost}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Estimated Repair Cost (MWK)</label>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={faultyReport.estimatedRepairCost}
                    onChange={(e) => setFaultyReport({...faultyReport, estimatedRepairCost: e.target.value})}
                    className={`w-full bg-white/10 border ${faultyReportErrors.estimatedRepairCost ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='0'
                  />
                  {faultyReportErrors.estimatedRepairCost && (
                    <p className="text-red-400 text-sm mt-1">{faultyReportErrors.estimatedRepairCost}</p>
                  )}
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

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Customer Name (Optional)</label>
                  <input
                    type='text'
                    value={faultyReport.customerName}
                    onChange={(e) => setFaultyReport({...faultyReport, customerName: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter customer name'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Customer Phone (Optional)</label>
                  <input
                    type='tel'
                    value={faultyReport.customerPhone}
                    onChange={(e) => setFaultyReport({...faultyReport, customerPhone: e.target.value})}
                    className={`w-full bg-white/10 border ${faultyReportErrors.customerPhone ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='e.g., 0881234567'
                  />
                  {faultyReportErrors.customerPhone && (
                    <p className="text-red-400 text-sm mt-1">{faultyReportErrors.customerPhone}</p>
                  )}
                </div>

                <div className='md:col-span-2'>
                  <label className='block text-white/70 text-sm mb-2'>Spares Needed</label>
                  <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
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
                  <label className='block text-white/70 text-sm mb-2'>Notes (Optional)</label>
                  <textarea
                    value={faultyReport.notes}
                    onChange={(e) => setFaultyReport({...faultyReport, notes: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white h-20'
                    placeholder='Additional notes...'
                  />
                </div>
              </div>

              {faultyReportErrors.submission && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded">
                  <p className="text-red-300 text-sm">{faultyReportErrors.submission}</p>
                </div>
              )}

              <div className='flex justify-end space-x-3 mt-6'>
                <button
                  onClick={() => setReportModal(false)}
                  className='px-4 py-2 text-white/70 hover:text-white'
                >
                  Cancel
                </button>
                <button
                  onClick={handleReportFaulty}
                  disabled={isFaultyValidating}
                  className='bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 text-white px-6 py-2 rounded-lg transition-colors'
                >
                  {isFaultyValidating ? 'Validating...' : 'Report Faulty'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Faulty Status Modal */}
      {editModal && selectedFaulty && (
        <div className='fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4'>
          <div className='bg-slate-800 rounded-lg max-w-md w-full'>
            <div className='p-6'>
              <div className='flex justify-between items-center mb-6'>
                <h2 className='text-xl font-semibold text-white'>Update Faulty Phone Status</h2>
                <button
                  onClick={() => {
                    setEditModal(false);
                    setSelectedFaulty(null);
                  }}
                  className='text-white/70 hover:text-white'
                >
                  ✕
                </button>
              </div>

              <div className='space-y-4'>
                <div>
                  <label className='block text-white/70 text-sm mb-2'>Status *</label>
                  <select
                    value={selectedFaulty.status}
                    onChange={(e) => setSelectedFaulty({...selectedFaulty, status: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                  >
                    {FAULTY_STATUS.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Actual Repair Cost (MWK)</label>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={selectedFaulty.actualRepairCost || ''}
                    onChange={(e) => setSelectedFaulty({...selectedFaulty, actualRepairCost: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter actual repair cost'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Spares Used</label>
                  <div className='grid grid-cols-2 gap-2'>
                    {SPARES_OPTIONS.map(spare => (
                      <label key={spare} className='flex items-center'>
                        <input
                          type='checkbox'
                          checked={selectedFaulty.sparesUsed?.includes(spare) || false}
                          onChange={(e) => {
                            const sparesUsed = selectedFaulty.sparesUsed || [];
                            if (e.target.checked) {
                              setSelectedFaulty({
                                ...selectedFaulty,
                                sparesUsed: [...sparesUsed, spare]
                              });
                            } else {
                              setSelectedFaulty({
                                ...selectedFaulty,
                                sparesUsed: sparesUsed.filter(s => s !== spare)
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

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Notes</label>
                  <textarea
                    value={selectedFaulty.updateNotes || ''}
                    onChange={(e) => setSelectedFaulty({...selectedFaulty, updateNotes: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white h-24'
                    placeholder='Update notes...'
                  />
                </div>
              </div>

              <div className='flex justify-end space-x-3 mt-6'>
                <button
                  onClick={() => {
                    setEditModal(false);
                    setSelectedFaulty(null);
                  }}
                  className='px-4 py-2 text-white/70 hover:text-white'
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateFaultyStatus(selectedFaulty.id, {
                    status: selectedFaulty.status,
                    repairCost: selectedFaulty.actualRepairCost,
                    sparesUsed: selectedFaulty.sparesUsed,
                    updateNotes: selectedFaulty.updateNotes
                  })}
                  className='bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors'
                >
                  Update Status
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
                    className={`w-full bg-white/10 border ${installmentErrors.customerName ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='Enter customer name'
                  />
                  {installmentErrors.customerName && (
                    <p className="text-red-400 text-sm mt-1">{installmentErrors.customerName}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Phone Number (Optional)</label>
                  <input
                    type='tel'
                    value={installmentData.phoneNumber}
                    onChange={(e) => setInstallmentData({...installmentData, phoneNumber: e.target.value})}
                    className={`w-full bg-white/10 border ${installmentErrors.phoneNumber ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='e.g., 0881234567'
                  />
                  {installmentErrors.phoneNumber && (
                    <p className="text-red-400 text-sm mt-1">{installmentErrors.phoneNumber}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Total Amount (MWK) *</label>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={installmentData.totalAmount}
                    onChange={(e) => setInstallmentData({...installmentData, totalAmount: e.target.value})}
                    className={`w-full bg-white/10 border ${installmentErrors.totalAmount ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    readOnly
                  />
                  {installmentErrors.totalAmount && (
                    <p className="text-red-400 text-sm mt-1">{installmentErrors.totalAmount}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Down Payment (MWK)</label>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={installmentData.downPayment}
                    onChange={(e) => {
                      const downPayment = parseFloat(e.target.value) || 0;
                      setInstallmentData({
                        ...installmentData,
                        downPayment: downPayment,
                        remainingAmount: installmentData.totalAmount - downPayment,
                        monthlyPayment: (installmentData.totalAmount - downPayment) / parseInt(installmentData.installmentPlan)
                      });
                    }}
                    className={`w-full bg-white/10 border ${installmentErrors.downPayment ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                    placeholder='Enter down payment'
                  />
                  {installmentErrors.downPayment && (
                    <p className="text-red-400 text-sm mt-1">{installmentErrors.downPayment}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Installment Plan (Months) *</label>
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
                    className={`w-full bg-white/10 border ${installmentErrors.installmentPlan ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                  >
                    <option value='1'>1 Month</option>
                    <option value='2'>2 Months</option>
                    <option value='3'>3 Months</option>
                    <option value='4'>4 Months</option>
                    <option value='5'>5 Months</option>
                    <option value='6'>6 Months</option>
                  </select>
                  {installmentErrors.installmentPlan && (
                    <p className="text-red-400 text-sm mt-1">{installmentErrors.installmentPlan}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Monthly Payment (MWK) *</label>
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={installmentData.monthlyPayment.toFixed(2)}
                    onChange={(e) => setInstallmentData({...installmentData, monthlyPayment: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    readOnly
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Next Payment Date *</label>
                  <input
                    type='date'
                    value={installmentData.nextPaymentDate}
                    onChange={(e) => setInstallmentData({...installmentData, nextPaymentDate: e.target.value})}
                    className={`w-full bg-white/10 border ${installmentErrors.nextPaymentDate ? 'border-red-500' : 'border-white/20'} rounded-lg px-3 py-2 text-white`}
                  />
                  {installmentErrors.nextPaymentDate && (
                    <p className="text-red-400 text-sm mt-1">{installmentErrors.nextPaymentDate}</p>
                  )}
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Notes (Optional)</label>
                  <textarea
                    value={installmentData.notes}
                    onChange={(e) => setInstallmentData({...installmentData, notes: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white h-20'
                    placeholder='Additional notes...'
                  />
                </div>
              </div>

              {installmentErrors.submission && (
                <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded">
                  <p className="text-red-300 text-sm">{installmentErrors.submission}</p>
                </div>
              )}

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
                  disabled={isInstallmentValidating}
                  className='bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white px-6 py-2 rounded-lg transition-colors'
                >
                  {isInstallmentValidating ? 'Validating...' : 'Create Installment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full fixed bottom-0 left-0 z-10 border-t bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-200 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
        </div>
      </footer>
    </div>
  );
}