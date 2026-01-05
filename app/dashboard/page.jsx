'use client'
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db, storage } from '@/app/lib/firebase/config';
import { 
  collection, query, where, getDocs, doc, updateDoc, 
  serverTimestamp, addDoc, orderBy, onSnapshot, writeBatch,
  deleteDoc, getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const LOCATIONS = ['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu', 'Chitipa', 'Salima'];
const FAULTY_STATUS = ['Reported', 'In Repair', 'Fixed', 'EOS (End of Service)', 'Scrapped'];
const SPARES_OPTIONS = ['Screen', 'Battery', 'Charging Port', 'Camera', 'Motherboard', 'Speaker', 'Microphone', 'Other'];

export default function UserDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const router = useRouter();

  // Data states
  const [stocks, setStocks] = useState([]);
  const [sales, setSales] = useState([]);
  const [faultyPhones, setFaultyPhones] = useState([]);
  const [currentLocation, setCurrentLocation] = useState('');
  
  // Analytics states
  const [salesAnalysis, setSalesAnalysis] = useState({
    totalSales: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    topProducts: {}
  });

  // Quick sale state
  const [quickSale, setQuickSale] = useState({
    itemCode: '',
    quantity: 1,
    customPrice: ''
  });

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

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Refs to track user state for listeners
  const userRef = useRef(null);
  const locationRef = useRef('');
  const unsubscribeRefs = useRef([]);

  // Safe unsubscribe function
  const safeUnsubscribe = (unsubscribe) => {
    try {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    } catch (err) {
      // Silent fail on unsubscribe errors
    }
  };

  // Cleanup all listeners
  const cleanupListeners = useCallback(() => {
    if (unsubscribeRefs.current.length > 0) {
      unsubscribeRefs.current.forEach(safeUnsubscribe);
      unsubscribeRefs.current = [];
    }
  }, []);

  // Handle permission denied errors
  const handleFirestoreError = useCallback((error, context) => {
    if (error.code === 'permission-denied') {
      // Store the error for UI display
      if (context === 'stocks' || context === 'sales') {
        // These are handled by state updates in listeners
      }
      
      // Check auth state silently
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // User is not authenticated - redirect silently
        setTimeout(() => router.push('/login'), 100);
        return;
      }
      
      // User is authenticated but lacks permissions
      // This will be handled by the component UI state
      return;
    }
  }, [router]);

  // Wrap initializeDashboard in useCallback with proper dependencies
  const initializeDashboard = useCallback(async (userData) => {
    try {
      await Promise.all([
        fetchStocks(userData.location),
        fetchSalesAnalysis(userData.location, userData.uid),
        fetchFaultyPhones(userData.location, userData.uid)
      ]);
      setupRealtimeListeners(userData.location, userData.uid);
    } catch (error) {
      // Silent catch for initialization errors
    }
  }, []);

  // Wrap handleUserAuth in useCallback with proper dependencies
  const handleUserAuth = useCallback(async (firebaseUser) => {
    try {
      const userDoc = await getDocs(
        query(collection(db, 'users'), where('uid', '==', firebaseUser.uid))
      );
      
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        
        if (userData.role === 'sales' || userData.role === 'dataEntry') {
          setUser(userData);
          userRef.current = userData;
          const userLocation = userData.location || 'Lilongwe';
          setCurrentLocation(userLocation);
          locationRef.current = userLocation;
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

  // Wrap setupRealtimeListeners in useCallback
  const setupRealtimeListeners = useCallback((location, userId) => {
    cleanupListeners(); // Clean up existing listeners
    
    if (!location || !userId) {
      return () => {}; // Return empty cleanup function
    }

    // Real-time stock updates for user's location only
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
        handleFirestoreError(error, 'stocks');
        setStocks([]); // Clear stocks on error
      }
    );

    // Real-time sales updates for user's location and user only
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
        setSales(salesData);
        calculateSalesAnalysis(salesData);
      }, 
      (error) => {
        handleFirestoreError(error, 'sales');
        setSales([]); // Clear sales on error
      }
    );

    // Real-time faulty phones updates
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
        setFaultyPhones(faultyData);
      },
      (error) => {
        handleFirestoreError(error, 'faulty-phones');
        setFaultyPhones([]);
      }
    );

    unsubscribeRefs.current.push(unsubscribeStocks, unsubscribeSales, unsubscribeFaulty);

    return cleanupListeners;
  }, [cleanupListeners, handleFirestoreError]);

  // Fetch faulty phones
  const fetchFaultyPhones = useCallback(async (location, userId) => {
    try {
      if (!location || !userId) {
        return;
      }

      const q = query(
        collection(db, 'faultyPhones'),
        where('location', '==', location),
        where('reportedBy', '==', userId),
        orderBy('reportedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const faultyData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setFaultyPhones(faultyData);
    } catch (error) {
      handleFirestoreError(error, 'faulty-fetch');
      setFaultyPhones([]);
    }
  }, [handleFirestoreError]);

  // Wrap fetchSalesAnalysis in useCallback
  const fetchSalesAnalysis = useCallback(async (location, userId) => {
    try {
      if (!location || !userId) {
        return;
      }

      const q = query(
        collection(db, 'sales'),
        where('location', '==', location),
        where('soldBy', '==', userId)
      );
      const querySnapshot = await getDocs(q);
      const salesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSales(salesData);
      calculateSalesAnalysis(salesData);
    } catch (error) {
      handleFirestoreError(error, 'sales-fetch');
      setSales([]);
    }
  }, [handleFirestoreError]);

  // Wrap calculateSalesAnalysis in useCallback
  const calculateSalesAnalysis = useCallback((salesData) => {
    const analysis = {
      totalSales: 0,
      totalRevenue: 0,
      monthlyRevenue: 0,
      topProducts: {}
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
    });

    setSalesAnalysis(analysis);
  }, []);

  // Wrap fetchStocks in useCallback
  const fetchStocks = useCallback(async (location) => {
    try {
      if (!location) {
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
      setStocks(stocksData);
    } catch (error) {
      handleFirestoreError(error, 'stocks-fetch');
      setStocks([]);
    }
  }, [handleFirestoreError]);

  // Authentication and initialization
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

  // Enhanced Sales functions with better error handling
  const handleQuickSale = async () => {
    if (!quickSale.itemCode) {
      alert('Please enter an item code.');
      return;
    }

    try {
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', quickSale.itemCode),
        where('location', '==', currentLocation)
      );
      
      const stockSnapshot = await getDocs(stockQuery);
      
      if (stockSnapshot.empty) {
        alert('Item not found in stock for your location!');
        return;
      }

      const stockDoc = stockSnapshot.docs[0];
      const stock = stockDoc.data();

      // Validate stock data
      if (!stock.quantity && stock.quantity !== 0) {
        alert('Invalid stock data. Please contact administrator.');
        return;
      }

      if (stock.quantity < quickSale.quantity) {
        alert(`Insufficient stock! Only ${stock.quantity} units available.`);
        return;
      }

      // Calculate final price
      let finalPrice;
      if (quickSale.customPrice) {
        finalPrice = parseFloat(quickSale.customPrice);
        if (isNaN(finalPrice) || finalPrice <= 0) {
          alert('Please enter a valid custom price.');
          return;
        }
      } else {
        const salePrice = parseFloat(stock.salePrice) || 0;
        const discountPercentage = parseFloat(stock.discountPercentage) || 0;
        finalPrice = salePrice * (1 - discountPercentage / 100) * quickSale.quantity;
      }

      // Use batch write for atomic operation
      const batch = writeBatch(db);

      // Update stock quantity
      const newQuantity = stock.quantity - quickSale.quantity;
      const stockRef = doc(db, 'stocks', stockDoc.id);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp()
      });

      // Create sale record
      const saleData = {
        itemCode: stock.itemCode,
        brand: stock.brand,
        model: stock.model,
        storage: stock.storage,
        color: stock.color,
        stockId: stockDoc.id,
        quantity: quickSale.quantity,
        originalPrice: parseFloat(stock.salePrice) || 0,
        finalSalePrice: finalPrice,
        customPrice: quickSale.customPrice ? parseFloat(quickSale.customPrice) : null,
        discountPercentage: parseFloat(stock.discountPercentage) || 0,
        soldAt: serverTimestamp(),
        soldBy: user.uid,
        soldByName: user.fullName,
        location: currentLocation,
        saleType: quickSale.customPrice ? 'custom_price' : 'standard',
        status: 'completed'
      };

      const salesRef = doc(collection(db, 'sales'));
      batch.set(salesRef, saleData);

      // Commit the batch
      await batch.commit();

      // Reset form
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
      // Validate input
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

      // Calculate final price
      const salePrice = parseFloat(stockData.salePrice) || 0;
      const discountPercentage = parseFloat(stockData.discountPercentage) || 0;
      const finalPrice = salePrice * (1 - discountPercentage / 100) * quantity;

      // Use batch write for atomic operation
      const batch = writeBatch(db);

      // Update stock quantity
      const newQuantity = stockData.quantity - quantity;
      const stockRef = doc(db, 'stocks', stockId);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp(),
        lastSold: serverTimestamp()
      });

      // Create sale record
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
        status: 'completed'
      };

      const salesRef = doc(collection(db, 'sales'));
      batch.set(salesRef, saleData);

      // Commit the batch
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

  // Faulty Phone Functions
  const handleReportFaulty = async () => {
    try {
      // Validate required fields
      if (!faultyReport.itemCode || !faultyReport.faultDescription) {
        alert('Please fill in required fields: Item Code and Fault Description');
        return;
      }

      // Find the stock item
      const stockQuery = query(
        collection(db, 'stocks'),
        where('itemCode', '==', faultyReport.itemCode),
        where('location', '==', currentLocation)
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

      // Use batch write for atomic operation
      const batch = writeBatch(db);

      // Update stock quantity (remove from available stock)
      const newQuantity = stock.quantity - 1;
      const stockRef = doc(db, 'stocks', stockDoc.id);
      batch.update(stockRef, {
        quantity: newQuantity,
        updatedAt: serverTimestamp()
      });

      // Create faulty phone record
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
        lastUpdated: serverTimestamp()
      };

      const faultyRef = doc(collection(db, 'faultyPhones'));
      batch.set(faultyRef, faultyData);

      // Commit the batch
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
      
      // Get current faulty phone data
      const faultyDoc = await getDoc(faultyRef);
      if (!faultyDoc.exists()) {
        alert('Faulty phone record not found!');
        return;
      }

      const faultyData = faultyDoc.data();
      const newStatus = updates.status;

      // If status is changed to "Fixed", update stock
      if (newStatus === 'Fixed' && faultyData.status !== 'Fixed') {
        // Check if stock exists
        const stockRef = doc(db, 'stocks', faultyData.stockId);
        const stockDoc = await getDoc(stockRef);
        
        if (stockDoc.exists()) {
          const stockData = stockDoc.data();
          // Add back to stock as a fixed item (could be in separate collection for repaired items)
          // For now, we'll add to main stock
          batch.update(stockRef, {
            quantity: (stockData.quantity || 0) + 1,
            updatedAt: serverTimestamp(),
            isRepaired: true,
            repairDate: serverTimestamp()
          });

          // Create repair history record
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
            location: currentLocation
          };

          const repairRef = doc(collection(db, 'repairs'));
          batch.set(repairRef, repairData);
        }
      }

      // Update faulty phone status
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

  const handleDeleteFaulty = async (faultyId) => {
    if (!confirm('Are you sure you want to delete this faulty phone record?')) {
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

  const generatePDFReport = (faultyPhone) => {
    const doc = new jsPDF();
    
    // Add logo/header
    doc.setFontSize(20);
    doc.setTextColor(40, 53, 147);
    doc.text('KM ELECTRONICS', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('FAULTY PHONE REPORT', 105, 30, { align: 'center' });
    
    // Add report details
    doc.setFontSize(10);
    doc.text(`Report ID: ${faultyPhone.id}`, 20, 45);
    doc.text(`Report Date: ${faultyPhone.reportedAt?.toDate().toLocaleDateString()}`, 20, 50);
    doc.text(`Location: ${faultyPhone.location}`, 20, 55);
    doc.text(`Reported By: ${faultyPhone.reportedByName}`, 20, 60);
    
    // Phone details table
    autoTable(doc, {
      startY: 70,
      head: [['Item Code', 'Brand', 'Model', 'IMEI']],
      body: [[
        faultyPhone.itemCode,
        faultyPhone.brand,
        faultyPhone.model,
        faultyPhone.imei || 'N/A'
      ]],
      theme: 'striped',
      headStyles: { fillColor: [40, 53, 147] }
    });
    
    // Fault details table
    autoTable(doc, {
      startY: 100,
      head: [['Fault Description', 'Status', 'Reported Cost']],
      body: [[
        faultyPhone.faultDescription,
        faultyPhone.status,
        `MK ${faultyPhone.reportedCost?.toLocaleString()}`
      ]],
      theme: 'striped',
      headStyles: { fillColor: [40, 53, 147] }
    });
    
    // Spares needed
    if (faultyPhone.sparesNeeded?.length > 0 || faultyPhone.otherSpares) {
      const spares = [...faultyPhone.sparesNeeded];
      if (faultyPhone.otherSpares) spares.push(faultyPhone.otherSpares);
      
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        head: [['Spares Required']],
        body: [spares.map(spare => [spare])],
        theme: 'striped',
        headStyles: { fillColor: [40, 53, 147] }
      });
    }
    
    // Customer details if available
    if (faultyPhone.customerName) {
      autoTable(doc, {
        startY: doc.lastAutoTable?.finalY + 10 || 130,
        head: [['Customer Name', 'Phone Number']],
        body: [[faultyPhone.customerName, faultyPhone.customerPhone || 'N/A']],
        theme: 'striped',
        headStyles: { fillColor: [40, 53, 147] }
      });
    }
    
    // Add footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text('This is an automated report generated by KM Electronics System', 105, pageHeight - 10, { align: 'center' });
    
    // Save PDF
    doc.save(`Faulty_Report_${faultyPhone.itemCode}_${Date.now()}.pdf`);
  };

  // Installment Functions
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
        location: currentLocation,
        status: 'active',
        payments: installmentData.downPayment > 0 ? [{
          amount: parseFloat(installmentData.downPayment),
          date: new Date().toISOString().split('T')[0],
          type: 'down_payment'
        }] : []
      };

      await addDoc(collection(db, 'installments'), installmentDataToSave);

      // Update sale record to mark as installment
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

  // Utility functions
  const getFilteredStocks = () => {
    let filtered = stocks;
    
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
    let filtered = faultyPhones;
    
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
    return [...new Set(stocks.map(stock => stock.brand).filter(Boolean))];
  };

  const calculateTotalStockValue = () => {
    return stocks.reduce((total, stock) => {
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

  // Loading state
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
                KM ELECTRONICS <span className='text-blue-500'></span>
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
            {['dashboard', 'stocks', 'quickSale', 'salesHistory', 'faultyPhones', 'installments'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-white/70 hover:text-white hover:border-white/30'
                }`}
              >
                {tab === 'dashboard' && 'Dashboard'}
                {tab === 'stocks' && 'Stock & Sales'}
                {tab === 'quickSale' && 'Quick Sale'}
                {tab === 'salesHistory' && 'My Sales'}
                {tab === 'faultyPhones' && 'Faulty Phones'}
                {tab === 'installments' && 'Installments'}
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
                  <h3 className='text-white/70 text-sm'>My Total Sales</h3>
                  <p className='text-2xl font-bold text-blue-400'>
                    {salesAnalysis.totalSales}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>My Total Revenue</h3>
                  <p className='text-2xl font-bold text-purple-400'>
                    MK {salesAnalysis.totalRevenue?.toLocaleString() || 0}
                  </p>
                </div>
                <div className='bg-white/5 rounded-lg p-6 border border-white/10'>
                  <h3 className='text-white/70 text-sm'>Faulty Phones Reported</h3>
                  <p className='text-2xl font-bold text-orange-400'>
                    {faultyPhones.length}
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
                    <button
                      onClick={() => setActiveTab('faultyPhones')}
                      className='w-full bg-red-600 hover:bg-red-700 text-red-200 px-4 py-3 rounded-lg transition-colors text-left'
                    >
                      <div className='font-semibold'>View Faulty Phones</div>
                      <div className='text-sm'>Track and update repair status</div>
                    </button>
                  </div>
                </div>

                {/* Recent Sales */}
                <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
                  <h2 className='text-xl font-semibold text-white mb-4'>Recent Sales</h2>
                  <div className='space-y-3'>
                    {sales.slice(0, 3).map((sale) => (
                      <div key={sale.id} className='bg-white/5 rounded-lg p-3 border border-white/10'>
                        <div className='flex justify-between items-start'>
                          <div>
                            <div className='font-semibold text-white'>{sale.brand} {sale.model}</div>
                            <div className='text-white/70 text-sm'>Qty: {sale.quantity}</div>
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
                    {sales.length === 0 && (
                      <div className='text-center py-8 text-white/70'>No sales yet</div>
                    )}
                  </div>
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
                    {getFilteredStocks().map((stock) => {
                      const stockStatus = stock.quantity > 10 ? 'bg-green-500/20 text-green-300' :
                                        stock.quantity > 0 ? 'bg-orange-500/20 text-orange-300' :
                                        'bg-red-500/20 text-red-300';

                      return (
                        <tr key={stock.id} className='border-b border-white/10'>
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
                            <span className={`px-2 py-1 rounded-full text-xs ${stockStatus}`}>
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
                                  if (quantity && !isNaN(quantity) && parseInt(quantity) > 0) {
                                    handleSellItem(stock.id, stock, parseInt(quantity));
                                  }
                                }}
                                className='bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors'
                              >
                                Sell Multiple
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {getFilteredStocks().length === 0 && (
                  <div className='text-center py-8 text-white/70'>
                    No stock items found matching your search criteria.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick Sale Tab */}
          {activeTab === 'quickSale' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>Quick Sale</h2>
              
              <div className='max-w-md mx-auto space-y-6'>
                {/* Quick Sale Form */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Process Sale</h3>
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

                {/* Recent Items */}
                <div className='bg-white/5 rounded-lg p-6'>
                  <h3 className='text-lg font-semibold text-white mb-4'>Recent Items</h3>
                  <div className='space-y-2'>
                    {stocks.slice(0, 5).map((stock) => (
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
                          <div className='text-green-400 text-sm'>MK {stock.salePrice || 0}</div>
                          <div className='text-white/50 text-xs'>{stock.quantity} available</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sales History Tab */}
          {activeTab === 'salesHistory' && (
            <div className='bg-white/5 backdrop-blur-lg rounded-lg border border-white/10 p-6'>
              <h2 className='text-xl font-semibold text-white mb-6'>My Sales History</h2>
              
              <div className='overflow-x-auto'>
                <table className='w-full text-white'>
                  <thead>
                    <tr className='border-b border-white/20'>
                      <th className='text-left py-2'>Date</th>
                      <th className='text-left py-2'>Item</th>
                      <th className='text-left py-2'>Quantity</th>
                      <th className='text-left py-2'>Price</th>
                      <th className='text-left py-2'>Type</th>
                      <th className='text-left py-2'>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr key={sale.id} className='border-b border-white/10'>
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
                    {sales.length === 0 && (
                      <tr>
                        <td colSpan='6' className='text-center py-8 text-white/70'>
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
                    {getFilteredFaultyPhones().map((faulty) => (
                      <tr key={faulty.id} className='border-b border-white/10 hover:bg-white/5'>
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
                            onClick={() => generatePDFReport(faulty)}
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
              <h2 className='text-xl font-semibold text-white mb-6'>Installment Plans</h2>
              
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                {sales.filter(sale => !sale.paymentType || sale.paymentType === 'full').slice(0, 6).map((sale) => (
                  <div key={sale.id} className='bg-white/5 rounded-lg p-4 border border-white/10'>
                    <div className='flex justify-between items-start mb-3'>
                      <div>
                        <div className='font-semibold text-white'>{sale.brand} {sale.model}</div>
                        <div className='text-white/70 text-sm'>{sale.itemCode}</div>
                      </div>
                      <div className='text-green-400 font-semibold'>MK {sale.finalSalePrice}</div>
                    </div>
                    <div className='text-white/70 text-sm mb-3'>
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
                {sales.filter(sale => !sale.paymentType || sale.paymentType === 'full').length === 0 && (
                  <div className='col-span-3 text-center py-8 text-white/70'>
                    No sales available for installment plans.
                  </div>
                )}
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
                <h2 className='text-xl font-semibold text-white'>Report Faulty Phone</h2>
                <button
                  onClick={() => setReportModal(false)}
                  className='text-white/70 hover:text-white'
                >
                  ✕
                </button>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <label className='block text-white/70 text-sm mb-2'>Item Code *</label>
                  <input
                    type='text'
                    value={faultyReport.itemCode}
                    onChange={(e) => setFaultyReport({...faultyReport, itemCode: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Enter item code'
                  />
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

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Customer Name (Optional)</label>
                  <input
                    type='text'
                    value={faultyReport.customerName}
                    onChange={(e) => setFaultyReport({...faultyReport, customerName: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Customer name'
                  />
                </div>

                <div>
                  <label className='block text-white/70 text-sm mb-2'>Customer Phone (Optional)</label>
                  <input
                    type='tel'
                    value={faultyReport.customerPhone}
                    onChange={(e) => setFaultyReport({...faultyReport, customerPhone: e.target.value})}
                    className='w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white'
                    placeholder='Phone number'
                  />
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
                  <label className='block text-white/70 text-sm mb-2'>Status</label>
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
                  <label className='block text-white/70 text-sm mb-2'>Notes</label>
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
      <footer className="w-full fixed bottom-0 left-0 z-10 border-t bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-200 text-sm">
          © {new Date().getFullYear()} KM ELECTRONICS | DESIGNED BY COD3PACK
        </div>
      </footer>
    </div>
  );
}