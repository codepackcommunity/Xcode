'use client'
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, getDoc,
  deleteDoc, setDoc, writeBatch
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// React Icons
import {
  FiHome,
  FiBarChart2,
  FiMessageSquare,
  FiTrendingUp,
  FiPackage,
  FiDollarSign,
  FiTruck,
  FiUsers,
  FiUserCheck,
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
  FiPieChart,
  FiGrid,
  FiShoppingBag,
  FiBell,
  FiSearch,
  FiSave,
  FiPrinter,
  FiShield,
  FiAlertTriangle,
  FiGlobe,
  FiMail,
  FiDatabase,
  FiServer,
  FiTag,
  FiPercent,
  FiTool,
  FiUser,
  FiKey,
  FiHeart,
  FiThumbsUp,
  FiThumbsDown,
  FiMonitor,
  FiSmartphone,
  FiTablet,
  FiPlay,
  FiPause,
  FiList,
  FiLayout,
  FiSidebar,
  FiChevronRight,
  FiChevronLeft,
  FiChevronDown,
  FiChevronUp,
  FiEye,
  FiEdit2,
  FiUpload,
  FiCopy,
  FiLock,
  FiUnlock,
  FiRadio,
  FiCamera,
  FiMusic,
  FiFilm,
  FiAward,
  FiGift,
  FiNavigation,
  FiTarget,
  FiFlag,
  FiLayers
} from 'react-icons/fi';

// shadcn/ui components - You'll need to install these
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
import { Checkbox } from "@/components/ui/checkbox"
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
import { Textarea as ShadTextarea } from "@/components/ui/textarea"

// Available locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'TV', 'Audio', 'Other'];

// Safe key generator
const generateSafeKey = (prefix = 'item', index, id) => {
  if (id) {
    return `${prefix}-${id}`;
  }
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Initialize database collections
const initializeDatabaseCollections = async (user) => {
  try {
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
    return false;
  }
};

export default function SuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  // New Stock State
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
  const [generatedReport, setGeneratedReport] = useState(null);

  // Error State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [addStockOpen, setAddStockOpen] = useState(false);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

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
    if (score >= 80) return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    if (score >= 40) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    return 'bg-red-500/20 text-red-300 border-red-500/30';
  };

  const getTrendIcon = (trend) => {
    if (trend === 'up') return <FiTrendingUp className="w-4 h-4" />;
    if (trend === 'down') return <FiTrendingUp className="w-4 h-4 transform rotate-180" />;
    return <FiTrendingUp className="w-4 h-4 text-gray-400" />;
  };

  const getTrendColor = (trend) => {
    if (trend === 'up') return 'text-green-400';
    if (trend === 'down') return 'text-red-400';
    return 'text-gray-400';
  };

  // Navigation items
  const navItems = [
    { id: 'dashboard', name: 'Dashboard', icon: <FiHome className="w-5 h-5" /> },
    { id: 'salesReport', name: 'Sales Report', icon: <FiBarChart2 className="w-5 h-5" /> },
    { id: 'locationPerformance', name: 'Location Performance', icon: <FiTrendingUp className="w-5 h-5" /> },
    { id: 'stocks', name: 'Stock Management', icon: <FiPackage className="w-5 h-5" /> },
    { id: 'sales', name: 'Sales Analysis Report', icon: <FiDollarSign className="w-5 h-5" /> },
    { id: 'transfer', name: 'Stock Transfer', icon: <FiTruck className="w-5 h-5" /> },
    { id: 'personnel', name: 'Personnel Management', icon: <FiUsers className="w-5 h-5" /> },
    { id: 'approvals', name: 'User Approvals', icon: <FiUserCheck className="w-5 h-5" />, count: pendingUsers.length },
    { id: 'requests', name: 'Stock Requests', icon: <FiClipboard className="w-5 h-5" />, count: stockRequests.length },
    { id: 'approvalSettings', name: 'Approval Settings', icon: <FiSettings className="w-5 h-5" /> }
  ];

  // Update the externalLinks to use onClick handlers instead of href
  const externalLinks = [
    { name: 'Operations', icon: <FiMessageSquare className="w-5 h-5" />, route: '/operations' },
    { name: 'Manage', icon: <FiTool className="w-5 h-5" />, route: '/manage' },
    { name: 'Shops', icon: <FiHome className="w-5 h-5" />, route: '/shops' }
  ];

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
      return;
    }
  }, []);

  const fetchUserApprovals = useCallback(async () => {
    try {
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
      const wb = XLSX.utils.book_new();
      
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
      
      const locationText = selectedLocation === 'all' ? 'all_locations' : selectedLocation;
      const filename = `KM_Stock_Inventory_${locationText}_${new Date().getTime()}.xlsx`;
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
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('Stock Inventory Report', pageWidth / 2, 28, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 38);
      doc.text(`Location: ${selectedLocation === 'all' ? 'All Locations' : selectedLocation}`, 20, 45);
      doc.text(`Total Items: ${filteredStocks.length}`, pageWidth - 20, 38, { align: 'right' });
      
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
        margin: { top: 55 }
      });
      
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
      
      const productKey = `${sale.brand || 'Unknown'} - ${sale.model || 'Unknown'}`;
      summary[location].productCount[productKey] = (summary[location].productCount[productKey] || 0) + 1;
      
      const seller = sale.soldByName || sale.soldBy || 'Unknown';
      summary[location].sellerCount[seller] = (summary[location].sellerCount[seller] || 0) + 1;
    });
    
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
      
      const allProducts = {};
      filteredSales.forEach(sale => {
        const productKey = `${sale.brand || 'Unknown'} - ${sale.model || 'Unknown'}`;
        allProducts[productKey] = (allProducts[productKey] || 0) + 1;
      });
      const topProducts = Object.entries(allProducts)
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      const allSellers = {};
      filteredSales.forEach(sale => {
        const seller = sale.soldByName || sale.soldBy || 'Unknown';
        allSellers[seller] = (allSellers[seller] || 0) + 1;
      });
      const topSellers = Object.entries(allSellers)
        .map(([seller, count]) => ({ seller, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
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

  const handleGenerateReport = async () => {
    if (!reportFilters.startDate && !reportFilters.endDate) {
      const confirm = window.confirm('No date range selected. Generate report for all sales data?');
      if (!confirm) return;
    }
    
    setIsGeneratingReport(true);
    setError(null);
    
    try {
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
      
      setGeneratedReport(reportData);
      
      const format = window.confirm('Download as Excel (XLSX) file?\nClick OK for Excel, Cancel for CSV.');
      
      if (format) {
        // Excel download logic here
      } else {
        // CSV download logic here
      }
      
      setSuccess(`Report downloaded successfully!\n\nTotal Records: ${reportData.totalSales}\nTotal Revenue: ${formatCurrency(reportData.totalRevenue)}`);
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
      
      setGeneratedReport(reportData);
      setSuccess(`Report generated successfully!\n\nTotal Records: ${reportData.totalSales}\nTotal Revenue: ${formatCurrency(reportData.totalRevenue)}`);
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

  // Stock Request Approval
  const handleApproveStockRequest = async (requestId, requestData) => {
    if (processingRequest === requestId) return;
    
    setProcessingRequest(requestId);
    setError(null);
    
    try {
      if (!requestData.itemCode || !requestData.quantity || !requestData.fromLocation || !requestData.toLocation) {
        setError('Invalid request data. Missing required fields.');
        return;
      }

      if (requestData.quantity <= 1) {
        setError('Cannot approve: Quantity must be greater than 1');
        return;
      }

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

      const batch = writeBatch(db);

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

      const destStockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', requestData.itemCode),
        where('location', '==', requestData.toLocation)
      );

      const destStockSnapshot = await getDocs(destStockQuery);

      if (destStockSnapshot.empty) { 
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

      batch.update(doc(db, 'stockRequests', requestId), {
        status: 'approved',
        approvedBy: user.uid,
        approvedByName: user.fullName || user.email,
        approvedAt: serverTimestamp(),
        sourceStockId: sourceStockDoc.id,
        processedAt: serverTimestamp()
      });

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

      await batch.commit();

      setSuccess('Stock request approved and quantities updated successfully!');
    } catch (error) {
      setError('Failed to approve stock request: ' + error.message);
      
      try {
        await updateDoc(doc(db, 'stockRequests', requestId), {
          status: 'failed',
          error: error.message,
          failedAt: serverTimestamp()
        });
      } catch (updateError) {
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

  // Stock Management Functions
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
      setAddStockOpen(false);
      
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
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', transferStock.itemCode.trim()),
        where('location', '==', transferStock.fromLocation)
      );
      const stockSnapshot = await getDocs(stockQuery);
      const stockDoc = stockSnapshot.docs[0];
      const stockData = stockDoc.data();
      
      const requestData = {
        itemCode: transferStock.itemCode.trim(),
        brand: stockData.brand,
        model: stockData.model,
        quantity: parseInt(transferStock.quantity),
        fromLocation: transferStock.fromLocation,
        toLocation: transferStock.toLocation,
        status: 'pending',
        requestedBy: user.uid,
        requestedByName: user.fullName || user.email,
        requestedAt: serverTimestamp(),
        sourceStockId: stockDoc.id
      };

      await addDoc(collection(db, 'stockRequests'), requestData);
      
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
              await initializeDatabaseCollections(userData);
              await initializeDashboard();
            } else {
              router.push('/dashboard');
            }
          } else {
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

  // Add this useEffect to detect screen size
  useEffect(() => {
    const checkIfMobile = () => {
      const mobile = window.innerWidth < 1024; // lg breakpoint
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true); // Always open on desktop
      } else {
        setIsSidebarOpen(false); // Always closed on mobile by default
      }
    };

    // Initial check
    checkIfMobile();

    // Add event listener
    window.addEventListener('resize', checkIfMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Add this effect to prevent body scrolling when mobile sidebar is open
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

  // Add this function to handle sidebar toggle
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Loading SuperAdmin Dashboard...</div>
      </div>
    );
  }

  // Desktop Sidebar Component
  const DesktopSidebar = () => (
    <div className={`hidden lg:flex lg:shrink-0 transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-0'}`}>
      <div className="flex flex-col w-64">
        <div className="flex flex-col grow bg-gray-900 border-r border-gray-800 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center justify-between shrink-0 px-4">
            <div className="flex items-center">
              <FiShoppingBag className="h-8 w-8 text-purple-500" />
              <div className="ml-3">
                <h1 className="text-xl font-bold text-white">KM ELECTRONICS</h1>
                <p className="text-xs text-gray-400">SuperAdmin Panel</p>
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
                  onClick={() => {
                    setActiveTab(item.id);
                    if (isMobile) setIsSidebarOpen(false);
                  }}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full justify-between ${
                    activeTab === item.id
                      ? 'bg-purple-900/30 text-white border-l-4 border-purple-500'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center">
                    {item.icon}
                    <span className="ml-3">{item.name}</span>
                  </div>
                  {item.count > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                      {item.count}
                    </span>
                  )}
                </button>
              ))}
              {/* External Links Section */}
              <div className="pt-2">
                {externalLinks.map((link) => (
                  <button
                    key={link.name}
                    onClick={() => {
                      router.push(link.route);
                      if (isMobile) setIsSidebarOpen(false);
                    }}
                    className="group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    {link.icon}
                    <span className="ml-3">{link.name}</span>
                    <FiChevronRight className="ml-auto h-4 w-4 text-gray-400 group-hover:text-white" />
                  </button>
                ))}
              </div>
            </nav>
          </div>
          <div className="shrink-0 flex border-t border-gray-800 p-4">
            <div className="flex items-center">
              <Avatar>
                <AvatarFallback className="bg-purple-600">
                  {user?.fullName?.charAt(0) || 'A'}
                </AvatarFallback>
              </Avatar>
              <div className="ml-3">
                <p className="text-sm font-medium text-white">{user?.fullName}</p>
                <p className="text-xs text-gray-400">Super Admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Mobile Navigation Trigger Component
  const MobileNavTrigger = () => (
    <Button 
      variant="ghost" 
      size="icon" 
      className="lg:hidden"
      onClick={() => setIsSidebarOpen(true)}
    >
      <FiMenu className="h-6 w-6 text-white" />
    </Button>
  );

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Error Display */}
      {error && (
        <div className="fixed top-4 right-4 z-50">
          <Alert variant="destructive" className="w-96">
            <FiAlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
      
      {/* Success Display */}
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
        {/* Desktop Sidebar */}
        <DesktopSidebar />
        
        {/* Mobile Sidebar (Sheet) */}
        <Sheet open={isSidebarOpen && isMobile} onOpenChange={setIsSidebarOpen}>
          <SheetContent side="left" className="w-64 bg-gray-900 border-r border-gray-800 p-0 sm:max-w-xs">
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
              <div className="flex items-center">
                <FiShoppingBag className="h-8 w-8 text-purple-500" />
                <div className="ml-3">
                  <h1 className="text-xl font-bold text-white">KM MGNT</h1>
                  <p className="text-xs text-gray-400">SuperAdmin Panel</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsSidebarOpen(false)}
              >
                <FiX className="h-5 w-5 text-white" />
              </Button>
            </div>
            <ScrollArea className="h-[calc(100vh-4rem)]">
              <div className="p-4 space-y-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab(item.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full justify-between ${
                      activeTab === item.id
                        ? 'bg-purple-900/30 text-white border-l-4 border-purple-500'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center">
                      {item.icon}
                      <span className="ml-3">{item.name}</span>
                    </div>
                    {item.count > 0 && (
                      <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                        {item.count}
                      </span>
                    )}
                  </button>
                ))}
                {/* External Links in Mobile */}
                <div className="pt-2">
                  {externalLinks.map((link) => (
                    <button
                      key={link.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(link.route);
                        setIsSidebarOpen(false);
                      }}
                      className="group flex items-center px-2 py-2 text-sm font-medium rounded-md w-full text-gray-300 hover:bg-gray-800 hover:text-white"
                    >
                      {link.icon}
                      <span className="ml-3">{link.name}</span>
                      <FiChevronRight className="ml-auto h-4 w-4 text-gray-400 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-gray-800">
                <div className="flex items-center">
                  <Avatar>
                    <AvatarFallback className="bg-purple-600">
                      {user?.fullName?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-white">{user?.fullName}</p>
                    <p className="text-xs text-gray-400">Super Admin</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <div className="lg:hidden sticky top-0 z-40 bg-gray-900 border-b border-gray-800">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center">
                <MobileNavTrigger />
                <div className="ml-4">
                  <h1 className="text-lg font-semibold text-white">KM ELECTRONICS</h1>
                  <p className="text-xs text-gray-400">SuperAdmin</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {LOCATIONS.map((location) => (
                      <SelectItem key={location} value={location}>{location}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-purple-600">
                          {user?.fullName?.charAt(0) || 'A'}
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
          </div>
          
          {/* Desktop Header */}
          <div className="hidden lg:block sticky top-0 z-40 bg-gray-900/80 backdrop-blur-lg border-b border-gray-800">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleSidebar}
                  className="mr-4"
                >
                  <FiMenu className="h-6 w-6 text-white" />
                </Button>
                <div>
                  <h1 className="text-xl font-semibold text-white">
                    {navItems.find(item => item.id === activeTab)?.name || 'Dashboard'}
                  </h1>
                  <p className="text-sm text-gray-400">
                    Welcome, {user?.fullName} | System Administrator
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {LOCATIONS.map((location) => (
                      <SelectItem key={location} value={location}>{location}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-purple-600">
                          {user?.fullName?.charAt(0) || 'A'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                        <p className="text-xs leading-none text-gray-500">
                          {user?.email}
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

          {/* Main Content Area */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Analytics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-400">Today's Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-400">{realTimeSales.todaySales}</div>
                      <p className="text-xs text-gray-500 mt-1">{formatCurrency(realTimeSales.todayRevenue)}</p>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-400">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-400">
                        {formatCurrency(salesAnalysis.totalRevenue)}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-400">Monthly Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-purple-400">
                        {formatCurrency(salesAnalysis.monthlyRevenue)}
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-400">Pending Requests</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-400">
                        {stockRequests.length + pendingUsers.length}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Location Performance Overview */}
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-white">Location Performance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data]) => (
                          <div key={location} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <div className={`w-3 h-3 rounded-full ${
                                data.score >= 80 ? 'bg-green-500' :
                                data.score >= 60 ? 'bg-yellow-500' :
                                data.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                              }`} />
                              <span className="text-white font-medium">{location}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={getTrendColor(data.trend)}>
                                {getTrendIcon(data.trend)}
                              </span>
                              <span className={`text-lg font-bold ${getPerformanceColor(data.score)}`}>
                                {data.score}%
                              </span>
                              <Badge variant="outline" className={getPerformanceBadge(data.score)}>
                                {data.grade}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Live Sales Feed */}
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-white">Live Sales Feed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-80">
                        <div className="space-y-3">
                          {realTimeSales.liveSales.map((sale) => (
                            <div key={sale.id} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-lg">
                              <div>
                                <div className="text-white font-medium">{sale.brand} {sale.model}</div>
                                <div className="text-gray-400 text-sm">
                                  {sale.location} • {sale.soldByName}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-green-400 font-semibold">{formatCurrency(sale.finalSalePrice)}</div>
                                <div className="text-gray-500 text-xs">
                                  {sale.soldAt?.toDate().toLocaleTimeString() || 'Just now'}
                                </div>
                              </div>
                            </div>
                          ))}
                          {realTimeSales.liveSales.length === 0 && (
                            <p className="text-gray-400 text-center py-4">No sales today</p>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue by Location */}
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white">Revenue by Location</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {Object.entries(salesAnalysis.revenueByLocation).map(([location, revenue]) => (
                        <Card key={location} className="bg-gray-900/50 border-gray-700">
                          <CardContent className="p-4 text-center">
                            <h3 className="text-gray-400 text-sm">{location}</h3>
                            <p className="text-lg font-bold text-green-400">
                              {formatCurrency(revenue)}
                            </p>
                            {salesAnalysis.locationPerformance?.[location] && (
                              <p className={`text-xs mt-1 ${getPerformanceColor(salesAnalysis.locationPerformance[location].score)}`}>
                                {salesAnalysis.locationPerformance[location].score}%
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sales Report Tab */}
            {activeTab === 'salesReport' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-white">Real-time Sales Report</CardTitle>
                    <Select value={timePeriod} onValueChange={setTimePeriod}>
                      <SelectTrigger className="w-48 bg-gray-700 border-gray-600 text-white">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                        <SelectItem value="year">This Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Sales Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-6 text-center">
                        <div className="text-2xl font-bold text-green-400">{realTimeSales.todaySales}</div>
                        <div className="text-gray-400 text-sm">Today's Sales</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-6 text-center">
                        <div className="text-2xl font-bold text-blue-400">
                          {formatCurrency(realTimeSales.todayRevenue)}
                        </div>
                        <div className="text-gray-400 text-sm">Today's Revenue</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-6 text-center">
                        <div className="text-2xl font-bold text-purple-400">
                          {salesAnalysis.totalSales}
                        </div>
                        <div className="text-gray-400 text-sm">Total Sales</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-6 text-center">
                        <div className="text-2xl font-bold text-orange-400">
                          {formatCurrency(salesAnalysis.totalRevenue)}
                        </div>
                        <div className="text-gray-400 text-sm">Total Revenue</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Hourly Sales Chart */}
                  <Card className="bg-gray-900/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-white">Today's Hourly Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
                        {Array.from({ length: 12 }, (_, i) => i + 8).map((hour) => (
                          <div key={hour} className="text-center">
                            <div className="text-gray-400 text-xs mb-1">{hour}:00</div>
                            <div className="bg-blue-500/20 rounded-lg p-2">
                              <div className="text-blue-300 text-sm font-semibold">
                                {formatCurrency((realTimeSales.hourlySales[hour] || 0) / 1000)}K
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Location-wise Breakdown */}
                  <Card className="bg-gray-900/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-white">Location Performance Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-700">
                            <TableHead className="text-gray-300">Location</TableHead>
                            <TableHead className="text-gray-300">Today's Revenue</TableHead>
                            <TableHead className="text-gray-300">Weekly Revenue</TableHead>
                            <TableHead className="text-gray-300">Performance</TableHead>
                            <TableHead className="text-gray-300">Grade</TableHead>
                            <TableHead className="text-gray-300">Trend</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data]) => (
                            <TableRow key={location} className="border-gray-700">
                              <TableCell className="font-medium text-white">{location}</TableCell>
                              <TableCell>{formatCurrency(data.metrics.todayRevenue)}</TableCell>
                              <TableCell>{formatCurrency(data.metrics.weeklyRevenue)}</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Progress value={data.score} className="w-24" />
                                  <span className={`font-semibold ${getPerformanceColor(data.score)}`}>
                                    {data.score}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={getPerformanceBadge(data.score)}>
                                  {data.grade}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className={getTrendColor(data.trend)}>
                                  {getTrendIcon(data.trend)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            )}

            {/* Stock Management Tab */}
            {activeTab === 'stocks' && (
              <div className="space-y-6">
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-white">
                        Stock Management - {selectedLocation === 'all' ? 'All Locations' : selectedLocation}
                      </CardTitle>
                      <div className="flex items-center space-x-4">
                        <div className="text-white">
                          Total Value: {formatCurrency(calculateTotalStockValue())}
                        </div>
                        <Dialog open={addStockOpen} onOpenChange={setAddStockOpen}>
                          <DialogTrigger asChild>
                            <Button>
                              <FiPlus className="mr-2 h-4 w-4" />
                              Add Stock
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Add New Stock</DialogTitle>
                              <DialogDescription>
                                Add new stock items to the inventory.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="brand">Brand</Label>
                                <Input
                                  id="brand"
                                  value={newStock.brand}
                                  onChange={(e) => setNewStock({...newStock, brand: e.target.value})}
                                  placeholder="Enter brand"
                                />
                                {stockErrors.brand && <p className="text-red-400 text-sm">{stockErrors.brand}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="model">Model</Label>
                                <Input
                                  id="model"
                                  value={newStock.model}
                                  onChange={(e) => setNewStock({...newStock, model: e.target.value})}
                                  placeholder="Enter model"
                                />
                                {stockErrors.model && <p className="text-red-400 text-sm">{stockErrors.model}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="itemCode">Item Code</Label>
                                <Input
                                  id="itemCode"
                                  value={newStock.itemCode}
                                  onChange={(e) => setNewStock({...newStock, itemCode: e.target.value})}
                                  placeholder="Enter item code"
                                />
                                {stockErrors.itemCode && <p className="text-red-400 text-sm">{stockErrors.itemCode}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="quantity">Quantity</Label>
                                <Input
                                  id="quantity"
                                  type="number"
                                  value={newStock.quantity}
                                  onChange={(e) => setNewStock({...newStock, quantity: e.target.value})}
                                  placeholder="Enter quantity"
                                />
                                {stockErrors.quantity && <p className="text-red-400 text-sm">{stockErrors.quantity}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="location">Location</Label>
                                <Select value={newStock.location} onValueChange={(value) => setNewStock({...newStock, location: value})}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select location" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LOCATIONS.map((location) => (
                                      <SelectItem key={location} value={location}>{location}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {stockErrors.location && <p className="text-red-400 text-sm">{stockErrors.location}</p>}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="costPrice">Cost Price (MWK)</Label>
                                <Input
                                  id="costPrice"
                                  type="number"
                                  value={newStock.costPrice}
                                  onChange={(e) => setNewStock({...newStock, costPrice: e.target.value})}
                                  placeholder="Enter cost price"
                                />
                                {stockErrors.costPrice && <p className="text-red-400 text-sm">{stockErrors.costPrice}</p>}
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setAddStockOpen(false)}>
                                Cancel
                              </Button>
                              <Button onClick={handleAddStock}>
                                <FiPlus className="mr-2 h-4 w-4" />
                                Add Stock
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button onClick={handleDownloadStockList} variant="outline">
                          <FiDownload className="mr-2 h-4 w-4" />
                          Download Stock List
                        </Button>
                      </div>
                    </div>
                    </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-600px">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-700">
                            <TableHead className="text-gray-300">Location</TableHead>
                            <TableHead className="text-gray-300">Item Code</TableHead>
                            <TableHead className="text-gray-300">Brand & Model</TableHead>
                            <TableHead className="text-gray-300">Category</TableHead>
                            <TableHead className="text-gray-300">Cost Price</TableHead>
                            <TableHead className="text-gray-300">Retail Price</TableHead>
                            <TableHead className="text-gray-300">Quantity</TableHead>
                            <TableHead className="text-gray-300">Total Value</TableHead>
                            <TableHead className="text-gray-300">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getFilteredStocks().map((stock) => {
                            const isLowStock = (stock.quantity || 0) <= (stock.minStockLevel || 5) && (stock.quantity || 0) > 0;
                            
                            return (
                              <TableRow key={stock.id} className={`border-gray-700 ${isLowStock ? 'bg-orange-900/20' : ''}`}>
                                <TableCell>
                                  <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                                    {stock.location}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-white">{stock.itemCode}</TableCell>
                                <TableCell className="text-white">{stock.brand} {stock.model}</TableCell>
                                <TableCell className="text-white">{stock.category || 'N/A'}</TableCell>
                                <TableCell className="text-white">{formatCurrency(stock.costPrice || 0)}</TableCell>
                                <TableCell className="text-white">{formatCurrency(stock.retailPrice || 0)}</TableCell>
                                <TableCell>
                                  <div className={`${isLowStock ? 'text-orange-400 font-semibold' : 'text-white'}`}>
                                    {stock.quantity || 0}
                                    {isLowStock && (
                                      <Badge variant="outline" className="ml-2 bg-orange-500/20 text-orange-300 border-orange-500/30">
                                        Low
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-white">{formatCurrency((stock.costPrice || 0) * (stock.quantity || 0))}</TableCell>
                                <TableCell>
                                  <div className="flex space-x-2">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="outline" size="sm" onClick={() => handleUpdateStock(stock.id, { quantity: (stock.quantity || 0) + 1 })}>
                                            <FiPlus className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Add 1 to quantity</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="outline" size="sm" onClick={() => handleUpdateStock(stock.id, { quantity: Math.max(0, (stock.quantity || 0) - 1)})}>
                                            <FiMinus className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Remove 1 from quantity</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="destructive" size="sm" onClick={() => handleDeleteStock(stock.id)}>
                                            <FiTrash2 className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Delete stock item</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Stock Requests Tab */}
            {activeTab === 'requests' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-white">Stock Request Approval System</CardTitle>
                    <div className="flex space-x-2">
                      {stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length > 0 && (
                        <Button variant="outline" onClick={handleAutoApprove}>
                          <FiCheckSquare className="mr-2 h-4 w-4" />
                          Auto-Approve ({stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length})
                        </Button>
                      )}
                      <Button onClick={() => handleBulkApprove(stockRequests.filter(req => req.quantity > 1))}>
                        <FiCheck className="mr-2 h-4 w-4" />
                        Bulk Approve All
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {stockRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <FiClipboard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending stock requests.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {stockRequests.map((request) => (
                        <Card key={request.id} className="bg-gray-900/50 border-gray-700">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="flex items-center space-x-3 mb-2">
                                  <h3 className="font-semibold text-white">Item: {request.itemCode}</h3>
                                  {request.quantity <= approvalSettings.autoApproveBelow && request.quantity > 1 && (
                                    <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                                      <FiCheck className="mr-1 h-3 w-3" />
                                      Auto-Approval Eligible
                                    </Badge>
                                  )}
                                  {request.quantity <= 1 && (
                                    <Badge variant="destructive">
                                      <FiAlertTriangle className="mr-1 h-3 w-3" />
                                      Requires Manual Review (Quantity ≤ 1)
                                    </Badge>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-gray-400">Quantity: </span>
                                    <span className={request.quantity > 1 ? "text-white" : "text-red-400 font-semibold"}>
                                      {request.quantity}
                                      {request.quantity <= 1 && <span className="text-xs ml-1">Out of stock</span>}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">From: </span>
                                    <span className="text-blue-300">{request.fromLocation}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">To: </span>
                                    <span className="text-green-300">{request.toLocation}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">Requested by: </span>
                                    <span className="text-white">{request.requestedByName}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-400">Requested at: </span>
                                    <span className="text-gray-500">
                                      {request.requestedAt?.toDate().toLocaleString() || 'Unknown date'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex space-x-2 ml-4">
                                <Button
                                  onClick={() => handleApproveStockRequest(request.id, request)}
                                  disabled={processingRequest === request.id || request.quantity <= 1}
                                  variant={request.quantity <= 1 ? "outline" : "default"}
                                >
                                  {processingRequest === request.id ? (
                                    <>
                                      <FiRefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                      Processing...
                                    </>
                                  ) : (
                                    <>
                                      <FiCheck className="mr-2 h-4 w-4" />
                                      Approve
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleRejectStockRequest(request.id, request)}
                                >
                                  <FiXCircle className="mr-2 h-4 w-4" />
                                  Reject
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Request Statistics */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-white">{stockRequests.length}</div>
                        <div className="text-gray-400 text-sm">Total Pending</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-400">
                          {stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length}
                        </div>
                        <div className="text-gray-400 text-sm">Auto-Approval Eligible</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-orange-400">
                          {stockRequests.filter(req => req.quantity > approvalSettings.autoApproveBelow).length}
                        </div>
                        <div className="text-gray-400 text-sm">Manual Review Needed</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-400">
                          {stockRequests.filter(req => req.quantity <= 1).length}
                        </div>
                        <div className="text-gray-400 text-sm">Quantity ≤ 1</div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* User Approvals Tab */}
            {activeTab === 'approvals' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-white">User Access Approvals</CardTitle>
                    {pendingUsers.length > 0 && (
                      <Button onClick={() => handleBulkApproveUsers(pendingUsers)}>
                        <FiCheck className="mr-2 h-4 w-4" />
                        Bulk Approve All ({pendingUsers.length})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Pending Approvals */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-white mb-4">Pending User Approvals</h3>
                    {pendingUsers.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <FiUserCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No pending user approvals.</p>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {pendingUsers.map((userItem) => (
                          <Card key={userItem.id} className="bg-gray-900/50 border-gray-700">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3 mb-2">
                                    <h4 className="font-semibold text-white">{userItem.fullName}</h4>
                                    <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                                      Pending Approval
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                                    <div>
                                      <span className="text-gray-400">Email: </span>
                                      <span className="text-white">{userItem.email}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Requested Role: </span>
                                      <span className="text-blue-300 capitalize">{userItem.role}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Location: </span>
                                      <span className="text-green-300">{userItem.location || 'Not specified'}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-400">Registered: </span>
                                      <span className="text-gray-500">
                                        {userItem.createdAt?.toDate().toLocaleDateString() || 'Unknown date'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex space-x-2 ml-4">
                                  <Button
                                    onClick={() => handleApproveUser(userItem.id, userItem)}
                                    disabled={processingUser === userItem.id}
                                  >
                                    {processingUser === userItem.id ? (
                                      <>
                                        <FiRefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                        Approving...
                                      </>
                                    ) : (
                                      <>
                                        <FiCheck className="mr-2 h-4 w-4" />
                                        Approve
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleRejectUser(userItem.id, userItem)}
                                    disabled={processingUser === userItem.id}
                                  >
                                    <FiXCircle className="mr-2 h-4 w-4" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Approval History */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Approval History</h3>
                    {userApprovals.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <p>No approval history found.</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-96">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-700">
                              <TableHead className="text-gray-300">User</TableHead>
                              <TableHead className="text-gray-300">Email</TableHead>
                              <TableHead className="text-gray-300">Role</TableHead>
                              <TableHead className="text-gray-300">Location</TableHead>
                              <TableHead className="text-gray-300">Status</TableHead>
                              <TableHead className="text-gray-300">Processed By</TableHead>
                              <TableHead className="text-gray-300">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {userApprovals.map((userItem) => (
                              <TableRow key={userItem.id} className="border-gray-700">
                                <TableCell className="text-white">{userItem.fullName}</TableCell>
                                <TableCell className="text-white">{userItem.email}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={
                                    userItem.role === 'superadmin' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                    userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                                    userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                    'bg-green-500/20 text-green-300 border-green-500/30'
                                  }>
                                    {userItem.role}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-white">{userItem.location || 'Not assigned'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={
                                    userItem.status === 'approved' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                    'bg-red-500/20 text-red-300 border-red-500/30'
                                  }>
                                    {userItem.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-white">
                                  {userItem.approvedByName || userItem.rejectedByName || 'System'}
                                </TableCell>
                                <TableCell className="text-gray-500">
                                  {userItem.approvedAt?.toDate().toLocaleDateString() || 
                                   userItem.rejectedAt?.toDate().toLocaleDateString() || 
                                   'Unknown date'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    )}
                  </div>

                  {/* Statistics */}
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-400">{pendingUsers.length}</div>
                        <div className="text-gray-400 text-sm">Pending Approvals</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-green-400">
                          {userApprovals.filter(u => u.status === 'approved').length}
                        </div>
                        <div className="text-gray-400 text-sm">Approved Users</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardContent className="p-4 text-center">
                        <div className="text-2xl font-bold text-red-400">
                          {userApprovals.filter(u => u.status === 'rejected').length}
                        </div>
                        <div className="text-gray-400 text-sm">Rejected Users</div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Approval Settings Tab */}
            {activeTab === 'approvalSettings' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Approval System Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-w-2xl space-y-6">
                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-white">Stock Request Approval</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="requireApproval" className="text-white">Require Approval for Stock Transfers</Label>
                          <Switch
                            id="requireApproval"
                            checked={approvalSettings.requireApproval}
                            onCheckedChange={(checked) => setApprovalSettings({
                              ...approvalSettings,
                              requireApproval: checked
                            })}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="autoApproveBelow" className="text-white">
                            Auto-Approve Quantity Limit
                          </Label>
                          <Input
                            id="autoApproveBelow"
                            type="number"
                            min="1"
                            value={approvalSettings.autoApproveBelow}
                            onChange={(e) => setApprovalSettings({
                              ...approvalSettings,
                              autoApproveBelow: parseInt(e.target.value) || 1
                            })}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                          <p className="text-sm text-gray-400">Requests below this quantity will be auto-approved (must be greater than 1)</p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-white">Allowed Transfer Locations</Label>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {LOCATIONS.map((location) => (
                              <div key={location} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`location-${location}`}
                                  checked={approvalSettings.allowedLocations.includes(location)}
                                  onCheckedChange={(checked) => {
                                    const newLocations = checked
                                      ? [...approvalSettings.allowedLocations, location]
                                      : approvalSettings.allowedLocations.filter(loc => loc !== location);
                                    setApprovalSettings({
                                      ...approvalSettings,
                                      allowedLocations: newLocations
                                    });
                                  }}
                                />
                                <Label htmlFor={`location-${location}`} className="text-white text-sm">
                                  {location}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <Button onClick={saveApprovalSettings} className="w-full">
                          <FiSave className="mr-2 h-4 w-4" />
                          Save Approval Settings
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="bg-gray-900/50 border-gray-700">
                      <CardHeader>
                        <CardTitle className="text-white">Approval Statistics</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-400">
                              {stockRequests.filter(req => req.quantity <= approvalSettings.autoApproveBelow && req.quantity > 1).length}
                            </div>
                            <div className="text-gray-400 text-sm">Auto-Approval Eligible</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-orange-400">
                              {stockRequests.filter(req => req.quantity > approvalSettings.autoApproveBelow).length}
                            </div>
                            <div className="text-gray-400 text-sm">Manual Review Needed</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Personnel Management Tab */}
            {activeTab === 'personnel' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Personnel Management</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-600px">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-700">
                          <TableHead className="text-gray-300">Name</TableHead>
                          <TableHead className="text-gray-300">Email</TableHead>
                          <TableHead className="text-gray-300">Current Role</TableHead>
                          <TableHead className="text-gray-300">Location</TableHead>
                          <TableHead className="text-gray-300">Assign Role</TableHead>
                          <TableHead className="text-gray-300">Update Location</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allUsers.map((userItem) => (
                          <TableRow key={userItem.id} className="border-gray-700">
                            <TableCell className="text-white">{userItem.fullName}</TableCell>
                            <TableCell className="text-white">{userItem.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                userItem.role === 'superadmin' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                userItem.role === 'manager' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                                userItem.role === 'sales' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                'bg-green-500/20 text-green-300 border-green-500/30'
                              }>
                                {userItem.role}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-white">{userItem.location || 'Not assigned'}</TableCell>
                            <TableCell>
                              <Select value={userItem.role} onValueChange={(value) => handleAssignRole(userItem.id, value)}>
                                <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="superadmin">Super Admin</SelectItem>
                                  <SelectItem value="manager">Manager</SelectItem>
                                  <SelectItem value="sales">Sales Personnel</SelectItem>
                                  <SelectItem value="dataEntry">Data Entry Clerk</SelectItem>
                                  <SelectItem value="user">Regular User</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={userItem.location || ''} 
                                onValueChange={(value) => handleUpdateUserLocation(userItem.id, value)}
                              >
                                <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                                  <SelectValue placeholder="Select location" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LOCATIONS.map((location) => (
                                    <SelectItem key={location} value={location}>{location}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Sales Analysis Report Tab */}
            {activeTab === 'sales' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-white">Sales Analysis Report Generator</CardTitle>
                    <div className="flex space-x-4">
                      <Button
                        onClick={handleGenerateAndDisplayReport}
                        disabled={isGeneratingReport}
                      >
                        {isGeneratingReport ? (
                          <>
                            <FiRefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FiFileText className="mr-2 h-4 w-4" />
                            Generate Report
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleGenerateReport}
                        disabled={isGeneratingReport || !generatedReport}
                      >
                        <FiDownload className="mr-2 h-4 w-4" />
                        Download Report
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Report Filters */}
                  <Card className="bg-gray-900/50 border-gray-700 mb-6">
                    <CardHeader>
                      <CardTitle className="text-white">Report Filters</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="space-y-2">
                          <Label className="text-white">Start Date</Label>
                          <Input
                            type="date"
                            value={reportFilters.startDate}
                            onChange={(e) => setReportFilters({...reportFilters, startDate: e.target.value})}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-white">End Date</Label>
                          <Input
                            type="date"
                            value={reportFilters.endDate}
                            onChange={(e) => setReportFilters({...reportFilters, endDate: e.target.value})}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-white">Location</Label>
                          <Select value={reportFilters.location} onValueChange={(value) => setReportFilters({...reportFilters, location: value})}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Locations</SelectItem>
                              {LOCATIONS.map((location) => (
                                <SelectItem key={location} value={location}>{location}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-white">Report Type</Label>
                          <Select value={reportFilters.reportType} onValueChange={(value) => setReportFilters({...reportFilters, reportType: value})}>
                            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                              <SelectValue placeholder="Select report type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="detailed">Detailed Report</SelectItem>
                              <SelectItem value="summary">Summary Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Generated Report Display */}
                  {generatedReport && (
                    <Card className="bg-gray-900/50 border-gray-700 mb-6">
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-white">Generated Report</CardTitle>
                          <div className="flex items-center space-x-2">
                            <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                              Generated on: {new Date().toLocaleDateString()}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Report Summary Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                          <Card className="bg-gray-800/50 border-gray-700">
                            <CardContent className="p-4 text-center">
                              <div className="text-2xl font-bold text-white">{generatedReport.totalSales}</div>
                              <div className="text-gray-400 text-sm">Total Sales</div>
                            </CardContent>
                          </Card>
                          
                          <Card className="bg-gray-800/50 border-gray-700">
                            <CardContent className="p-4 text-center">
                              <div className="text-2xl font-bold text-green-400">
                                {formatCurrency(generatedReport.totalRevenue)}
                              </div>
                              <div className="text-gray-400 text-sm">Total Revenue</div>
                            </CardContent>
                          </Card>
                          
                          <Card className="bg-gray-800/50 border-gray-700">
                            <CardContent className="p-4 text-center">
                              <div className="text-2xl font-bold text-blue-400">
                                {formatCurrency(generatedReport.averageSaleValue)}
                              </div>
                              <div className="text-gray-400 text-sm">Average Sale Value</div>
                            </CardContent>
                          </Card>
                          
                          <Card className="bg-gray-800/50 border-gray-700">
                            <CardContent className="p-4 text-center">
                              <div className="text-2xl font-bold text-purple-400">
                                {Object.keys(generatedReport.locationSummary).length}
                              </div>
                              <div className="text-gray-400 text-sm">Locations</div>
                            </CardContent>
                          </Card>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stock Transfer Tab */}
            {activeTab === 'transfer' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Stock Transfer (SuperAdmin)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2">
                      <Label className="text-white">Item Code *</Label>
                      <Input
                        placeholder="Enter item code"
                        value={transferStock.itemCode}
                        onChange={(e) => setTransferStock({...transferStock, itemCode: e.target.value})}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      {transferErrors.itemCode && <p className="text-red-400 text-sm">{transferErrors.itemCode}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Quantity * (must be greater than 1)</Label>
                      <Input
                        type="number"
                        placeholder="Enter quantity"
                        value={transferStock.quantity}
                        onChange={(e) => setTransferStock({...transferStock, quantity: e.target.value})}
                        className="bg-gray-800 border-gray-700 text-white"
                      />
                      {transferErrors.quantity && <p className="text-red-400 text-sm">{transferErrors.quantity}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Source Location *</Label>
                      <Select 
                        value={transferStock.fromLocation} 
                        onValueChange={(value) => setTransferStock({...transferStock, fromLocation: value})}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select source location" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCATIONS.map((location) => (
                            <SelectItem key={location} value={location}>{location}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {transferErrors.fromLocation && <p className="text-red-400 text-sm">{transferErrors.fromLocation}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white">Destination Location *</Label>
                      <Select 
                        value={transferStock.toLocation} 
                        onValueChange={(value) => setTransferStock({...transferStock, toLocation: value})}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                          <SelectValue placeholder="Select destination location" />
                        </SelectTrigger>
                        <SelectContent>
                          {LOCATIONS.map((location) => (
                            <SelectItem key={location} value={location}>{location}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {transferErrors.toLocation && <p className="text-red-400 text-sm">{transferErrors.toLocation}</p>}
                    </div>
                  </div>
                  <Button onClick={handleRequestStock} className="w-full">
                    <FiTruck className="mr-2 h-4 w-4" />
                    Initiate Stock Transfer
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Location Performance Tab */}
            {activeTab === 'locationPerformance' && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Location Performance Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {Object.entries(salesAnalysis.locationPerformance || {}).map(([location, data]) => (
                      <Card key={location} className="bg-gray-900/50 border-gray-700">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-white">{location}</CardTitle>
                            <Badge variant="outline" className={getPerformanceBadge(data.score)}>
                              {data.grade}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">Performance Score</span>
                            <span className={`text-xl font-bold ${getPerformanceColor(data.score)}`}>
                              {data.score}%
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">Today's Revenue</span>
                            <span className="text-green-400 font-semibold">
                              {formatCurrency(data.metrics.todayRevenue)}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">Weekly Revenue</span>
                            <span className="text-blue-400 font-semibold">
                              {formatCurrency(data.metrics.weeklyRevenue)}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">Total Sales</span>
                            <span className="text-white font-semibold">
                              {data.metrics.salesCount}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">Avg. Sale Value</span>
                            <span className="text-purple-400 font-semibold">
                              {formatCurrency(data.metrics.salesCount > 0 ? data.metrics.totalRevenue / data.metrics.salesCount : 0)}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">Trend</span>
                            <span className={`flex items-center ${getTrendColor(data.trend)}`}>
                              {getTrendIcon(data.trend)}
                              <span className="ml-1 capitalize">{data.trend}</span>
                            </span>
                          </div>
                        </CardContent>
                        <CardFooter>
                          <Progress value={data.score} className="w-full" />
                        </CardFooter>
                      </Card>
                    ))}
                  </div>

                  {/* Performance Summary */}
                  <Card className="bg-gray-900/50 border-gray-700">
                    <CardHeader>
                      <CardTitle className="text-white">Performance Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-400">
                            {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 80).length}
                          </div>
                          <div className="text-gray-400 text-sm">Excellent</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-400">
                            {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 60 && p.score < 80).length}
                          </div>
                          <div className="text-gray-400 text-sm">Good</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-400">
                            {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score >= 40 && p.score < 60).length}
                          </div>
                          <div className="text-gray-400 text-sm">Average</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-400">
                            {Object.values(salesAnalysis.locationPerformance || {}).filter(p => p.score < 40).length}
                          </div>
                          <div className="text-gray-400 text-sm">Needs Attention</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}