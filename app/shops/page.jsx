'use client'
import { useState, useEffect, useCallback } from 'react';
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
import { 
  FaFilter, FaDownload, FaChartBar, FaStore, FaBoxes,
  FaMoneyBillWave, FaPercent, FaArrowUp, FaArrowDown,
  FaFilePdf, FaFileExcel, FaPrint, FaSearch, FaSync,
  FaLocationArrow, FaWarehouse, FaCalculator, FaClipboardList,
  FaShoppingCart, FaUsers, FaCalendar, FaChartLine,
  FaShoppingBag, FaTags, FaDollarSign, FaCreditCard,
  FaArrowRight
} from 'react-icons/fa';

// Available locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];

export default function StocksDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Stocks State
  const [stocks, setStocks] = useState([]);
  const [filteredStocks, setFilteredStocks] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sales State
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [salesTimeFilter, setSalesTimeFilter] = useState('today');
  const [salesLocationFilter, setSalesLocationFilter] = useState('all');

  // Dashboard Stats
  const [dashboardStats, setDashboardStats] = useState({
    totalItems: 0,
    totalQuantity: 0,
    totalCostValue: 0,
    totalRetailValue: 0,
    potentialProfit: 0,
    lowStockItems: 0
  });

  // Sales Stats
  const [salesStats, setSalesStats] = useState({
    todaySales: 0,
    todayTransactions: 0,
    todayProfit: 0,
    monthlySales: 0,
    monthlyTransactions: 0,
    monthlyProfit: 0,
    avgTransactionValue: 0
  });

  // Location-wise Analytics
  const [locationAnalytics, setLocationAnalytics] = useState({});
  const [locationDetails, setLocationDetails] = useState([]);
  
  // Sales by Location Analytics
  const [salesByLocation, setSalesByLocation] = useState({});
  const [salesLocationDetails, setSalesLocationDetails] = useState([]);

  // UI State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [activeTab, setActiveTab] = useState('stocks');
  const [sortConfig, setSortConfig] = useState({
    key: 'quantity',
    direction: 'desc'
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

  // Format percentage
  const formatPercentage = (value) => {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(1)}%`;
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    const jsDate = date.toDate ? date.toDate() : new Date(date);
    return jsDate.toLocaleDateString('en-MW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get time filter range - CORRECTED VERSION
  const getTimeFilterRange = (filter) => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch(filter) {
      case 'today':
        // Set to beginning of today
        start.setHours(0, 0, 0, 0);
        // Set to end of today
        end.setHours(23, 59, 59, 999);
        break;
      case 'yesterday':
        // Go back 1 day
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        // Go back 7 days
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        // First day of current month
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        // Last day of current month
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        // Default to current month
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
    }

    // Convert JavaScript Date to Firebase Timestamp
    return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
  };

  // Fetch all stocks
  const fetchAllStocks = useCallback(async () => {
    try {
      const stocksQuery = query(
        collection(db, 'stocks'),
        where('isActive', '==', true)
      );
      const stocksSnapshot = await getDocs(stocksQuery);
      const stocksData = stocksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setStocks(stocksData);
      calculateDashboardStats(stocksData);
    } catch (error) {
      console.error('Failed to fetch stocks:', error);
      setError('Failed to fetch stocks: ' + error.message);
    }
  }, []);

  // Fetch sales data
  const fetchSalesData = useCallback(async () => {
    try {
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
      calculateSalesStats(salesData);
      calculateSalesByLocation(salesData);
    } catch (error) {
      console.error('Failed to fetch sales:', error);
      setError('Failed to fetch sales data: ' + error.message);
    }
  }, []);

  // Calculate dashboard statistics
  const calculateDashboardStats = (stocksData) => {
    try {
      const filtered = filterStocks(stocksData);
      
      const totalItems = filtered.length;
      const totalQuantity = filtered.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
      const totalCostValue = filtered.reduce((sum, stock) => 
        sum + ((stock.costPrice || 0) * (stock.quantity || 0)), 0);
      const totalRetailValue = filtered.reduce((sum, stock) => 
        sum + ((stock.retailPrice || 0) * (stock.quantity || 0)), 0);
      const potentialProfit = totalRetailValue - totalCostValue;
      const lowStockItems = filtered.filter(stock => 
        (stock.quantity || 0) <= (stock.minStockLevel || 5)
      ).length;

      setDashboardStats({
        totalItems,
        totalQuantity,
        totalCostValue,
        totalRetailValue,
        potentialProfit,
        lowStockItems
      });

      // Calculate location-wise analytics
      calculateLocationAnalytics(filtered);
    } catch (error) {
      console.error('Error calculating stats:', error);
    }
  };

  // Calculate sales statistics
  const calculateSalesStats = (salesData) => {
    try {
      const todayRange = getTimeFilterRange('today');
      const monthRange = getTimeFilterRange('month');
      
      const todaySalesData = salesData.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= todayRange.start && saleTimestamp <= todayRange.end;
      });

      const monthlySalesData = salesData.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= monthRange.start && saleTimestamp <= monthRange.end;
      });

      const todaySales = todaySalesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      const todayProfit = todaySalesData.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
      
      const monthlySales = monthlySalesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      const monthlyProfit = monthlySalesData.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);

      const avgTransactionValue = monthlySalesData.length > 0 
        ? monthlySales / monthlySalesData.length 
        : 0;

      setSalesStats({
        todaySales,
        todayTransactions: todaySalesData.length,
        todayProfit,
        monthlySales,
        monthlyTransactions: monthlySalesData.length,
        monthlyProfit,
        avgTransactionValue
      });

    } catch (error) {
      console.error('Error calculating sales stats:', error);
    }
  };

  // Calculate location-wise analytics for stocks
  const calculateLocationAnalytics = (stocksData) => {
    const analytics = {};
    const details = [];

    LOCATIONS.forEach(location => {
      const locationStocks = stocksData.filter(stock => stock.location === location);
      
      if (locationStocks.length > 0) {
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

        analytics[location] = {
          totalItems,
          totalQuantity,
          totalCostValue,
          totalRetailValue,
          potentialProfit,
          profitMargin,
          lowStockItems
        };

        details.push({
          location,
          totalItems,
          totalQuantity,
          totalCostValue,
          totalRetailValue,
          potentialProfit,
          profitMargin,
          lowStockItems
        });
      }
    });

    setLocationAnalytics(analytics);
    setLocationDetails(details.sort((a, b) => b.potentialProfit - a.potentialProfit));
  };

  // Calculate sales by location
  const calculateSalesByLocation = (salesData) => {
    const analytics = {};
    const details = [];
    const timeRange = getTimeFilterRange(salesTimeFilter);

    LOCATIONS.forEach(location => {
      const locationSales = salesData.filter(sale => {
        if (sale.location !== location) return false;
        
        // Apply time filter
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= timeRange.start && saleTimestamp <= timeRange.end;
      });

      if (locationSales.length > 0) {
        const totalSales = locationSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
        const totalProfit = locationSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
        const transactionCount = locationSales.length;
        const avgSaleValue = totalSales / transactionCount;
        const avgProfitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

        analytics[location] = {
          totalSales,
          totalProfit,
          transactionCount,
          avgSaleValue,
          avgProfitMargin
        };

        details.push({
          location,
          totalSales,
          totalProfit,
          transactionCount,
          avgSaleValue,
          avgProfitMargin
        });
      }
    });

    setSalesByLocation(analytics);
    setSalesLocationDetails(details.sort((a, b) => b.totalSales - a.totalSales));
  };

  // Filter stocks based on location and search
  const filterStocks = (stocksData) => {
    let filtered = [...stocksData];
    
    // Filter by location
    if (selectedLocation !== 'all') {
      filtered = filtered.filter(stock => stock.location === selectedLocation);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(stock =>
        stock.itemCode?.toLowerCase().includes(term) ||
        stock.brand?.toLowerCase().includes(term) ||
        stock.model?.toLowerCase().includes(term) ||
        stock.category?.toLowerCase().includes(term) ||
        stock.supplier?.toLowerCase().includes(term)
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.key] || 0;
      const bValue = b[sortConfig.key] || 0;
      
      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  };

  // Filter sales data
  const filterSalesData = (salesData) => {
    let filtered = [...salesData];
    const timeRange = getTimeFilterRange(salesTimeFilter);

    // Filter by location
    if (salesLocationFilter !== 'all') {
      filtered = filtered.filter(sale => sale.location === salesLocationFilter);
    }

    // Filter by time
    filtered = filtered.filter(sale => {
      const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
      const saleTimestamp = Timestamp.fromDate(saleDate);
      return saleTimestamp >= timeRange.start && saleTimestamp <= timeRange.end;
    });

    return filtered;
  };

  // Update filtered stocks when dependencies change
  useEffect(() => {
    const filtered = filterStocks(stocks);
    setFilteredStocks(filtered);
    calculateDashboardStats(stocks);
  }, [stocks, selectedLocation, searchTerm, sortConfig]);

  // Update filtered sales when dependencies change
  useEffect(() => {
    const filtered = filterSalesData(sales);
    setFilteredSales(filtered);
    calculateSalesByLocation(sales);
  }, [sales, salesTimeFilter, salesLocationFilter]);

  // Request sort
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Generate stock report by location - FIXED VERSION
  const generateLocationPDFReport = (location) => {
    setIsGeneratingReport(true);
    try {
      // FIX: Handle "all" locations case
      let locationStocks;
      let reportLocation;
      
      if (location === 'all' || location === 'All_Locations') {
        locationStocks = stocks; // Get all stocks
        reportLocation = 'ALL LOCATIONS';
      } else {
        locationStocks = stocks.filter(s => s.location === location);
        reportLocation = location.toUpperCase();
      }
      
      // Calculate analytics for the selected stocks
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

      const analytics = {
        totalItems,
        totalQuantity,
        totalCostValue,
        totalRetailValue,
        potentialProfit,
        profitMargin,
        lowStockItems
      };
      
      // Create PDF
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const today = new Date();
      
      // Header with linear effect simulation
      doc.setFillColor(0, 51, 102);
      doc.rect(0, 0, pageWidth, 60, 'F');
      
      // Company Logo/Name
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KM ELECTRONICS', pageWidth / 2, 25, { align: 'center' });
      
      doc.setFontSize(16);
      const reportTitle = location === 'all' || location === 'All_Locations' 
        ? 'COMPLETE STOCK INVENTORY REPORT'
        : 'STOCK INVENTORY REPORT';
      doc.text(reportTitle, pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`${reportLocation}`, pageWidth / 2, 45, { align: 'center' });
      
      // Report Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated on: ${today.toLocaleDateString('en-MW')} ${today.toLocaleTimeString('en-MW', { hour: '2-digit', minute: '2-digit' })}`, 15, 70);
      doc.text(`Generated by: ${user?.fullName || user?.email}`, 15, 77);
      doc.text(`Report ID: STK-${location === 'all' || location === 'All_Locations' ? 'ALL' : location.slice(0, 3).toUpperCase()}-${today.getTime().toString().slice(-6)}`, pageWidth - 15, 70, { align: 'right' });
      
      // Location Summary Box
      doc.setFillColor(240, 248, 255);
      doc.roundedRect(15, 85, pageWidth - 30, 40, 3, 3, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('LOCATION SUMMARY', 20, 95);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Summary columns
      const summaryData = [
        [`Total Items: ${analytics.totalItems || 0}`, `Total Quantity: ${analytics.totalQuantity || 0}`],
        [`Cost Value: ${formatCurrency(analytics.totalCostValue || 0)}`, `Retail Value: ${formatCurrency(analytics.totalRetailValue || 0)}`],
        [`Potential Profit: ${formatCurrency(analytics.potentialProfit || 0)}`, `Profit Margin: ${formatPercentage(analytics.profitMargin || 0)}`],
        [`Low Stock Items: ${analytics.lowStockItems || 0}`, `Report Period: ${today.toLocaleDateString('en-MW')}`]
      ];
      
      let yPos = 105;
      summaryData.forEach(row => {
        doc.text(row[0], 20, yPos);
        doc.text(row[1], pageWidth / 2 + 10, yPos);
        yPos += 7;
      });
      
      // Stock Items Table - Only show if there are items
      if (locationStocks.length > 0) {
        const tableData = locationStocks.map(stock => [
          stock.itemCode || 'N/A',
          `${stock.brand || ''} ${stock.model || ''}`.trim(),
          stock.category || 'N/A',
          stock.location || 'N/A',
          stock.quantity || 0,
          formatCurrency(stock.costPrice || 0),
          formatCurrency(stock.retailPrice || 0),
          formatCurrency((stock.costPrice || 0) * (stock.quantity || 0)),
          formatCurrency((stock.retailPrice || 0) * (stock.quantity || 0)),
          formatCurrency(((stock.retailPrice || 0) - (stock.costPrice || 0)) * (stock.quantity || 0))
        ]);
        
        autoTable(doc, {
          startY: 135,
          head: [['Item Code', 'Product', 'Category', 'Location', 'Qty', 'Cost', 'Retail', 'Total Cost', 'Total Retail', 'Profit']],
          body: tableData,
          theme: 'striped',
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
          margin: { top: 135 },
          styles: {
            overflow: 'linebreak',
            cellPadding: 3
          },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 30 },
            2: { cellWidth: 20 },
            3: { cellWidth: 20 },
            4: { cellWidth: 15 },
            5: { cellWidth: 18 },
            6: { cellWidth: 18 },
            7: { cellWidth: 20 },
            8: { cellWidth: 20 },
            9: { cellWidth: 20 }
          }
        });
      }
      
      // Performance Insights
      let finalY = 135;
      if (locationStocks.length > 0) {
        finalY = doc.lastAutoTable.finalY + 15;
      }
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PERFORMANCE INSIGHTS', 15, finalY);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const insights = [
        `• Inventory Turnover: ${analytics.totalQuantity > 0 ? 'Good' : 'Needs Review'}`,
        `• Profit Margin: ${analytics.profitMargin > 20 ? 'Excellent' : analytics.profitMargin > 10 ? 'Good' : 'Needs Improvement'}`,
        `• Stock Health: ${analytics.lowStockItems === 0 ? 'Healthy' : `${analytics.lowStockItems} items need restocking`}`,
        `• ${location === 'all' || location === 'All_Locations' ? 'Overall' : 'Location'} Performance: ${analytics.potentialProfit > 1000000 ? 'Outstanding' : analytics.potentialProfit > 500000 ? 'Good' : 'Average'}`
      ];
      
      let insightY = finalY + 10;
      insights.forEach(insight => {
        doc.text(insight, 20, insightY);
        insightY += 7;
      });
      
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('KM ELECTRONICS - CONFIDENTIAL BUSINESS REPORT', pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.text(`Page 1 of 1 | Generated ${today.toLocaleDateString('en-MW')}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
      doc.text('© KM Electronics - All Rights Reserved', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // Save PDF
      const filename = location === 'all' || location === 'All_Locations'
        ? `KM_Complete_Stock_Report_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`
        : `KM_Stock_Report_${location}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`;
      
      doc.save(filename);
      
      setSuccess(`PDF report for ${location === 'all' || location === 'All_Locations' ? 'all locations' : location} generated successfully!`);
    } catch (error) {
      console.error('PDF Generation Error:', error);
      setError('Failed to generate PDF report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Generate Excel report - FIXED VERSION
  const generateLocationExcelReport = (location) => {
    setIsGeneratingReport(true);
    try {
      // FIX: Handle "all" locations case
      let locationStocks;
      let reportLocation;
      
      if (location === 'all' || location === 'All_Locations') {
        locationStocks = stocks; // Get all stocks
        reportLocation = 'ALL LOCATIONS';
      } else {
        locationStocks = stocks.filter(s => s.location === location);
        reportLocation = location;
      }
      
      // Calculate analytics for the selected stocks
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

      const analytics = {
        totalItems,
        totalQuantity,
        totalCostValue,
        totalRetailValue,
        potentialProfit,
        profitMargin,
        lowStockItems
      };
      
      const today = new Date();
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      
      // Summary Sheet
      const summaryData = [
        ['KM ELECTRONICS - STOCK INVENTORY REPORT'],
        [`${reportLocation}`],
        [`Generated on: ${today.toLocaleString('en-MW')}`],
        [`Generated by: ${user?.fullName || user?.email}`],
        [],
        ['LOCATION SUMMARY'],
        ['Total Items:', analytics.totalItems || 0],
        ['Total Quantity:', analytics.totalQuantity || 0],
        ['Total Cost Value:', analytics.totalCostValue || 0],
        ['Total Retail Value:', analytics.totalRetailValue || 0],
        ['Potential Profit:', analytics.potentialProfit || 0],
        ['Profit Margin:', `${formatPercentage(analytics.profitMargin || 0)}`],
        ['Low Stock Items:', analytics.lowStockItems || 0],
        [],
        ['FINANCIAL ANALYSIS'],
        ['Average Cost per Item:', analytics.totalItems > 0 ? (analytics.totalCostValue / analytics.totalItems) : 0],
        ['Average Retail per Item:', analytics.totalItems > 0 ? (analytics.totalRetailValue / analytics.totalItems) : 0],
        ['Average Profit per Item:', analytics.totalItems > 0 ? (analytics.potentialProfit / analytics.totalItems) : 0],
        ['Profitability Index:', analytics.totalCostValue > 0 ? (analytics.potentialProfit / analytics.totalCostValue) : 0]
      ];
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
      
      // Detailed Stock Sheet - Only if there are items
      if (locationStocks.length > 0) {
        const stockRows = locationStocks.map(stock => ({
          'Item Code': stock.itemCode || 'N/A',
          'Brand': stock.brand || 'N/A',
          'Model': stock.model || 'N/A',
          'Category': stock.category || 'N/A',
          'Color': stock.color || 'N/A',
          'Storage': stock.storage || 'N/A',
          'Location': stock.location || 'N/A',
          'Quantity': stock.quantity || 0,
          'Cost Price': stock.costPrice || 0,
          'Retail Price': stock.retailPrice || 0,
          'Wholesale Price': stock.wholesalePrice || 0,
          'Discount %': stock.discountPercentage || 0,
          'Total Cost': (stock.costPrice || 0) * (stock.quantity || 0),
          'Total Retail': (stock.retailPrice || 0) * (stock.quantity || 0),
          'Potential Profit': ((stock.retailPrice || 0) - (stock.costPrice || 0)) * (stock.quantity || 0),
          'Min Stock Level': stock.minStockLevel || 5,
          'Reorder Quantity': stock.reorderQuantity || 10,
          'Supplier': stock.supplier || 'N/A',
          'Warranty (Months)': stock.warrantyPeriod || 12,
          'Added By': stock.addedByName || 'System',
          'Added Date': stock.createdAt?.toDate?.().toLocaleDateString() || 'N/A',
          'Last Updated': stock.updatedAt?.toDate?.().toLocaleDateString() || 'N/A'
        }));
        
        const stockWs = XLSX.utils.json_to_sheet(stockRows);
        XLSX.utils.book_append_sheet(wb, stockWs, 'Stock Details');
        
        // Analysis Sheet
        const analysisData = [
          ['CATEGORY BREAKDOWN'],
          ['Category', 'Items', 'Quantity', 'Cost Value', 'Retail Value', 'Profit']
        ];
        
        // Group by category
        const categoryBreakdown = {};
        locationStocks.forEach(stock => {
          const category = stock.category || 'Other';
          if (!categoryBreakdown[category]) {
            categoryBreakdown[category] = {
              items: 0,
              quantity: 0,
              costValue: 0,
              retailValue: 0
            };
          }
          categoryBreakdown[category].items++;
          categoryBreakdown[category].quantity += stock.quantity || 0;
          categoryBreakdown[category].costValue += (stock.costPrice || 0) * (stock.quantity || 0);
          categoryBreakdown[category].retailValue += (stock.retailPrice || 0) * (stock.quantity || 0);
        });
        
        Object.entries(categoryBreakdown).forEach(([category, data]) => {
          const profit = data.retailValue - data.costValue;
          analysisData.push([
            category,
            data.items,
            data.quantity,
            data.costValue,
            data.retailValue,
            profit
          ]);
        });
        
        const analysisWs = XLSX.utils.aoa_to_sheet(analysisData);
        XLSX.utils.book_append_sheet(wb, analysisWs, 'Category Analysis');
        
        // Location Breakdown (only for "all" locations)
        if (location === 'all' || location === 'All_Locations') {
          const locationData = [['LOCATION BREAKDOWN'], ['Location', 'Items', 'Quantity', 'Cost Value', 'Retail Value', 'Profit']];
          
          const locationBreakdown = {};
          locationStocks.forEach(stock => {
            const loc = stock.location || 'Unknown';
            if (!locationBreakdown[loc]) {
              locationBreakdown[loc] = {
                items: 0,
                quantity: 0,
                costValue: 0,
                retailValue: 0
              };
            }
            locationBreakdown[loc].items++;
            locationBreakdown[loc].quantity += stock.quantity || 0;
            locationBreakdown[loc].costValue += (stock.costPrice || 0) * (stock.quantity || 0);
            locationBreakdown[loc].retailValue += (stock.retailPrice || 0) * (stock.quantity || 0);
          });
          
          Object.entries(locationBreakdown).forEach(([loc, data]) => {
            const profit = data.retailValue - data.costValue;
            locationData.push([
              loc,
              data.items,
              data.quantity,
              data.costValue,
              data.retailValue,
              profit
            ]);
          });
          
          const locationWs = XLSX.utils.aoa_to_sheet(locationData);
          XLSX.utils.book_append_sheet(wb, locationWs, 'Location Analysis');
        }
      }
      
      // Generate filename and save
      const filename = location === 'all' || location === 'All_Locations'
        ? `KM_Complete_Stock_Report_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.xlsx`
        : `KM_Stock_Report_${location}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.xlsx`;
      
      XLSX.writeFile(wb, filename);
      
      setSuccess(`Excel report for ${location === 'all' || location === 'All_Locations' ? 'all locations' : location} generated successfully!`);
    } catch (error) {
      console.error('Excel Generation Error:', error);
      setError('Failed to generate Excel report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Generate sales report by location - FIXED VERSION
  const generateSalesReportByLocation = (location) => {
    setIsGeneratingReport(true);
    try {
      // FIX: Handle "all" locations case
      let locationSales;
      let reportLocation;
      
      if (location === 'all' || location === 'All_Locations') {
        locationSales = sales; // Get all sales
        reportLocation = 'ALL LOCATIONS';
      } else {
        locationSales = sales.filter(s => s.location === location);
        reportLocation = location.toUpperCase();
      }
      
      // Apply the time filter
      const timeRange = getTimeFilterRange(salesTimeFilter);
      locationSales = locationSales.filter(sale => {
        const saleDate = sale.soldAt?.toDate ? sale.soldAt.toDate() : new Date(sale.soldAt);
        const saleTimestamp = Timestamp.fromDate(saleDate);
        return saleTimestamp >= timeRange.start && saleTimestamp <= timeRange.end;
      });
      
      // Calculate analytics
      const totalSales = locationSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
      const totalProfit = locationSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0);
      const transactionCount = locationSales.length;
      const avgSaleValue = transactionCount > 0 ? totalSales / transactionCount : 0;
      const avgProfitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

      const analytics = {
        totalSales,
        totalProfit,
        transactionCount,
        avgSaleValue,
        avgProfitMargin
      };
      
      const today = new Date();
      
      // Create PDF
      const doc = new jsPDF('portrait');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Header
      doc.setFillColor(30, 144, 255);
      doc.rect(0, 0, pageWidth, 60, 'F');
      
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KM ELECTRONICS', pageWidth / 2, 25, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('SALES ANALYSIS REPORT', pageWidth / 2, 35, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`${reportLocation} - ${salesTimeFilter.toUpperCase()}`, pageWidth / 2, 45, { align: 'center' });
      
      // Report Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated: ${today.toLocaleDateString('en-MW')}`, 15, 70);
      doc.text(`Period: ${salesTimeFilter}`, pageWidth - 15, 70, { align: 'right' });
      
      // Sales Summary
      doc.setFillColor(240, 248, 255);
      doc.roundedRect(15, 80, pageWidth - 30, 40, 3, 3, 'F');
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SALES SUMMARY', 20, 90);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const summaryData = [
        [`Total Sales: ${formatCurrency(analytics.totalSales || 0)}`, `Transactions: ${analytics.transactionCount || 0}`],
        [`Total Profit: ${formatCurrency(analytics.totalProfit || 0)}`, `Avg Sale: ${formatCurrency(analytics.avgSaleValue || 0)}`],
        [`Profit Margin: ${formatPercentage(analytics.avgProfitMargin || 0)}`, `Period: ${salesTimeFilter}`]
      ];
      
      let yPos = 100;
      summaryData.forEach(row => {
        doc.text(row[0], 20, yPos);
        doc.text(row[1], pageWidth / 2 + 10, yPos);
        yPos += 7;
      });
      
      // Sales Transactions Table - Only show if there are transactions
      if (locationSales.length > 0) {
        const tableData = locationSales.map(sale => [
          sale.invoiceNumber || 'N/A',
          formatDate(sale.soldAt),
          sale.customerName || 'Walk-in',
          sale.location || 'N/A',
          sale.paymentMethod || 'Cash',
          sale.items?.length || 0,
          formatCurrency(sale.subTotal || 0),
          formatCurrency(sale.discount || 0),
          formatCurrency(sale.totalAmount || 0),
          formatCurrency(sale.totalProfit || 0)
        ]);
        
        autoTable(doc, {
          startY: 130,
          head: [['Invoice', 'Date', 'Customer', 'Location', 'Payment', 'Items', 'Subtotal', 'Discount', 'Total', 'Profit']],
          body: tableData,
          theme: 'striped',
          headStyles: {
            fillColor: [30, 144, 255],
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
          }
        });
      }
      
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('KM ELECTRONICS - SALES REPORT', pageWidth / 2, pageHeight - 20, { align: 'center' });
      doc.text(`Generated ${today.toLocaleDateString('en-MW')}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
      doc.text('© KM Electronics - All Rights Reserved', pageWidth / 2, pageHeight - 10, { align: 'center' });
      
      // Save PDF
      const filename = location === 'all' || location === 'All_Locations'
        ? `KM_Complete_Sales_Report_${salesTimeFilter}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`
        : `KM_Sales_Report_${location}_${salesTimeFilter}_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`;
      
      doc.save(filename);
      
      setSuccess(`Sales report for ${location === 'all' || location === 'All_Locations' ? 'all locations' : location} generated successfully!`);
    } catch (error) {
      console.error('Sales Report Error:', error);
      setError('Failed to generate sales report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Generate all locations PDF
  const generateAllLocationsPDF = () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const today = new Date();
      
      // Header
      doc.setFillColor(30, 30, 46);
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('KM ELECTRONICS', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text('COMPREHENSIVE STOCK ANALYSIS REPORT', pageWidth / 2, 30, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text('All Locations Performance Overview', pageWidth / 2, 40, { align: 'center' });
      
      // Report Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(`Generated: ${today.toLocaleDateString('en-MW')}`, 15, 60);
      doc.text(`By: ${user?.fullName || user?.email}`, pageWidth - 15, 60, { align: 'right' });
      
      // Overall Summary
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('OVERALL SUMMARY', 15, 75);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const summaryRows = [
        ['Total Items:', dashboardStats.totalItems],
        ['Total Quantity:', dashboardStats.totalQuantity],
        ['Total Cost Value:', formatCurrency(dashboardStats.totalCostValue)],
        ['Total Retail Value:', formatCurrency(dashboardStats.totalRetailValue)],
        ['Potential Profit:', formatCurrency(dashboardStats.potentialProfit)],
        ['Low Stock Items:', dashboardStats.lowStockItems]
      ];
      
      let yPos = 85;
      summaryRows.forEach(([label, value]) => {
        doc.text(label, 20, yPos);
        doc.text(value.toString(), 100, yPos);
        yPos += 7;
      });
      
      // Location Performance Table
      const tableData = locationDetails.map(detail => [
        detail.location,
        detail.totalItems,
        detail.totalQuantity,
        formatCurrency(detail.totalCostValue),
        formatCurrency(detail.totalRetailValue),
        formatCurrency(detail.potentialProfit),
        formatPercentage(detail.profitMargin),
        detail.lowStockItems
      ]);
      
      autoTable(doc, {
        startY: 110,
        head: [['Location', 'Items', 'Quantity', 'Cost Value', 'Retail Value', 'Profit', 'Margin', 'Low Stock']],
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
        }
      });
      
      // Performance Chart
      const chartY = doc.lastAutoTable.finalY + 15;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('LOCATION PERFORMANCE RANKING', 15, chartY);
      
      // Simple bar chart representation
      const maxProfit = Math.max(...locationDetails.map(d => d.potentialProfit), 1);
      const barWidth = 150;
      let barY = chartY + 20;
      
      locationDetails.forEach((detail, index) => {
        const barLength = (detail.potentialProfit / maxProfit) * barWidth;
        
        // Bar
        doc.setFillColor(30, 144, 255);
        doc.rect(50, barY - 2, barLength, 6, 'F');
        
        // Label
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        doc.text(detail.location, 15, barY + 2);
        
        // Value
        doc.text(formatCurrency(detail.potentialProfit), 210, barY + 2);
        
        barY += 10;
      });
      
      // Footer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const footerY = barY + 20;
      doc.text('KM ELECTRONICS - ALL LOCATIONS STOCK REPORT', pageWidth / 2, footerY, { align: 'center' });
      doc.text(`Page 1 of 1 | Generated ${today.toLocaleDateString('en-MW')}`, pageWidth / 2, footerY + 5, { align: 'center' });
      
      // Save PDF
      const filename = `KM_All_Locations_Stock_Report_${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}.pdf`;
      doc.save(filename);
      
      setSuccess('All locations PDF report generated successfully!');
    } catch (error) {
      setError('Failed to generate all locations report: ' + error.message);
    } finally {
      setIsGeneratingReport(false);
    }
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
            if (['superadmin', 'admin', 'manager', 'dataEntry'].includes(userData.role)) {
              setUser(userData);
              await fetchAllStocks();
              await fetchSalesData();
              
              // Setup real-time listeners
              const stocksQuery = query(collection(db, 'stocks'), where('isActive', '==', true));
              const unsubscribeStocks = onSnapshot(stocksQuery, (snapshot) => {
                const stocksData = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                }));
                setStocks(stocksData);
                calculateDashboardStats(stocksData);
              });
              
              const salesQuery = query(collection(db, 'sales'), orderBy('soldAt', 'desc'));
              const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
                const salesData = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                }));
                setSales(salesData);
                calculateSalesStats(salesData);
                calculateSalesByLocation(salesData);
              });
              
              return () => {
                unsubscribeStocks();
                unsubscribeSales();
              };
            } else {
              setError('Access denied. Required privileges not found.');
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
  }, [router, fetchAllStocks, fetchSalesData]);

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

  // if (loading) {
  //   return (
  //     <div className="min-h-screen bg-linear-to-br from-gray-900 to-blue-900 flex items-center justify-center">
  //       <div className="text-center">
  //         <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
  //         <div className="text-white text-xl">Loading Dashboard...</div>
  //         <p className="text-gray-400 mt-2">Please wait while we authenticate and load your data</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-blue-900 text-white">
      {/* Messages */}
      {error && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className="bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <span>⚠️</span>
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
      <header className="bg-gray-800/80 backdrop-blur-lg border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold">
                <FaChartLine className="inline mr-2 text-blue-400" />
                KM ELECTRONICS <span className="text-blue-400">Business Dashboard</span>
              </h1>
              <p className="text-gray-400 text-sm">
                Welcome, {user?.fullName || user?.email} | {user?.role?.toUpperCase()}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  fetchAllStocks();
                  fetchSalesData();
                }}
                className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
              >
                <FaSync />
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex space-x-2 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('stocks')}
            className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
              activeTab === 'stocks'
                ? 'bg-blue-600 text-white border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <FaBoxes className="inline mr-2" />
            Stock Management
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
              activeTab === 'sales'
                ? 'bg-green-600 text-white border-b-2 border-green-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <FaShoppingCart className="inline mr-2" />
            Sales Analytics
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
              activeTab === 'reports'
                ? 'bg-purple-600 text-white border-b-2 border-purple-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <FaFilePdf className="inline mr-2" />
            Reports
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Combined Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Inventory Value */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
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
          </div>
          
          {/* Today's Sales */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-green-500/30">
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
          </div>
          
          {/* Monthly Sales */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
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
          </div>
          
          {/* Stock Overview */}
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-orange-500/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-gray-400 text-sm mb-2">Stock Status</h3>
                <p className="text-2xl font-bold text-white">
                  {dashboardStats.totalItems} items
                </p>
                <div className="flex space-x-4 text-sm mt-1">
                  <span className="text-blue-300">{dashboardStats.totalQuantity} units</span>
                  <span className="text-red-300">{dashboardStats.lowStockItems} low stock</span>
                </div>
              </div>
              <div className="bg-orange-500/20 p-3 rounded-lg">
                <FaBoxes className="text-orange-400 text-2xl" />
              </div>
            </div>
          </div>
        </div>

        {/* Stocks Tab Content */}
        {activeTab === 'stocks' && (
          <>
            {/* Stock Filters and Controls */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    <FaFilter className="inline mr-2" />
                    Filter by Location
                  </label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Locations</option>
                    {LOCATIONS.map((location, index) => (
                      <option key={index} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    <FaSearch className="inline mr-2" />
                    Search Inventory
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Search by item code, brand, model..."
                  />
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    <FaDownload className="inline mr-2" />
                    Stock Reports
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => generateLocationPDFReport(selectedLocation)}
                      disabled={isGeneratingReport}
                      className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 px-4 py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <FaFilePdf />
                      <span>Stock PDF</span>
                    </button>
                    <button
                      onClick={() => generateLocationExcelReport(selectedLocation)}
                      disabled={isGeneratingReport}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 px-4 py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <FaFileExcel />
                      <span>Stock Excel</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Location-wise Stock Analytics */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  <FaStore className="inline mr-2 text-blue-400" />
                  Stock Analytics by Location
                </h2>
                <div className="text-sm text-gray-400">
                  {selectedLocation === 'all' ? 'All Locations' : selectedLocation}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {locationDetails.map((detail, index) => (
                  <div key={index} className="bg-gray-700/30 rounded-lg p-5 border border-gray-600/50 hover:border-blue-500/50 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">{detail.location}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        detail.profitMargin > 20 ? 'bg-green-900/50 text-green-300' :
                        detail.profitMargin > 10 ? 'bg-blue-900/50 text-blue-300' :
                        'bg-yellow-900/50 text-yellow-300'
                      }`}>
                        {formatPercentage(detail.profitMargin)}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Items</span>
                        <span className="font-semibold">{detail.totalItems}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Quantity</span>
                        <span className="font-semibold">{detail.totalQuantity}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Cost Value</span>
                        <span className="font-semibold">{formatCurrency(detail.totalCostValue)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Retail Value</span>
                        <span className="font-semibold text-green-400">{formatCurrency(detail.totalRetailValue)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center pt-3 border-t border-gray-600/50">
                        <span className="text-gray-400 text-sm">Potential Profit</span>
                        <span className="font-bold text-lg text-blue-400">{formatCurrency(detail.potentialProfit)}</span>
                      </div>
                      
                      <div className="pt-3">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Low Stock: {detail.lowStockItems}</span>
                          <span>Avg Profit: {formatCurrency(detail.totalItems > 0 ? detail.potentialProfit / detail.totalItems : 0)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex space-x-2">
                      <button
                        onClick={() => generateLocationPDFReport(detail.location)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm transition-colors flex items-center justify-center space-x-1"
                      >
                        <FaFilePdf size={12} />
                        <span>PDF</span>
                      </button>
                      <button
                        onClick={() => generateLocationExcelReport(detail.location)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-green-700 hover:bg-green-600 px-3 py-2 rounded text-sm transition-colors flex items-center justify-center space-x-1"
                      >
                        <FaFileExcel size={12} />
                        <span>Excel</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {locationDetails.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FaBoxes className="text-4xl mx-auto mb-4 opacity-50" />
                  <p>No stock data available for selected filters</p>
                </div>
              )}
            </div>

            {/* Detailed Stock List */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  <FaClipboardList className="inline mr-2 text-blue-400" />
                  Detailed Stock List ({filteredStocks.length} items)
                </h2>
                <div className="text-sm text-gray-400">
                  Sorted by: {sortConfig.key} ({sortConfig.direction})
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th 
                        className="text-left py-3 px-2 cursor-pointer hover:bg-gray-700/50"
                        onClick={() => requestSort('itemCode')}
                      >
                        Item Code {sortConfig.key === 'itemCode' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th 
                        className="text-left py-3 px-2 cursor-pointer hover:bg-gray-700/50"
                        onClick={() => requestSort('brand')}
                      >
                        Product {sortConfig.key === 'brand' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="text-left py-3 px-2">Location</th>
                      <th 
                        className="text-left py-3 px-2 cursor-pointer hover:bg-gray-700/50"
                        onClick={() => requestSort('quantity')}
                      >
                        Qty {sortConfig.key === 'quantity' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </th>
                      <th className="text-left py-3 px-2">Cost</th>
                      <th className="text-left py-3 px-2">Retail</th>
                      <th className="text-left py-3 px-2">Total Cost</th>
                      <th className="text-left py-3 px-2">Total Retail</th>
                      <th className="text-left py-3 px-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStocks.map((stock, index) => {
                      const totalCost = (stock.costPrice || 0) * (stock.quantity || 0);
                      const totalRetail = (stock.retailPrice || 0) * (stock.quantity || 0);
                      const profit = totalRetail - totalCost;
                      const isLowStock = (stock.quantity || 0) <= (stock.minStockLevel || 5);
                      
                      return (
                        <tr 
                          key={index} 
                          className={`border-b border-gray-700/30 hover:bg-gray-700/30 ${
                            isLowStock ? 'bg-red-900/10' : ''
                          }`}
                        >
                          <td className="py-3 px-2">
                            <div className="font-mono text-sm">{stock.itemCode || 'N/A'}</div>
                            <div className="text-gray-400 text-xs">{stock.category || 'N/A'}</div>
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-semibold">{stock.brand} {stock.model}</div>
                            <div className="text-gray-400 text-xs">
                              {stock.color && <span className="mr-2">{stock.color}</span>}
                              {stock.storage && <span>{stock.storage}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="px-2 py-1 rounded-full text-xs bg-blue-900/30 text-blue-300">
                              {stock.location}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <div className={`font-semibold ${isLowStock ? 'text-red-400' : ''}`}>
                              {stock.quantity || 0}
                              {isLowStock && <span className="text-xs text-red-300 ml-1">LOW</span>}
                            </div>
                          </td>
                          <td className="py-3 px-2">{formatCurrency(stock.costPrice || 0)}</td>
                          <td className="py-3 px-2 text-green-400">{formatCurrency(stock.retailPrice || 0)}</td>
                          <td className="py-3 px-2">{formatCurrency(totalCost)}</td>
                          <td className="py-3 px-2 text-green-300">{formatCurrency(totalRetail)}</td>
                          <td className="py-3 px-2">
                            <span className={`font-bold ${profit > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {formatCurrency(profit)}
                            </span>
                            <div className="text-gray-400 text-xs">
                              {stock.costPrice > 0 ? `${((profit / totalCost) * 100).toFixed(1)}%` : 'N/A'}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {filteredStocks.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FaSearch className="text-3xl mx-auto mb-4 opacity-50" />
                  <p>No stock items found matching your criteria</p>
                  <p className="text-sm mt-2">Try changing your filters or search term</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Sales Tab Content */}
        {activeTab === 'sales' && (
          <>
            {/* Sales Filters and Controls */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    <FaCalendar className="inline mr-2" />
                    Time Period
                  </label>
                  <select
                    value={salesTimeFilter}
                    onChange={(e) => setSalesTimeFilter(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">This Month</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    <FaLocationArrow className="inline mr-2" />
                    Filter by Location
                  </label>
                  <select
                    value={salesLocationFilter}
                    onChange={(e) => setSalesLocationFilter(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-3 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="all">All Locations</option>
                    {LOCATIONS.map((location, index) => (
                      <option key={index} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-400 text-sm mb-2">
                    <FaDownload className="inline mr-2" />
                    Sales Reports
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => generateSalesReportByLocation(salesLocationFilter)}
                      disabled={isGeneratingReport}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 px-4 py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <FaFilePdf />
                      <span>Sales PDF</span>
                    </button>
                    <button
                      onClick={() => generateLocationExcelReport(salesLocationFilter)}
                      disabled={isGeneratingReport}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 px-4 py-3 rounded-lg transition-colors flex items-center justify-center space-x-2"
                    >
                      <FaFileExcel />
                      <span>Sales Excel</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sales Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-green-500/30">
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
              </div>
              
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-blue-500/30">
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
              </div>
              
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30">
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
              </div>
            </div>

            {/* Sales by Location Analytics */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 mb-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  <FaStore className="inline mr-2 text-green-400" />
                  Sales Performance by Location ({salesTimeFilter})
                </h2>
                <div className="text-sm text-gray-400">
                  {salesLocationFilter === 'all' ? 'All Locations' : salesLocationFilter}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {salesLocationDetails.map((detail, index) => (
                  <div key={index} className="bg-gray-700/30 rounded-lg p-5 border border-gray-600/50 hover:border-green-500/50 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-lg">{detail.location}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        detail.avgProfitMargin > 20 ? 'bg-green-900/50 text-green-300' :
                        detail.avgProfitMargin > 10 ? 'bg-blue-900/50 text-blue-300' :
                        'bg-yellow-900/50 text-yellow-300'
                      }`}>
                        {formatPercentage(detail.avgProfitMargin)}
                      </span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Total Sales</span>
                        <span className="font-semibold text-green-400">{formatCurrency(detail.totalSales)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Transactions</span>
                        <span className="font-semibold">{detail.transactionCount}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Total Profit</span>
                        <span className="font-semibold text-blue-400">{formatCurrency(detail.totalProfit)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-sm">Avg Sale</span>
                        <span className="font-semibold">{formatCurrency(detail.avgSaleValue)}</span>
                      </div>
                      
                      <div className="pt-3 border-t border-gray-600/50">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Profit/Transaction: {formatCurrency(detail.transactionCount > 0 ? detail.totalProfit / detail.transactionCount : 0)}</span>
                          <span>Sales Rank: #{index + 1}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex space-x-2">
                      <button
                        onClick={() => generateSalesReportByLocation(detail.location)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-sm transition-colors flex items-center justify-center space-x-1"
                      >
                        <FaFilePdf size={12} />
                        <span>PDF</span>
                      </button>
                      <button
                        onClick={() => generateLocationExcelReport(detail.location)}
                        disabled={isGeneratingReport}
                        className="flex-1 bg-green-700 hover:bg-green-600 px-3 py-2 rounded text-sm transition-colors flex items-center justify-center space-x-1"
                      >
                        <FaFileExcel size={12} />
                        <span>Excel</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              {salesLocationDetails.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FaShoppingCart className="text-4xl mx-auto mb-4 opacity-50" />
                  <p>No sales data available for selected filters</p>
                </div>
              )}
            </div>

            {/* Recent Sales Transactions */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  <FaClipboardList className="inline mr-2 text-green-400" />
                  Recent Sales Transactions ({filteredSales.length})
                </h2>
                <div className="text-sm text-gray-400">
                  Showing {salesTimeFilter} sales
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-2">Invoice</th>
                      <th className="text-left py-3 px-2">Date</th>
                      <th className="text-left py-3 px-2">Customer</th>
                      <th className="text-left py-3 px-2">Location</th>
                      <th className="text-left py-3 px-2">Items</th>
                      <th className="text-left py-3 px-2">Payment</th>
                      <th className="text-left py-3 px-2">Amount</th>
                      <th className="text-left py-3 px-2">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.slice(0, 20).map((sale, index) => (
                      <tr key={index} className="border-b border-gray-700/30 hover:bg-gray-700/30">
                        <td className="py-3 px-2">
                          <div className="font-mono text-sm">{sale.invoiceNumber || 'N/A'}</div>
                        </td>
                        <td className="py-3 px-2">
                          {formatDate(sale.soldAt)}
                        </td>
                        <td className="py-3 px-2">
                          <div className="font-semibold">{sale.customerName || 'Walk-in'}</div>
                          <div className="text-gray-400 text-xs">
                            {sale.customerPhone || 'No phone'}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className="px-2 py-1 rounded-full text-xs bg-green-900/30 text-green-300">
                            {sale.location || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="font-semibold">{sale.items?.length || 0}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            sale.paymentMethod === 'Cash' ? 'bg-green-900/30 text-green-300' :
                            sale.paymentMethod === 'Card' ? 'bg-blue-900/30 text-blue-300' :
                            'bg-yellow-900/30 text-yellow-300'
                          }`}>
                            {sale.paymentMethod || 'Cash'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-green-400 font-semibold">
                          {formatCurrency(sale.totalAmount || 0)}
                        </td>
                        <td className="py-3 px-2">
                          <span className={`font-bold ${sale.totalProfit > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                            {formatCurrency(sale.totalProfit || 0)}
                          </span>
                          <div className="text-gray-400 text-xs">
                            {sale.totalAmount > 0 ? `${(((sale.totalProfit || 0) / sale.totalAmount) * 100).toFixed(1)}% margin` : 'N/A'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {filteredSales.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <FaShoppingCart className="text-3xl mx-auto mb-4 opacity-50" />
                  <p>No sales transactions found for selected filters</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Reports Tab Content */}
        {activeTab === 'reports' && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold">
                  <FaFilePdf className="inline mr-2" />
                  Comprehensive Report Generation
                </h3>
                <p className="text-gray-400 text-sm">
                  Generate detailed reports for analysis and record-keeping
                </p>
              </div>
              <div className="text-sm text-gray-300">
                Available in PDF & Excel formats
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-800/50 rounded-lg p-5">
                <h4 className="font-bold mb-4 text-blue-300">Stock Reports</h4>
                <div className="space-y-3">
                  <button
                    onClick={() => generateAllLocationsPDF()}
                    disabled={isGeneratingReport}
                    className="w-full bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 px-4 py-3 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>All Locations Stock Report</span>
                    <FaArrowRight className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => generateLocationPDFReport('all')}
                    disabled={isGeneratingReport}
                    className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-4 py-3 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>Complete Stock Inventory Report</span>
                    <FaArrowRight className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => {
                      // Generate report for low stock items
                      const lowStockItems = stocks.filter(stock => 
                        (stock.quantity || 0) <= (stock.minStockLevel || 5)
                      );
                      if (lowStockItems.length > 0) {
                        // Create a temporary location for low stock report
                        const originalLocation = selectedLocation;
                        setSelectedLocation('all');
                        setTimeout(() => {
                          generateLocationPDFReport('low_stock');
                          setSelectedLocation(originalLocation);
                        }, 100);
                      } else {
                        setError('No low stock items found');
                      }
                    }}
                    disabled={isGeneratingReport}
                    className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-4 py-3 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>Low Stock Alert Report</span>
                    <FaArrowRight className="text-gray-400" />
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-5">
                <h4 className="font-bold mb-4 text-green-300">Sales Reports</h4>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setSalesTimeFilter('today');
                      setTimeout(() => generateSalesReportByLocation('all'), 100);
                    }}
                    disabled={isGeneratingReport}
                    className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-800 px-4 py-3 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>Daily Sales Report</span>
                    <FaArrowRight className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => {
                      setSalesTimeFilter('month');
                      setTimeout(() => generateSalesReportByLocation('all'), 100);
                    }}
                    disabled={isGeneratingReport}
                    className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-4 py-3 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>Monthly Sales Report</span>
                    <FaArrowRight className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => generateAllLocationsPDF()}
                    disabled={isGeneratingReport}
                    className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-4 py-3 rounded-lg transition-colors flex items-center justify-between"
                  >
                    <span>Location Sales Comparison</span>
                    <FaArrowRight className="text-gray-400" />
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-5 md:col-span-2">
                <h4 className="font-bold mb-4 text-purple-300">Location-Specific Reports</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {LOCATIONS.map((location, index) => (
                    <div key={index} className="flex flex-col space-y-2">
                      <button
                        onClick={() => generateLocationPDFReport(location)}
                        disabled={isGeneratingReport}
                        className="bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 px-3 py-2 rounded transition-colors flex flex-col items-center justify-center"
                      >
                        <FaWarehouse className="mb-1" />
                        <span className="text-xs">Stock</span>
                      </button>
                      <button
                        onClick={() => generateSalesReportByLocation(location)}
                        disabled={isGeneratingReport}
                        className="bg-green-700 hover:bg-green-600 disabled:bg-green-800 px-3 py-2 rounded transition-colors flex flex-col items-center justify-center"
                      >
                        <FaShoppingCart className="mb-1" />
                        <span className="text-xs">Sales</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="w-full py-6 mt-8 border-t border-gray-800">
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
              <span className="inline-block px-2 py-1 rounded bg-blue-900/30 mr-2">
                {dashboardStats.totalItems} Items
              </span>
              <span className="inline-block px-2 py-1 rounded bg-green-900/30">
                {salesStats.todayTransactions} Today's Sales
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}