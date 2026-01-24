'use client'
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, orderBy, onSnapshot,
  Timestamp
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// React Icons
import { 
  FaFilter, FaDownload, FaChartBar, FaStore, FaBoxes,
  FaMoneyBillWave, FaPercent, FaArrowUp, FaArrowDown,
  FaFilePdf, FaFileExcel, FaPrint, FaSearch, FaSync,
  FaLocationArrow, FaWarehouse, FaCalculator, FaClipboardList,
  FaShoppingCart, FaUsers, FaCalendar, FaChartLine,
  FaShoppingBag, FaTags, FaDollarSign, FaCreditCard,
  FaArrowRight, FaHome, FaBars, FaTimes, FaUser,
  FaCog, FaSignOutAlt, FaBell, FaExclamationTriangle,
  FaCheckCircle, FaSpinner, FaDatabase, FaChartPie,
  FaMapMarkerAlt, FaLayerGroup
} from 'react-icons/fa';

// Shadcn Components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const DEFAULT_LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

// Navigation items
const NAV_ITEMS = [
  { name: 'Dashboard', icon: <FaHome />, path: '/dashboard' },
  { name: 'Inventory', icon: <FaBoxes />, path: '/inventory' },
  { name: 'Sales', icon: <FaShoppingCart />, path: '/sales' },
  { name: 'Customers', icon: <FaUsers />, path: '/customers' },
  { name: 'Reports', icon: <FaChartPie />, path: '/reports' },
  { name: 'Settings', icon: <FaCog />, path: '/settings' },
];

export default function StocksDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState([]);
  const [sales, setSales] = useState([]);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Filter State
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [salesTimeFilter, setSalesTimeFilter] = useState('today');
  const [salesLocationFilter, setSalesLocationFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('stocks');
  const [sortConfig, setSortConfig] = useState({ key: 'quantity', direction: 'desc' });
  
  // UI State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Utility Functions
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'MK 0';
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value) => {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(1)}%`;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTimeFilterRange = (filter) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch(filter) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
    }

    return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
  };

  // Fetch locations from database
  const fetchLocations = useCallback(async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'), where('isActive', '==', true));
      const locationsSnapshot = await getDocs(locationsQuery);
      if (!locationsSnapshot.empty) {
        const locationsData = locationsSnapshot.docs.map(doc => doc.data().name);
        setLocations(locationsData);
      }
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    }
  }, []);

  // Fetch Stocks Data
  const fetchStocks = useCallback(async () => {
    try {
      const stocksQuery = query(
        collection(db, 'stocks'),
        where('isActive', '==', true)
      );
      const stocksSnapshot = await getDocs(stocksQuery);
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        quantity: Number(doc.data().quantity) || 0,
        costPrice: Number(doc.data().costPrice) || 0,
        retailPrice: Number(doc.data().retailPrice) || 0,
        minStockLevel: Number(doc.data().minStockLevel) || 5
      }));
      setStocks(stocksData);
    } catch (error) {
      console.error('Failed to fetch stocks:', error);
      setError('Failed to fetch stocks: ' + error.message);
    }
  }, []);

  // Fetch Sales Data
  const fetchSales = useCallback(async () => {
    try {
      const salesQuery = query(
        collection(db, 'sales'),
        orderBy('soldAt', 'desc')
      );
      const salesSnapshot = await getDocs(salesQuery);
      const salesData = salesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        totalAmount: Number(doc.data().totalAmount) || 0,
        totalProfit: Number(doc.data().totalProfit) || 0,
        subTotal: Number(doc.data().subTotal) || 0,
        discount: Number(doc.data().discount) || 0
      }));
      setSales(salesData);
    } catch (error) {
      console.error('Failed to fetch sales:', error);
      setError('Failed to fetch sales data: ' + error.message);
    }
  }, []);

  // Derived Data
  const filteredStocks = useMemo(() => {
    let filtered = [...stocks];
    
    if (selectedLocation !== 'all') {
      filtered = filtered.filter(stock => stock.location === selectedLocation);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(stock =>
        stock.itemCode?.toLowerCase().includes(term) ||
        stock.brand?.toLowerCase().includes(term) ||
        stock.model?.toLowerCase().includes(term) ||
        stock.category?.toLowerCase().includes(term)
      );
    }
    
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.key] || 0;
      const bValue = b[sortConfig.key] || 0;
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    });
    
    return filtered;
  }, [stocks, selectedLocation, searchTerm, sortConfig]);

  const filteredSales = useMemo(() => {
    let filtered = [...sales];
    const timeRange = getTimeFilterRange(salesTimeFilter);

    if (salesLocationFilter !== 'all') {
      filtered = filtered.filter(sale => sale.location === salesLocationFilter);
    }

    filtered = filtered.filter(sale => {
      try {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= timeRange.start && saleTimestamp <= timeRange.end;
      } catch {
        return false;
      }
    });

    return filtered;
  }, [sales, salesTimeFilter, salesLocationFilter]);

  // Dashboard Statistics
  const dashboardStats = useMemo(() => {
    const totalItems = filteredStocks.length;
    const totalQuantity = filteredStocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
    const totalCostValue = filteredStocks.reduce((sum, stock) => 
      sum + ((stock.costPrice || 0) * (stock.quantity || 0)), 0);
    const totalRetailValue = filteredStocks.reduce((sum, stock) => 
      sum + ((stock.retailPrice || 0) * (stock.quantity || 0)), 0);
    const potentialProfit = totalRetailValue - totalCostValue;
    const lowStockItems = filteredStocks.filter(stock => 
      (stock.quantity || 0) <= (stock.minStockLevel || 5)
    ).length;

    return {
      totalItems,
      totalQuantity,
      totalCostValue,
      totalRetailValue,
      potentialProfit,
      lowStockItems
    };
  }, [filteredStocks]);

  const salesStats = useMemo(() => {
    const todayRange = getTimeFilterRange('today');
    const monthRange = getTimeFilterRange('month');
    
    const todaySalesData = sales.filter(sale => {
      if (!sale.soldAt) return false;
      try {
        const saleDate = sale.soldAt.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= todayRange.start && saleTimestamp <= todayRange.end;
      } catch {
        return false;
      }
    });

    const monthlySalesData = sales.filter(sale => {
      if (!sale.soldAt) return false;
      try {
        const saleDate = sale.soldAt.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= monthRange.start && saleTimestamp <= monthRange.end;
      } catch {
        return false;
      }
    });

    const todaySales = todaySalesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
    const todayProfit = todaySalesData.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
    const monthlySales = monthlySalesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
    const monthlyProfit = monthlySalesData.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
    const avgTransactionValue = monthlySalesData.length > 0 ? monthlySales / monthlySalesData.length : 0;

    return {
      todaySales,
      todayTransactions: todaySalesData.length,
      todayProfit,
      monthlySales,
      monthlyTransactions: monthlySalesData.length,
      monthlyProfit,
      avgTransactionValue
    };
  }, [sales]);

  // Location Analytics
  const locationDetails = useMemo(() => {
    const details = locations.map(location => {
      const locationStocks = filteredStocks.filter(stock => stock.location === location);
      const locationSales = filteredSales.filter(sale => sale.location === location);
      
      const totalItems = locationStocks.length;
      const totalQuantity = locationStocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
      const totalCostValue = locationStocks.reduce((sum, stock) => 
        sum + ((stock.costPrice || 0) * (stock.quantity || 0)), 0);
      const totalRetailValue = locationStocks.reduce((sum, stock) => 
        sum + ((stock.retailPrice || 0) * (stock.quantity || 0)), 0);
      const potentialProfit = totalRetailValue - totalCostValue;
      const profitMargin = totalCostValue > 0 ? (potentialProfit / totalCostValue) * 100 : 0;
      const lowStockItems = locationStocks.filter(stock => 
        (stock.quantity || 0) <= (stock.minStockLevel || 5)
      ).length;
      
      const totalSales = locationSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      const totalProfit = locationSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
      const transactionCount = locationSales.length;
      const avgSaleValue = transactionCount > 0 ? totalSales / transactionCount : 0;
      const avgProfitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

      return {
        location,
        totalItems,
        totalQuantity,
        totalCostValue,
        totalRetailValue,
        potentialProfit,
        profitMargin,
        lowStockItems,
        totalSales,
        totalProfit,
        transactionCount,
        avgSaleValue,
        avgProfitMargin
      };
    });

    return details.sort((a, b) => b.totalSales - a.totalSales);
  }, [locations, filteredStocks, filteredSales]);

  // Report Generation Functions
  const generateStockReport = async (location = 'all') => {
    setIsGeneratingReport(true);
    try {
      let reportStocks = location === 'all' ? stocks : stocks.filter(s => s.location === location);
      
      if (reportStocks.length === 0) {
        setError('No stock data available for the selected location');
        return;
      }

      const doc = new jsPDF('landscape');
      const today = new Date();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageWidth, 50, 'F');
      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('KM ELECTRONICS', pageWidth / 2, 25, { align: 'center' });
      doc.setFontSize(16);
      doc.text('STOCK INVENTORY REPORT', pageWidth / 2, 35, { align: 'center' });
      doc.setFontSize(12);
      doc.text(location === 'all' ? 'ALL LOCATIONS' : location.toUpperCase(), pageWidth / 2, 45, { align: 'center' });
      
      // Report Info
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${today.toLocaleDateString()}`, 15, 60);
      doc.text(`By: ${user?.fullName || user?.email}`, pageWidth - 15, 60, { align: 'right' });
      
      // Summary
      const totalItems = reportStocks.length;
      const totalQuantity = reportStocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
      const totalCostValue = reportStocks.reduce((sum, stock) => sum + ((stock.costPrice || 0) * (stock.quantity || 0)), 0);
      const totalRetailValue = reportStocks.reduce((sum, stock) => sum + ((stock.retailPrice || 0) * (stock.quantity || 0)), 0);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 15, 75);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Items: ${totalItems}`, 20, 85);
      doc.text(`Total Quantity: ${totalQuantity}`, 20, 92);
      doc.text(`Total Cost Value: ${formatCurrency(totalCostValue)}`, 20, 99);
      doc.text(`Total Retail Value: ${formatCurrency(totalRetailValue)}`, 20, 106);
      
      // Table Data
      const tableData = reportStocks.map(stock => [
        stock.itemCode || 'N/A',
        `${stock.brand || ''} ${stock.model || ''}`.trim(),
        stock.category || 'N/A',
        stock.location || 'N/A',
        stock.quantity || 0,
        formatCurrency(stock.costPrice || 0),
        formatCurrency(stock.retailPrice || 0),
        formatCurrency((stock.costPrice || 0) * (stock.quantity || 0)),
        formatCurrency((stock.retailPrice || 0) * (stock.quantity || 0))
      ]);
      
      autoTable(doc, {
        startY: 115,
        head: [['Item Code', 'Product', 'Category', 'Location', 'Qty', 'Cost', 'Retail', 'Total Cost', 'Total Retail']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        bodyStyles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 25 },
          3: { cellWidth: 25 },
          4: { cellWidth: 15 },
          5: { cellWidth: 20 },
          6: { cellWidth: 20 },
          7: { cellWidth: 25 },
          8: { cellWidth: 25 }
        }
      });
      
      // Footer
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text('© KM Electronics - Confidential Report', pageWidth / 2, finalY + 5, { align: 'center' });
      
      const filename = `KM_Stock_${location === 'all' ? 'All_Locations' : location}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`;
      doc.save(filename);
      
      setSuccess(`Stock report for ${location === 'all' ? 'all locations' : location} generated successfully!`);
    } catch (error) {
      console.error('PDF Generation Error:', error);
      setError('Failed to generate PDF report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateSalesReport = async (location = 'all') => {
    setIsGeneratingReport(true);
    try {
      let reportSales = location === 'all' ? sales : sales.filter(s => s.location === location);
      const timeRange = getTimeFilterRange(salesTimeFilter);
      
      reportSales = reportSales.filter(sale => {
        try {
          const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
          const saleTimestamp = Timestamp.fromDate(saleDate);
          return saleTimestamp >= timeRange.start && saleTimestamp <= timeRange.end;
        } catch {
          return false;
        }
      });
      
      if (reportSales.length === 0) {
        setError('No sales data available for the selected criteria');
        return;
      }

      const doc = new jsPDF('portrait');
      const today = new Date();
      
      // Header
      doc.setFillColor(20, 83, 45);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 50, 'F');
      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('KM ELECTRONICS', doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' });
      doc.setFontSize(16);
      doc.text('SALES REPORT', doc.internal.pageSize.getWidth() / 2, 35, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`${location === 'all' ? 'ALL LOCATIONS' : location.toUpperCase()} - ${salesTimeFilter.toUpperCase()}`, doc.internal.pageSize.getWidth() / 2, 45, { align: 'center' });
      
      // Summary
      const totalSales = reportSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      const totalProfit = reportSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      doc.text(`Period: ${salesTimeFilter}`, 15, 60);
      doc.text(`Total Sales: ${formatCurrency(totalSales)}`, 15, 67);
      doc.text(`Total Profit: ${formatCurrency(totalProfit)}`, 15, 74);
      doc.text(`Transactions: ${reportSales.length}`, 15, 81);
      
      // Table Data
      const tableData = reportSales.map(sale => [
        sale.invoiceNumber || 'N/A',
        formatDate(sale.soldAt),
        sale.customerName || 'Walk-in',
        sale.location || 'N/A',
        sale.items?.length || 0,
        formatCurrency(sale.totalAmount || 0),
        formatCurrency(sale.totalProfit || 0)
      ]);
      
      autoTable(doc, {
        startY: 90,
        head: [['Invoice', 'Date', 'Customer', 'Location', 'Items', 'Amount', 'Profit']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [20, 83, 45], textColor: 255 },
        bodyStyles: { fontSize: 8 }
      });
      
      const filename = `KM_Sales_${location === 'all' ? 'All_Locations' : location}_${salesTimeFilter}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`;
      doc.save(filename);
      
      setSuccess(`Sales report for ${location === 'all' ? 'all locations' : location} generated successfully!`);
    } catch (error) {
      console.error('Sales Report Error:', error);
      setError('Failed to generate sales report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateExcelReport = async (type = 'stock', location = 'all') => {
    setIsGeneratingReport(true);
    try {
      let data = [];
      let sheetName = '';
      let filename = '';
      const today = new Date();
      
      if (type === 'stock') {
        data = location === 'all' ? stocks : stocks.filter(s => s.location === location);
        sheetName = 'Stock Inventory';
        filename = `KM_Stock_${location === 'all' ? 'All_Locations' : location}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.xlsx`;
      } else {
        let salesData = location === 'all' ? sales : sales.filter(s => s.location === location);
        const timeRange = getTimeFilterRange(salesTimeFilter);
        salesData = salesData.filter(sale => {
          try {
            const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
            const saleTimestamp = Timestamp.fromDate(saleDate);
            return saleTimestamp >= timeRange.start && saleTimestamp <= timeRange.end;
          } catch {
            return false;
          }
        });
        data = salesData;
        sheetName = 'Sales Data';
        filename = `KM_Sales_${location === 'all' ? 'All_Locations' : location}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.xlsx`;
      }
      
      if (data.length === 0) {
        setError(`No ${type} data available for the selected criteria`);
        return;
      }
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, filename);
      
      setSuccess(`Excel ${type} report generated successfully!`);
    } catch (error) {
      console.error('Excel Generation Error:', error);
      setError('Failed to generate Excel report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Authentication and Data Loading
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          const userQuery = query(collection(db, 'users'), where('uid', '==', authUser.uid));
          const userSnapshot = await getDocs(userQuery);
          
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            if (['superadmin', 'admin', 'manager', 'dataEntry'].includes(userData.role)) {
              setUser(userData);
              
              // Fetch initial data
              await Promise.all([
                fetchLocations(),
                fetchStocks(),
                fetchSales()
              ]);
              
              // Setup real-time listeners
              const stocksUnsubscribe = onSnapshot(
                query(collection(db, 'stocks'), where('isActive', '==', true)),
                (snapshot) => {
                  const stocksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                  setStocks(stocksData);
                }
              );
              
              const salesUnsubscribe = onSnapshot(
                query(collection(db, 'sales'), orderBy('soldAt', 'desc')),
                (snapshot) => {
                  const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                  setSales(salesData);
                }
              );
              
              return () => {
                stocksUnsubscribe();
                salesUnsubscribe();
              };
            } else {
              setError('Access denied. Required privileges not found.');
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
  }, [router, fetchLocations, fetchStocks, fetchSales]);

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

  // Loading State
  // if (loading) {
  //   return (
  //     <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 flex items-center justify-center">
  //       <div className="text-center">
  //         <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
  //         <div className="text-white text-xl">Loading Dashboard...</div>
  //         <p className="text-gray-400 mt-2">Please wait while we authenticate and load your data</p>
  //       </div>
  //     </div>
  //   );
  // }

  // Request Sort Function
  const requestSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-900 text-white">
      {/* Messages */}
      {error && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <Alert variant="destructive">
            <FaExclamationTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
      
      {success && (
        <div className="fixed top-4 right-4 z-50 max-w-md">
          <Alert variant="default" className="bg-green-900/20 border-green-700">
            <FaCheckCircle className="h-4 w-4 text-green-400" />
            <AlertTitle className="text-green-200">Success</AlertTitle>
            <AlertDescription className="text-green-300">{success}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Navigation Header */}
      <header className="bg-gray-800/80 backdrop-blur-lg border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Mobile Menu Button */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <FaBars className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-gray-800 border-gray-700">
                <SheetHeader>
                  <SheetTitle className="text-white">KM Electronics</SheetTitle>
                </SheetHeader>
                <div className="py-6 space-y-2">
                  {NAV_ITEMS.map((item) => (
                    <Button
                      key={item.name}
                      variant="ghost"
                      className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        router.push(item.path);
                      }}
                    >
                      <span className="mr-3">{item.icon}</span>
                      {item.name}
                    </Button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo and Title */}
            <div className="flex items-center">
              <div className="bg-blue-600 p-2 rounded-lg mr-3">
                <FaChartLine className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">KM Electronics</h1>
                <p className="text-xs text-gray-400">Business Dashboard</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex space-x-1">
              {NAV_ITEMS.map((item) => (
                <Button
                  key={item.name}
                  variant="ghost"
                  className="text-gray-300 hover:text-white hover:bg-gray-700"
                  onClick={() => router.push(item.path)}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.name}
                </Button>
              ))}
            </nav>

            {/* User Profile and Actions */}
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  fetchLocations();
                  fetchStocks();
                  fetchSales();
                  setSuccess('Data refreshed successfully!');
                }}
              >
                <FaSync className="h-5 w-5" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-blue-600">
                        {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
                  <DropdownMenuLabel className="text-gray-300">
                    {user?.fullName || user?.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem className="text-gray-300 hover:bg-gray-700">
                    <FaUser className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-gray-300 hover:bg-gray-700">
                    <FaCog className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem 
                    className="text-red-300 hover:bg-red-900/20"
                    onClick={() => auth.signOut()}
                  >
                    <FaSignOutAlt className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-gray-800/50 border border-gray-700">
            <TabsTrigger value="stocks" className="data-[state=active]:bg-blue-600">
              <FaBoxes className="mr-2 h-4 w-4" />
              Stock Management
            </TabsTrigger>
            <TabsTrigger value="sales" className="data-[state=active]:bg-green-600">
              <FaShoppingCart className="mr-2 h-4 w-4" />
              Sales Analytics
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-purple-600">
              <FaFilePdf className="mr-2 h-4 w-4" />
              Reports
            </TabsTrigger>
          </TabsList>

          {/* Combined Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Inventory Value */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-400 text-sm mb-2">Inventory Value</h3>
                    <p className="text-2xl font-bold text-blue-400">
                      {formatCurrency(dashboardStats.totalCostValue)}
                    </p>
                    <p className="text-green-400 text-sm mt-1">
                      Retail: {formatCurrency(dashboardStats.totalRetailValue)}
                    </p>
                  </div>
                  <div className="bg-blue-500/20 p-3 rounded-lg">
                    <FaWarehouse className="text-blue-400 text-2xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Today's Sales */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-green-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-400 text-sm mb-2">Today's Sales</h3>
                    <p className="text-2xl font-bold text-green-400">
                      {formatCurrency(salesStats.todaySales)}
                    </p>
                    <p className="text-blue-400 text-sm mt-1">
                      {salesStats.todayTransactions} transactions
                    </p>
                  </div>
                  <div className="bg-green-500/20 p-3 rounded-lg">
                    <FaShoppingCart className="text-green-400 text-2xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Monthly Sales */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-400 text-sm mb-2">Monthly Sales</h3>
                    <p className="text-2xl font-bold text-purple-400">
                      {formatCurrency(salesStats.monthlySales)}
                    </p>
                    <p className="text-green-400 text-sm mt-1">
                      Profit: {formatCurrency(salesStats.monthlyProfit)}
                    </p>
                  </div>
                  <div className="bg-purple-500/20 p-3 rounded-lg">
                    <FaChartBar className="text-purple-400 text-2xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Stock Overview */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-orange-500/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-400 text-sm mb-2">Stock Status</h3>
                    <p className="text-2xl font-bold text-white">
                      {dashboardStats.totalItems} items
                    </p>
                    <div className="flex space-x-4 text-sm mt-1">
                      <Badge variant="outline" className="bg-blue-900/30 text-blue-300 border-blue-700">
                        {dashboardStats.totalQuantity} units
                      </Badge>
                      <Badge variant="destructive" className="bg-red-900/20 text-red-300 border-red-700">
                        {dashboardStats.lowStockItems} low stock
                      </Badge>
                    </div>
                  </div>
                  <div className="bg-orange-500/20 p-3 rounded-lg">
                    <FaBoxes className="text-orange-400 text-2xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stocks Tab Content */}
          <TabsContent value="stocks" className="space-y-6">
            {/* Stock Filters and Controls */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>Stock Management Filters</CardTitle>
                <CardDescription>
                  Filter and manage your inventory across all locations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      <FaFilter className="inline mr-2" />
                      Filter by Location
                    </Label>
                    <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                      <SelectTrigger className="bg-gray-700 border-gray-600">
                        <SelectValue placeholder="All Locations" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="all">All Locations</SelectItem>
                        {locations.map((location, index) => (
                          <SelectItem key={index} value={location}>{location}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      <FaSearch className="inline mr-2" />
                      Search Inventory
                    </Label>
                    <Input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-gray-700 border-gray-600"
                      placeholder="Search by item code, brand, model..."
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      <FaDownload className="inline mr-2" />
                      Stock Reports
                    </Label>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => generateStockReport(selectedLocation === 'all' ? 'all' : selectedLocation)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-red-600 hover:bg-red-700"
                      >
                        {isGeneratingReport ? <FaSpinner className="animate-spin mr-2" /> : <FaFilePdf className="mr-2" />}
                        Stock PDF
                      </Button>
                      <Button
                        onClick={() => generateExcelReport('stock', selectedLocation === 'all' ? 'all' : selectedLocation)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {isGeneratingReport ? <FaSpinner className="animate-spin mr-2" /> : <FaFileExcel className="mr-2" />}
                        Stock Excel
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location-wise Stock Analytics */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>
                  <FaStore className="inline mr-2 text-blue-400" />
                  Stock Analytics by Location
                </CardTitle>
                <CardDescription>
                  {selectedLocation === 'all' ? 'All Locations' : selectedLocation}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {locationDetails.map((detail, index) => (
                    <Card key={index} className="bg-gray-700/30 border-gray-600/50 hover:border-blue-500/50 transition-all duration-300">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg">{detail.location}</CardTitle>
                          <Badge className={
                            detail.profitMargin > 20 ? 'bg-green-900/50 text-green-300' :
                            detail.profitMargin > 10 ? 'bg-blue-900/50 text-blue-300' :
                            'bg-yellow-900/50 text-yellow-300'
                          }>
                            {formatPercentage(detail.profitMargin)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Items</span>
                            <span className="font-semibold">{detail.totalItems}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Quantity</span>
                            <span className="font-semibold">{detail.totalQuantity}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Cost Value</span>
                            <span className="font-semibold">{formatCurrency(detail.totalCostValue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Retail Value</span>
                            <span className="font-semibold text-green-400">{formatCurrency(detail.totalRetailValue)}</span>
                          </div>
                          <Separator className="bg-gray-600" />
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Potential Profit</span>
                            <span className="font-bold text-lg text-blue-400">{formatCurrency(detail.potentialProfit)}</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Low Stock: {detail.lowStockItems}</span>
                          <span>Avg Profit: {formatCurrency(detail.totalItems > 0 ? detail.potentialProfit / detail.totalItems : 0)}</span>
                        </div>
                        
                        <div className="flex space-x-2 pt-2">
                          <Button
                            onClick={() => generateStockReport(detail.location)}
                            disabled={isGeneratingReport}
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-gray-700 hover:bg-gray-600"
                          >
                            <FaFilePdf size={12} className="mr-1" />
                            PDF
                          </Button>
                          <Button
                            onClick={() => generateExcelReport('stock', detail.location)}
                            disabled={isGeneratingReport}
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-green-700 hover:bg-green-600"
                          >
                            <FaFileExcel size={12} className="mr-1" />
                            Excel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {locationDetails.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <FaBoxes className="text-4xl mx-auto mb-4 opacity-50" />
                    <p>No stock data available for selected filters</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed Stock List */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>
                  <FaClipboardList className="inline mr-2 text-blue-400" />
                  Detailed Stock List ({filteredStocks.length} items)
                </CardTitle>
                <CardDescription>
                  Sorted by: {sortConfig.key} ({sortConfig.direction})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-700/50"
                          onClick={() => requestSort('itemCode')}
                        >
                          Item Code {sortConfig.key === 'itemCode' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-700/50"
                          onClick={() => requestSort('brand')}
                        >
                          Product {sortConfig.key === 'brand' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-700/50"
                          onClick={() => requestSort('quantity')}
                        >
                          Qty {sortConfig.key === 'quantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Retail</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Total Retail</TableHead>
                        <TableHead>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStocks.map((stock) => {
                        const totalCost = (stock.costPrice || 0) * (stock.quantity || 0);
                        const totalRetail = (stock.retailPrice || 0) * (stock.quantity || 0);
                        const profit = totalRetail - totalCost;
                        const isLowStock = (stock.quantity || 0) <= (stock.minStockLevel || 5);
                        
                        return (
                          <TableRow key={stock.id} className={isLowStock ? 'bg-red-900/10' : ''}>
                            <TableCell>
                              <div className="font-mono text-sm">{stock.itemCode || 'N/A'}</div>
                              <div className="text-gray-400 text-xs">{stock.category || 'N/A'}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold">{stock.brand} {stock.model}</div>
                              <div className="text-gray-400 text-xs">
                                {stock.color && <span className="mr-2">{stock.color}</span>}
                                {stock.storage && <span>{stock.storage}</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-900/30 text-blue-300 border-blue-700">
                                {stock.location}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className={`font-semibold ${isLowStock ? 'text-red-400' : ''}`}>
                                {stock.quantity || 0}
                                {isLowStock && (
                                  <Badge variant="destructive" className="ml-2 text-xs">
                                    LOW
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{formatCurrency(stock.costPrice || 0)}</TableCell>
                            <TableCell className="text-green-400">{formatCurrency(stock.retailPrice || 0)}</TableCell>
                            <TableCell>{formatCurrency(totalCost)}</TableCell>
                            <TableCell className="text-green-300">{formatCurrency(totalRetail)}</TableCell>
                            <TableCell>
                              <span className={`font-bold ${profit > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                {formatCurrency(profit)}
                              </span>
                              <div className="text-gray-400 text-xs">
                                {stock.costPrice > 0 ? `${((profit / totalCost) * 100).toFixed(1)}%` : 'N/A'}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                
                {filteredStocks.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <FaSearch className="text-3xl mx-auto mb-4 opacity-50" />
                    <p>No stock items found matching your criteria</p>
                    <p className="text-sm mt-2">Try changing your filters or search term</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales Tab Content */}
          <TabsContent value="sales" className="space-y-6">
            {/* Sales Filters and Controls */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>Sales Analytics Filters</CardTitle>
                <CardDescription>
                  Analyze sales performance across different time periods and locations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      <FaCalendar className="inline mr-2" />
                      Time Period
                    </Label>
                    <Select value={salesTimeFilter} onValueChange={setSalesTimeFilter}>
                      <SelectTrigger className="bg-gray-700 border-gray-600">
                        <SelectValue placeholder="Select period" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="yesterday">Yesterday</SelectItem>
                        <SelectItem value="week">Last 7 Days</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      <FaLocationArrow className="inline mr-2" />
                      Filter by Location
                    </Label>
                    <Select value={salesLocationFilter} onValueChange={setSalesLocationFilter}>
                      <SelectTrigger className="bg-gray-700 border-gray-600">
                        <SelectValue placeholder="All Locations" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        <SelectItem value="all">All Locations</SelectItem>
                        {locations.map((location, index) => (
                          <SelectItem key={index} value={location}>{location}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-gray-300">
                      <FaDownload className="inline mr-2" />
                      Sales Reports
                    </Label>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => generateSalesReport(salesLocationFilter === 'all' ? 'all' : salesLocationFilter)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                      >
                        {isGeneratingReport ? <FaSpinner className="animate-spin mr-2" /> : <FaFilePdf className="mr-2" />}
                        Sales PDF
                      </Button>
                      <Button
                        onClick={() => generateExcelReport('sales', salesLocationFilter === 'all' ? 'all' : salesLocationFilter)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {isGeneratingReport ? <FaSpinner className="animate-spin mr-2" /> : <FaFileExcel className="mr-2" />}
                        Sales Excel
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sales Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <Card className="bg-gray-800/50 backdrop-blur-sm border border-green-500/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Avg Transaction Value</h3>
                      <p className="text-2xl font-bold text-green-400">
                        {formatCurrency(salesStats.avgTransactionValue)}
                      </p>
                      <p className="text-blue-400 text-sm mt-1">
                        Based on {salesStats.monthlyTransactions} transactions
                      </p>
                    </div>
                    <div className="bg-green-500/20 p-3 rounded-lg">
                      <FaDollarSign className="text-green-400 text-2xl" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Today's Profit</h3>
                      <p className="text-2xl font-bold text-blue-400">
                        {formatCurrency(salesStats.todayProfit)}
                      </p>
                      <p className="text-green-400 text-sm mt-1">
                        Margin: {salesStats.todaySales > 0 ? formatPercentage((salesStats.todayProfit / salesStats.todaySales) * 100) : '0%'}
                      </p>
                    </div>
                    <div className="bg-blue-500/20 p-3 rounded-lg">
                      <FaPercent className="text-blue-400 text-2xl" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-gray-400 text-sm mb-2">Monthly Profit</h3>
                      <p className="text-2xl font-bold text-purple-400">
                        {formatCurrency(salesStats.monthlyProfit)}
                      </p>
                      <p className="text-green-400 text-sm mt-1">
                        Margin: {salesStats.monthlySales > 0 ? formatPercentage((salesStats.monthlyProfit / salesStats.monthlySales) * 100) : '0%'}
                      </p>
                    </div>
                    <div className="bg-purple-500/20 p-3 rounded-lg">
                      <FaChartBar className="text-purple-400 text-2xl" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sales by Location Analytics */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>
                  <FaStore className="inline mr-2 text-green-400" />
                  Sales Performance by Location ({salesTimeFilter})
                </CardTitle>
                <CardDescription>
                  {salesLocationFilter === 'all' ? 'All Locations' : salesLocationFilter}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {locationDetails.map((detail, index) => (
                    <Card key={index} className="bg-gray-700/30 border-gray-600/50 hover:border-green-500/50 transition-all duration-300">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-lg">{detail.location}</CardTitle>
                          <Badge className={
                            detail.avgProfitMargin > 20 ? 'bg-green-900/50 text-green-300' :
                            detail.avgProfitMargin > 10 ? 'bg-blue-900/50 text-blue-300' :
                            'bg-yellow-900/50 text-yellow-300'
                          }>
                            {formatPercentage(detail.avgProfitMargin)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Total Sales</span>
                            <span className="font-semibold text-green-400">{formatCurrency(detail.totalSales)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Transactions</span>
                            <span className="font-semibold">{detail.transactionCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Total Profit</span>
                            <span className="font-semibold text-blue-400">{formatCurrency(detail.totalProfit)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400 text-sm">Avg Sale</span>
                            <span className="font-semibold">{formatCurrency(detail.avgSaleValue)}</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>Profit/Transaction: {formatCurrency(detail.transactionCount > 0 ? detail.totalProfit / detail.transactionCount : 0)}</span>
                          <span>Sales Rank: #{index + 1}</span>
                        </div>
                        
                        <div className="flex space-x-2 pt-2">
                          <Button
                            onClick={() => generateSalesReport(detail.location)}
                            disabled={isGeneratingReport}
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-gray-700 hover:bg-gray-600"
                          >
                            <FaFilePdf size={12} className="mr-1" />
                            PDF
                          </Button>
                          <Button
                            onClick={() => generateExcelReport('sales', detail.location)}
                            disabled={isGeneratingReport}
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-green-700 hover:bg-green-600"
                          >
                            <FaFileExcel size={12} className="mr-1" />
                            Excel
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                
                {locationDetails.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <FaShoppingCart className="text-4xl mx-auto mb-4 opacity-50" />
                    <p>No sales data available for selected filters</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Sales Transactions */}
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>
                  <FaClipboardList className="inline mr-2 text-green-400" />
                  Recent Sales Transactions ({filteredSales.length})
                </CardTitle>
                <CardDescription>
                  Showing {salesTimeFilter} sales
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.slice(0, 20).map((sale, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="font-mono text-sm">{sale.invoiceNumber || 'N/A'}</div>
                          </TableCell>
                          <TableCell>
                            {formatDate(sale.soldAt)}
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold">{sale.customerName || 'Walk-in'}</div>
                            <div className="text-gray-400 text-xs">
                              {sale.customerPhone || 'No phone'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-green-900/30 text-green-300 border-green-700">
                              {sale.location || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">{sale.items?.length || 0}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              sale.paymentMethod === 'Cash' ? 'bg-green-900/30 text-green-300 border-green-700' :
                              sale.paymentMethod === 'Card' ? 'bg-blue-900/30 text-blue-300 border-blue-700' :
                              'bg-yellow-900/30 text-yellow-300 border-yellow-700'
                            }>
                              {sale.paymentMethod || 'Cash'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-green-400 font-semibold">
                            {formatCurrency(sale.totalAmount || 0)}
                          </TableCell>
                          <TableCell>
                            <span className={`font-bold ${sale.totalProfit > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {formatCurrency(sale.totalProfit || 0)}
                            </span>
                            <div className="text-gray-400 text-xs">
                              {sale.totalAmount > 0 ? `${(((sale.totalProfit || 0) / sale.totalAmount) * 100).toFixed(1)}% margin` : 'N/A'}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                
                {filteredSales.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <FaShoppingCart className="text-3xl mx-auto mb-4 opacity-50" />
                    <p>No sales transactions found for selected filters</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab Content */}
          <TabsContent value="reports" className="space-y-6">
            <Card className="bg-gray-800/50 backdrop-blur-sm border border-gray-700">
              <CardHeader>
                <CardTitle>
                  <FaFilePdf className="inline mr-2" />
                  Comprehensive Report Generation
                </CardTitle>
                <CardDescription>
                  Generate detailed reports for analysis and record-keeping
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Stock Reports */}
                  <Card className="bg-gray-800/50">
                    <CardHeader>
                      <CardTitle className="text-blue-300">Stock Reports</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        onClick={() => generateStockReport('all')}
                        disabled={isGeneratingReport}
                        className="w-full justify-between bg-blue-700 hover:bg-blue-600"
                      >
                        <span>All Locations Stock Report</span>
                        <FaArrowRight className="text-gray-400" />
                      </Button>
                      <Button
                        onClick={() => generateStockReport('all')}
                        disabled={isGeneratingReport}
                        className="w-full justify-between bg-gray-700 hover:bg-gray-600"
                      >
                        <span>Complete Stock Inventory Report</span>
                        <FaArrowRight className="text-gray-400" />
                      </Button>
                      <Button
                        onClick={() => {
                          const lowStockItems = stocks.filter(stock => 
                            (stock.quantity || 0) <= (stock.minStockLevel || 5)
                          );
                          if (lowStockItems.length > 0) {
                            setSuccess(`Found ${lowStockItems.length} low stock items`);
                          } else {
                            setError('No low stock items found');
                          }
                        }}
                        disabled={isGeneratingReport}
                        className="w-full justify-between bg-gray-700 hover:bg-gray-600"
                      >
                        <span>Low Stock Alert Report</span>
                        <FaArrowRight className="text-gray-400" />
                      </Button>
                    </CardContent>
                  </Card>
                  
                  {/* Sales Reports */}
                  <Card className="bg-gray-800/50">
                    <CardHeader>
                      <CardTitle className="text-green-300">Sales Reports</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        onClick={() => {
                          setSalesTimeFilter('today');
                          setTimeout(() => generateSalesReport('all'), 100);
                        }}
                        disabled={isGeneratingReport}
                        className="w-full justify-between bg-green-700 hover:bg-green-600"
                      >
                        <span>Daily Sales Report</span>
                        <FaArrowRight className="text-gray-400" />
                      </Button>
                      <Button
                        onClick={() => {
                          setSalesTimeFilter('month');
                          setTimeout(() => generateSalesReport('all'), 100);
                        }}
                        disabled={isGeneratingReport}
                        className="w-full justify-between bg-gray-700 hover:bg-gray-600"
                      >
                        <span>Monthly Sales Report</span>
                        <FaArrowRight className="text-gray-400" />
                      </Button>
                      <Button
                        onClick={() => generateStockReport('all')}
                        disabled={isGeneratingReport}
                        className="w-full justify-between bg-gray-700 hover:bg-gray-600"
                      >
                        <span>Location Sales Comparison</span>
                        <FaArrowRight className="text-gray-400" />
                      </Button>
                    </CardContent>
                  </Card>
                  
                  {/* Location-Specific Reports */}
                  <Card className="md:col-span-2 bg-gray-800/50">
                    <CardHeader>
                      <CardTitle className="text-purple-300">Location-Specific Reports</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {locations.map((location, index) => (
                          <div key={index} className="flex flex-col space-y-2">
                            <Button
                              onClick={() => generateStockReport(location)}
                              disabled={isGeneratingReport}
                              className="bg-blue-700 hover:bg-blue-600 flex flex-col items-center justify-center"
                            >
                              <FaWarehouse className="mb-1" />
                              <span className="text-xs">Stock</span>
                            </Button>
                            <Button
                              onClick={() => generateSalesReport(location)}
                              disabled={isGeneratingReport}
                              className="bg-green-700 hover:bg-green-600 flex flex-col items-center justify-center"
                            >
                              <FaShoppingCart className="mb-1" />
                              <span className="text-xs">Sales</span>
                            </Button>
                          </div>
                        ))}
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
      <footer className="w-full py-6 mt-8 border-t border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-center md:text-left mb-4 md:mb-0">
              <p className="text-gray-400">
                © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
              </p>
              <p className="text-gray-500 text-sm mt-1">
                Business Dashboard v2.0 • Last updated: Today
              </p>
            </div>
            <div className="text-gray-400 text-sm">
              <Badge variant="outline" className="bg-blue-900/30 text-blue-300 border-blue-700 mr-2">
                {dashboardStats.totalItems} Items
              </Badge>
              <Badge variant="outline" className="bg-green-900/30 text-green-300 border-green-700">
                {salesStats.todayTransactions} Today's Sales
              </Badge>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}