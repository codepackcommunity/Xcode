'use client'
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, getDoc,
  deleteDoc
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FaEdit, FaSave, FaTrash, FaFilePdf, FaFileExcel, 
  FaMoneyBillWave, FaWarehouse, FaChartBar, FaEye,
  FaPrint, FaFileCsv, FaHistory, FaBell, FaSearch,
  FaFilter, FaSortAmountDown, FaSortAmountUp, FaCalendarAlt,
  FaUser, FaPhone, FaEnvelope, FaMapMarkerAlt, FaCreditCard
} from 'react-icons/fa';

// Locations
const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const CATEGORIES = ['Smartphone', 'Tablet', 'Laptop', 'Accessory', 'TV', 'Audio', 'Other'];

export default function SuperAdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Dashboard Stats
  const [dashboardStats, setDashboardStats] = useState({
    totalStockValue: 0,
    activeInstallments: 0,
    totalPaid: 0,
    totalPending: 0,
    lowStockItems: 0,
    overdueInstallments: 0,
    todaySales: 0,
    todayRevenue: 0
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
  const [newInstallment, setNewInstallment] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    customerAddress: '',
    itemId: '',
    itemName: '',
    totalAmount: '',
    initialPayment: '',
    totalInstallments: '12',
    installmentAmount: '',
    startDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    status: 'active',
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
    category: 'all'
  });

  // UI State
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(amount);
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

      // Fetch installments
      const installmentsSnapshot = await getDocs(collection(db, 'installments'));
      const installmentsData = installmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallments(installmentsData);

      // Fetch installment payments
      const paymentsSnapshot = await getDocs(collection(db, 'installmentPayments'));
      const paymentsData = paymentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setInstallmentPayments(paymentsData);

      // Calculate dashboard stats
      calculateDashboardStats(stocksData, installmentsData, paymentsData);

    } catch (error) {
      setError('Failed to fetch data: ' + error.message);
    }
  }, []);

  // Calculate dashboard statistics
  const calculateDashboardStats = (stocksData, installmentsData, paymentsData) => {
    // Stock stats
    const totalStockValue = stocksData.reduce((sum, stock) => 
      sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0);

    const lowStockItems = stocksData.filter(stock => 
      (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) && 
      (parseInt(stock.quantity) || 0) > 0
    ).length;

    // Installment stats
    const activeInstallments = installmentsData.filter(i => i.status === 'active').length;
    
    const overdueInstallments = installmentsData.filter(i => {
      if (i.status === 'active' && i.dueDate) {
        const dueDate = i.dueDate.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
        return dueDate < new Date();
      }
      return false;
    }).length;

    const totalPaid = paymentsData.reduce((sum, payment) => 
      sum + (parseFloat(payment.amount) || 0), 0);

    const totalPending = installmentsData.reduce((sum, installment) => {
      if (installment.status === 'active') {
        const paid = paymentsData
          .filter(p => p.installmentId === installment.id)
          .reduce((paidSum, p) => paidSum + (parseFloat(p.amount) || 0), 0);
        return sum + (parseFloat(installment.totalAmount) || 0) - paid;
      }
      return sum;
    }, 0);

    setDashboardStats({
      totalStockValue,
      activeInstallments,
      totalPaid,
      totalPending,
      lowStockItems,
      overdueInstallments,
      todaySales: 0,
      todayRevenue: 0
    });
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
        stock.itemCode?.toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric values
        if (['quantity', 'costPrice', 'retailPrice'].includes(sortConfig.key)) {
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
    
    if (reportFilters.location !== 'all') {
      filtered = filtered.filter(installment => installment.location === reportFilters.location);
    }

    setFilteredInstallments(filtered);
  }, [installments, reportFilters]);

  // CRUD Operations for Stocks
  const handleAddStock = async () => {
    try {
      if (!stockForm.brand || !stockForm.model || !stockForm.itemCode || !stockForm.quantity || !stockForm.location) {
        setError('Please fill in required fields');
        return;
      }

      const stockData = {
        ...stockForm,
        costPrice: parseFloat(stockForm.costPrice) || 0,
        retailPrice: parseFloat(stockForm.retailPrice) || 0,
        wholesalePrice: parseFloat(stockForm.wholesalePrice) || (parseFloat(stockForm.retailPrice) * 0.8) || 0,
        quantity: parseInt(stockForm.quantity) || 0,
        minStockLevel: parseInt(stockForm.minStockLevel) || 5,
        reorderQuantity: parseInt(stockForm.reorderQuantity) || 10,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        addedBy: user.uid,
        addedByName: user.displayName || user.email
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
    if (!window.confirm('Are you sure you want to delete this stock item?')) return;

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
      if (!newInstallment.customerName || !newInstallment.customerPhone || !newInstallment.totalAmount) {
        setError('Please fill in required fields');
        return;
      }

      const selectedStock = stocks.find(s => s.id === newInstallment.itemId);
      if (!selectedStock) {
        setError('Selected item not found');
        return;
      }

      // Calculate 60% initial payment
      const startPrice = calculateInstallmentStartPrice(selectedStock.retailPrice || selectedStock.salePrice);
      const initialPayment = parseFloat(newInstallment.initialPayment) || parseFloat(startPrice);
      const totalAmount = parseFloat(newInstallment.totalAmount);
      const installmentAmount = calculateInstallmentAmount(totalAmount, newInstallment.totalInstallments, initialPayment);

      const installmentData = {
        ...newInstallment,
        customerName: newInstallment.customerName.trim(),
        customerPhone: newInstallment.customerPhone.trim(),
        itemId: newInstallment.itemId,
        itemName: selectedStock.brand + ' ' + selectedStock.model,
        itemCode: selectedStock.itemCode,
        location: selectedStock.location,
        totalAmount: totalAmount,
        initialPayment: initialPayment,
        installmentAmount: parseFloat(installmentAmount),
        remainingAmount: totalAmount - initialPayment,
        paidAmount: initialPayment,
        startDate: new Date(newInstallment.startDate),
        dueDate: newInstallment.dueDate ? new Date(newInstallment.dueDate) : null,
        status: 'active',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: user.displayName || user.email
      };

      // Reduce stock quantity
      if (selectedStock.quantity > 0) {
        await updateDoc(doc(db, 'stocks', selectedStock.id), {
          quantity: parseInt(selectedStock.quantity) - 1,
          updatedAt: serverTimestamp()
        });
      }

      const installmentRef = await addDoc(collection(db, 'installments'), installmentData);

      // Record initial payment
      const paymentData = {
        installmentId: installmentRef.id,
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
        totalInstallments: '12',
        installmentAmount: '',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        status: 'active',
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
        receiptNumber: paymentForm.receiptNumber || `PAY-${Date.now()}`,
        collectedBy: paymentForm.collectedBy || user.displayName || user.email,
        recordedBy: user.uid,
        recordedByName: user.displayName || user.email,
        notes: paymentForm.notes || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'installmentPayments'), paymentData);

      // Update installment
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

  // Report Generation
  const generateInstallmentReportPDF = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();

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
      doc.text(`Generated on: ${new Date().toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Period: ${reportFilters.startDate || 'Start'} to ${reportFilters.endDate || 'End'}`, 20, 52);
      doc.text(`Location: ${reportFilters.location === 'all' ? 'All Locations' : reportFilters.location}`, 20, 59);
      doc.text(`Status: ${reportFilters.status === 'all' ? 'All Statuses' : reportFilters.status}`, 20, 66);

      // Summary Stats
      const totalActive = filteredInstallments.filter(i => i.status === 'active').length;
      const totalCompleted = filteredInstallments.filter(i => i.status === 'completed').length;
      const overdue = filteredInstallments.filter(i => {
        if (i.status === 'active' && i.dueDate) {
          const dueDate = i.dueDate.toDate ? i.dueDate.toDate() : new Date(i.dueDate);
          return dueDate < new Date();
        }
        return false;
      }).length;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SUMMARY', 20, 80);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Active Installments: ${totalActive}`, 20, 90);
      doc.text(`Completed: ${totalCompleted}`, 100, 90);
      doc.text(`Overdue: ${overdue}`, 180, 90);

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
        startY: 100,
        head: [['Customer', 'Phone', 'Item', 'Location', 'Total', 'Paid', 'Pending', 'Status', 'Start Date']],
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
        margin: { top: 100 }
      });

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
      doc.text(`Generated on: ${new Date().toLocaleString('en-MW')}`, 20, 45);
      doc.text(`Location: ${selectedLocation === 'all' ? 'All Locations' : selectedLocation}`, 20, 52);

      // Summary
      const totalValue = filteredStocks.reduce((sum, stock) => 
        sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0);

      const lowStockItems = filteredStocks.filter(stock => 
        (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5) &&
        (parseInt(stock.quantity) || 0) > 0
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
        formatCurrency(parseFloat(stock.costPrice) || 0),
        formatCurrency(parseFloat(stock.retailPrice) || 0),
        formatCurrency((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0))
      ]);

      autoTable(doc, {
        startY: 85,
        head: [['Location', 'Item Code', 'Product', 'Category', 'Qty', 'Cost', 'Retail', 'Total Value']],
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

      // Low Stock Warning
      if (lowStockItems.length > 0) {
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 140, 0);
        doc.text('LOW STOCK ALERT:', 20, finalY);
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        lowStockItems.slice(0, 5).forEach((stock, index) => {
          doc.text(`${stock.itemCode} - ${stock.brand} ${stock.model}: ${stock.quantity} units`, 
            20, finalY + 10 + (index * 5));
        });
      }

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

  // Authentication
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading SuperAdmin Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
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
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold">
                KM ELECTRONICS <span className="text-red-500">SuperAdmin</span>
              </h1>
              <p className="text-gray-400 text-sm">
                Welcome, {user?.displayName || user?.email}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
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
              { id: 'dashboard', name: 'Dashboard' },
              { id: 'stocks', name: 'Stock CRUD' },
              { id: 'installments', name: 'Installments' },
              { id: 'reports', name: 'Reports' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-red-500 text-red-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                }`}
              >
                {tab.name}
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
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-sm mb-2">Total Stock Value</h3>
                  <p className="text-2xl font-bold text-blue-400">
                    {formatCurrency(dashboardStats.totalStockValue)}
                  </p>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-sm mb-2">Active Installments</h3>
                  <p className="text-2xl font-bold text-green-400">
                    {dashboardStats.activeInstallments}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    {dashboardStats.overdueInstallments} overdue
                  </p>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-sm mb-2">Installment Payments</h3>
                  <p className="text-2xl font-bold text-purple-400">
                    {formatCurrency(dashboardStats.totalPaid)}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    {formatCurrency(dashboardStats.totalPending)} pending
                  </p>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-gray-400 text-sm mb-2">Stock Alerts</h3>
                  <p className="text-2xl font-bold text-orange-400">
                    {dashboardStats.lowStockItems}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Low stock items</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setActiveTab('stocks')}
                      className="bg-blue-600 hover:bg-blue-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaWarehouse className="text-2xl mb-2" />
                      <span>Manage Stocks</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('installments')}
                      className="bg-green-600 hover:bg-green-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaMoneyBillWave className="text-2xl mb-2" />
                      <span>Installments</span>
                    </button>
                    <button
                      onClick={generateStockBalanceReportPDF}
                      className="bg-purple-600 hover:bg-purple-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaFilePdf className="text-2xl mb-2" />
                      <span>Stock Report</span>
                    </button>
                    <button
                      onClick={generateInstallmentReportPDF}
                      className="bg-orange-600 hover:bg-orange-700 p-4 rounded-lg transition-colors flex flex-col items-center"
                    >
                      <FaChartBar className="text-2xl mb-2" />
                      <span>Installment Report</span>
                    </button>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
                  <div className="space-y-3">
                    {filteredInstallments.slice(0, 5).map((installment, index) => (
                      <div key={index} className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                        <div>
                          <div className="font-medium">{installment.customerName}</div>
                          <div className="text-gray-400 text-sm">{installment.itemName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-semibold">
                            {formatCurrency(parseFloat(installment.totalAmount) || 0)}
                          </div>
                          <div className="text-gray-400 text-xs">{installment.status}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock CRUD Tab */}
          {activeTab === 'stocks' && (
            <div className="space-y-6">
              {/* Stock Filters */}
              <div className="bg-gray-800 rounded-lg p-4">
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
                    <label className="block text-gray-400 text-sm mb-2">Actions</label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setStockSearch('')}
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
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
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
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Stock Inventory ({filteredStocks.length} items)</h2>
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
                        const isLowStock = (parseInt(stock.quantity) || 0) <= (parseInt(stock.minStockLevel) || 5);
                        
                        return (
                          <tr key={index} className={`border-b border-gray-700/50 ${isLowStock ? 'bg-orange-900/20' : ''}`}>
                            <td className="py-3 px-2">
                              <div className="font-mono text-sm">{stock.itemCode}</div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="font-medium">{stock.brand} {stock.model}</div>
                              <div className="text-gray-400 text-xs">{stock.category}</div>
                            </td>
                            <td className="py-3 px-2">{stock.location}</td>
                            <td className="py-3 px-2">
                              <div className={`font-semibold ${isLowStock ? 'text-orange-400' : ''}`}>
                                {stock.quantity || 0}
                              </div>
                              {isLowStock && (
                                <div className="text-orange-400 text-xs">Low Stock</div>
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

          {/* Installments Tab */}
          {activeTab === 'installments' && (
            <div className="space-y-6">
              {/* Installment Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-400">{dashboardStats.activeInstallments}</div>
                  <div className="text-gray-400 text-sm">Active</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-400">{formatCurrency(dashboardStats.totalPaid)}</div>
                  <div className="text-gray-400 text-sm">Paid</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-400">{formatCurrency(dashboardStats.totalPending)}</div>
                  <div className="text-gray-400 text-sm">Pending</div>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="text-2xl font-bold text-red-400">{dashboardStats.overdueInstallments}</div>
                  <div className="text-gray-400 text-sm">Overdue</div>
                </div>
              </div>

              {/* Create Installment */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">Create New Installment (60% Start)</h2>
                
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
                    <label className="block text-gray-400 text-sm mb-2">Select Item *</label>
                    <select
                      value={newInstallment.itemId}
                      onChange={(e) => {
                        const selected = stocks.find(s => s.id === e.target.value);
                        if (selected) {
                          const retailPrice = parseFloat(selected.retailPrice) || 0;
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
                      onChange={(e) => setNewInstallment({...newInstallment, totalAmount: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Initial Payment (60%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newInstallment.initialPayment}
                      onChange={(e) => setNewInstallment({...newInstallment, initialPayment: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Installments</label>
                    <select
                      value={newInstallment.totalInstallments}
                      onChange={(e) => setNewInstallment({...newInstallment, totalInstallments: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                    >
                      <option value="6">6 Months</option>
                      <option value="12">12 Months</option>
                      <option value="18">18 Months</option>
                      <option value="24">24 Months</option>
                    </select>
                  </div>
                </div>
                
                <button
                  onClick={handleCreateInstallment}
                  className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <span>+</span>
                  <span>Create Installment Plan</span>
                </button>
              </div>

              {/* Record Payment */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">Record Payment</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Select Installment *</label>
                    <select
                      value={paymentForm.installmentId}
                      onChange={(e) => setPaymentForm({...paymentForm, installmentId: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
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
                            <option key={index} value={installment.id}>
                              {installment.customerName} - Pending: {formatCurrency(pendingAmount)}
                            </option>
                          );
                        })}
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
                </div>
                
                <button
                  onClick={handleRecordPayment}
                  className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <FaMoneyBillWave />
                  <span>Record Payment</span>
                </button>
              </div>

              {/* Installments List */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold">Installments ({filteredInstallments.length})</h2>
                  <button
                    onClick={generateInstallmentReportPDF}
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
                        <th className="text-left py-3 px-2">Customer</th>
                        <th className="text-left py-3 px-2">Phone</th>
                        <th className="text-left py-3 px-2">Item</th>
                        <th className="text-left py-3 px-2">Total</th>
                        <th className="text-left py-3 px-2">Paid</th>
                        <th className="text-left py-3 px-2">Pending</th>
                        <th className="text-left py-3 px-2">Status</th>
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
                          <tr key={index} className={`border-b border-gray-700/50 ${isOverdue ? 'bg-red-900/20' : ''}`}>
                            <td className="py-3 px-2">{installment.customerName}</td>
                            <td className="py-3 px-2">{installment.customerPhone}</td>
                            <td className="py-3 px-2">
                              <div>{installment.itemName}</div>
                              <div className="text-gray-400 text-xs">{installment.location}</div>
                            </td>
                            <td className="py-3 px-2">{formatCurrency(parseFloat(installment.totalAmount) || 0)}</td>
                            <td className="py-3 px-2 text-green-400">{formatCurrency(paidAmount)}</td>
                            <td className="py-3 px-2 text-orange-400">{formatCurrency(pendingAmount)}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                installment.status === 'completed' ? 'bg-green-900/50 text-green-300' :
                                isOverdue ? 'bg-red-900/50 text-red-300' :
                                'bg-blue-900/50 text-blue-300'
                              }`}>
                                {installment.status} {isOverdue ? '(Overdue)' : ''}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <button
                                onClick={() => {
                                  setPaymentForm({
                                    ...paymentForm,
                                    installmentId: installment.id,
                                    amount: installment.installmentAmount?.toString() || ''
                                  });
                                }}
                                className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm transition-colors"
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
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Report Type Selection */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4">Generate Reports</h2>
                
                <div className="flex space-x-4 mb-6">
                  <button
                    onClick={() => setReportType('installments')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                      reportType === 'installments' 
                        ? 'bg-blue-600' 
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Installment Report
                  </button>
                  
                  <button
                    onClick={() => setReportType('stocks')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                      reportType === 'stocks' 
                        ? 'bg-blue-600' 
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Stock Balance Report
                  </button>
                </div>

                {/* Report Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                        <label className="block text-gray-400 text-sm mb-2">Status</label>
                        <select
                          value={reportFilters.status}
                          onChange={(e) => setReportFilters({...reportFilters, status: e.target.value})}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
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
                      
                      <div className="md:col-span-2">
                        <label className="block text-gray-400 text-sm mb-2">Stock Status</label>
                        <div className="flex space-x-4">
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              className="w-4 h-4"
                            />
                            <span className="text-sm">Low Stock Only</span>
                          </label>
                        </div>
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
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
                        isGeneratingReport 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isGeneratingReport ? 'Generating...' : 'Generate Installment Report PDF'}
                    </button>
                  ) : (
                    <button
                      onClick={generateStockBalanceReportPDF}
                      disabled={isGeneratingReport}
                      className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
                        isGeneratingReport 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isGeneratingReport ? 'Generating...' : 'Generate Stock Balance Report PDF'}
                    </button>
                  )}
                </div>
              </div>

              {/* Report Preview */}
              {reportType === 'installments' && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-4">Installment Report Preview</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">
                        {filteredInstallments.filter(i => i.status === 'active').length}
                      </div>
                      <div className="text-gray-400 text-sm">Active Installments</div>
                    </div>
                    
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">
                        {formatCurrency(filteredInstallments.reduce((sum, installment) => {
                          const paid = installmentPayments
                            .filter(p => p.installmentId === installment.id)
                            .reduce((paidSum, p) => paidSum + (parseFloat(p.amount) || 0), 0);
                          return sum + paid;
                        }, 0))}
                      </div>
                      <div className="text-gray-400 text-sm">Total Paid Amount</div>
                    </div>
                    
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-orange-400">
                        {formatCurrency(filteredInstallments.reduce((sum, installment) => {
                          const paid = installmentPayments
                            .filter(p => p.installmentId === installment.id)
                            .reduce((paidSum, p) => paidSum + (parseFloat(p.amount) || 0), 0);
                          return sum + (parseFloat(installment.totalAmount) || 0) - paid;
                        }, 0))}
                      </div>
                      <div className="text-gray-400 text-sm">Total Pending Amount</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-2">Customer</th>
                          <th className="text-left py-2">Item</th>
                          <th className="text-left py-2">Total Amount</th>
                          <th className="text-left py-2">Paid</th>
                          <th className="text-left py-2">Pending</th>
                          <th className="text-left py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInstallments.slice(0, 10).map((installment, index) => {
                          const paidAmount = installmentPayments
                            .filter(p => p.installmentId === installment.id)
                            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                          const pendingAmount = (parseFloat(installment.totalAmount) || 0) - paidAmount;
                          
                          return (
                            <tr key={index} className="border-b border-gray-700/50">
                              <td className="py-2">{installment.customerName}</td>
                              <td className="py-2">{installment.itemName}</td>
                              <td className="py-2">{formatCurrency(parseFloat(installment.totalAmount) || 0)}</td>
                              <td className="py-2 text-green-400">{formatCurrency(paidAmount)}</td>
                              <td className="py-2 text-orange-400">{formatCurrency(pendingAmount)}</td>
                              <td className="py-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  installment.status === 'completed' ? 'bg-green-900/50 text-green-300' :
                                  installment.status === 'active' ? 'bg-blue-900/50 text-blue-300' :
                                  'bg-gray-900/50 text-gray-300'
                                }`}>
                                  {installment.status}
                                </span>
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
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold mb-4">Stock Balance Report Preview</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-400">{filteredStocks.length}</div>
                      <div className="text-gray-400 text-sm">Total Items</div>
                    </div>
                    
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-400">
                        {filteredStocks.reduce((sum, stock) => sum + (parseInt(stock.quantity) || 0), 0)}
                      </div>
                      <div className="text-gray-400 text-sm">Total Quantity</div>
                    </div>
                    
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-400">
                        {formatCurrency(filteredStocks.reduce((sum, stock) => 
                          sum + ((parseFloat(stock.costPrice) || 0) * (parseInt(stock.quantity) || 0)), 0))}
                      </div>
                      <div className="text-gray-400 text-sm">Total Value</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-2">Item Code</th>
                          <th className="text-left py-2">Product</th>
                          <th className="text-left py-2">Location</th>
                          <th className="text-left py-2">Quantity</th>
                          <th className="text-left py-2">Cost Price</th>
                          <th className="text-left py-2">Total Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStocks.slice(0, 10).map((stock, index) => (
                          <tr key={index} className="border-b border-gray-700/50">
                            <td className="py-2 font-mono text-sm">{stock.itemCode}</td>
                            <td className="py-2">{stock.brand} {stock.model}</td>
                            <td className="py-2">{stock.location}</td>
                            <td className="py-2">{stock.quantity || 0}</td>
                            <td className="py-2">{formatCurrency(parseFloat(stock.costPrice) || 0)}</td>
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
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 border-t border-gray-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS SuperAdmin Dashboard
        </div>
      </footer>
    </div>
  );
}