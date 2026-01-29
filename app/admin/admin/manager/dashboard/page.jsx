'use client'
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot,
  writeBatch, getDoc, Timestamp, deleteDoc,
  runTransaction, increment
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

// React Icons (same as before)
import {
  FiHome,
  FiBarChart2,
  FiPackage,
  FiDollarSign,
  FiTruck,
  FiUsers,
  FiClipboard,
  FiSettings,
  FiLogOut,
  FiMenu,
  FiX,
  FiDownload,
  FiCheck,
  FiXCircle,
  FiAlertCircle,
  FiFileText,
  FiShoppingCart,
  FiMapPin,
  FiCalendar,
  FiFilter,
  FiTrash2,
  FiPlus,
  FiMinus,
  FiRefreshCw,
  FiCheckSquare,
  FiClock,
  FiActivity,
  FiShoppingBag,
  FiBell,
  FiSearch,
  FiSave,
  FiPrinter,
  FiShield,
  FiAlertTriangle,
  FiTool,
  FiUser,
  FiCreditCard,
  FiTrendingUp,
  FiBox,
  FiPhone,
  FiEdit2,
  FiEye,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
  FiChevronUp,
  FiArrowRight,
  FiArrowLeft,
  FiGrid,
  FiList,
  FiLayers,
  FiDatabase,
  FiServer,
  FiMonitor,
  FiSmartphone,
  FiTablet,
  FiAward,
  FiGift,
  FiTarget,
  FiFlag,
  FiMessageSquare,
  FiUserCheck
} from 'react-icons/fi';

// shadcn/ui components (same as before)
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

// Available locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'TV', 'Audio', 'Other'];

// Navigation items
const navItems = [
  { id: 'dashboard', name: 'Dashboard', icon: <FiHome className="w-5 h-5" /> },
  { id: 'myStocks', name: 'My Stocks', icon: <FiPackage className="w-5 h-5" /> },
  { id: 'quickSale', name: 'Quick Sale', icon: <FiShoppingCart className="w-5 h-5" /> },
  { id: 'salesHistory', name: 'Sales History', icon: <FiDollarSign className="w-5 h-5" /> },
  { id: 'faultyPhones', name: 'Faulty Phones', icon: <FiPhone className="w-5 h-5" /> },
  { id: 'installments', name: 'Installments', icon: <FiCreditCard className="w-5 h-5" /> },
  { id: 'transfer', name: 'Stock Transfer', icon: <FiTruck className="w-5 h-5" /> },
  { id: 'salesAnalysis', name: 'Sales Analysis', icon: <FiBarChart2 className="w-5 h-5" /> },
  { id: 'requests', name: 'Stock Requests', icon: <FiClipboard className="w-5 h-5" />, count: true },
];

export default function ManagerDashboard() {
  const [user, setUser] = useState(null);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const router = useRouter();

  // State Management (same as before)
  const [stocks, setStocks] = useState([]);
  const [sales, setSales] = useState([]);
  const [faultyPhones, setFaultyPhones] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [stockRequests, setStockRequests] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [salesAnalysis, setSalesAnalysis] = useState({
    todaySales: 0,
    todayRevenue: 0,
    monthlyRevenue: 0,
    topProducts: [],
    salesByUser: {},
    revenueByCategory: {}
  });

  // Quick Sale State
  const [quickSale, setQuickSale] = useState({
    itemCode: '',
    quantity: 1,
    customPrice: '',
    customerName: '',
    customerPhone: ''
  });

  // Faulty Phone State
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

  // Transfer State
  const [transferStock, setTransferStock] = useState({
    itemCode: '',
    quantity: '',
    fromLocation: '',
    toLocation: ''
  });

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Modals
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  // Format currency (same as before)
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  // Check if mobile (same as before)
  useEffect(() => {
    const checkIfMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Prevent body scrolling (same as before)
  useEffect(() => {
    if (isMobile && isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isMobile, isSidebarOpen]);

  // Clear messages (same as before)
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Authentication (same as before)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userQuery = query(
            collection(db, 'users'),
            where('uid', '==', authUser.uid)
          );
          const querySnapshot = await getDocs(userQuery);
          
          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            if (userData.role === 'manager') {
              setUser(userData);
              setLocation(userData.location);
              await initializeDashboard(userData);
            } else {
              router.push('/dashboard');
            }
          } else {
            router.push('/login');
          }
        } catch (error) {
          setError('Auth error:', error);
          setError('Authentication error');
          router.push('/login');
        }
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Initialize Dashboard - UPDATED to handle index errors gracefully
  const initializeDashboard = async (userData) => {
    try {
      setLoading(true);
      await Promise.all([
        fetchLocationStocks(userData.location),
        fetchLocationSales(userData.location),
        fetchFaultyPhones(userData.location),
        fetchInstallments(userData.location),
        fetchStockRequests(userData.location),
        fetchPersonnel(userData.location)
      ]);
      calculateSalesAnalysisData();
    } catch (error) {
      setError('Dashboard init error:', error);
      
      // Check if error is about missing indexes
      if (error.code === 'failed-precondition' && error.message.includes('requires an index')) {
        setError('Please create Firestore indexes. Check console for links.');
      } else {
        setError('Failed to initialize dashboard: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Data Fetching Functions - UPDATED with better error handling
  const fetchLocationStocks = async (location) => {
    try {
      const q = query(
        collection(db, 'stocks'),
        where('location', '==', location)
      );
      const querySnapshot = await getDocs(q);
      const stocksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
    } catch (error) {
      setError('Fetch stocks error:', error);
      if (error.code === 'failed-precondition') {
        setError('Please create stocks index in Firestore.');
      } else {
        setError('Failed to fetch stocks');
      }
    }
  };

  const fetchLocationSales = async (location) => {
    try {
      const q = query(
        collection(db, 'sales'),
        where('location', '==', location),
        orderBy('soldAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const salesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
    } catch (error) {
      setError('Fetch sales error:', error);
      if (error.code === 'failed-precondition') {
        setError('Please create sales index in Firestore.');
      } else {
        setError('Failed to fetch sales');
      }
    }
  };

  // FIXED: Faulty phones with proper error handling
  const fetchFaultyPhones = async (location) => {
    try {
      // First try without orderBy to avoid index error
      const q = query(
        collection(db, 'faultyPhones'),
        where('location', '==', location)
      );
      const querySnapshot = await getDocs(q);
      const faultyData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort manually if needed
      faultyData.sort((a, b) => {
        const dateA = a.reportedAt?.toDate() || new Date(0);
        const dateB = b.reportedAt?.toDate() || new Date(0);
        return dateB - dateA; // Descending
      });
      
      setFaultyPhones(faultyData);
    } catch (error) {
      setError('Fetch faulty phones error:', error);
      if (error.code === 'failed-precondition') {
        setError('Faulty phones index required. Please create index for location and reportedAt.');
        // Set empty array to avoid breaking the UI
        setFaultyPhones([]);
      } else {
        setError('Failed to fetch faulty phones');
      }
    }
  };

  // FIXED: Installments with proper error handling
  const fetchInstallments = async (location) => {
    try {
      // First try without orderBy to avoid index error
      const q = query(
        collection(db, 'installments'),
        where('location', '==', location)
      );
      const querySnapshot = await getDocs(q);
      const installmentData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort manually if needed
      installmentData.sort((a, b) => {
        const dateA = a.createdAt?.toDate() || new Date(0);
        const dateB = b.createdAt?.toDate() || new Date(0);
        return dateB - dateA; // Descending
      });
      
      setInstallments(installmentData);
    } catch (error) {
      setError('Fetch installments error:', error);
      if (error.code === 'failed-precondition') {
        setError('Installments index required. Please create index for location and createdAt.');
        // Set empty array to avoid breaking the UI
        setInstallments([]);
      } else {
        setError('Failed to fetch installments');
      }
    }
  };

  // FIXED: Stock requests with proper error handling
  const fetchStockRequests = async (location) => {
    try {
      // Simplified query to avoid index error
      const q = query(
        collection(db, 'stockRequests'),
        where('toLocation', '==', location)
      );
      const querySnapshot = await getDocs(q);
      const requestsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filter and sort manually
      const filteredRequests = requestsData
        .filter(request => request.status === 'pending')
        .sort((a, b) => {
          const dateA = a.requestedAt?.toDate() || new Date(0);
          const dateB = b.requestedAt?.toDate() || new Date(0);
          return dateB - dateA; // Descending
        });
      
      setStockRequests(filteredRequests);
    } catch (error) {
      setError('Fetch stock requests error:', error);
      if (error.code === 'failed-precondition') {
        setError('Stock requests index required. Please create composite index.');
        // Set empty array to avoid breaking the UI
        setStockRequests([]);
      } else {
        setError('Failed to fetch stock requests');
      }
    }
  };

  const fetchPersonnel = async (location) => {
    try {
      const q = query(
        collection(db, 'users'),
        where('location', '==', location),
        where('role', 'in', ['sales', 'dataEntry', 'user'])
      );
      const querySnapshot = await getDocs(q);
      const personnelData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPersonnel(personnelData);
    } catch (error) {
      setError('Failed to fetch personnel');
    }
  };

  // Real-time Listeners - UPDATED with better error handling
  const setupRealtimeListeners = useCallback((location) => {
    const cleanupFunctions = [];

    try {
      // Stocks listener
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
          setStocks(stocksData);
        }, 
        (error) => {
          setError('Failed to listen to stock updates');
        }
      );
      cleanupFunctions.push(unsubscribeStocks);

      // Sales listener
      const salesQuery = query(
        collection(db, 'sales'),
        where('location', '==', location)
        // Removed orderBy to avoid index error in listener
      );

      const unsubscribeSales = onSnapshot(salesQuery, 
        (snapshot) => {
          const salesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Sort manually
          salesData.sort((a, b) => {
            const dateA = a.soldAt?.toDate() || new Date(0);
            const dateB = b.soldAt?.toDate() || new Date(0);
            return dateB - dateA;
          });
          
          setSales(salesData);
        }, 
        (error) => {
          setError('Failed to listen to sales updates');
        }
      );
      cleanupFunctions.push(unsubscribeSales);

      // Faulty phones listener - simplified to avoid index error
      const faultyQuery = query(
        collection(db, 'faultyPhones'),
        where('location', '==', location)
      );

      const unsubscribeFaulty = onSnapshot(faultyQuery,
        (snapshot) => {
          const faultyData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Sort manually
          faultyData.sort((a, b) => {
            const dateA = a.reportedAt?.toDate() || new Date(0);
            const dateB = b.reportedAt?.toDate() || new Date(0);
            return dateB - dateA;
          });
          
          setFaultyPhones(faultyData);
        },
        (error) => {
          setError('Faulty phones listener error:', error);
          // Don't show error if it's just an index issue
          if (error.code !== 'failed-precondition') {
            setError('Failed to listen to faulty phones updates');
          }
        }
      );
      cleanupFunctions.push(unsubscribeFaulty);

    } catch (error) {
      setError('Listener setup error:', error);
    }

    return () => {
      cleanupFunctions.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          setError('Cleanup error:', error);
        }
      });
    };
  }, []);

  // Setup real-time listeners when location is set
  useEffect(() => {
    if (!location) return;

    const cleanup = setupRealtimeListeners(location);
    
    return () => {
      if (cleanup) cleanup();
    };
  }, [location, setupRealtimeListeners]);

  // Calculate sales analysis (same as before)
  const calculateSalesAnalysisData = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const todaySales = sales.filter(sale => {
      const saleDate = sale.soldAt?.toDate();
      return saleDate && saleDate >= today;
    });

    const monthlySales = sales.filter(sale => {
      const saleDate = sale.soldAt?.toDate();
      return saleDate && saleDate >= thisMonth;
    });

    // Calculate top products
    const productSales = {};
    sales.forEach(sale => {
      const productKey = `${sale.brand} ${sale.model}`;
      if (!productSales[productKey]) {
        productSales[productKey] = { count: 0, revenue: 0 };
      }
      productSales[productKey].count += 1;
      productSales[productKey].revenue += sale.finalSalePrice || 0;
    });

    const topProducts = Object.entries(productSales)
      .map(([product, data]) => ({ product, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Calculate sales by user
    const salesByUser = {};
    sales.forEach(sale => {
      const seller = sale.soldByName || 'Unknown';
      if (!salesByUser[seller]) {
        salesByUser[seller] = 0;
      }
      salesByUser[seller] += sale.finalSalePrice || 0;
    });

    // Calculate revenue by category
    const revenueByCategory = {};
    sales.forEach(sale => {
      const category = sale.category || 'Other';
      if (!revenueByCategory[category]) {
        revenueByCategory[category] = 0;
      }
      revenueByCategory[category] += sale.finalSalePrice || 0;
    });

    setSalesAnalysis({
      todaySales: todaySales.length,
      todayRevenue: todaySales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0),
      monthlyRevenue: monthlySales.reduce((sum, sale) => sum + (sale.finalSalePrice || 0), 0),
      topProducts,
      salesByUser,
      revenueByCategory
    });
  }, [sales]);

  // Update sales analysis when sales change
  useEffect(() => {
    if (sales.length > 0) {
      calculateSalesAnalysisData();
    }
  }, [sales, calculateSalesAnalysisData]);

  // Handle tab change (same as before)
  const handleTabChange = async (tabId) => {
    if (tabId === activeTab) return;
    
    setTabLoading(true);
    setActiveTab(tabId);
    
    if (tabId === 'myStocks' && stocks.length === 0) {
      await fetchLocationStocks(location);
    } else if (tabId === 'salesHistory' && sales.length === 0) {
      await fetchLocationSales(location);
    } else if (tabId === 'faultyPhones' && faultyPhones.length === 0) {
      await fetchFaultyPhones(location);
    } else if (tabId === 'installments' && installments.length === 0) {
      await fetchInstallments(location);
    } else if (tabId === 'requests' && stockRequests.length === 0) {
      await fetchStockRequests(location);
    }
    
    setTimeout(() => setTabLoading(false), 300);
  };

  // Refresh all data (same as before)
  const handleRefreshData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchLocationStocks(location),
        fetchLocationSales(location),
        fetchFaultyPhones(location),
        fetchInstallments(location),
        fetchStockRequests(location)
      ]);
      setSuccess('Data refreshed successfully');
    } catch (error) {
      setError('Refresh error:', error);
      setError('Failed to refresh data');
    } finally {
      setLoading(false);
    }
  };

  // Database Validation Functions (same as before)
  const validateStockBeforeOperation = async (itemCode, location, requiredQuantity = 1) => {
    try {
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', itemCode),
        where('location', '==', location)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        return { valid: false, error: `Item "${itemCode}" not found in ${location}` };
      }

      const stock = stockSnapshot.docs[0].data();
      
      if (stock.quantity < requiredQuantity) {
        return { 
          valid: false, 
          error: `Insufficient stock! Only ${stock.quantity} units available.`,
          available: stock.quantity 
        };
      }

      // Validate stock data integrity
      if (!stock.brand || !stock.model) {
        return { valid: false, error: 'Stock item has incomplete data' };
      }

      if (stock.quantity < 0) {
        return { valid: false, error: 'Stock quantity cannot be negative' };
      }

      return { 
        valid: true, 
        stock: stock,
        stockId: stockSnapshot.docs[0].id,
        available: stock.quantity 
      };
    } catch (error) {
      return { valid: false, error: 'Validation error: ' + error.message };
    }
  };

  const validateDatabaseConsistency = async () => {
    try {
      const validationPromises = [
        validateStockConsistency(),
        validateSalesConsistency(),
        validateFaultyPhonesConsistency()
      ];
      
      const results = await Promise.allSettled(validationPromises);
      
      const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message);
      
      if (errors.length > 0) {
        setError('Database consistency warnings:', errors);
        return { consistent: false, errors };
      }
      
      return { consistent: true, errors: [] };
    } catch (error) {
      return { consistent: false, errors: [error.message] };
    }
  };

  const validateStockConsistency = async () => {
    const stocks = await getDocs(collection(db, 'stocks'));
    const issues = [];
    
    stocks.forEach(doc => {
      const data = doc.data();
      if (data.quantity < 0) {
        issues.push(`Negative quantity for ${data.itemCode} at ${data.location}`);
      }
      if (!data.location || !LOCATIONS.includes(data.location)) {
        issues.push(`Invalid location for ${data.itemCode}: ${data.location}`);
      }
      if (!data.itemCode || data.itemCode.trim() === '') {
        issues.push(`Empty item code at ${data.location}`);
      }
    });
    
    if (issues.length > 0) {
      throw new Error(`Stock consistency issues: ${issues.join(', ')}`);
    }
  };

  const validateSalesConsistency = async () => {
    const sales = await getDocs(collection(db, 'sales'));
    const issues = [];
    
    sales.forEach(doc => {
      const data = doc.data();
      if (!data.itemCode) {
        issues.push(`Sale ${doc.id} has no item code`);
      }
      if (data.quantity <= 0) {
        issues.push(`Sale ${doc.id} has invalid quantity: ${data.quantity}`);
      }
      if (data.finalSalePrice < 0) {
        issues.push(`Sale ${doc.id} has negative price`);
      }
    });
    
    if (issues.length > 0) {
      throw new Error(`Sales consistency issues: ${issues.join(', ')}`);
    }
  };

  const validateFaultyPhonesConsistency = async () => {
    const faultyPhones = await getDocs(collection(db, 'faultyPhones'));
    const issues = [];
    
    faultyPhones.forEach(doc => {
      const data = doc.data();
      if (!data.itemCode && !data.imei) {
        issues.push(`Faulty phone ${doc.id} has no identifier`);
      }
      if (data.reportedCost < 0) {
        issues.push(`Faulty phone ${doc.id} has negative reported cost`);
      }
    });
    
    if (issues.length > 0) {
      throw new Error(`Faulty phones consistency issues: ${issues.join(', ')}`);
    }
  };

  // Execute with retry (same as before)
  const executeWithRetry = async (operation, maxRetries = 3) => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (error.code === 'failed-precondition' || error.code === 'aborted') {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
          alert(`Retrying operation (attempt ${i + 1}/${maxRetries})...`);
        } else {
          break;
        }
      }
    }
    throw lastError;
  };

// Generate Sales Receipt with QR Code
const generateSalesReceipt = async (saleData) => {
  try {
    if (!saleData || !saleData.receiptNumber) {
      throw new Error('Invalid sale data for receipt generation');
    }

    setSuccess('Generating receipt with QR code for:', saleData.receiptNumber);
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // FIX: Properly handle sale date - use current time as fallback
    const saleDate = saleData.soldAt ? 
      (saleData.soldAt.toDate ? saleData.soldAt.toDate() : new Date(saleData.soldAt)) : 
      new Date();
    
    // FIX: Format dates safely
    const formattedDate = saleDate.toLocaleDateString();
    const formattedTime = saleDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Generate QR code data
    const qrData = JSON.stringify({
      receiptNumber: saleData.receiptNumber,
      itemCode: saleData.itemCode,
      brand: saleData.brand,
      model: saleData.model,
      customerName: saleData.customerName,
      finalSalePrice: saleData.finalSalePrice,
      date: saleDate.toISOString(),  // FIX: Use actual sale date
      location: saleData.location || user?.location,
      warrantyId: `WARR-${Date.now().toString(36).toUpperCase()}-${saleData.receiptNumber}`
    });

    // Create QR code
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 100,
      margin: 1,
      color: {
        dark: '#1e293b', // slate-800
        light: '#ffffff'
      }
    });

    // Header with blue background
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // Company Logo/Name
    doc.setFontSize(28);
    doc.setTextColor(96, 165, 250); // blue-400
    doc.setFont('helvetica', 'bold');
    doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(226, 232, 240); // slate-200
    doc.setFont('helvetica', 'normal');
    doc.text('OFFICIAL SALES RECEIPT', pageWidth / 2, 30, { align: 'center' });
    
    // Receipt details - FIX: Use actual sale date/time
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Receipt No: ${saleData.receiptNumber}`, 20, 50);
    doc.text(`Date: ${formattedDate}`, pageWidth - 20, 50, { align: 'right' });
    doc.text(`Time: ${formattedTime}`, pageWidth - 20, 56, { align: 'right' });
    
    // Customer Information
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.setFont('helvetica', 'bold');
    doc.text('CUSTOMER INFORMATION', 20, 70);
    
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.5);
    doc.line(20, 73, pageWidth - 20, 73);
    
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.setFont('helvetica', 'normal');
    doc.text(`Customer: ${saleData.customerName || 'Walk-in Customer'}`, 25, 80);
    
    if (saleData.customerPhone) {
      doc.text(`Contact: ${saleData.customerPhone}`, 25, 87);
    }
    
    // Sale Details Section with QR Code
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('SALE DETAILS', 20, 100);
    
    // Add QR code on the right
    doc.addImage(qrCodeDataUrl, 'PNG', pageWidth - 90, 95, 70, 70);
    
    // QR code border and label
    doc.setDrawColor(59, 130, 246); // blue-500
    doc.setLineWidth(1);
    doc.rect(pageWidth - 92, 93, 74, 74);
    
    doc.setFontSize(9);
    doc.setTextColor(59, 130, 246);
    doc.text('WARRANTY VERIFICATION', pageWidth - 55, 170, { align: 'center' });
    doc.text('SCAN THIS QR CODE', pageWidth - 55, 175, { align: 'center' });
    
    // Product details table on left
    const startY = 110;
    const colWidth = (pageWidth - 100) / 4;
    
    // Table headers
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246);
    
    const headers = ['Item Description', 'Qty', 'Unit Price', 'Total'];
    headers.forEach((header, i) => {
      const x = 20 + (i * colWidth);
      doc.text(header, x, startY);
    });
    
    // Table data - FIX: Add null checks
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    
    const rowData = [
      `${saleData.brand || ''} ${saleData.model || ''}`,
      (saleData.quantity || 1).toString(),
      `MK ${(saleData.retailPrice || 0).toLocaleString()}`,
      `MK ${(saleData.finalSalePrice || 0).toLocaleString()}`
    ];
    
    rowData.forEach((data, i) => {
      const x = 20 + (i * colWidth);
      doc.text(data, x, startY + 8);
    });
    
    // Table lines
    doc.setDrawColor(203, 213, 225);
    doc.line(20, startY + 2, pageWidth - 100, startY + 2);
    doc.line(20, startY + 10, pageWidth - 100, startY + 10);
    
    // Summary Section
    const summaryY = startY + 20;
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(20, summaryY, pageWidth - 100, 35, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(20, summaryY, pageWidth - 100, 35);
    
    doc.setFontSize(11);
    doc.setTextColor(71, 85, 105);
    
    // Summary items - FIX: Handle missing discountPercentage
    const discountPercentage = saleData.discountPercentage || 0;
    const summaryItems = [
      { label: 'Subtotal:', value: `MK ${(saleData.finalSalePrice || 0).toLocaleString()}` },
      { label: 'Discount:', value: `${discountPercentage}%` },
      { label: 'Total Amount:', value: `MK ${(saleData.finalSalePrice || 0).toLocaleString()}` }
    ];
    
    summaryItems.forEach((item, index) => {
      const y = summaryY + 12 + (index * 10);
      doc.text(item.label, 25, y);
      doc.text(item.value, pageWidth - 120, y, { align: 'right' });
    });
    
    // Payment Information
    const paymentY = summaryY + 45;
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYMENT INFORMATION', 20, paymentY);
    
    doc.setFillColor(241, 245, 249);
    doc.rect(20, paymentY + 5, pageWidth - 100, 20, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(20, paymentY + 5, pageWidth - 100, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Payment Method: ${saleData.paymentMethod || 'Cash'}`, 25, paymentY + 13);
    doc.text(`Sold By: ${saleData.soldByName || user?.fullName || 'Unknown'}`, 25, paymentY + 19);
    doc.text(`Location: ${saleData.location || user?.location || 'Unknown'}`, 
      pageWidth - 120, paymentY + 13, { align: 'right' });
    
    // Warranty Information
    const warrantyY = paymentY + 30;
    doc.setFillColor(239, 246, 255); // blue-50
    doc.setDrawColor(59, 130, 246);
    doc.rect(20, warrantyY, pageWidth - 100, 25, 'FD');
    
    doc.setFontSize(11);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text('🔒 7-DAY WARRANTY INCLUDED', pageWidth / 2 - 50, warrantyY + 8, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text('Valid for 7 days from purchase date | Manufacturing defects only', 
      pageWidth / 2 - 50, warrantyY + 16, { align: 'center' });
    
    // Footer
    const footerY = pageHeight - 25;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Thank you for choosing KM Electronics!', 
      pageWidth / 2, footerY, { align: 'center' });
    doc.text('For warranty claims, scan QR code or present this receipt', 
      pageWidth / 2, footerY + 5, { align: 'center' });
    doc.text('Contact: +86 187 1117 7003 | +265 995 181 454', 
      pageWidth / 2, footerY + 10, { align: 'center' });
    doc.text('© 2024 KM Electronics. All rights reserved.', 
      pageWidth / 2, footerY + 15, { align: 'center' });
    
    // Generate filename and save
    const filename = `KM_Receipt_${saleData.receiptNumber}.pdf`;
    doc.save(filename);
    
    setSuccess(`Receipt generated successfully: ${filename}`);
    return true;
    
  } catch (error) {
    setError('Receipt generation error:', error);
    // Fallback: Simple receipt without QR code
    try {
      setSuccess('Attempting fallback receipt generation...');
      
      // Use safe date formatting for fallback
      const fallbackDate = saleData.soldAt ? 
        (saleData.soldAt.toDate ? saleData.soldAt.toDate() : new Date(saleData.soldAt)) : 
        new Date();
      
      const fallbackDoc = new jsPDF();
      fallbackDoc.setFontSize(16);
      fallbackDoc.text('KM ELECTRONICS', 20, 20);
      fallbackDoc.setFontSize(12);
      fallbackDoc.text(`Receipt: ${saleData.receiptNumber}`, 20, 30);
      fallbackDoc.text(`Date: ${fallbackDate.toLocaleDateString()}`, 20, 40);
      fallbackDoc.text(`Customer: ${saleData.customerName || 'Walk-in Customer'}`, 20, 50);
      fallbackDoc.text(`Item: ${saleData.brand || ''} ${saleData.model || ''}`, 20, 60);
      fallbackDoc.text(`Amount: MK ${saleData.finalSalePrice || 0}`, 20, 70);
      fallbackDoc.text(`Warranty ID: ${saleData.receiptNumber}`, 20, 80);
      fallbackDoc.text('7-DAY WARRANTY INCLUDED', 20, 90);
      
      fallbackDoc.save(`Receipt_${saleData.receiptNumber}.pdf`);
      setSuccess('Fallback receipt generated');
      return true;
    } catch (fallbackError) {
      setError('Fallback also failed:', fallbackError);
      throw new Error('Receipt generation failed: ' + error.message);
    }
  }
};

  // ACID-Compliant Quick Sale
  const handleQuickSale = async () => {
    if (!quickSale.itemCode || !quickSale.customerName) {
      setError('Please enter item code and customer name');
      return;
    }

    if (quickSale.quantity <= 0) {
      setError('Quantity must be greater than 0');
      return;
    }

    setIsProcessingSale(true);
    setIsGeneratingReceipt(false);

    try {
      // First, validate database consistency
      const consistencyCheck = await validateDatabaseConsistency();
      if (!consistencyCheck.consistent) {
        setError('Database consistency issues:', consistencyCheck.errors);
      }

      // Pre-validate stock before transaction
      const validationResult = await validateStockBeforeOperation(
        quickSale.itemCode, 
        user.location, 
        quickSale.quantity
      );
      
      if (!validationResult.valid) {
        setError(validationResult.error);
        setIsProcessingSale(false);
        return;
      }

      // Execute transaction with retry logic
      const transactionResult = await executeWithRetry(async () => {
        return await runTransaction(db, async (transaction) => {
          // 1. VALIDATION PHASE: Re-validate stock within transaction
          const stockQuery = query(
            collection(db, 'stocks'),
            where('itemCode', '==', quickSale.itemCode),
            where('location', '==', user.location)
          );
          
          const stockSnapshot = await getDocs(stockQuery);
          
          if (stockSnapshot.empty) {
            throw new Error(`Item "${quickSale.itemCode}" not found in ${user.location}!`);
          }

          const stockDoc = stockSnapshot.docs[0];
          const stockRef = doc(db, 'stocks', stockDoc.id);
          
          const freshStockDoc = await transaction.get(stockRef);
          if (!freshStockDoc.exists()) {
            throw new Error('Stock item was deleted during transaction');
          }

          const freshStock = freshStockDoc.data();
          
          if (freshStock.quantity < quickSale.quantity) {
            throw new Error(`Insufficient stock! Only ${freshStock.quantity} units available.`);
          }

          if (freshStock.itemCode !== quickSale.itemCode) {
            throw new Error('Stock item code mismatch during transaction');
          }

          // 2. CALCULATION PHASE
          const retailPrice = parseFloat(freshStock.retailPrice) || 0;
          const discountPercentage = parseFloat(freshStock.discountPercentage) || 0;
          
          let finalPrice;
          if (quickSale.customPrice) {
            finalPrice = parseFloat(quickSale.customPrice);
            if (isNaN(finalPrice) || finalPrice <= 0) {
              throw new Error('Please enter a valid custom price.');
            }
            if (finalPrice < retailPrice * 0.5) {
              throw new Error('Custom price cannot be less than 50% of retail price.');
            }
          } else {
            finalPrice = retailPrice * (1 - discountPercentage / 100) * quickSale.quantity;
          }

          const costPrice = parseFloat(freshStock.costPrice) || 0;
          const profit = finalPrice - (costPrice * quickSale.quantity);

          if (profit < 0 && !quickSale.customPrice) {
            throw new Error('Sale would result in a loss. Please use custom price or check costs.');
          }

          // 3. UPDATE PHASE
          transaction.update(stockRef, {
            quantity: increment(-quickSale.quantity),
            updatedAt: serverTimestamp(),
            lastSold: serverTimestamp(),
            totalSold: increment(quickSale.quantity)
          });

          // 4. CREATE PHASE
          const receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          const transactionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          
          const saleData = {
            itemCode: freshStock.itemCode,
            brand: freshStock.brand,
            model: freshStock.model,
            category: freshStock.category || 'Smartphone',
            color: freshStock.color,
            storage: freshStock.storage,
            quantity: quickSale.quantity,
            costPrice: costPrice,
            retailPrice: retailPrice,
            discountPercentage: discountPercentage,
            finalSalePrice: finalPrice,
            profit: profit,
            paymentMethod: 'cash',
            customerName: quickSale.customerName.trim(),
            customerPhone: quickSale.customerPhone.trim(),
            location: user.location,
            soldBy: user.uid,
            soldByName: user.fullName,
            soldAt: serverTimestamp(),
            receiptNumber: receiptNumber,
            notes: quickSale.customPrice ? `Custom price sale: MK ${quickSale.customPrice}` : 'Standard sale',
            transactionId: transactionId,
            status: 'completed',
            originalStockQuantity: freshStock.quantity,
            remainingStockQuantity: freshStock.quantity - quickSale.quantity
          };

          const salesRef = doc(collection(db, 'sales'));
          transaction.set(salesRef, saleData);

          const auditLog = {
            action: 'quick_sale',
            itemCode: freshStock.itemCode,
            quantity: quickSale.quantity,
            price: finalPrice,
            customer: quickSale.customerName,
            location: user.location,
            user: user.uid,
            userName: user.fullName,
            timestamp: serverTimestamp(),
            stockBefore: freshStock.quantity,
            stockAfter: freshStock.quantity - quickSale.quantity,
            transactionId: transactionId,
            receiptNumber: receiptNumber,
            status: 'success'
          };

          const auditRef = doc(collection(db, 'auditLogs'));
          transaction.set(auditRef, auditLog);

          return { saleData, receiptNumber, transactionId };
        });
      });

      alert('Transaction successful, generating receipt...');
      setIsGeneratingReceipt(true);
      
      // Generate receipt with QR code
      try {
        await generateSalesReceipt(transactionResult.saleData);
        
        setQuickSale({ 
          itemCode: '', 
          quantity: 1, 
          customPrice: '', 
          customerName: '',
          customerPhone: ''
        });
        
        setSuccess('Sale completed successfully! Receipt with QR code downloaded.');
        
        // Refresh data
        await Promise.all([
          fetchLocationStocks(user.location),
          fetchLocationSales(user.location)
        ]);
        
      } catch (receiptError) {
        setSuccess('Sale completed! (Receipt error: ' + receiptError.message + ')');
        // Still refresh data even if receipt failed
        await Promise.all([
          fetchLocationStocks(user.location),
          fetchLocationSales(user.location)
        ]);
      }

    } catch (error) {
      setError('Quick sale error');  
      
      // Log error to audit
      const errorAuditLog = {
        action: 'quick_sale_error',
        itemCode: quickSale.itemCode,
        quantity: quickSale.quantity,
        customer: quickSale.customerName,
        location: user?.location,
        user: user?.uid,
        userName: user?.fullName,
        timestamp: serverTimestamp(),
        error: error.message,
        status: 'failed'
      };

      try {
        await addDoc(collection(db, 'auditLogs'), errorAuditLog);
      } catch (auditError) {
        setError('Failed to log error to audit:', auditError);
      }
      
      setError(`Sale failed: ${error.message}`);
      
    } finally {
      setIsProcessingSale(false);
      setIsGeneratingReceipt(false);
    }
  };

  // ACID-Compliant Stock Request (same as before)
  const handleRequestStock = async () => {
    try {
      if (!transferStock.itemCode || !transferStock.quantity || !transferStock.toLocation) {
        setError('Please fill all required fields');
        return;
      }

      const quantity = parseInt(transferStock.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        setError('Quantity must be greater than 0');
        return;
      }

      if (transferStock.toLocation === user.location) {
        setError('Destination location must be different from your location');
        return;
      }

      await executeWithRetry(async () => {
        return await runTransaction(db, async (transaction) => {
          const stockQuery = query(
            collection(db, 'stocks'),
            where('itemCode', '==', transferStock.itemCode),
            where('location', '==', user.location)
          );
          
          const stockSnapshot = await getDocs(stockQuery);
          
          if (stockSnapshot.empty) {
            throw new Error(`Item not found in ${user.location}`);
          }

          const stockDoc = stockSnapshot.docs[0];
          const stockRef = doc(db, 'stocks', stockDoc.id);
          const freshStockDoc = await transaction.get(stockRef);
          
          if (!freshStockDoc.exists()) {
            throw new Error('Stock item was deleted during transaction');
          }

          const stock = freshStockDoc.data();

          if (stock.quantity < quantity) {
            throw new Error(`Insufficient stock! Only ${stock.quantity} units available.`);
          }

          const requestData = {
            itemCode: transferStock.itemCode,
            quantity: quantity,
            fromLocation: user.location,
            toLocation: transferStock.toLocation,
            status: 'pending',
            requestedBy: user.uid,
            requestedByName: user.fullName,
            requestedByLocation: user.location,
            requestedAt: serverTimestamp(),
            sourceStockId: stockDoc.id,
            transactionId: Date.now().toString() + Math.random().toString(36).substr(2, 9)
          };

          const requestRef = doc(collection(db, 'stockRequests'));
          transaction.set(requestRef, requestData);

          const auditLog = {
            action: 'stock_request',
            itemCode: transferStock.itemCode,
            quantity: quantity,
            fromLocation: user.location,
            toLocation: transferStock.toLocation,
            user: user.uid,
            userName: user.fullName,
            timestamp: serverTimestamp(),
            transactionId: requestData.transactionId,
            status: 'pending'
          };

          const auditRef = doc(collection(db, 'auditLogs'));
          transaction.set(auditRef, auditLog);

          return requestData;
        });
      }).then(() => {
        setTransferStock({
          itemCode: '',
          quantity: '',
          fromLocation: '',
          toLocation: ''
        });
        setTransferModalOpen(false);
        setSuccess('Stock transfer request submitted successfully!');
        
        fetchStockRequests(user.location);
      }).catch((error) => {
        setError('Error submitting request: ' + error.message);
        throw error;
      });
      
    } catch (error) {
      setError('Stock request error:', error);
      if (!error.message.includes('Error submitting request:')) {
        setError('Error submitting request: ' + error.message);
      }
    }
  };

  // ACID-Compliant Installment Creation (same as before)
  const handleCreateInstallment = async () => {
    try {
      if (!installmentData.customerName || !installmentData.totalAmount) {
        setError('Please fill in required fields');
        return;
      }

      const totalAmount = parseFloat(installmentData.totalAmount);
      const downPayment = parseFloat(installmentData.downPayment) || 0;

      if (totalAmount <= 0) {
        setError('Total amount must be greater than 0');
        return;
      }

      if (downPayment < 0) {
        setError('Down payment cannot be negative');
        return;
      }

      if (downPayment > totalAmount) {
        setError('Down payment cannot exceed total amount');
        return;
      }

      const transactionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const remainingAmount = totalAmount - downPayment;
      const months = parseInt(installmentData.installmentPlan);
      const monthlyPayment = remainingAmount / months;

      await executeWithRetry(async () => {
        return await runTransaction(db, async (transaction) => {
          const installmentDataToSave = {
            ...installmentData,
            saleId: installmentData.saleId,
            customerName: installmentData.customerName,
            phoneNumber: installmentData.phoneNumber,
            totalAmount: totalAmount,
            downPayment: downPayment,
            remainingAmount: remainingAmount,
            installmentPlan: installmentData.installmentPlan,
            monthlyPayment: monthlyPayment,
            nextPaymentDate: installmentData.nextPaymentDate,
            notes: installmentData.notes,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            createdByName: user.fullName,
            location: user.location,
            status: 'active',
            transactionId: transactionId,
            payments: downPayment > 0 ? [{
              amount: downPayment,
              date: new Date().toISOString().split('T')[0],
              type: 'down_payment',
              receiptNumber: `DP-${Date.now()}`,
              recordedAt: serverTimestamp()
            }] : []
          };

          const installmentRef = doc(collection(db, 'installments'));
          transaction.set(installmentRef, installmentDataToSave);

          if (installmentData.saleId) {
            const saleRef = doc(db, 'sales', installmentData.saleId);
            const saleDoc = await transaction.get(saleRef);
            
            if (saleDoc.exists()) {
              transaction.update(saleRef, {
                paymentType: 'installment',
                installmentId: installmentRef.id,
                updatedAt: serverTimestamp()
              });
            }
          }

          const auditLog = {
            action: 'create_installment',
            customerName: installmentData.customerName,
            totalAmount: totalAmount,
            downPayment: downPayment,
            remainingAmount: remainingAmount,
            months: months,
            user: user.uid,
            userName: user.fullName,
            location: user.location,
            timestamp: serverTimestamp(),
            transactionId: transactionId,
            status: 'created'
          };

          const auditRef = doc(collection(db, 'auditLogs'));
          transaction.set(auditRef, auditLog);

          return { installmentId: installmentRef.id, data: installmentDataToSave };
        });
      }).then(() => {
        setInstallmentModalOpen(false);
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
        
        setSuccess('Installment plan created successfully!');
        
        fetchInstallments(user.location);
      }).catch((error) => {
        setError('Error creating installment plan: ' + error.message);
        throw error;
      });
      
    } catch (error) {
      setError('Create installment error:', error);
      if (!error.message.includes('Error creating installment plan:')) {
        setError('Error creating installment plan: ' + error.message);
      }
    }
  };

  // ACID-Compliant Faulty Phone Report (same as before)
  const handleReportFaultyPhone = async () => {
    try {
      if (!faultyReport.itemCode || !faultyReport.faultDescription) {
        setError('Please enter item code and fault description');
        return;
      }

      await executeWithRetry(async () => {
        return await runTransaction(db, async (transaction) => {
          const stockQuery = query(
            collection(db, 'stocks'),
            where('itemCode', '==', faultyReport.itemCode),
            where('location', '==', user.location)
          );
          
          const stockSnapshot = await getDocs(stockQuery);
          
          if (stockSnapshot.empty) {
            throw new Error(`Item "${faultyReport.itemCode}" not found in ${user.location}`);
          }

          const stockDoc = stockSnapshot.docs[0];
          const stockRef = doc(db, 'stocks', stockDoc.id);
          const freshStockDoc = await transaction.get(stockRef);
          
          if (!freshStockDoc.exists()) {
            throw new Error('Stock item was deleted during transaction');
          }

          const stock = freshStockDoc.data();
          const transactionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

          const faultyData = {
            ...faultyReport,
            stockId: stockDoc.id,
            brand: stock.brand,
            model: stock.model,
            location: user.location,
            reportedBy: user.uid,
            reportedByName: user.fullName,
            reportedAt: serverTimestamp(),
            estimatedRepairCost: parseFloat(faultyReport.estimatedRepairCost) || 0,
            reportedCost: parseFloat(faultyReport.reportedCost) || 0,
            transactionId: transactionId,
            statusHistory: [{
              status: faultyReport.status,
              changedAt: serverTimestamp(),
              changedBy: user.uid,
              changedByName: user.fullName
            }]
          };

          const faultyRef = doc(collection(db, 'faultyPhones'));
          transaction.set(faultyRef, faultyData);

          if (stock.quantity > 0) {
            transaction.update(stockRef, {
              quantity: increment(-1),
              updatedAt: serverTimestamp(),
              faultyReported: increment(1)
            });
          }

          const auditLog = {
            action: 'report_faulty',
            itemCode: faultyReport.itemCode,
            brand: stock.brand,
            model: stock.model,
            faultDescription: faultyReport.faultDescription,
            reportedCost: faultyReport.reportedCost,
            location: user.location,
            user: user.uid,
            userName: user.fullName,
            timestamp: serverTimestamp(),
            transactionId: transactionId,
            status: 'reported'
          };

          const auditRef = doc(collection(db, 'auditLogs'));
          transaction.set(auditRef, auditLog);

          return { faultyId: faultyRef.id, data: faultyData };
        });
      }).then(() => {
        setReportModalOpen(false);
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
        
        setSuccess('Faulty phone reported successfully!');
        
        fetchFaultyPhones(user.location);
      }).catch((error) => {
        setError('Error reporting faulty phone: ' + error.message);
        throw error;
      });
      
    } catch (error) {
      setError('Report faulty phone error:', error);
      if (!error.message.includes('Error reporting faulty phone:')) {
        setError('Error reporting faulty phone: ' + error.message);
      }
    }
  };

  // Helper Functions
  const calculateTodaySales = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySales = sales.filter(sale => {
      const saleDate = sale.soldAt?.toDate();
      return saleDate && saleDate >= today;
    });

    return {
      count: todaySales.length,
      revenue: todaySales.reduce((total, sale) => total + (sale.finalSalePrice || 0), 0)
    };
  };

  const calculateTotalStockValue = () => {
    return stocks.reduce((total, stock) => {
      return total + ((stock.costPrice || 0) * (stock.quantity || 0));
    }, 0);
  };

  const getFilteredStocks = () => {
    if (!stocks || !Array.isArray(stocks)) return [];
    
    let filtered = [...stocks];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(stock => 
        (stock.itemCode?.toLowerCase() || '').includes(term) ||
        (stock.brand?.toLowerCase() || '').includes(term) ||
        (stock.model?.toLowerCase() || '').includes(term)
      );
    }
    
    if (filterBrand && filterBrand !== 'all') {
      filtered = filtered.filter(stock => stock.brand === filterBrand);
    }
    
    return filtered;
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      case 'approved': return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      default: return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
    }
  };

  const getStockStatusBadge = (quantity) => {
    return quantity > 10 ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
           quantity > 0 ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
           'bg-red-500/20 text-red-300 border border-red-500/30';
  };

  const getInstallmentStatusBadge = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500/20 text-green-300 border border-green-500/30';
      case 'overdue': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'cancelled': return 'bg-gray-500/20 text-gray-300 border border-gray-500/30';
      default: return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
    }
  };

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-6 text-slate-300 font-medium">Loading Manager Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Error/Success Alerts */}
      {error && (
        <div className="fixed top-4 right-4 z-50">
          <Alert variant="destructive" className="w-96">
            <FiAlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
      
      {success && (
        <div className="fixed top-4 right-4 z-50">
          <Alert className="w-96 bg-green-900/30 border-green-700">
            <FiCheck className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        </div>
      )}
      
      <div className="flex h-screen">
        {/* Desktop Sidebar (same as before) */}
        {!isMobile && isSidebarOpen && (
          <div className="hidden lg:flex lg:shrink-0 transition-all duration-300 w-64">
            <div className="flex flex-col w-64">
              <div className="flex flex-col grow bg-slate-900 border-r border-slate-800 pt-5 pb-4 overflow-y-auto">
                <div className="flex items-center justify-between shrink-0 px-4">
                  <div className="flex items-center">
                    <FiShoppingBag className="h-8 w-8 text-blue-500" />
                    <div className="ml-3">
                      <h1 className="text-xl font-bold text-white">KM MGNT</h1>
                      <p className="text-xs text-slate-400">Manager Panel</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarOpen(false)}
                    className="hidden lg:inline-flex"
                  >
                    <FiChevronLeft className="h-5 w-5 text-white" />
                  </Button>
                </div>
                <div className="mt-8 flex-1 flex flex-col">
                  <nav className="flex-1 px-2 space-y-1">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full justify-between ${
                          activeTab === item.id
                            ? 'bg-blue-900/30 text-white border-l-4 border-blue-500'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        } ${tabLoading && activeTab !== item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={tabLoading && activeTab !== item.id}
                      >
                        <div className="flex items-center">
                          {item.icon}
                          <span className="ml-3">{item.name}</span>
                        </div>
                        {item.count && stockRequests.length > 0 && (
                          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                            {stockRequests.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </nav>
                </div>
                <div className="shrink-0 flex border-t border-slate-800 p-4">
                  <div className="flex items-center">
                    <Avatar>
                      <AvatarFallback className="bg-blue-600">
                        {user?.fullName?.charAt(0) || 'M'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-white">{user?.fullName}</p>
                      <p className="text-xs text-slate-400">Manager • {user?.location}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header (same as before) */}
          <div className="lg:hidden sticky top-0 z-40 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="lg:hidden"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <FiMenu className="h-6 w-6 text-white" />
                </Button>
                <div className="ml-4">
                  <h1 className="text-lg font-semibold text-white">KM ELECTRONICS</h1>
                  <p className="text-xs text-slate-400">Manager</p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-600">
                        {user?.fullName?.charAt(0) || 'M'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut(auth).then(() => router.push('/login'))}>
                    <FiLogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          {/* Desktop Header */}
          <div className="hidden lg:block sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="mr-4"
                >
                  <FiMenu className="h-6 w-6 text-white" />
                </Button>
                <div>
                  <h1 className="text-xl font-semibold text-white">
                    {navItems.find(item => item.id === activeTab)?.name || 'Dashboard'}
                  </h1>
                  <p className="text-sm text-slate-400">
                    Welcome, {user?.fullName} | Manager • {user?.location}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                  {user?.location}
                </Badge>
                
                <Button
                  onClick={handleRefreshData}
                  variant="outline"
                  size="sm"
                  className="text-slate-300 hover:text-white"
                  disabled={loading}
                >
                  <FiRefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </Button>
                
                <Button
                  onClick={() => validateDatabaseConsistency()}
                  variant="outline"
                  size="sm"
                  className="text-slate-300 hover:text-white"
                  disabled={loading}
                >
                  <FiDatabase className="w-4 h-4 mr-2" />
                  Validate DB
                </Button>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-600">
                          {user?.fullName?.charAt(0) || 'M'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                        <p className="text-xs leading-none text-slate-500">
                          Manager • {user?.location}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => signOut(auth).then(() => router.push('/login'))}>
                      <FiLogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Mobile Sidebar (same as before) */}
          {isMobile && (
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetContent side="left" className="w-64 bg-slate-900 border-r border-slate-800 p-0">
                <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
                  <div className="flex items-center">
                    <FiShoppingBag className="h-8 w-8 text-blue-500" />
                    <div className="ml-3">
                      <h1 className="text-xl font-bold text-white">KM ELECTRONICS</h1>
                      <p className="text-xs text-slate-400">Manager Panel</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
                    <FiX className="h-5 w-5 text-white" />
                  </Button>
                </div>
                <ScrollArea className="h-[calc(100vh-4rem)]">
                  <div className="p-4 space-y-2">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          handleTabChange(item.id);
                          setIsSidebarOpen(false);
                        }}
                        className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full justify-between ${
                          activeTab === item.id
                            ? 'bg-blue-900/30 text-white border-l-4 border-blue-500'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        } ${tabLoading && activeTab !== item.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={tabLoading && activeTab !== item.id}
                      >
                        <div className="flex items-center">
                          {item.icon}
                          <span className="ml-3">{item.name}</span>
                        </div>
                        {item.count && stockRequests.length > 0 && (
                          <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                            {stockRequests.length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center">
                      <Avatar>
                        <AvatarFallback className="bg-blue-600">
                          {user?.fullName?.charAt(0) || 'M'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-white">{user?.fullName}</p>
                        <p className="text-xs text-slate-400">Manager • {user?.location}</p>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          )}

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {tabLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-4 text-slate-300 font-medium">Loading {navItems.find(item => item.id === activeTab)?.name || 'Data'}...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Dashboard Tab (same as before) */}
                {activeTab === 'dashboard' && (
                  <div className="space-y-6">
                    {/* Analytics Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-slate-400">Today's Sales</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-green-400">{calculateTodaySales().count}</div>
                          <p className="text-xs text-slate-500 mt-1">{formatCurrency(calculateTodaySales().revenue)}</p>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-slate-400">Stock Value</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-blue-400">
                            {formatCurrency(calculateTotalStockValue())}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-slate-400">Faulty Phones</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-orange-400">
                            {faultyPhones.length}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-slate-400">Pending Requests</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-yellow-400">
                            {stockRequests.length}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white">Quick Actions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Button
                              onClick={() => handleTabChange('quickSale')}
                              className="w-full h-auto py-4 bg-blue-600 hover:bg-blue-700"
                            >
                              <FiShoppingCart className="mr-2 h-5 w-5" />
                              Quick Sale
                            </Button>
                            <Button
                              onClick={() => setReportModalOpen(true)}
                              className="w-full h-auto py-4 bg-orange-600 hover:bg-orange-700"
                            >
                              <FiAlertTriangle className="mr-2 h-5 w-5" />
                              Report Faulty
                            </Button>
                            <Button
                              onClick={() => setTransferModalOpen(true)}
                              className="w-full h-auto py-4 bg-green-600 hover:bg-green-700"
                            >
                              <FiTruck className="mr-2 h-5 w-5" />
                              Request Stock
                            </Button>
                            <Button
                              onClick={() => setInstallmentModalOpen(true)}
                              className="w-full h-auto py-4 bg-purple-600 hover:bg-purple-700"
                            >
                              <FiCreditCard className="mr-2 h-5 w-5" />
                              Create Installment
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Recent Sales */}
                      <Card className="bg-slate-800/50 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-white">Recent Sales</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-64">
                            <div className="space-y-3">
                              {sales.slice(0, 5).map((sale) => (
                                <div key={sale.id} className="flex justify-between items-center p-3 bg-slate-900/50 rounded-lg">
                                  <div>
                                    <div className="text-white font-medium">{sale.brand} {sale.model}</div>
                                    <div className="text-slate-400 text-sm">
                                      {sale.customerName} • {sale.soldByName}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-green-400 font-semibold">{formatCurrency(sale.finalSalePrice)}</div>
                                    <div className="text-slate-500 text-xs">
                                      {sale.soldAt?.toDate().toLocaleTimeString() || 'Just now'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Stock Overview */}
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <CardTitle className="text-white">Stock Overview - {user?.location}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-700">
                              <TableHead className="text-slate-300">Item Code</TableHead>
                              <TableHead className="text-slate-300">Product</TableHead>
                              <TableHead className="text-slate-300">Price</TableHead>
                              <TableHead className="text-slate-300">Quantity</TableHead>
                              <TableHead className="text-slate-300">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stocks.slice(0, 5).map((stock) => (
                              <TableRow key={stock.id} className="border-slate-700">
                                <TableCell className="font-mono text-white">{stock.itemCode}</TableCell>
                                <TableCell className="text-white">{stock.brand} {stock.model}</TableCell>
                                <TableCell className="text-green-400">{formatCurrency(stock.retailPrice)}</TableCell>
                                <TableCell>
                                  <Badge className={getStockStatusBadge(stock.quantity)}>
                                    {stock.quantity}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Button
                                    onClick={() => {
                                      setQuickSale(prev => ({
                                        ...prev,
                                        itemCode: stock.itemCode,
                                        customerName: 'Walk-in Customer'
                                      }));
                                      handleTabChange('quickSale');
                                    }}
                                    size="sm"
                                    disabled={stock.quantity === 0}
                                  >
                                    Sell
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* My Stocks Tab - FIXED Select Error */}
                {activeTab === 'myStocks' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-white">
                          My Stocks - {user?.location || 'Loading...'}
                        </CardTitle>
                        {!loading && (
                          <div className="text-lg font-medium">
                            <span className="text-slate-300">Total Value: </span>
                            <span className="text-green-400 font-bold">
                              {formatCurrency(calculateTotalStockValue())}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Search and Filter - FIXED Select Error */}
                      <div className="flex flex-col lg:flex-row gap-4 mb-6">
                        <div className="relative flex-1">
                          <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
                          <Input
                            type="text"
                            placeholder="Search by item code, brand, or model..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 bg-slate-800/50 border-slate-600 text-white"
                            disabled={loading}
                          />
                        </div>
                        <div className="flex gap-4">
                          <Select value={filterBrand} onValueChange={setFilterBrand}>
                            <SelectTrigger className="w-48 bg-slate-800/50 border-slate-600 text-white">
                              <SelectValue placeholder="All Brands" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* FIXED: Changed empty string value to "all" */}
                              <SelectItem value="all">All Brands</SelectItem>
                              {[...new Set(stocks.map(stock => stock.brand).filter(Boolean))].map(brand => (
                                <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => { setSearchTerm(''); setFilterBrand('all'); }}
                            variant="outline"
                            className="bg-slate-700 hover:bg-slate-600 border-slate-600"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      {loading ? (
                        // Loading skeleton
                        <div className="space-y-4">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-4 p-4 bg-slate-800/30 rounded-lg">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-4 w-48" />
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-8 w-20" />
                            </div>
                          ))}
                        </div>
                      ) : stocks.length === 0 ? (
                        <div className="text-center py-12">
                          <FiPackage className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                          <p className="text-slate-400">No stocks found for {user?.location}</p>
                          <Button
                            onClick={() => fetchLocationStocks(location)}
                            variant="outline"
                            className="mt-4"
                          >
                            <FiRefreshCw className="w-4 h-4 mr-2" />
                            Refresh Stocks
                          </Button>
                        </div>
                      ) : (
                        <ScrollArea className="h-600px">
                          <Table>
                            <TableHeader className="bg-slate-800/50">
                              <TableRow className="border-slate-700">
                                <TableHead className="text-slate-300">Item Code</TableHead>
                                <TableHead className="text-slate-300">Product</TableHead>
                                <TableHead className="text-slate-300">Cost Price</TableHead>
                                <TableHead className="text-slate-300">Retail Price</TableHead>
                                <TableHead className="text-slate-300">Quantity</TableHead>
                                <TableHead className="text-slate-300">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getFilteredStocks().map((stock) => (
                                <TableRow key={stock.id} className="border-slate-700">
                                  <TableCell className="font-mono text-white">{stock.itemCode}</TableCell>
                                  <TableCell>
                                    <div className="text-white font-medium">{stock.brand} {stock.model}</div>
                                    <div className="text-slate-400 text-xs">{stock.color} • {stock.storage}</div>
                                  </TableCell>
                                  <TableCell className="text-slate-300">{formatCurrency(stock.costPrice)}</TableCell>
                                  <TableCell className="text-green-400 font-medium">{formatCurrency(stock.retailPrice)}</TableCell>
                                  <TableCell>
                                    <Badge className={getStockStatusBadge(stock.quantity)}>
                                      {stock.quantity}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex space-x-2">
                                      <Button
                                        onClick={() => {
                                          setQuickSale(prev => ({
                                            ...prev,
                                            itemCode: stock.itemCode,
                                            customerName: 'Walk-in Customer'
                                          }));
                                          handleTabChange('quickSale');
                                        }}
                                        size="sm"
                                        disabled={stock.quantity === 0}
                                      >
                                        Sell
                                      </Button>
                                      {stock.quantity > 1 && (
                                        <Button
                                          onClick={() => {
                                            const quantity = prompt(`Enter quantity to sell (Available: ${stock.quantity}):`, '1');
                                            if (quantity && !isNaN(quantity) && parseInt(quantity) > 0) {
                                              setQuickSale(prev => ({
                                                ...prev,
                                                itemCode: stock.itemCode,
                                                quantity: parseInt(quantity),
                                                customerName: 'Walk-in Customer'
                                              }));
                                              handleTabChange('quickSale');
                                            }
                                          }}
                                          variant="outline"
                                          size="sm"
                                        >
                                          Bulk
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </CardContent>
                    {!loading && (
                      <CardFooter className="flex justify-between border-t border-slate-700 pt-4">
                        <div className="text-slate-400 text-sm">
                          Showing {getFilteredStocks().length} of {stocks.length} items
                        </div>
                        <Button
                          onClick={() => fetchLocationStocks(location)}
                          variant="outline"
                          size="sm"
                          className="text-slate-300 hover:text-white"
                        >
                          <FiRefreshCw className="w-4 h-4 mr-2" />
                          Refresh
                        </Button>
                      </CardFooter>
                    )}
                  </Card>
                )}

                {/* Quick Sale Tab */}
                {activeTab === 'quickSale' && (
                  <div className="space-y-6">
                    <Card className="bg-slate-800/50 border-slate-700">
                      <CardHeader>
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-xl bg-linear-to-br from-green-500 to-green-600 flex items-center justify-center">
                            <FiShoppingCart className="text-white w-6 h-6" />
                          </div>
                          <div>
                            <CardTitle className="text-white">Quick Sale</CardTitle>
                            <CardDescription>Process sale from {user?.location}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                          {/* Quick Sale Form */}
                          <Card className="bg-slate-800/30 border-slate-700">
                            <CardHeader>
                              <div className="flex items-center space-x-2">
                                <FiShoppingCart className="text-green-400" />
                                <CardTitle className="text-lg">Process Sale</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-6">
                                <div>
                                  <Label className="text-slate-300">Customer Name *</Label>
                                  <Input
                                    type="text"
                                    placeholder="Enter customer name..."
                                    value={quickSale.customerName}
                                    onChange={(e) => setQuickSale({...quickSale, customerName: e.target.value})}
                                    className="bg-slate-800/50 border-slate-600 text-white"
                                    disabled={isProcessingSale}
                                  />
                                </div>
                                
                                <div>
                                  <Label className="text-slate-300">Customer Phone</Label>
                                  <Input
                                    type="tel"
                                    placeholder="Enter phone number..."
                                    value={quickSale.customerPhone}
                                    onChange={(e) => setQuickSale({...quickSale, customerPhone: e.target.value})}
                                    className="bg-slate-800/50 border-slate-600 text-white"
                                    disabled={isProcessingSale}
                                  />
                                </div>
                                
                                <div>
                                  <Label className="text-slate-300">Item Code *</Label>
                                  <Input
                                    type="text"
                                    placeholder="Enter item code..."
                                    value={quickSale.itemCode}
                                    onChange={(e) => setQuickSale({...quickSale, itemCode: e.target.value})}
                                    className="bg-slate-800/50 border-slate-600 text-white"
                                    disabled={isProcessingSale}
                                  />
                                  <p className="text-xs text-orange-300 mt-2">Only items from {user?.location} can be sold</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-slate-300">Quantity</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={quickSale.quantity}
                                      onChange={(e) => setQuickSale({...quickSale, quantity: parseInt(e.target.value) || 1})}
                                      className="bg-slate-800/50 border-slate-600 text-white"
                                      disabled={isProcessingSale}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-slate-300">
                                      Custom Price (Optional)
                                    </Label>
                                    <Input
                                      type="number"
                                      placeholder="Enter custom price..."
                                      value={quickSale.customPrice}
                                      onChange={(e) => setQuickSale({...quickSale, customPrice: e.target.value})}
                                      className="bg-slate-800/50 border-slate-600 text-white"
                                      disabled={isProcessingSale}
                                    />
                                  </div>
                                </div>
                                
                                <Button
                                  onClick={handleQuickSale}
                                  disabled={!quickSale.itemCode || !quickSale.customerName || isProcessingSale}
                                  className="w-full bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                                >
                                  {isProcessingSale ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      <span>
                                        {isGeneratingReceipt ? 'Generating Receipt...' : 'Processing Sale...'}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <FiShoppingCart className="w-5 h-5 mr-2" />
                                      <span>Process Sale & Generate Receipt with QR</span>
                                    </>
                                  )}
                                </Button>

                                {isProcessingSale && (
                                  <div className="text-center text-slate-400 text-sm">
                                    <p>Processing transaction and generating receipt with QR code...</p>
                                    <p className="text-xs mt-1">Receipt includes warranty QR code for verification</p>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>

                          {/* Available Items */}
                          <Card className="bg-slate-800/30 border-slate-700">
                            <CardHeader>
                              <div className="flex items-center space-x-2">
                                <FiPackage className="text-blue-400" />
                                <CardTitle className="text-lg">Available Items in {user?.location}</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <ScrollArea className="h-400px">
                                <div className="space-y-3">
                                  {stocks.slice(0, 10).map((stock) => (
                                    <Card 
                                      key={stock.id} 
                                      className="border-slate-700 hover:border-green-500/30 cursor-pointer bg-slate-900/30 hover:bg-slate-900/50"
                                      onClick={() => !isProcessingSale && setQuickSale(prev => ({...prev, itemCode: stock.itemCode}))}
                                    >
                                      <CardContent className="p-4">
                                        <div className="flex justify-between items-center">
                                          <div>
                                            <div className="text-white font-mono text-sm font-medium">{stock.itemCode}</div>
                                            <div className="text-slate-400 text-xs">{stock.brand} {stock.model}</div>
                                            <div className="text-slate-500 text-xs">{stock.quantity} available</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-green-400 text-sm font-medium">{formatCurrency(stock.retailPrice)}</div>
                                            {stock.discountPercentage > 0 && (
                                              <Badge variant="outline" className="mt-1 bg-orange-500/20 text-orange-300 border-orange-500/30">
                                                Save {stock.discountPercentage}%
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))}
                                </div>
                              </ScrollArea>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Sales History Tab */}
                {activeTab === 'salesHistory' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white">Sales History - {user?.location}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="space-y-4">
                          {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full bg-slate-700/50" />
                          ))}
                        </div>
                      ) : sales.length === 0 ? (
                        <div className="text-center py-12">
                          <FiDollarSign className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                          <p className="text-slate-400">No sales history found for {user?.location}</p>
                          <Button
                            onClick={() => fetchLocationSales(location)}
                            variant="outline"
                            className="mt-4"
                          >
                            <FiRefreshCw className="w-4 h-4 mr-2" />
                            Refresh Sales
                          </Button>
                        </div>
                      ) : (
                        <ScrollArea className="h-600px">
                          <Table>
                            <TableHeader className="bg-slate-800/50">
                              <TableRow className="border-slate-700">
                                <TableHead className="text-slate-300">Date</TableHead>
                                <TableHead className="text-slate-300">Customer</TableHead>
                                <TableHead className="text-slate-300">Item</TableHead>
                                <TableHead className="text-slate-300">Quantity</TableHead>
                                <TableHead className="text-slate-300">Price</TableHead>
                                <TableHead className="text-slate-300">Sold By</TableHead>
                                <TableHead className="text-slate-300">Receipt</TableHead>
                                <TableHead className="text-slate-300">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sales.map((sale) => (
                                <TableRow key={sale.id} className="border-slate-700">
                                  <TableCell>
                                    {sale.soldAt?.toDate().toLocaleDateString() || 'Unknown'}
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-white font-medium">{sale.customerName || 'Walk-in'}</div>
                                    {sale.customerPhone && <div className="text-slate-400 text-xs">{sale.customerPhone}</div>}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-semibold text-white">{sale.brand} {sale.model}</div>
                                    <div className="text-slate-400 text-xs">{sale.itemCode}</div>
                                  </TableCell>
                                  <TableCell className="text-white font-medium">{sale.quantity}</TableCell>
                                  <TableCell>
                                    <div className="text-green-400 font-medium">{formatCurrency(sale.finalSalePrice)}</div>
                                  </TableCell>
                                  <TableCell className="text-white">{sale.soldByName}</TableCell>
                                  <TableCell>
                                    <div className="font-mono text-xs text-blue-300">{sale.receiptNumber}</div>
                                    <div className="text-slate-500 text-xs">QR Code Receipt</div>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      onClick={async () => {
                                        try {
                                          setIsGeneratingReceipt(true);
                                          await generateSalesReceipt(sale);
                                        } catch (error) {
                                          setError('Failed to generate receipt: ' + error.message);
                                        } finally {
                                          setIsGeneratingReceipt(false);
                                        }
                                      }}
                                      variant="outline"
                                      size="sm"
                                      className="border-blue-500/30 hover:bg-blue-500/20"
                                      disabled={isGeneratingReceipt}
                                    >
                                      {isGeneratingReceipt ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                                      ) : (
                                        <FiDownload className="w-4 h-4 mr-2" />
                                      )}
                                      {isGeneratingReceipt ? 'Generating...' : 'Download'}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Faulty Phones Tab - Working without indexes */}
                {activeTab === 'faultyPhones' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                          <FiPhone className="text-white w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="text-white">Faulty Phones - {user?.location}</CardTitle>
                          <CardDescription>Reported faulty devices</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center mb-6">
                        <Button
                          onClick={() => setReportModalOpen(true)}
                          className="bg-linear-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800"
                        >
                          <FiPlus className="w-5 h-5 mr-2" />
                          Report New Faulty Phone
                        </Button>
                      </div>

                      {loading ? (
                        <div className="space-y-4">
                          {[...Array(3)].map((_, i) => (
                            <Skeleton key={i} className="h-32 w-full bg-slate-700/50" />
                          ))}
                        </div>
                      ) : faultyPhones.length === 0 ? (
                        <div className="text-center py-12">
                          <FiPhone className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                          <p className="text-slate-400">No faulty phones reported for {user?.location}</p>
                          <Button
                            onClick={() => setReportModalOpen(true)}
                            className="mt-4 bg-orange-600 hover:bg-orange-700"
                          >
                            <FiPlus className="w-4 h-4 mr-2" />
                            Report First Faulty Phone
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {faultyPhones.map((faulty) => (
                            <Card key={faulty.id} className="bg-slate-800/30 border-slate-700">
                              <CardContent className="p-6">
                                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
                                  <div className="space-y-3">
                                    <div className="flex items-center space-x-3">
                                      <span className="font-semibold text-white">{faulty.brand} {faulty.model}</span>
                                      <Badge className={getStatusBadgeColor(faulty.status)}>
                                        {faulty.status}
                                      </Badge>
                                    </div>
                                    <div className="text-slate-400 text-sm">
                                      <span className="text-slate-300">Item Code: {faulty.itemCode}</span>
                                      {faulty.imei && <span className="ml-4">IMEI: {faulty.imei}</span>}
                                    </div>
                                    <div className="text-slate-500 text-sm">
                                      Reported on {faulty.reportedAt?.toDate().toLocaleDateString()} by {faulty.reportedByName}
                                    </div>
                                    {faulty.faultDescription && (
                                      <div className="text-slate-400 text-sm">
                                        <span className="text-slate-300">Issue: </span>
                                        {faulty.faultDescription}
                                      </div>
                                    )}
                                  </div>
                                  <div className="lg:text-right">
                                    <div className="text-slate-300 text-lg font-medium">
                                      {formatCurrency(faulty.reportedCost)}
                                    </div>
                                    <div className="text-slate-500 text-sm">Reported Cost</div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Installments Tab - Working without indexes */}
                {activeTab === 'installments' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                          <FiCreditCard className="text-white w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="text-white">Installment Plans - {user?.location}</CardTitle>
                          <CardDescription>Active installment payment plans</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center mb-6">
                        <Button
                          onClick={() => setInstallmentModalOpen(true)}
                          className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
                        >
                          <FiPlus className="w-5 h-5 mr-2" />
                          Create New Installment Plan
                        </Button>
                      </div>

                      {loading ? (
                        <div className="space-y-4">
                          {[...Array(3)].map((_, i) => (
                            <Skeleton key={i} className="h-32 w-full bg-slate-700/50" />
                          ))}
                        </div>
                      ) : installments.length === 0 ? (
                        <div className="text-center py-12">
                          <FiCreditCard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                          <p className="text-slate-400">No installment plans created for {user?.location}</p>
                          <Button
                            onClick={() => setInstallmentModalOpen(true)}
                            className="mt-4 bg-purple-600 hover:bg-purple-700"
                          >
                            <FiPlus className="w-4 h-4 mr-2" />
                            Create First Installment Plan
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {installments.map((installment) => (
                            <Card key={installment.id} className="bg-slate-800/30 border-slate-700">
                              <CardContent className="p-6">
                                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
                                  <div className="space-y-3">
                                    <div className="flex items-center space-x-3">
                                      <span className="font-semibold text-white">{installment.customerName}</span>
                                      <Badge className={getInstallmentStatusBadge(installment.status)}>
                                        {installment.status}
                                      </Badge>
                                    </div>
                                    <div className="text-slate-400 text-sm">
                                      <span className="text-slate-300">Phone: {installment.phoneNumber}</span>
                                      <span className="ml-4">Plan: {installment.installmentPlan} months</span>
                                    </div>
                                    <div className="text-slate-500 text-sm">
                                      Created on {installment.createdAt?.toDate().toLocaleDateString()}
                                    </div>
                                  </div>
                                  <div className="lg:text-right space-y-2">
                                    <div>
                                      <div className="text-slate-300 text-lg font-medium">
                                        {formatCurrency(installment.totalAmount)}
                                      </div>
                                      <div className="text-slate-500 text-sm">Total Amount</div>
                                    </div>
                                    <div>
                                      <div className="text-green-400 text-sm">
                                        {formatCurrency(installment.remainingAmount)} remaining
                                      </div>
                                      <div className="text-slate-500 text-xs">
                                        {installment.monthlyPayment > 0 && 
                                          `${formatCurrency(installment.monthlyPayment)}/month`}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Stock Transfer Tab - FIXED Select Error */}
                {activeTab === 'transfer' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-green-500 to-green-600 flex items-center justify-center">
                          <FiTruck className="text-white w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="text-white">Stock Transfer Requests</CardTitle>
                          <CardDescription>Request stock from other locations</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Request Form */}
                      <Card className="bg-slate-800/30 border-slate-700 mb-8">
                        <CardContent className="p-6">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <Label className="text-slate-300">Item Code *</Label>
                              <Input
                                type="text"
                                placeholder="Enter item code"
                                value={transferStock.itemCode}
                                onChange={(e) => setTransferStock({...transferStock, itemCode: e.target.value})}
                                className="bg-slate-800/50 border-slate-600 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300">Quantity *</Label>
                              <Input
                                type="number"
                                min="1"
                                placeholder="Enter quantity"
                                value={transferStock.quantity}
                                onChange={(e) => setTransferStock({...transferStock, quantity: e.target.value})}
                                className="bg-slate-800/50 border-slate-600 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300">From Location</Label>
                              <div className="px-4 py-3.5 bg-slate-800/50 border border-slate-600 rounded-md text-slate-300">
                                {user?.location} (Your Location)
                              </div>
                            </div>
                            <div>
                              <Label className="text-slate-300">To Location *</Label>
                              <Select
                                value={transferStock.toLocation}
                                onValueChange={(value) => setTransferStock({...transferStock, toLocation: value})}
                              >
                                <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                                  <SelectValue placeholder="Select destination" />
                                </SelectTrigger>
                                <SelectContent>
                                  {/* FIXED: Removed empty string SelectItem */}
                                  {LOCATIONS.filter(loc => loc !== user?.location).map((location) => (
                                    <SelectItem key={location} value={location}>{location}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          <Button
                            onClick={handleRequestStock}
                            className="w-full mt-8 bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                          >
                            <FiTruck className="w-5 h-5 mr-2" />
                            Request Stock Transfer
                          </Button>
                        </CardContent>
                      </Card>

                      {/* Recent Requests */}
                      <Card className="bg-slate-800/30 border-slate-700">
                        <CardHeader>
                          <CardTitle className="text-lg">Recent Transfer Requests</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {loading ? (
                            <div className="space-y-4">
                              {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="h-32 w-full bg-slate-700/50" />
                              ))}
                            </div>
                          ) : stockRequests.length === 0 ? (
                            <div className="text-center py-8">
                              <FiTruck className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                              <p className="text-slate-400">No transfer requests made from {user?.location}</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {stockRequests.slice(0, 5).map((request) => (
                                <Card key={request.id} className="bg-slate-900/30 border-slate-700">
                                  <CardContent className="p-5">
                                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0">
                                      <div className="space-y-3">
                                        <div className="flex items-center space-x-3">
                                          <span className="font-semibold text-white">{request.itemCode}</span>
                                          <Badge className={getStatusBadgeColor(request.status)}>
                                            {request.status}
                                          </Badge>
                                        </div>
                                        <div className="text-slate-400 text-sm">
                                          <span className="text-slate-300">{request.quantity} units</span> • 
                                          <span className="text-blue-400 mx-2">{request.fromLocation}</span>
                                          <FiArrowRight className="inline text-slate-500 mx-1" />
                                          <span className="text-green-400 mx-2">{request.toLocation}</span>
                                        </div>
                                        <div className="text-slate-500 text-xs">
                                          Requested on {request.requestedAt?.toDate().toLocaleDateString()}
                                        </div>
                                      </div>
                                      <div className="lg:text-right">
                                        <div className="text-slate-300 text-sm font-medium">
                                          {request.status === 'pending' ? '⏳ Awaiting Approval' : 
                                          request.status === 'approved' ? '✅ Approved' : 
                                          request.status === 'rejected' ? '❌ Rejected' : 
                                          request.status === 'completed' ? '✅ Completed' : ''}
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </CardContent>
                  </Card>
                )}

                {/* Sales Analysis Tab (same as before) */}
                {activeTab === 'salesAnalysis' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                          <FiBarChart2 className="text-white w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="text-white">Sales Analysis - {user?.location}</CardTitle>
                          <CardDescription>Performance metrics and insights</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {sales.length === 0 ? (
                        <div className="text-center py-12">
                          <FiBarChart2 className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                          <p className="text-slate-400">No sales data available for analysis</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Summary Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <Card className="bg-slate-800/30 border-slate-700">
                              <CardContent className="p-6 text-center">
                                <div className="text-3xl font-bold text-green-400">{salesAnalysis.todaySales}</div>
                                <div className="text-slate-400 text-sm">Today's Sales</div>
                                <div className="text-slate-500 text-xs mt-1">{formatCurrency(salesAnalysis.todayRevenue)}</div>
                              </CardContent>
                            </Card>
                            <Card className="bg-slate-800/30 border-slate-700">
                              <CardContent className="p-6 text-center">
                                <div className="text-3xl font-bold text-blue-400">{formatCurrency(salesAnalysis.monthlyRevenue)}</div>
                                <div className="text-slate-400 text-sm">Monthly Revenue</div>
                                <div className="text-slate-500 text-xs mt-1">This Month</div>
                              </CardContent>
                            </Card>
                            <Card className="bg-slate-800/30 border-slate-700">
                              <CardContent className="p-6 text-center">
                                <div className="text-3xl font-bold text-purple-400">{sales.length}</div>
                                <div className="text-slate-400 text-sm">Total Sales</div>
                                <div className="text-slate-500 text-xs mt-1">All Time</div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Top Products */}
                          <Card className="bg-slate-800/30 border-slate-700">
                            <CardHeader>
                              <CardTitle className="text-lg">Top Selling Products</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {salesAnalysis.topProducts.length === 0 ? (
                                <p className="text-slate-400 text-center py-4">No product sales data</p>
                              ) : (
                                <div className="space-y-3">
                                  {salesAnalysis.topProducts.map((product, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                                      <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                          <span className="text-blue-300 font-bold">{index + 1}</span>
                                        </div>
                                        <div>
                                          <div className="text-white font-medium">{product.product}</div>
                                          <div className="text-slate-400 text-xs">{product.count} sales</div>
                                        </div>
                                      </div>
                                      <div className="text-green-400 font-medium">
                                        {formatCurrency(product.revenue)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {/* Sales by User */}
                          <Card className="bg-slate-800/30 border-slate-700">
                            <CardHeader>
                              <CardTitle className="text-lg">Sales Performance by User</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {Object.keys(salesAnalysis.salesByUser).length === 0 ? (
                                <p className="text-slate-400 text-center py-4">No user sales data</p>
                              ) : (
                                <div className="space-y-3">
                                  {Object.entries(salesAnalysis.salesByUser)
                                    .sort(([,a], [,b]) => b - a)
                                    .map(([userName, revenue]) => (
                                      <div key={userName} className="flex items-center justify-between p-3 bg-slate-900/30 rounded-lg">
                                        <div className="flex items-center space-x-3">
                                          <Avatar className="h-8 w-8">
                                            <AvatarFallback className="bg-blue-600">
                                              {userName.charAt(0)}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="text-white font-medium">{userName}</div>
                                        </div>
                                        <div className="text-green-400 font-medium">
                                          {formatCurrency(revenue)}
                                        </div>
                                      </div>
                                    ))
                                  }
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Requests Tab - Working without indexes */}
                {activeTab === 'requests' && (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-xl bg-linear-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                          <FiClipboard className="text-white w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="text-white">Stock Transfer Requests</CardTitle>
                          <CardDescription>View Only - Awaiting Admin/SuperAdmin Approval</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="space-y-4">
                          {[...Array(3)].map((_, i) => (
                            <Skeleton key={i} className="h-32 w-full bg-slate-700/50" />
                          ))}
                        </div>
                      ) : stockRequests.length === 0 ? (
                        <div className="text-center py-12">
                          <FiClipboard className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                          <p className="text-slate-400">No transfer requests made from {user?.location}</p>
                          <Button
                            onClick={() => handleTabChange('transfer')}
                            className="mt-4 bg-orange-600 hover:bg-orange-700"
                          >
                            <FiTruck className="w-4 h-4 mr-2" />
                            Make Your First Request
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {stockRequests.map((request) => (
                            <Card key={request.id} className="bg-slate-800/30 border-slate-700">
                              <CardContent className="p-6">
                                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-6 lg:space-y-0">
                                  <div className="space-y-4">
                                    <div className="flex items-center space-x-3">
                                      <div className="font-semibold text-white text-lg">{request.itemCode}</div>
                                      <Badge className={getStatusBadgeColor(request.status)}>
                                        {request.status}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                      <div>
                                        <div className="text-slate-400 text-sm">Quantity</div>
                                        <div className="text-white text-lg font-semibold">{request.quantity} units</div>
                                      </div>
                                      <div>
                                        <div className="text-slate-400 text-sm">Route</div>
                                        <div className="text-white">
                                          <span className="text-blue-400">{request.fromLocation}</span>
                                          <FiArrowRight className="inline mx-3 text-slate-500" />
                                          <span className="text-green-400">{request.toLocation}</span>
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-slate-400 text-sm">Requested By</div>
                                        <div className="text-white">{request.requestedByName}</div>
                                      </div>
                                    </div>
                                    <div className="text-slate-500 text-sm">
                                      {request.requestedAt?.toDate().toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </main>

          {/* Footer (same as before) */}
          <footer className="w-full py-6 mt-8 border-t border-slate-800 bg-slate-900/30">
            <div className="max-w-full mx-auto px-8">
              <div className="flex flex-col lg:flex-row justify-between items-center">
                <div className="text-center lg:text-left mb-4 lg:mb-0">
                  <p className="text-slate-400">
                    © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
                  </p>
                  <p className="text-slate-500 text-sm mt-1">
                    Manager Dashboard v2.0 • QR Code Receipts • 7 Days Warranty Included
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <FiShield className="text-green-400" />
                  <span className="text-slate-400 text-sm">Secure • QR Code • Professional</span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Report Faulty Phone Modal (same as before) */}
      <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-linear-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <FiAlertTriangle className="text-white w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl text-white">Report Faulty Phone</DialogTitle>
                <DialogDescription>Report a faulty device from your location</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <Label className="text-slate-300">Item Code *</Label>
              <Input
                type="text"
                value={faultyReport.itemCode}
                onChange={(e) => setFaultyReport({...faultyReport, itemCode: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter item code"
              />
            </div>

            <div>
              <Label className="text-slate-300">IMEI (Optional)</Label>
              <Input
                type="text"
                value={faultyReport.imei}
                onChange={(e) => setFaultyReport({...faultyReport, imei: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter IMEI number"
              />
            </div>

            <div className="lg:col-span-2">
              <Label className="text-slate-300">Fault Description *</Label>
              <Textarea
                value={faultyReport.faultDescription}
                onChange={(e) => setFaultyReport({...faultyReport, faultDescription: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white h-40"
                placeholder="Describe the fault in detail..."
              />
            </div>

            <div>
              <Label className="text-slate-300">Customer Name</Label>
              <Input
                type="text"
                value={faultyReport.customerName}
                onChange={(e) => setFaultyReport({...faultyReport, customerName: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <Label className="text-slate-300">Customer Phone</Label>
              <Input
                type="tel"
                value={faultyReport.customerPhone}
                onChange={(e) => setFaultyReport({...faultyReport, customerPhone: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter phone number"
              />
            </div>

            <div>
              <Label className="text-slate-300">Reported Cost (MWK)</Label>
              <Input
                type="number"
                value={faultyReport.reportedCost}
                onChange={(e) => setFaultyReport({...faultyReport, reportedCost: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="0"
              />
            </div>

            <div>
              <Label className="text-slate-300">Status</Label>
              <Select
                value={faultyReport.status}
                onValueChange={(value) => setFaultyReport({...faultyReport, status: value})}
              >
                <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Reported">Reported</SelectItem>
                  <SelectItem value="In Repair">In Repair</SelectItem>
                  <SelectItem value="Fixed">Fixed</SelectItem>
                  <SelectItem value="EOS (End of Service)">EOS (End of Service)</SelectItem>
                  <SelectItem value="Scrapped">Scrapped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              onClick={() => setReportModalOpen(false)}
              variant="outline"
              className="bg-slate-700 hover:bg-slate-600 border-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReportFaultyPhone}
              className="bg-linear-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800"
            >
              <FiPlus className="w-5 h-5 mr-2" />
              Report Faulty
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Installment Modal (same as before) */}
      <Dialog open={installmentModalOpen} onOpenChange={setInstallmentModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-linear-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <FiCreditCard className="text-white w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-2xl text-white">Create Installment Plan</DialogTitle>
                <DialogDescription>Setup payment plan for customer</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            <div>
              <Label className="text-slate-300">Customer Name *</Label>
              <Input
                type="text"
                value={installmentData.customerName}
                onChange={(e) => setInstallmentData({...installmentData, customerName: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <Label className="text-slate-300">Phone Number</Label>
              <Input
                type="tel"
                value={installmentData.phoneNumber}
                onChange={(e) => setInstallmentData({...installmentData, phoneNumber: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter phone number"
              />
            </div>

            <div>
              <Label className="text-slate-300">Total Amount (MWK)</Label>
              <Input
                type="number"
                value={installmentData.totalAmount}
                onChange={(e) => setInstallmentData({...installmentData, totalAmount: e.target.value})}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter total amount"
              />
            </div>

            <div>
              <Label className="text-slate-300">Down Payment (MWK)</Label>
              <Input
                type="number"
                value={installmentData.downPayment}
                onChange={(e) => {
                  const downPayment = parseFloat(e.target.value) || 0;
                  setInstallmentData({
                    ...installmentData,
                    downPayment: downPayment,
                    remainingAmount: installmentData.totalAmount - downPayment
                  });
                }}
                className="bg-slate-800/50 border-slate-600 text-white"
                placeholder="Enter down payment"
              />
            </div>

            <div>
              <Label className="text-slate-300">Installment Plan (Months)</Label>
              <Select
                value={installmentData.installmentPlan}
                onValueChange={(value) => {
                  const months = parseInt(value);
                  const monthlyPayment = (installmentData.totalAmount - installmentData.downPayment) / months;
                  setInstallmentData({
                    ...installmentData,
                    installmentPlan: value,
                    monthlyPayment: monthlyPayment
                  });
                }}
              >
                <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Month</SelectItem>
                  <SelectItem value="2">2 Months</SelectItem>
                  <SelectItem value="3">3 Months</SelectItem>
                  <SelectItem value="4">4 Months</SelectItem>
                  <SelectItem value="5">5 Months</SelectItem>
                  <SelectItem value="6">6 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              onClick={() => setInstallmentModalOpen(false)}
              variant="outline"
              className="bg-slate-700 hover:bg-slate-600 border-slate-600"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateInstallment}
              className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
            >
              <FiCreditCard className="w-5 h-5 mr-2" />
              Create Installment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}