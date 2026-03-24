import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError, secondaryAuth } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { MenuItem, Category, InventoryItem, JournalEntry, Order } from '../types';
import { Plus, Edit2, Trash2, Eye, EyeOff, Save, X, ShoppingBag, LayoutGrid, CheckCircle2, Clock, Ban, ShieldCheck, Monitor, Package, ChefHat, Truck, FileText, BarChart3, Boxes, History, Utensils, Printer, Move, Search, Filter, Calendar, Phone, MapPin, User, Hash, ChevronDown, RotateCcw, Users, BookOpen, Building, Warehouse, Settings, Menu as MenuIcon, Upload, Download, FileSpreadsheet, ChevronRight, CreditCard, Wallet, ArrowRightLeft, Receipt, Percent, TrendingUp, UserPlus } from 'lucide-react';
import TableDesigner from './TableDesigner';
import CRM from './CRM';
import RecipeManager from './RecipeManager';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/format';
import { exportToExcel } from '../utils/excel';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { LedgerGroup } from '../types';

interface AdminPanelProps {
  items: MenuItem[];
  categories: Category[];
  onClose?: () => void;
  onLogout: () => void;
  onOpenPOS?: () => void;
}

export default function AdminPanel({ items, categories, onClose, onLogout, onOpenPOS }: AdminPanelProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'menu' | 'orders' | 'kitchen' | 'inventory' | 'accounting' | 'tables' | 'crm' | 'users' | 'stores' | 'warehouses' | 'mobile' | 'terminals' | 'settings' | 'wastage' | 'recipes' | 'suppliers'>('orders');
  const [accountingSubTab, setAccountingSubTab] = useState<'dashboard' | 'vouchers' | 'bills' | 'banking' | 'taxes' | 'reports'>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [isManageTreeOpen, setIsManageTreeOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newLedgerGroup, setNewLedgerGroup] = useState({ name: '', type: 'Asset' as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' });

  const handleAddLedgerGroup = async () => {
    if (!newLedgerGroup.name) return;
    try {
      await addDoc(collection(db, 'ledgerGroups'), {
        ...newLedgerGroup,
        createdAt: serverTimestamp()
      });
      setNewLedgerGroup({ name: '', type: 'Asset' });
    } catch (error) {
      console.error("Error adding ledger group:", error);
    }
  };

  const deleteLedgerGroup = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ledgerGroups', id));
    } catch (error) {
      console.error("Error deleting ledger group:", error);
    }
  };
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  
  const isSuperAdmin = user?.email === 'ashkan.yaghtin@gmail.com';
  const userRole = profile?.role || 'waiter';

  const canAccess = (tab: string) => {
    if (isSuperAdmin || userRole === 'admin') return true;
    
    switch (tab) {
      case 'dashboard':
      case 'orders':
      case 'tables':
      case 'crm':
      case 'pos':
        return ['manager', 'chef', 'driver', 'waiter'].includes(userRole);
      case 'kitchen':
      case 'inventory':
      case 'wastage':
      case 'menu':
      case 'recipes':
        return ['manager', 'chef'].includes(userRole);
      case 'delivery':
        return ['driver', 'manager'].includes(userRole);
      case 'accounting':
      case 'users':
      case 'stores':
      case 'warehouses':
      case 'settings':
        return ['manager'].includes(userRole);
      default:
        return false;
    }
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [isManagingTree, setIsManagingTree] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [managingRecipeId, setManagingRecipeId] = useState<string | null>(null);
  const [viewingRecipeId, setViewingRecipeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MenuItem>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState<Partial<MenuItem>>({
    name: '',
    price: 0,
    description: '',
    category: categories[0]?.id || '',
    available: true,
    image: ''
  });

  // Inventory Management State
  const [isAddingInventory, setIsAddingInventory] = useState(false);
  const [inventoryForm, setInventoryForm] = useState<Partial<InventoryItem>>({
    name: '',
    stock: 0,
    unit: '',
    costPerUnit: 0,
    lowStockThreshold: 10
  });
  const [adjustingStock, setAdjustingStock] = useState<{ id: string, type: 'add' | 'remove', amount: number } | null>(null);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [editInventoryForm, setEditInventoryForm] = useState<Partial<InventoryItem>>({});

  // Order Management Filters
  const [orderFilters, setOrderFilters] = useState({
    store: '',
    orderNo: '',
    orderType: '',
    fromDate: '',
    toDate: '',
    salesFromDate: '',
    salesToDate: '',
    kotNo: '',
    status: '',
    payment: '',
    customer: '',
    phone: '',
    deliveryZone: '',
    deliveryArea: '',
    driver: '',
    table: '',
    onlineOnly: false,
    hideRevoked: false
  });

  // New Management States
  const [stores, setStores] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [mobileUnits, setMobileUnits] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [wastage, setWastage] = useState<any[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>(null);

  // Accounting Modals
  const [isAddingVoucher, setIsAddingVoucher] = useState(false);
  const [isAddingBill, setIsAddingBill] = useState(false);
  const [isAddingCheque, setIsAddingCheque] = useState(false);
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  
  const [voucherForm, setVoucherForm] = useState({ type: 'receipt', amount: 0, description: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'cash' });
  const [billForm, setBillForm] = useState({ vendorId: '', amount: 0, dueDate: new Date().toISOString().split('T')[0], description: '', status: 'unpaid' });
  const [chequeForm, setChequeForm] = useState({ chequeNumber: '', bank: '', amount: 0, date: new Date().toISOString().split('T')[0], status: 'pending', vendorId: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', phone: '', email: '', address: '' });

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'staff'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStaff(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'staff'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'stores'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'stores'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'warehouses'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'warehouses'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'mobileUnits'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMobileUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'mobileUnits'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'terminals'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTerminals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'terminals'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'ledgerGroups'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLedgerGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerGroup)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ledgerGroups'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'wastage'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWastage(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'wastage'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'settings', 'system'), (doc) => {
      if (doc.exists()) {
        setSystemSettings(doc.data());
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/system'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'journal'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJournal(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journal'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubBills = onSnapshot(collection(db, 'bills'), (snapshot) => {
      setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bills'));
    const unsubVendors = onSnapshot(collection(db, 'vendors'), (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vendors'));
    const unsubVouchers = onSnapshot(collection(db, 'vouchers'), (snapshot) => {
      setVouchers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vouchers'));
    const unsubCheques = onSnapshot(collection(db, 'cheques'), (snapshot) => {
      setCheques(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'cheques'));

    return () => {
      unsubBills();
      unsubVendors();
      unsubVouchers();
      unsubCheques();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'inventory'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || activeTab !== 'accounting') return;
    const q = query(collection(db, 'journal'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJournal(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journal'));
    return () => unsubscribe();
  }, [user, activeTab]);

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: 'expense' as 'sale' | 'expense' | 'wastage',
    amount: 0,
    description: ''
  });

  const handleAddTransaction = async () => {
    try {
      await addDoc(collection(db, 'journal'), {
        ...newTransaction,
        timestamp: serverTimestamp()
      });
      setShowAddTransaction(false);
      setNewTransaction({ type: 'expense', amount: 0, description: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'journal');
    }
  };

  const handleAddVoucher = async () => {
    try {
      await addDoc(collection(db, 'vouchers'), {
        ...voucherForm,
        createdAt: serverTimestamp()
      });
      setIsAddingVoucher(false);
      setVoucherForm({ type: 'receipt', amount: 0, description: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'cash' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vouchers');
    }
  };

  const handleAddBill = async () => {
    try {
      await addDoc(collection(db, 'bills'), {
        ...billForm,
        createdAt: serverTimestamp()
      });
      setIsAddingBill(false);
      setBillForm({ vendorId: '', amount: 0, dueDate: new Date().toISOString().split('T')[0], description: '', status: 'unpaid' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bills');
    }
  };

  const handleAddCheque = async () => {
    try {
      await addDoc(collection(db, 'cheques'), {
        ...chequeForm,
        createdAt: serverTimestamp()
      });
      setIsAddingCheque(false);
      setChequeForm({ chequeNumber: '', bank: '', amount: 0, date: new Date().toISOString().split('T')[0], status: 'pending', vendorId: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'cheques');
    }
  };

  const handleAddVendor = async () => {
    try {
      await addDoc(collection(db, 'vendors'), {
        ...vendorForm,
        createdAt: serverTimestamp()
      });
      setIsAddingVendor(false);
      setVendorForm({ name: '', phone: '', email: '', address: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vendors');
    }
  };

  const handleBulkImport = async (type: 'menu' | 'inventory' | 'recipes', file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      try {
        for (const row of jsonData as any[]) {
          if (type === 'menu') {
            await addDoc(collection(db, 'menu'), {
              name: row.Name,
              price: row.Price,
              description: row.Description || '',
              category: row.Category || categories[0]?.id,
              available: true,
              image: row.Image || ''
            });
          } else if (type === 'inventory') {
            await addDoc(collection(db, 'inventory'), {
              name: row.Name,
              stock: row.Stock || 0,
              unit: row.Unit || 'pcs',
              costPerUnit: row.CostPerUnit || 0,
              lowStockThreshold: row.LowStockThreshold || 10,
              lastUpdated: serverTimestamp()
            });
          } else if (type === 'recipes') {
            const menuItems = await getDocs(query(collection(db, 'menu'), where('name', '==', row.MenuItemName)));
            const inventoryItems = await getDocs(query(collection(db, 'inventory'), where('name', '==', row.IngredientName)));
            
            if (!menuItems.empty && !inventoryItems.empty) {
              const menuItemDoc = menuItems.docs[0];
              const inventoryItemId = inventoryItems.docs[0].id;
              
              const currentRecipe = menuItemDoc.data().recipe || [];
              const existingIngredientIdx = currentRecipe.findIndex((r: any) => r.inventoryItemId === inventoryItemId);
              
              let updatedRecipe;
              if (existingIngredientIdx > -1) {
                updatedRecipe = [...currentRecipe];
                updatedRecipe[existingIngredientIdx].quantity = row.Quantity || 1;
              } else {
                updatedRecipe = [...currentRecipe, {
                  inventoryItemId,
                  quantity: row.Quantity || 1
                }];
              }
              
              await updateDoc(doc(db, 'menu', menuItemDoc.id), {
                recipe: updatedRecipe
              });
            }
          }
        }
        alert(`${type} imported successfully!`);
      } catch (err) {
        console.error(`Bulk import for ${type} failed:`, err);
        alert(`Failed to import ${type}. Check console for details.`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = (type: 'menu' | 'inventory' | 'recipes') => {
    let data = [];
    if (type === 'menu') {
      data = [{ Name: 'Pizza', Price: 12.99, Description: 'Delicious pizza', Category: 'Main', Image: '' }];
    } else if (type === 'inventory') {
      data = [{ Name: 'Flour', Stock: 100, Unit: 'kg', CostPerUnit: 1.5, LowStockThreshold: 10 }];
    } else if (type === 'recipes') {
      data = [{ MenuItemName: 'Pizza', IngredientName: 'Flour', Quantity: 0.5, Unit: 'kg' }];
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${type}_template.xlsx`);
  };

  const formatImageUrl = (url: string) => {
    if (!url) return '';
    if (!url.includes('/') && !url.includes('.') && !url.startsWith('http')) {
      return `https://lh3.googleusercontent.com/d/${url}`;
    }
    return url;
  };

  const handleEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setEditForm(item);
  };

  const handleSave = async (id: string) => {
    try {
      const itemRef = doc(db, 'menu', id);
      const { id: _, ...dataToUpdate } = editForm;
      const updatedItem = {
        ...dataToUpdate,
        image: formatImageUrl(editForm.image || '')
      };
      await updateDoc(itemRef, updatedItem);
      setEditingId(null);
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  const handleEditInventory = (item: InventoryItem) => {
    setEditingInventoryId(item.id);
    setEditInventoryForm(item);
  };

  const handleSaveInventory = async (id: string) => {
    try {
      const itemRef = doc(db, 'inventory', id);
      const { id: _, ...dataToUpdate } = editInventoryForm;
      await updateDoc(itemRef, dataToUpdate);
      setEditingInventoryId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'inventory');
    }
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    try {
      const itemRef = doc(db, 'menu', item.id);
      await updateDoc(itemRef, { available: !item.available });
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingItemId(id);
  };

  const confirmDelete = async () => {
    if (!deletingItemId) return;
    try {
      await deleteDoc(doc(db, 'menu', deletingItemId));
      setDeletingItemId(null);
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const handleAddItem = async () => {
    if (!newForm.name || !newForm.category) return;
    try {
      await addDoc(collection(db, 'menu'), {
        ...newForm,
        price: Number(newForm.price) || 0,
        available: true,
        image: formatImageUrl(newForm.image || '')
      });
      setIsAdding(false);
      setNewForm({
        name: '',
        price: 0,
        description: '',
        category: categories[0]?.id || '',
        available: true,
        image: ''
      });
    } catch (err) {
      console.error("Add failed:", err);
    }
  };

  const printKOT = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-family: monospace;">
        <span>${item.quantity}x ${item.name}</span>
      </div>
    `).join('');

    const html = `
      <html>
        <head>
          <title>KOT - #${order.id.slice(-6).toUpperCase()}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .footer { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; text-align: center; font-size: 12px; }
            .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h2 style="margin: 0;">KITCHEN ORDER</h2>
            <p style="margin: 5px 0;">Order: #${order.id.slice(-6).toUpperCase()}</p>
            <p style="margin: 5px 0;">Type: ${order.orderType?.toUpperCase() || 'DELIVERY'}</p>
            ${order.tableNumber ? `<p style="margin: 5px 0; font-size: 20px; font-weight: bold;">TABLE: ${order.tableNumber}</p>` : ''}
            <p style="margin: 5px 0;">Date: ${new Date().toLocaleString()}</p>
          </div>
          <div class="items">
            ${itemsHtml}
          </div>
          <div class="footer">
            <p>*** END OF KOT ***</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const printBill = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-family: monospace; font-size: 12px;">
        <span>${item.quantity}x ${item.name}</span>
        <span>${formatCurrency(item.price * item.quantity)}</span>
      </div>
    `).join('');

    const html = `
      <html>
        <head>
          <title>Bill - #${order.id.slice(-6).toUpperCase()}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .footer { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; text-align: center; font-size: 12px; }
            .totals { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
            .total-row.final { font-weight: bold; font-size: 14px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h2 style="margin: 0 0 5px 0;">CUSTOMER BILL</h2>
            <div style="font-size: 12px;">Order #${order.id.slice(-6).toUpperCase()}</div>
            <div style="font-size: 12px;">Date: ${new Date().toLocaleString()}</div>
            ${order.customerName ? `<div style="font-size: 12px;">Customer: ${order.customerName}</div>` : ''}
          </div>
          <div style="margin-bottom: 15px;">
            ${itemsHtml}
          </div>
          <div class="totals">
            <div class="total-row">
              <span>Subtotal</span>
              <span>${formatCurrency(order.total + (order.discount || 0))}</span>
            </div>
            ${order.discount ? `
            <div class="total-row">
              <span>Discount</span>
              <span>-${formatCurrency(order.discount)}</span>
            </div>
            ` : ''}
            <div class="total-row final">
              <span>Total</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
          </div>
          <div class="footer">
            Thank you for your business!
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const deductInventory = async (order: Order) => {
    try {
      for (const orderItem of order.items) {
        const menuItem = items.find(m => m.id === orderItem.itemId);
        if (menuItem && menuItem.recipe && menuItem.recipe.length > 0) {
          for (const ingredient of menuItem.recipe) {
            const invRef = doc(db, 'inventory', ingredient.inventoryItemId);
            const invDoc = inventory.find(i => i.id === ingredient.inventoryItemId);
            if (invDoc) {
              const currentStock = invDoc.stock || 0;
              const deduction = ingredient.quantity * orderItem.quantity;
              await updateDoc(invRef, {
                stock: Math.max(0, currentStock - deduction),
                lastUpdated: serverTimestamp()
              });
            }
          }
        } else {
          // Fallback to simple name matching if no recipe exists
          const invItem = inventory.find(i => i.name.toLowerCase() === orderItem.name.toLowerCase());
          if (invItem) {
            await updateDoc(doc(db, 'inventory', invItem.id), {
              stock: Math.max(0, invItem.stock - orderItem.quantity),
              lastUpdated: serverTimestamp()
            });
          }
        }
      }
    } catch (err) {
      console.error("Inventory deduction failed:", err);
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const previousStatus = order.status;
      await updateDoc(doc(db, 'orders', orderId), { status });
      
      // Deduct Inventory when order is finalized
      if (status === 'finalized' && previousStatus !== 'finalized') {
        await deductInventory(order);
        
        // Automated Accounting when order is completed
        await addDoc(collection(db, 'journal'), {
          orderId: order.id,
          type: 'sale',
          amount: order.total,
          description: `Sale from order #${order.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: order.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price
          }))
        });
        console.log("Journal entry created for order:", orderId);
      }

      // Free up table if order is finalized or cancelled
      if ((status === 'finalized' || status === 'cancelled') && order.tableId) {
        await updateDoc(doc(db, 'tables', order.tableId), { status: 'available' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'paid': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'confirmed': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'preparing': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'serving': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'done-serving': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'awaiting-bill': return 'bg-pink-100 text-pink-700 border-pink-200';
      case 'finalized': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  const filteredOrders = orders.filter(order => {
    if (orderFilters.orderNo && !order.id.toLowerCase().includes(orderFilters.orderNo.toLowerCase())) return false;
    if (orderFilters.status && order.status !== orderFilters.status) return false;
    if (orderFilters.orderType && order.orderType !== orderFilters.orderType) return false;
    if (orderFilters.table && order.tableNumber?.toString() !== orderFilters.table.toString()) return false;
    if (orderFilters.deliveryZone && order.deliveryZone !== orderFilters.deliveryZone) return false;
    if (orderFilters.deliveryArea && order.deliveryArea !== orderFilters.deliveryArea) return false;
    if (orderFilters.driver && order.driver !== orderFilters.driver) return false;
    if (orderFilters.kotNo && order.kotNo !== orderFilters.kotNo) return false;
    if (orderFilters.payment && order.paymentMethod !== orderFilters.payment) return false;
    if (orderFilters.customer && !order.customerName?.toLowerCase().includes(orderFilters.customer.toLowerCase())) return false;
    if (orderFilters.phone && !order.customerPhone?.includes(orderFilters.phone)) return false;
    if (orderFilters.store && orderFilters.store !== 'all' && order.store !== orderFilters.store) return false;
    
    // Date filters (Order Date)
    if (orderFilters.fromDate && order.createdAt) {
      const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt.seconds * 1000);
      const fromDate = new Date(orderFilters.fromDate);
      fromDate.setHours(0, 0, 0, 0);
      if (orderDate < fromDate) return false;
    }
    if (orderFilters.toDate && order.createdAt) {
      const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt.seconds * 1000);
      const toDate = new Date(orderFilters.toDate);
      toDate.setHours(23, 59, 59, 999);
      if (orderDate > toDate) return false;
    }

    // Date filters (Sales Date - only for finalized orders)
    if (orderFilters.salesFromDate && order.status === 'finalized' && order.createdAt) {
      const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt.seconds * 1000);
      const fromDate = new Date(orderFilters.salesFromDate);
      fromDate.setHours(0, 0, 0, 0);
      if (orderDate < fromDate) return false;
    }
    if (orderFilters.salesToDate && order.status === 'finalized' && order.createdAt) {
      const orderDate = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt.seconds * 1000);
      const toDate = new Date(orderFilters.salesToDate);
      toDate.setHours(23, 59, 59, 999);
      if (orderDate > toDate) return false;
    }
    
    if (orderFilters.onlineOnly && order.orderType !== 'delivery' && order.orderType !== 'pickup') return false;
    if (orderFilters.hideRevoked && order.status === 'cancelled') return false;
    return true;
  });

  const getStats = () => {
    const finalizedOrders = orders.filter(o => o.status === 'finalized');
    const totalSales = finalizedOrders.reduce((sum, o) => sum + o.total, 0);
    const cashSales = finalizedOrders.filter(o => o.paymentMethod === 'cash').reduce((sum, o) => sum + o.total, 0);
    const cardSales = finalizedOrders.filter(o => o.paymentMethod === 'card').reduce((sum, o) => sum + o.total, 0);
    const onlineSales = finalizedOrders.filter(o => o.paymentMethod === 'online').reduce((sum, o) => sum + o.total, 0);
    
    const dineInCount = orders.filter(o => o.orderType === 'dine-in').length;
    const takeOutCount = orders.filter(o => o.orderType === 'take-out').length;
    const deliveryCount = orders.filter(o => o.orderType === 'delivery').length;
    const pickupCount = orders.filter(o => o.orderType === 'pickup').length;
    const openBillsCount = orders.filter(o => o.status !== 'finalized' && o.status !== 'cancelled').length;
    const openBillsTotal = orders.filter(o => o.status !== 'finalized' && o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);

    return { 
      totalSales, 
      cashSales, 
      cardSales, 
      onlineSales,
      dineInCount, 
      takeOutCount, 
      deliveryCount, 
      pickupCount,
      openBillsCount,
      openBillsTotal,
      finalizedCount: finalizedOrders.length,
      cashCount: finalizedOrders.filter(o => o.paymentMethod === 'cash').length,
      cardCount: finalizedOrders.filter(o => o.paymentMethod === 'card').length,
      onlineCount: finalizedOrders.filter(o => o.paymentMethod === 'online').length
    };
  };

  const stats = getStats();

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar (Desktop) */}
      <div className={`bg-white border-r border-zinc-200 flex-col h-screen sticky top-0 hidden md:flex transition-all duration-300 ${isMenuOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-zinc-200 flex items-center gap-4 whitespace-nowrap">
          {systemSettings?.logo ? (
            <img src={systemSettings.logo} alt="Logo" className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
          ) : (
            <img src="https://res.cloudinary.com/htyeg8qey/image/upload/v1742727215/p03r5f8p99g6yit80h6k.png" alt="Logo" className="h-8 w-auto object-contain" referrerPolicy="no-referrer" />
          )}
          <div>
            <h2 className="text-sm font-bold text-zinc-900">{systemSettings?.companyName || 'Robotic ERP'}</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 scrollbar-hide w-64">
          <div className="px-6 py-2 mb-2">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Modules</p>
          </div>
          {[
            { id: 'orders', name: 'Order Management', icon: <ShoppingBag size={18} /> },
            { id: 'menu', name: 'Menu Items', icon: <LayoutGrid size={18} /> },
            { id: 'recipes', name: 'Recipe Management', icon: <BookOpen size={18} /> },
            { id: 'kitchen', name: 'Kitchen (KDS)', icon: <ChefHat size={18} /> },
            { id: 'inventory', name: 'Inventory', icon: <Boxes size={18} /> },
            { id: 'suppliers', name: 'Suppliers & Purchases', icon: <Truck size={18} /> },
            { id: 'accounting', name: 'Accounting', icon: <BarChart3 size={18} /> },
            { id: 'wastage', name: 'Wastage', icon: <Trash2 size={18} /> },
            { id: 'tables', name: 'Tables', icon: <Move size={18} /> },
            { id: 'crm', name: 'CRM', icon: <Users size={18} /> },
            { id: 'users', name: 'Users', icon: <ShieldCheck size={18} /> },
            { id: 'stores', name: 'Stores', icon: <Building size={18} /> },
            { id: 'warehouses', name: 'Warehouses', icon: <Warehouse size={18} /> },
            { id: 'settings', name: 'Settings', icon: <Settings size={18} /> },
          ].filter(m => canAccess(m.id)).map(module => (
            <button
              key={module.id}
              onClick={() => setActiveTab(module.id as any)}
              className={`w-full flex items-center justify-between px-6 py-3 transition-all hover:bg-zinc-50 group ${activeTab === module.id ? 'bg-primary/5 border-r-4 border-primary' : ''}`}
            >
              <div className="flex items-center gap-3">
                <span className={activeTab === module.id ? 'text-primary' : 'text-zinc-400 group-hover:text-zinc-600'}>
                  {module.icon}
                </span>
                <div className="text-left">
                  <p className={`text-sm font-bold ${activeTab === module.id ? 'text-primary' : 'text-zinc-600'}`}>{module.name}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-8 border-b flex items-center justify-between bg-white">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 hover:bg-zinc-100 rounded-xl transition-all text-zinc-600"
            >
              <MenuIcon size={24} />
            </button>
            <h1 className="text-xl md:text-2xl font-black text-zinc-900 uppercase tracking-tight">{activeTab.replace('-', ' ')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onOpenPOS ? onOpenPOS() : navigate('/admin/pos')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/5 rounded-xl transition-all border border-primary/20"
            >
              <Monitor size={18} />
              <span className="hidden md:inline">Launch POS</span>
            </button>
            <button 
              onClick={onLogout}
              className="px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-all hidden md:block"
            >
              Logout
            </button>
            <button 
              onClick={() => onClose ? onClose() : navigate('/')}
              className="p-2 hover:bg-zinc-100 rounded-xl transition-all text-zinc-400 hover:text-zinc-900"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-[73px] left-0 right-0 bg-white border-b border-zinc-200 z-50 max-h-[60vh] overflow-y-auto shadow-xl">
            {[
              { id: 'orders', name: 'Order Management', icon: <ShoppingBag size={18} /> },
              { id: 'menu', name: 'Menu Items', icon: <LayoutGrid size={18} /> },
              { id: 'recipes', name: 'Recipe Management', icon: <BookOpen size={18} /> },
              { id: 'kitchen', name: 'Kitchen (KDS)', icon: <ChefHat size={18} /> },
              { id: 'inventory', name: 'Inventory', icon: <Boxes size={18} /> },
              { id: 'suppliers', name: 'Suppliers & Purchases', icon: <Truck size={18} /> },
              { id: 'accounting', name: 'Accounting', icon: <BarChart3 size={18} /> },
              { id: 'wastage', name: 'Wastage', icon: <Trash2 size={18} /> },
              { id: 'tables', name: 'Tables', icon: <Move size={18} /> },
              { id: 'crm', name: 'CRM', icon: <Users size={18} /> },
              { id: 'users', name: 'Users', icon: <ShieldCheck size={18} /> },
              { id: 'stores', name: 'Stores', icon: <Building size={18} /> },
              { id: 'warehouses', name: 'Warehouses', icon: <Warehouse size={18} /> },
              { id: 'settings', name: 'Settings', icon: <Settings size={18} /> },
            ].filter(m => canAccess(m.id)).map(module => (
              <button
                key={module.id}
                onClick={() => {
                  setActiveTab(module.id as any);
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-6 py-4 border-b border-zinc-50 ${activeTab === module.id ? 'bg-primary/5 text-primary' : 'text-zinc-600'}`}
              >
                {module.icon}
                <span className="font-bold text-sm">{module.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-zinc-50">
          {activeTab === 'crm' ? (
            <CRM />
          ) : activeTab === 'users' ? (
            <StaffSection staff={staff} />
          ) : activeTab === 'stores' ? (
            <ManagementSection title="Store Management" data={stores} collectionName="stores" icon={<Building size={24} />} />
          ) : activeTab === 'warehouses' ? (
            <ManagementSection title="Warehouse Management" data={warehouses} collectionName="warehouses" icon={<Warehouse size={24} />} />
          ) : activeTab === 'mobile' ? (
            <ManagementSection title="Mobile Units" data={mobileUnits} collectionName="mobileUnits" icon={<Truck size={24} />} />
          ) : activeTab === 'terminals' ? (
            <ManagementSection title="Terminals" data={terminals} collectionName="terminals" icon={<Monitor size={24} />} />
          ) : activeTab === 'wastage' ? (
            <WastageSection wastage={wastage} inventory={inventory} />
          ) : activeTab === 'recipes' ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                    <BookOpen size={24} />
                  </div>
                  <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Recipe Management</h2>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => exportToExcel(items.map(i => ({ name: i.name, category: i.category, price: i.price, recipe: JSON.stringify(i.recipe || []) })), 'Recipes')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-600 rounded-2xl text-[10px] font-bold hover:bg-zinc-50 transition-all"
                  >
                    <Download size={14} /> Export
                  </button>
                  <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
                    <button 
                      onClick={() => downloadTemplate('recipes')}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-zinc-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                    >
                      <Download size={14} /> Template
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-primary hover:bg-white hover:shadow-sm rounded-xl transition-all cursor-pointer">
                      <Upload size={14} /> Bulk Import
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleBulkImport('recipes', e.target.files[0])} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map(item => (
                  <div key={item.id} className="p-6 bg-white border border-zinc-100 rounded-[2.5rem] hover:shadow-xl hover:shadow-zinc-200/50 transition-all group">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-16 h-16 rounded-2xl bg-zinc-50 flex items-center justify-center overflow-hidden border border-zinc-100">
                        {item.image ? (
                          <img src={formatImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Utensils className="text-zinc-200" size={24} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-zinc-900">{item.name}</h4>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{categories.find(c => c.id === item.category)?.name || 'No Category'}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Ingredients</p>
                        <p className="text-sm font-black text-zinc-900">{item.recipe?.length || 0} Items</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase">Cost Status</p>
                        <p className={`text-sm font-black ${item.recipe?.length ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {item.recipe?.length ? 'Configured' : 'Missing'}
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => setManagingRecipeId(item.id)}
                      className="w-full py-3 bg-zinc-900 text-white rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                    >
                      <ChefHat size={18} /> Edit Recipe
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === 'suppliers' ? (
            <SuppliersSection suppliers={vendors} inventory={inventory} />
          ) : activeTab === 'settings' ? (
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                  <Settings size={24} />
                </div>
                <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">System Settings</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-white border border-zinc-100 rounded-[2.5rem] shadow-sm">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <Building size={18} className="text-zinc-400" />
                    Company Information
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Company Name</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.companyName || ''} 
                        onChange={e => setSystemSettings({...systemSettings, companyName: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Logo URL</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.logo || ''} 
                        onChange={e => setSystemSettings({...systemSettings, logo: e.target.value})}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Tax ID</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.taxId || ''} 
                        onChange={e => setSystemSettings({...systemSettings, taxId: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-white border border-zinc-100 rounded-[2.5rem] shadow-sm">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <Monitor size={18} className="text-zinc-400" />
                    POS Configuration
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">Auto-Finalize Orders</p>
                        <p className="text-xs text-zinc-500">Automatically finalize orders after payment</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 accent-primary" defaultChecked={false} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">Print Receipt Automatically</p>
                        <p className="text-xs text-zinc-500">Print receipt when order is finalized</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 accent-primary" defaultChecked={true} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end items-center gap-4">
                {saveSuccess && <span className="text-emerald-600 font-bold animate-in fade-in">Settings saved successfully!</span>}
                <button 
                  onClick={async () => {
                    try {
                      await setDoc(doc(db, 'settings', 'system'), systemSettings);
                      setSaveSuccess(true);
                      setTimeout(() => setSaveSuccess(false), 3000);
                    } catch (err) {
                      handleFirestoreError(err, OperationType.UPDATE, 'settings/system');
                    }
                  }}
                  className="bg-primary text-white px-12 py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  Save All Settings
                </button>
              </div>
            </div>
          ) : activeTab === 'orders' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Bar */}
              <div className="p-6 bg-zinc-50 border-b border-zinc-200 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900">Order Filters</h3>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => exportToExcel(orders, 'Orders')}
                      className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                    >
                      <Download size={14} /> Export Orders
                    </button>
                    <button 
                      onClick={() => setOrderFilters({
                        store: 'all', orderNo: '', orderType: '', fromDate: '', toDate: '', salesFromDate: '', salesToDate: '', kotNo: '', status: '', payment: '', customer: '', phone: '', deliveryZone: '', deliveryArea: '', driver: '', table: '', onlineOnly: false, hideRevoked: false
                      })}
                      className="flex items-center gap-2 bg-zinc-200 text-zinc-700 px-6 py-2 rounded-xl text-xs font-bold hover:bg-zinc-300 transition-all"
                    >
                      <RotateCcw size={14} /> Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <input
                    type="text"
                    placeholder="Search Order No..."
                    value={orderFilters.orderNo}
                    onChange={(e) => setOrderFilters({ ...orderFilters, orderNo: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <select
                    value={orderFilters.status}
                    onChange={(e) => setOrderFilters({ ...orderFilters, status: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="preparing">Preparing</option>
                    <option value="serving">Serving</option>
                    <option value="done-serving">Done Serving</option>
                    <option value="awaiting-bill">Awaiting Bill</option>
                    <option value="finalized">Finalized</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select
                    value={orderFilters.orderType}
                    onChange={(e) => setOrderFilters({ ...orderFilters, orderType: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">All Types</option>
                    <option value="dine-in">Dine-in</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="delivery">Delivery</option>
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={orderFilters.fromDate}
                      onChange={(e) => setOrderFilters({ ...orderFilters, fromDate: e.target.value })}
                      className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <input
                      type="date"
                      value={orderFilters.toDate}
                      onChange={(e) => setOrderFilters({ ...orderFilters, toDate: e.target.value })}
                      className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Customer Name..."
                    value={orderFilters.customer}
                    onChange={(e) => setOrderFilters({ ...orderFilters, customer: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Customer Phone..."
                    value={orderFilters.phone}
                    onChange={(e) => setOrderFilters({ ...orderFilters, phone: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Table Number..."
                    value={orderFilters.table}
                    onChange={(e) => setOrderFilters({ ...orderFilters, table: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <select
                    value={orderFilters.payment}
                    onChange={(e) => setOrderFilters({ ...orderFilters, payment: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">All Payments</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>

              {/* Statistics Bar */}
              <div className="px-6 py-3 bg-zinc-900 flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-white/60 uppercase">Total Sales:</span>
                  <span className="text-xs font-black text-white">{formatCurrency(stats.totalSales)} ({stats.finalizedCount} no)</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-500/20 px-3 py-1.5 rounded-lg border border-blue-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-blue-400 uppercase">Cash:</span>
                  <span className="text-xs font-black text-blue-400">{formatCurrency(stats.cashSales)} ({stats.cashCount} no)</span>
                </div>
                <div className="flex items-center gap-2 bg-indigo-500/20 px-3 py-1.5 rounded-lg border border-indigo-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase">Card:</span>
                  <span className="text-xs font-black text-indigo-400">{formatCurrency(stats.cardSales)} ({stats.cardCount} no)</span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Online:</span>
                  <span className="text-xs font-black text-emerald-400">{formatCurrency(stats.onlineSales)} ({stats.onlineCount} no)</span>
                </div>
                <div className="flex items-center gap-2 bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-amber-400 uppercase">Open Bills:</span>
                  <span className="text-xs font-black text-amber-400">{formatCurrency(stats.openBillsTotal)} ({stats.openBillsCount} no)</span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Dine in:</span>
                  <span className="text-xs font-black text-emerald-400">{stats.dineInCount}</span>
                </div>
                <div className="flex items-center gap-2 bg-orange-500/20 px-3 py-1.5 rounded-lg border border-orange-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-orange-400 uppercase">Take out:</span>
                  <span className="text-xs font-black text-orange-400">{stats.takeOutCount}</span>
                </div>
                <div className="flex items-center gap-2 bg-purple-500/20 px-3 py-1.5 rounded-lg border border-purple-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-purple-400 uppercase">Delivery:</span>
                  <span className="text-xs font-black text-purple-400">{stats.deliveryCount}</span>
                </div>
                <div className="flex items-center gap-2 bg-pink-500/20 px-3 py-1.5 rounded-lg border border-pink-500/30 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-pink-400 uppercase">Pickup:</span>
                  <span className="text-xs font-black text-pink-400">{stats.pickupCount}</span>
                </div>
              </div>

              {/* Order List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-50">
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-20">
                    <ShoppingBag size={48} className="text-zinc-200 mx-auto mb-4" />
                    <p className="text-zinc-400 font-bold uppercase text-xs tracking-widest">No matching orders found</p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden hover:shadow-md transition-all">
                      <div 
                        className="grid grid-cols-1 lg:grid-cols-12 cursor-pointer hover:bg-zinc-50/50 transition-colors"
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >
                        {/* Left Info */}
                        <div className="lg:col-span-3 p-6 border-r border-zinc-100 space-y-4">
                          <div className="space-y-1">
                            <div className="bg-zinc-900 text-white text-[10px] font-black px-2 py-0.5 rounded inline-block uppercase">{order.store || 'Main Store'}</div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${order.orderType === 'dine-in' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {order.orderType}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase">Order No</p>
                              <p className="text-sm font-black text-zinc-900">{order.id.slice(-6).toUpperCase()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase">KOT No</p>
                              <p className="text-sm font-black text-zinc-900">{order.kotNo || 'N/A'}</p>
                            </div>
                            {order.orderType === 'dine-in' && (
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Table</p>
                                <p className="text-sm font-black text-zinc-900">{order.tableNumber || 'N/A'}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Info */}
                        <div className="lg:col-span-3 p-6 border-r border-zinc-100">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Customer</p>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center">
                              <User size={20} className="text-zinc-400" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-zinc-900">{order.customerName || 'Guest'}</p>
                              <p className="text-xs text-zinc-500">{order.customerPhone || order.address?.phone || 'No phone'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Date Info */}
                        <div className="lg:col-span-2 p-6 border-r border-zinc-100 space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Order date/time</p>
                            <div className="flex items-center gap-2 text-zinc-900">
                              <Calendar size={14} className="text-zinc-400" />
                              <span className="text-xs font-bold">{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'Processing...'}</span>
                            </div>
                          </div>
                          {order.invoicedAt && (
                            <div>
                              <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Invoiced Date</p>
                              <div className="flex items-center gap-2 text-zinc-900">
                                <Calendar size={14} className="text-zinc-400" />
                                <span className="text-xs font-bold">{order.invoicedAt?.toDate ? order.invoicedAt.toDate().toLocaleString() : 'N/A'}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status */}
                        <div className="lg:col-span-2 p-6 border-r border-zinc-100 flex flex-col justify-center items-center gap-2">
                          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>
                            <CheckCircle2 size={14} />
                            {order.status}
                          </div>
                          {order.orderType === 'delivery' && (
                            <>
                              <p className="text-[10px] font-bold text-zinc-400">Delivered by</p>
                              <p className="text-xs font-black text-blue-600">{order.waiter || 'Unassigned'}</p>
                            </>
                          )}
                          {order.orderType === 'dine-in' && order.waiter && (
                            <>
                              <p className="text-[10px] font-bold text-zinc-400">Waiter</p>
                              <p className="text-xs font-black text-blue-600">{order.waiter}</p>
                            </>
                          )}
                        </div>

                          {/* Accounting & Stock Flow */}
                        <div className="lg:col-span-10 p-6 border-t border-zinc-100 bg-zinc-50/30">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-black text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                              <BarChart3 size={14} className="text-primary" />
                              Accounting & Stock Flow
                            </h4>
                            <button 
                              onClick={() => {
                                setActiveTab('accounting');
                              }}
                              className="text-[10px] font-bold text-primary hover:underline"
                            >
                              View Full Ledger →
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Journal Entries */}
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase">Journal Entries</p>
                              <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                                {journal.filter(j => j.orderId === order.id || j.description.includes(order.id) || j.description.includes(order.orderNumber)).length > 0 ? (
                                  journal.filter(j => j.orderId === order.id || j.description.includes(order.id) || j.description.includes(order.orderNumber)).map((entry, idx) => (
                                    <div key={idx} className="p-3 border-b border-zinc-50 last:border-0 flex items-center justify-between">
                                      <div>
                                        <p className="text-xs font-bold text-zinc-900">{entry.type.toUpperCase()}</p>
                                        <p className="text-[10px] text-zinc-500">{entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleString() : 'N/A'}</p>
                                      </div>
                                      <p className="text-xs font-black text-emerald-600">+{formatCurrency(entry.amount)}</p>
                                    </div>
                                  ))
                                ) : (
                                  <div className="p-4 text-center">
                                    <p className="text-[10px] text-zinc-400 italic">No journal entries found for this order.</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Stock Flow */}
                            <div className="space-y-3">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase">Associated Stock Flow</p>
                              <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                                {order.items.map((orderItem, idx) => {
                                  const menuItem = items.find(i => i.id === orderItem.itemId);
                                  const recipe = menuItem?.recipe || [];
                                  
                                  return (
                                    <div key={idx} className="border-b border-zinc-50 last:border-0">
                                      <div className="p-3 bg-zinc-50/50">
                                        <p className="text-xs font-black text-zinc-900">{orderItem.name} <span className="text-zinc-400 font-bold ml-1">x{orderItem.quantity}</span></p>
                                      </div>
                                      <div className="p-3 space-y-2">
                                        {recipe.length > 0 ? (
                                          recipe.map((ing, iIdx) => {
                                            const invItem = inventory.find(inv => inv.id === ing.inventoryItemId);
                                            return (
                                              <div key={iIdx} className="flex justify-between items-center">
                                                <p className="text-[10px] font-bold text-zinc-600">{invItem?.name || 'Unknown Ingredient'}</p>
                                                <p className="text-[10px] font-black text-red-500">-{ (ing.quantity * orderItem.quantity).toFixed(2) } {invItem?.unit}</p>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="flex justify-between items-center">
                                            <p className="text-[10px] font-bold text-zinc-400 italic">No recipe defined</p>
                                            <p className="text-[10px] font-black text-red-500">-{orderItem.quantity} pcs</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Amount & Actions */}
                          <div className="lg:col-span-2 p-6 bg-zinc-50/50 flex flex-col justify-between gap-4">
                            <div className="space-y-2">
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Payment Method</p>
                                <p className="text-xs font-black text-zinc-900 uppercase">{order.paymentMethod || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Amount</p>
                                <p className="text-sm font-black text-zinc-900">{formatCurrency(order.total)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase">Amount Paid (Paid)</p>
                                <p className="text-sm font-black text-emerald-600">{formatCurrency(order.status === 'finalized' ? order.total : 0)}</p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <button 
                                onClick={() => printBill(order)}
                                className="w-full flex items-center justify-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all"
                              >
                                <Printer size={14} /> Print Bill
                              </button>
                              
                              {order.status === 'pending' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'confirmed')}
                                  className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                                >
                                  Confirm Order
                                </button>
                              )}
                               {order.status === 'confirmed' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'preparing')}
                                  className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all"
                                >
                                  Start Preparing
                                </button>
                              )}
                              {order.status === 'preparing' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'serving')}
                                  className="w-full flex items-center justify-center gap-2 bg-purple-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-600 transition-all"
                                >
                                  Start Serving
                                </button>
                              )}
                              {order.status === 'serving' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'done-serving')}
                                  className="w-full flex items-center justify-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all"
                                >
                                  Done Serving
                                </button>
                              )}
                              {order.status === 'done-serving' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'awaiting-bill')}
                                  className="w-full flex items-center justify-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-pink-600 transition-all"
                                >
                                  Awaiting Bill
                                </button>
                              )}
                              {order.status === 'awaiting-bill' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'finalized')}
                                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all"
                                >
                                  Finalize
                                </button>
                              )}
                              {order.status !== 'finalized' && order.status !== 'cancelled' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                  className="w-full flex items-center justify-center gap-2 bg-white text-red-500 border border-red-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                                >
                                  <Ban size={14} /> Cancel
                                </button>
                              )}
                            </div>
                          </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedOrderId === order.id && (
                        <div className="p-6 bg-zinc-50 border-t border-zinc-200">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2">
                              <h4 className="font-bold text-zinc-900 mb-4">Order Items</h4>
                              <div className="space-y-3">
                                {order.items.map((item, idx) => (
                                  <div key={idx} className="flex items-start justify-between bg-white p-4 rounded-xl border border-zinc-200">
                                    <div className="flex items-start gap-3">
                                      <span className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center font-black text-sm text-zinc-700">{item.quantity}</span>
                                      <div>
                                        <span className="font-bold text-zinc-900 block">{item.name}</span>
                                        {item.notes && <span className="text-xs text-zinc-500 mt-1 block">Note: {item.notes}</span>}
                                      </div>
                                    </div>
                                    <span className="font-bold text-zinc-900">{formatCurrency(item.price * item.quantity)}</span>
                                  </div>
                                ))}
                              </div>
                              {order.notes && (
                                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                  <p className="text-xs font-bold text-amber-800 uppercase mb-1">Order Notes</p>
                                  <p className="text-sm text-amber-900">{order.notes}</p>
                                </div>
                              )}
                            </div>
                            
                            <div className="space-y-6">
                              <div>
                                <h4 className="font-bold text-zinc-900 mb-4">Customer Details</h4>
                                <div className="bg-white p-4 rounded-xl border border-zinc-200 space-y-3">
                                  <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Name</p>
                                    <p className="text-sm font-medium text-zinc-900">{order.customerName || 'Guest'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Phone</p>
                                    <p className="text-sm font-medium text-zinc-900">{order.customerPhone || order.address?.phone || 'N/A'}</p>
                                  </div>
                                  {order.address && (
                                    <div>
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Delivery Address</p>
                                      <p className="text-sm font-medium text-zinc-900">
                                        {order.address.apartment && `${order.address.apartment}, `}
                                        {order.address.building && `${order.address.building}, `}
                                        {order.address.street}, {order.address.city}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div>
                                <h4 className="font-bold text-zinc-900 mb-4">Payment Details</h4>
                                <div className="bg-white p-4 rounded-xl border border-zinc-200 space-y-3">
                                  <div className="flex justify-between">
                                    <span className="text-sm text-zinc-500">Subtotal</span>
                                    <span className="text-sm font-medium text-zinc-900">{formatCurrency(order.total + (order.discount || 0))}</span>
                                  </div>
                                  {order.discount && order.discount > 0 && (
                                    <div className="flex justify-between text-emerald-600">
                                      <span className="text-sm">Discount</span>
                                      <span className="text-sm font-medium">-{formatCurrency(order.discount)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between border-t border-zinc-100 pt-3">
                                    <span className="text-sm font-bold text-zinc-900">Total</span>
                                    <span className="text-sm font-black text-zinc-900">{formatCurrency(order.total)}</span>
                                  </div>
                                  {order.amountReceived && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-sm text-zinc-500">Amount Received</span>
                                        <span className="text-sm font-medium text-zinc-900">{formatCurrency(order.amountReceived)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm text-zinc-500">Change Given</span>
                                        <span className="text-sm font-medium text-zinc-900">{formatCurrency(order.changeGiven || 0)}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'kitchen' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {orders.filter(o => ['confirmed', 'preparing', 'serving', 'ready'].includes(o.status)).length === 0 ? (
                <div className="col-span-full text-center py-20">
                  <ChefHat size={48} className="text-zinc-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-zinc-900">Kitchen is clear</h3>
                  <p className="text-zinc-500">No orders currently in preparation</p>
                </div>
              ) : (
                orders.filter(o => ['confirmed', 'preparing', 'serving', 'ready'].includes(o.status)).map(order => (
                  <div key={order.id} className="bg-zinc-50 rounded-3xl border border-zinc-200 flex flex-col overflow-hidden">
                    <div className={`p-4 flex items-center justify-between ${getStatusColor(order.status)}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs uppercase tracking-widest">#{order.id.slice(-6).toUpperCase()}</span>
                        {order.orderType === 'dine-in' && (
                          <span className="bg-white/40 px-2 py-0.5 rounded text-[10px] font-black">TABLE {order.tableNumber}</span>
                        )}
                      </div>
                      <span className="font-bold text-[10px] uppercase">{order.status}</span>
                    </div>
                    <div className="p-6 flex-1">
                      <div className="space-y-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3 justify-between">
                            <div className="flex items-start gap-3">
                              <span className="w-8 h-8 bg-white rounded-lg flex items-center justify-center font-black text-sm border border-zinc-200">{item.quantity}</span>
                              <span className="font-bold text-zinc-900 pt-1">{item.name}</span>
                            </div>
                            {items.find(i => i.id === item.itemId)?.recipe && (
                              <button
                                onClick={() => setViewingRecipeId(item.itemId)}
                                className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-colors"
                                title="View Recipe"
                              >
                                <BookOpen size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="p-4 bg-white border-t border-zinc-100 grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => printKOT(order)}
                        className="col-span-2 flex items-center justify-center gap-2 bg-zinc-100 text-zinc-600 py-2 rounded-xl font-bold text-xs hover:bg-zinc-200 transition-all mb-1"
                      >
                        <Printer size={14} /> Print KOT
                      </button>
                      {order.status === 'confirmed' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-600 transition-all"
                        >
                          Start Preparing
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id, 'serving')}
                          className="w-full bg-purple-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-purple-600 transition-all"
                        >
                          Serving
                        </button>
                      )}
                      {order.status === 'serving' && (
                        <button 
                          onClick={() => updateOrderStatus(order.id, 'finalized')}
                          className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all"
                        >
                          Finalize
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === 'inventory' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-zinc-900">Inventory Management</h3>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => exportToExcel(inventory, 'Inventory')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-600 rounded-2xl text-[10px] font-bold hover:bg-zinc-50 transition-all"
                  >
                    <Download size={14} /> Export
                  </button>
                  <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
                    <button 
                      onClick={() => downloadTemplate('inventory')}
                      className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-zinc-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                    >
                      <Download size={14} /> Template
                    </button>
                    <label className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-primary hover:bg-white hover:shadow-sm rounded-xl transition-all cursor-pointer">
                      <Upload size={14} /> Bulk Import
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleBulkImport('inventory', e.target.files[0])} />
                    </label>
                  </div>
                  <button 
                    onClick={() => setIsAddingInventory(true)}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-2xl text-sm font-bold hover:scale-105 transition-transform"
                  >
                    <Plus size={18} /> Add Stock Item
                  </button>
                </div>
              </div>

              {isAddingInventory && (
                <div className="p-6 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200 mb-6">
                  <h4 className="font-bold text-zinc-900 mb-4">Add New Inventory Item</h4>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input
                      type="text"
                      placeholder="Item Name"
                      className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                      value={inventoryForm.name}
                      onChange={e => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder="Initial Stock"
                      className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                      value={inventoryForm.stock || ''}
                      onChange={e => setInventoryForm({ ...inventoryForm, stock: Number(e.target.value) })}
                    />
                    <input
                      type="text"
                      placeholder="Unit (e.g. kg, pcs)"
                      className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                      value={inventoryForm.unit}
                      onChange={e => setInventoryForm({ ...inventoryForm, unit: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder="Cost per Unit"
                      className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                      value={inventoryForm.costPerUnit || ''}
                      onChange={e => setInventoryForm({ ...inventoryForm, costPerUnit: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      placeholder="Low Stock Threshold"
                      className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                      value={inventoryForm.lowStockThreshold || ''}
                      onChange={e => setInventoryForm({ ...inventoryForm, lowStockThreshold: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      onClick={() => setIsAddingInventory(false)}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!inventoryForm.name || !inventoryForm.unit) return;
                        try {
                          await addDoc(collection(db, 'inventory'), {
                            name: inventoryForm.name,
                            stock: inventoryForm.stock || 0,
                            unit: inventoryForm.unit,
                            costPerUnit: inventoryForm.costPerUnit || 0,
                            lowStockThreshold: inventoryForm.lowStockThreshold || 10,
                            lastUpdated: serverTimestamp()
                          });
                          setIsAddingInventory(false);
                          setInventoryForm({ name: '', stock: 0, unit: '', costPerUnit: 0, lowStockThreshold: 10 });
                        } catch (err) {
                          handleFirestoreError(err, OperationType.CREATE, 'inventory');
                        }
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
                    >
                      Save Item
                    </button>
                  </div>
                </div>
              )}
              
              {inventory.length === 0 ? (
                <div className="text-center py-20 bg-zinc-50 rounded-[2.5rem] border-2 border-dashed border-zinc-200">
                  <Boxes size={48} className="text-zinc-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-zinc-900">No inventory items</h3>
                  <p className="text-zinc-500">Add items to start tracking your stock</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inventory.map(item => (
                    <div key={item.id} className="p-6 bg-zinc-50 rounded-3xl border border-zinc-200">
                      {editingInventoryId === item.id ? (
                        <div className="space-y-4">
                          <input
                            type="text"
                            placeholder="Item Name"
                            className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                            value={editInventoryForm.name}
                            onChange={e => setEditInventoryForm({ ...editInventoryForm, name: e.target.value })}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Stock"
                              className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                              value={editInventoryForm.stock ?? ''}
                              onChange={e => setEditInventoryForm({ ...editInventoryForm, stock: Number(e.target.value) })}
                            />
                            <input
                              type="text"
                              placeholder="Unit"
                              className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                              value={editInventoryForm.unit}
                              onChange={e => setEditInventoryForm({ ...editInventoryForm, unit: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Cost per Unit"
                              className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                              value={editInventoryForm.costPerUnit ?? ''}
                              onChange={e => setEditInventoryForm({ ...editInventoryForm, costPerUnit: Number(e.target.value) })}
                            />
                            <input
                              type="number"
                              placeholder="Low Stock Threshold"
                              className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                              value={editInventoryForm.lowStockThreshold ?? ''}
                              onChange={e => setEditInventoryForm({ ...editInventoryForm, lowStockThreshold: Number(e.target.value) })}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingInventoryId(null)}
                              className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveInventory(item.id)}
                              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="font-bold text-zinc-900">{item.name}</h4>
                              <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest">{item.unit}</p>
                              {item.costPerUnit !== undefined && (
                                <p className="text-xs text-zinc-500 mt-1">Cost: {formatCurrency(item.costPerUnit)} / {item.unit}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {item.stock <= item.lowStockThreshold && (
                                <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg animate-pulse">LOW STOCK</span>
                              )}
                              <button
                                onClick={() => handleEditInventory(item)}
                                className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-all"
                                title="Edit Item"
                              >
                                <Edit2 size={16} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-end justify-between">
                            <div className="text-3xl font-black text-zinc-900">
                              {Number(item.stock.toFixed(4))}
                              <span className="text-sm font-bold text-zinc-400 ml-1">{item.unit}</span>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setAdjustingStock({ id: item.id, type: 'add', amount: 0 })}
                                className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-100 transition-all"
                                title="Add Stock"
                              >
                                <Plus size={16} className="text-emerald-600" />
                              </button>
                              <button 
                                onClick={() => setAdjustingStock({ id: item.id, type: 'remove', amount: 0 })}
                                className="p-2 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-100 transition-all"
                                title="Remove Stock"
                              >
                                <X size={16} className="text-red-600" />
                              </button>
                            </div>
                          </div>
                          
                          {adjustingStock?.id === item.id && (
                            <div className="mt-4 p-3 bg-white rounded-xl border border-zinc-200 flex items-center gap-2">
                              <span className="text-sm font-bold text-zinc-600">
                                {adjustingStock.type === 'add' ? 'Add' : 'Remove'}:
                              </span>
                              <input
                                type="number"
                                className="w-20 p-1.5 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-primary outline-none"
                                value={adjustingStock.amount || ''}
                                onChange={e => setAdjustingStock({ ...adjustingStock, amount: Number(e.target.value) })}
                                autoFocus
                              />
                              <button
                                onClick={async () => {
                                  if (!adjustingStock.amount || isNaN(adjustingStock.amount)) return;
                                  try {
                                    const newStock = adjustingStock.type === 'add' 
                                      ? item.stock + adjustingStock.amount 
                                      : Math.max(0, item.stock - adjustingStock.amount);
                                    
                                    await updateDoc(doc(db, 'inventory', item.id), {
                                      stock: newStock,
                                      lastUpdated: serverTimestamp()
                                    });
                                    setAdjustingStock(null);
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.UPDATE, `inventory/${item.id}`);
                                  }
                                }}
                                className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors ml-auto"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                              <button
                                onClick={() => setAdjustingStock(null)}
                                className="p-1.5 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'accounting' ? (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Accounting & Financials</h2>
                  <p className="text-sm text-zinc-500 font-medium">Manage your books, vouchers, and financial reports</p>
                </div>
                <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-2xl">
                  {(['dashboard', 'vouchers', 'bills', 'banking', 'taxes', 'reports'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setAccountingSubTab(tab)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                        accountingSubTab === tab 
                          ? 'bg-white text-primary shadow-sm' 
                          : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {accountingSubTab === 'dashboard' ? (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900">Financial Overview</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => exportToExcel(journal, 'Transaction_Journal')}
                        className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                      >
                        <Download size={14} /> Export Journal
                      </button>
                      <button 
                        onClick={() => setShowAddTransaction(true)}
                        className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                      >
                        <Plus size={18} /> Record Transaction
                      </button>
                    </div>
                  </div>

              {showAddTransaction && (
                <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">Record Transaction</h3>
                      <button onClick={() => setShowAddTransaction(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                        <X size={20} className="text-zinc-400" />
                      </button>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Type</label>
                        <select 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={newTransaction.type}
                          onChange={e => setNewTransaction({...newTransaction, type: e.target.value as any})}
                        >
                          <option value="expense">Expense</option>
                          <option value="sale">Sale (Manual)</option>
                          <option value="wastage">Wastage</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Amount</label>
                        <input 
                          type="number" 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={newTransaction.amount}
                          onChange={e => setNewTransaction({...newTransaction, amount: parseFloat(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Description</label>
                        <textarea 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-32"
                          value={newTransaction.description}
                          onChange={e => setNewTransaction({...newTransaction, description: e.target.value})}
                          placeholder="e.g. Utility bill, Supplier payment..."
                        />
                      </div>
                      <button 
                        onClick={handleAddTransaction}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                      >
                        Save Transaction
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Total Revenue</p>
                  <h3 className="text-4xl font-black text-emerald-900">
                    {formatCurrency(journal.reduce((acc, curr) => acc + (curr.type === 'sale' ? curr.amount : -curr.amount), 0))}
                  </h3>
                </div>
                <div className="p-8 bg-blue-50 rounded-[2.5rem] border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Total Orders</p>
                  <h3 className="text-4xl font-black text-blue-900">{journal.filter(j => j.type === 'sale').length}</h3>
                </div>
                <div className="p-8 bg-zinc-50 rounded-[2.5rem] border border-zinc-100">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Last Transaction</p>
                  <h3 className="text-xl font-bold text-zinc-900">
                    {journal[0]?.timestamp?.toDate ? journal[0].timestamp.toDate().toLocaleDateString() : 'No data'}
                  </h3>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
                <div className="p-6 border-b bg-zinc-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <BookOpen size={18} className="text-zinc-400" />
                    Account Tree (Ledger Groups)
                  </h3>
                  <button 
                    onClick={() => setIsManageTreeOpen(true)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    Manage Tree
                  </button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { 
                      name: 'Assets', 
                      balance: journal.reduce((acc, curr) => acc + (curr.type === 'sale' ? curr.amount : -curr.amount), 0), 
                      color: 'emerald' 
                    },
                    { 
                      name: 'Liabilities', 
                      balance: 0, 
                      color: 'red' 
                    },
                    { 
                      name: 'Equity', 
                      balance: journal.reduce((acc, curr) => acc + (curr.type === 'sale' ? curr.amount : -curr.amount), 0), 
                      color: 'blue' 
                    },
                    { 
                      name: 'Revenue', 
                      balance: journal.filter(j => j.type === 'sale').reduce((acc, curr) => acc + curr.amount, 0), 
                      color: 'indigo' 
                    },
                    { 
                      name: 'Expenses', 
                      balance: journal.filter(j => j.type !== 'sale').reduce((acc, curr) => acc + curr.amount, 0), 
                      color: 'orange' 
                    },
                    ...ledgerGroups.map(lg => ({
                      name: lg.name,
                      balance: 0,
                      color: lg.type === 'Asset' ? 'emerald' : lg.type === 'Liability' ? 'red' : lg.type === 'Equity' ? 'blue' : lg.type === 'Revenue' ? 'indigo' : 'orange'
                    }))
                  ].map(group => (
                    <div key={group.name} className={`p-4 rounded-2xl border border-${group.color}-100 bg-${group.color}-50/30`}>
                      <p className={`text-[10px] font-bold text-${group.color}-600 uppercase tracking-widest mb-1`}>{group.name}</p>
                      <p className="text-lg font-black text-zinc-900">{formatCurrency(group.balance)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
                <div className="p-6 border-b bg-zinc-50/50 flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <History size={18} className="text-zinc-400" />
                    Transaction Journal
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {journal.map(entry => (
                        <tr key={entry.id} className="hover:bg-zinc-50/50 transition-all">
                          <td className="px-6 py-4 text-sm text-zinc-500">
                            {entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleString() : 'Processing...'}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-zinc-900">{entry.description}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                              entry.type === 'sale' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {entry.type}
                            </span>
                          </td>
                          <td className={`px-6 py-4 text-sm font-black text-right ${
                            entry.type === 'sale' ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {entry.type === 'sale' ? '+' : '-'}{formatCurrency(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : accountingSubTab === 'vouchers' ? (
            <div className="space-y-6">
              {isAddingVoucher && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">New Voucher</h3>
                      <button onClick={() => setIsAddingVoucher(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Type</label>
                          <select 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={voucherForm.type}
                            onChange={e => setVoucherForm({...voucherForm, type: e.target.value})}
                          >
                            <option value="receipt">Receipt</option>
                            <option value="payment">Payment</option>
                            <option value="cash_receipt">Cash Receipt</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Date</label>
                          <input 
                            type="date" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={voucherForm.date}
                            onChange={e => setVoucherForm({...voucherForm, date: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Amount</label>
                        <input 
                          type="number" 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={voucherForm.amount}
                          onChange={e => setVoucherForm({...voucherForm, amount: parseFloat(e.target.value)})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Payment Method</label>
                        <select 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={voucherForm.paymentMethod}
                          onChange={e => setVoucherForm({...voucherForm, paymentMethod: e.target.value})}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="cheque">Cheque</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Description</label>
                        <textarea 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
                          value={voucherForm.description}
                          onChange={e => setVoucherForm({...voucherForm, description: e.target.value})}
                          placeholder="Voucher description..."
                        />
                      </div>
                      <button 
                        onClick={handleAddVoucher}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                      >
                        Save Voucher
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900">Vouchers</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => exportToExcel(vouchers, 'Vouchers')}
                    className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                  >
                    <Download size={14} /> Export
                  </button>
                  <button 
                    onClick={() => setIsAddingVoucher(true)}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                  >
                    <Plus size={14} /> New Voucher
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {vouchers.map(v => (
                      <tr key={v.id} className="hover:bg-zinc-50/50 transition-all">
                        <td className="px-6 py-4 text-sm text-zinc-500">{v.date}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-zinc-100 text-zinc-700">
                            {v.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-zinc-900">{v.description}</td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{v.paymentMethod}</td>
                        <td className="px-6 py-4 text-sm font-black text-right">{formatCurrency(v.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : accountingSubTab === 'bills' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {isAddingBill && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">New Bill</h3>
                      <button onClick={() => setIsAddingBill(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Vendor</label>
                        <select 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={billForm.vendorId}
                          onChange={e => setBillForm({...billForm, vendorId: e.target.value})}
                        >
                          <option value="">Select Vendor...</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Amount</label>
                          <input 
                            type="number" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={billForm.amount}
                            onChange={e => setBillForm({...billForm, amount: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Due Date</label>
                          <input 
                            type="date" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={billForm.dueDate}
                            onChange={e => setBillForm({...billForm, dueDate: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Status</label>
                        <select 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={billForm.status}
                          onChange={e => setBillForm({...billForm, status: e.target.value})}
                        >
                          <option value="unpaid">Unpaid</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Description</label>
                        <textarea 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
                          value={billForm.description}
                          onChange={e => setBillForm({...billForm, description: e.target.value})}
                          placeholder="Bill description..."
                        />
                      </div>
                      <button 
                        onClick={handleAddBill}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                      >
                        Save Bill
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-zinc-900">Bills & Payables</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => exportToExcel(bills, 'Bills')}
                      className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                    >
                      <Download size={14} /> Export
                    </button>
                    <button 
                      onClick={() => setIsAddingBill(true)}
                      className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                    >
                      <Plus size={14} /> Add Bill
                    </button>
                  </div>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <th className="px-6 py-4">Due Date</th>
                        <th className="px-6 py-4">Vendor</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {bills.map(b => (
                        <tr key={b.id} className="hover:bg-zinc-50/50 transition-all">
                          <td className="px-6 py-4 text-sm text-zinc-500">{b.dueDate}</td>
                          <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                            {vendors.find(v => v.id === b.vendorId)?.name || 'Unknown Vendor'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                              b.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-right">{formatCurrency(b.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-6">
                {isAddingVendor && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">New Vendor</h3>
                        <button onClick={() => setIsAddingVendor(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
                          <X size={20} />
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Name</label>
                          <input 
                            type="text" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={vendorForm.name}
                            onChange={e => setVendorForm({...vendorForm, name: e.target.value})}
                            placeholder="Vendor Name"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Phone</label>
                          <input 
                            type="text" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={vendorForm.phone}
                            onChange={e => setVendorForm({...vendorForm, phone: e.target.value})}
                            placeholder="Phone Number"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Email</label>
                          <input 
                            type="email" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={vendorForm.email}
                            onChange={e => setVendorForm({...vendorForm, email: e.target.value})}
                            placeholder="Email Address"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Address</label>
                          <textarea 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
                            value={vendorForm.address}
                            onChange={e => setVendorForm({...vendorForm, address: e.target.value})}
                            placeholder="Vendor Address"
                          />
                        </div>
                        <button 
                          onClick={handleAddVendor}
                          className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                        >
                          Save Vendor
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-zinc-900">Vendors</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => exportToExcel(vendors, 'Vendors')}
                      className="p-2 bg-white border border-zinc-200 text-zinc-600 rounded-xl hover:bg-zinc-50 transition-all"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      onClick={() => setIsAddingVendor(true)}
                      className="p-2 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-200 transition-all"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {vendors.map(v => (
                    <div key={v.id} className="p-4 bg-white border border-zinc-100 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{v.name}</p>
                        <p className="text-xs text-zinc-500">{v.phone}</p>
                      </div>
                      <button className="p-2 text-zinc-400 hover:text-primary transition-colors">
                        <ArrowRightLeft size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : accountingSubTab === 'banking' ? (
            <div className="space-y-8">
              {isAddingCheque && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Record Cheque</h3>
                      <button onClick={() => setIsAddingCheque(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Cheque Number</label>
                        <input 
                          type="text" 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.chequeNumber}
                          onChange={e => setChequeForm({...chequeForm, chequeNumber: e.target.value})}
                          placeholder="e.g. 100234"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Bank Name</label>
                        <input 
                          type="text" 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.bank}
                          onChange={e => setChequeForm({...chequeForm, bank: e.target.value})}
                          placeholder="e.g. Chase Bank"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Amount</label>
                          <input 
                            type="number" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={chequeForm.amount}
                            onChange={e => setChequeForm({...chequeForm, amount: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Date</label>
                          <input 
                            type="date" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={chequeForm.date}
                            onChange={e => setChequeForm({...chequeForm, date: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Status</label>
                        <select 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.status}
                          onChange={e => setChequeForm({...chequeForm, status: e.target.value})}
                        >
                          <option value="pending">Pending</option>
                          <option value="cleared">Cleared</option>
                          <option value="bounced">Bounced</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Vendor (Optional)</label>
                        <select 
                          className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.vendorId}
                          onChange={e => setChequeForm({...chequeForm, vendorId: e.target.value})}
                        >
                          <option value="">Select Vendor...</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                      <button 
                        onClick={handleAddCheque}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                      >
                        Save Cheque
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900">Cheques</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => exportToExcel(cheques, 'Cheques')}
                        className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                      >
                        <Download size={14} /> Export
                      </button>
                      <button 
                        onClick={() => setIsAddingCheque(true)}
                        className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all"
                      >
                        <Plus size={14} /> Record Cheque
                      </button>
                    </div>
                  </div>
                  <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                          <th className="px-6 py-4">No.</th>
                          <th className="px-6 py-4">Bank</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {cheques.map(c => (
                          <tr key={c.id} className="hover:bg-zinc-50/50 transition-all">
                            <td className="px-6 py-4 text-sm font-bold text-zinc-900">{c.chequeNumber}</td>
                            <td className="px-6 py-4 text-sm text-zinc-500">{c.bank}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-zinc-100 text-zinc-700">
                                {c.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-right">{formatCurrency(c.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-zinc-900">Fund Transfers</h3>
                    <button className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all">
                      <Plus size={14} /> New Transfer
                    </button>
                  </div>
                  <div className="space-y-4">
                    {/* Mock transfers or list from state */}
                    <div className="p-6 bg-zinc-50 rounded-[2rem] border border-dashed border-zinc-200 text-center">
                      <p className="text-sm text-zinc-400 italic">No recent transfers recorded</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : accountingSubTab === 'taxes' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-8 bg-zinc-900 rounded-[2.5rem] text-white">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Total Tax Payable</p>
                  <h3 className="text-4xl font-black">{formatCurrency(journal.reduce((acc, curr) => acc + (curr.amount * 0.05), 0))}</h3>
                  <p className="text-xs text-zinc-500 mt-4">Estimated at 5% VAT</p>
                </div>
                {/* More tax cards */}
              </div>
            </div>
          ) : accountingSubTab === 'reports' ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900">Financial Reports</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => exportToExcel(journal, 'Financial_Report')}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                  >
                    <FileSpreadsheet size={18} /> Export All to Excel
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-8 bg-white rounded-[2.5rem] border border-zinc-100 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">Profit & Loss</h4>
                      <p className="text-xs text-zinc-500">Summary of revenue vs costs</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-500">Total Revenue</span>
                      <span className="font-bold text-emerald-600">+{formatCurrency(journal.filter(j => j.type === 'sale').reduce((acc, curr) => acc + curr.amount, 0))}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-500">Total Costs</span>
                      <span className="font-bold text-red-600">-{formatCurrency(journal.filter(j => j.type !== 'sale').reduce((acc, curr) => acc + curr.amount, 0))}</span>
                    </div>
                    <div className="pt-4 border-t flex justify-between items-center">
                      <span className="font-bold text-zinc-900">Net Profit</span>
                      <span className="text-xl font-black text-zinc-900">
                        {formatCurrency(journal.reduce((acc, curr) => acc + (curr.type === 'sale' ? curr.amount : -curr.amount), 0))}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-white rounded-[2.5rem] border border-zinc-100 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">Net Cash Flow</h4>
                      <p className="text-xs text-zinc-500">Summary of all cash movements</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-500">Total Inflow</span>
                      <span className="font-bold text-emerald-600">+{formatCurrency(journal.filter(j => j.type === 'sale').reduce((acc, curr) => acc + curr.amount, 0))}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-500">Total Outflow</span>
                      <span className="font-bold text-red-600">-{formatCurrency(journal.filter(j => j.type !== 'sale').reduce((acc, curr) => acc + curr.amount, 0))}</span>
                    </div>
                    <div className="pt-4 border-t flex justify-between items-center">
                      <span className="font-bold text-zinc-900">Net Cash Flow</span>
                      <span className="text-xl font-black text-zinc-900">
                        {formatCurrency(journal.reduce((acc, curr) => acc + (curr.type === 'sale' ? curr.amount : -curr.amount), 0))}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-white rounded-[2.5rem] border border-zinc-100 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                      <CreditCard size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">Payment Method Summary</h4>
                      <p className="text-xs text-zinc-500">Breakdown by payment type</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {['Cash', 'Card', 'Online'].map(method => (
                      <div key={method} className="flex justify-between items-center text-sm">
                        <span className="text-zinc-500">{method}</span>
                        <span className="font-bold text-zinc-900">
                          {formatCurrency(journal.filter(j => j.type === 'sale' && (j.description.includes(method) || method === 'Cash')).reduce((acc, curr) => acc + curr.amount, 0))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sales by Category */}
                <div className="p-8 bg-white rounded-[2.5rem] border border-zinc-100 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl">
                      <LayoutGrid size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">Sales by Category</h4>
                      <p className="text-xs text-zinc-500">Revenue breakdown by menu category</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const categorySales: Record<string, number> = {};
                      orders.filter(o => o.status === 'paid' || o.status === 'finalized').forEach(order => {
                        order.items.forEach(item => {
                          const menuItem = items.find(i => i.id === item.itemId);
                          const categoryId = menuItem?.category || 'uncategorized';
                          categorySales[categoryId] = (categorySales[categoryId] || 0) + (item.price * item.quantity);
                        });
                      });
                      
                      const sortedCategories = Object.entries(categorySales).sort((a, b) => b[1] - a[1]);
                      const totalSales = sortedCategories.reduce((acc, [_, amount]) => acc + amount, 0);

                      return sortedCategories.length > 0 ? sortedCategories.map(([categoryId, amount]) => {
                        const categoryName = categories.find(c => c.id === categoryId)?.name || 'Other';
                        const percentage = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
                        return (
                          <div key={categoryId} className="space-y-1">
                            <div className="flex justify-between items-center text-sm">
                              <span className="font-medium text-zinc-700">{categoryName}</span>
                              <span className="font-bold text-zinc-900">{formatCurrency(amount)}</span>
                            </div>
                            <div className="w-full bg-zinc-100 rounded-full h-2">
                              <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                            </div>
                          </div>
                        );
                      }) : (
                        <p className="text-sm text-zinc-500 text-center py-4">No sales data available.</p>
                      );
                    })()}
                  </div>
                </div>

                {/* Top Selling Items */}
                <div className="p-8 bg-white rounded-[2.5rem] border border-zinc-100 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl">
                      <ShoppingBag size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-900">Top Selling Items</h4>
                      <p className="text-xs text-zinc-500">Best performing menu items</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {(() => {
                      const itemSales: Record<string, { name: string, quantity: number, revenue: number }> = {};
                      orders.filter(o => o.status === 'paid' || o.status === 'finalized').forEach(order => {
                        order.items.forEach(item => {
                          if (!itemSales[item.itemId]) {
                            itemSales[item.itemId] = { name: item.name, quantity: 0, revenue: 0 };
                          }
                          itemSales[item.itemId].quantity += item.quantity;
                          itemSales[item.itemId].revenue += (item.price * item.quantity);
                        });
                      });
                      
                      const topItems = Object.values(itemSales)
                        .sort((a, b) => b.revenue - a.revenue)
                        .slice(0, 5);

                      return topItems.length > 0 ? topItems.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-zinc-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                              {index + 1}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                              <p className="text-[10px] text-zinc-500">{item.quantity} units sold</p>
                            </div>
                          </div>
                          <span className="font-bold text-emerald-600">{formatCurrency(item.revenue)}</span>
                        </div>
                      )) : (
                        <p className="text-sm text-zinc-500 text-center py-4">No sales data available.</p>
                      );
                    })()}
                  </div>
                </div>

                <div className="md:col-span-2 p-8 bg-white rounded-[2.5rem] border border-zinc-100 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-zinc-100 text-zinc-600 rounded-2xl">
                        <Receipt size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-zinc-900">Payment Method Detail</h4>
                        <p className="text-xs text-zinc-500">Recent transactions by payment type</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => exportToExcel(journal.filter(j => j.type === 'sale'), 'Payment_Detail')}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Export Detail
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-50">
                          <th className="pb-4">Date</th>
                          <th className="pb-4">Method</th>
                          <th className="pb-4">Order #</th>
                          <th className="pb-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {journal.filter(j => j.type === 'sale').slice(0, 5).map(j => (
                          <tr key={j.id}>
                            <td className="py-4 text-xs text-zinc-500">{j.timestamp?.toDate ? j.timestamp.toDate().toLocaleDateString() : 'N/A'}</td>
                            <td className="py-4 text-xs font-bold text-zinc-900">
                              {j.description.includes('Card') ? 'Card' : j.description.includes('Online') ? 'Online' : 'Cash'}
                            </td>
                            <td className="py-4 text-xs text-zinc-500">{j.description.split('#')[1] || 'Manual'}</td>
                            <td className="py-4 text-xs font-black text-right text-emerald-600">+{formatCurrency(j.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : activeTab === 'tables' ? (
            <TableDesigner />
          ) : activeTab === 'menu' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-zinc-900">Menu Management</h3>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsAdding(true)}
                    className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                  >
                    <Plus size={18} /> Add New Item
                  </button>
                  <button 
                    onClick={() => exportToExcel(items, 'Menu_Items')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 text-zinc-600 rounded-2xl text-[10px] font-bold hover:bg-zinc-50 transition-all"
                  >
                    <Download size={14} /> Export
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200">
                <button 
                  onClick={() => downloadTemplate('menu')}
                  className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-zinc-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                >
                  <Download size={14} /> Template
                </button>
                <label className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-primary hover:bg-white hover:shadow-sm rounded-xl transition-all cursor-pointer">
                  <Upload size={14} /> Bulk Import
                  <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleBulkImport('menu', e.target.files[0])} />
                </label>
              </div>
              <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-2xl text-sm font-bold hover:scale-105 transition-transform shadow-lg shadow-primary/20"
              >
                <Plus size={18} /> Add New Item
              </button>

              {isAdding && (
                <div className="p-8 bg-zinc-50 rounded-[2rem] border-2 border-dashed border-zinc-200 mb-8">
                  <h3 className="text-lg font-bold mb-6">Add New Menu Item</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Item Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Grilled Chicken" 
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all"
                        value={newForm.name}
                        onChange={e => setNewForm({...newForm, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Price (in cents)</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 1000 for AED 10.00" 
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all"
                        value={newForm.price}
                        onChange={e => setNewForm({...newForm, price: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Category</label>
                      <select 
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none bg-white"
                        value={newForm.category}
                        onChange={e => setNewForm({...newForm, category: e.target.value})}
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Image URL / ID</label>
                      <input 
                        type="text" 
                        placeholder="Google Drive ID or URL" 
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all"
                        value={newForm.image}
                        onChange={e => setNewForm({...newForm, image: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Description / Arabic Name</label>
                      <textarea 
                        placeholder="Item description or Arabic name..." 
                        rows={3}
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all"
                        value={newForm.description}
                        onChange={e => setNewForm({...newForm, description: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="mt-8 flex gap-3 justify-end">
                    <button 
                      onClick={() => setIsAdding(false)}
                      className="px-6 py-3 rounded-2xl text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAddItem}
                      className="px-10 py-3 rounded-2xl text-sm font-bold bg-primary text-white hover:scale-105 transition-all shadow-lg shadow-primary/20"
                    >
                      Save Item
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-6 p-5 bg-white border border-zinc-100 rounded-3xl hover:shadow-xl hover:shadow-zinc-200/50 transition-all group">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-zinc-100 border border-zinc-100">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300">
                          <Utensils size={32} />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {editingId === item.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Name</label>
                              <input 
                                type="text" 
                                className="w-full p-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                                value={editForm.name}
                                onChange={e => setEditForm({...editForm, name: e.target.value})}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Price (cents)</label>
                              <input 
                                type="number" 
                                className="w-full p-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                                value={editForm.price}
                                onChange={e => setEditForm({...editForm, price: Number(e.target.value)})}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Image URL / ID</label>
                            <input 
                              type="text" 
                              className="w-full p-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                              value={editForm.image}
                              onChange={e => setEditForm({...editForm, image: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Description</label>
                            <textarea 
                              className="w-full p-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                              rows={2}
                              value={editForm.description}
                              onChange={e => setEditForm({...editForm, description: e.target.value})}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-zinc-900 truncate text-lg">{item.name}</h4>
                            {!item.available && (
                              <span className="px-2 py-0.5 bg-zinc-100 text-zinc-400 text-[10px] font-bold uppercase rounded-md">Hidden</span>
                            )}
                          </div>
                          <p className="text-primary font-bold">{formatCurrency(item.price)}</p>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleToggleAvailable(item)}
                        className={`p-3 rounded-2xl transition-all ${item.available ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-zinc-400 bg-zinc-50 hover:bg-zinc-100'}`}
                      >
                        {item.available ? <Eye size={20} /> : <EyeOff size={20} />}
                      </button>
                      
                      {editingId === item.id ? (
                        <button 
                          onClick={() => handleSave(item.id)}
                          className="p-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all"
                        >
                          <Save size={20} />
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleEdit(item)}
                            className="p-3 text-zinc-600 bg-zinc-50 hover:bg-zinc-100 rounded-2xl transition-all"
                          >
                            <Edit2 size={20} />
                          </button>
                        </>
                      )}

                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-2xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {managingRecipeId && (
        <RecipeManager
          item={items.find(i => i.id === managingRecipeId)!}
          inventory={inventory}
          onClose={() => setManagingRecipeId(null)}
        />
      )}

      {viewingRecipeId && (
        <RecipeManager
          item={items.find(i => i.id === viewingRecipeId)!}
          inventory={inventory}
          onClose={() => setViewingRecipeId(null)}
          readOnly={true}
        />
      )}

      {deletingItemId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">Delete Item?</h3>
            <p className="text-zinc-500 mb-8">Are you sure you want to delete this menu item? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingItemId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Tree Modal */}
      {isManageTreeOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-zinc-100">
            <div className="p-8 border-b flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Manage Account Tree</h3>
                  <p className="text-sm text-zinc-500">Define your ledger groups and structure</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManageTreeOpen(false)}
                className="p-2 hover:bg-zinc-200 rounded-xl transition-all text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-8">
              {/* Add New Group */}
              <div className="bg-zinc-50 p-6 rounded-3xl border border-zinc-100 space-y-4">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Add New Ledger Group</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input 
                    type="text" 
                    placeholder="Group Name (e.g. Cash at Bank)" 
                    className="p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm"
                    value={newLedgerGroup.name}
                    onChange={e => setNewLedgerGroup({...newLedgerGroup, name: e.target.value})}
                  />
                  <select 
                    className="p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm"
                    value={newLedgerGroup.type}
                    onChange={e => setNewLedgerGroup({...newLedgerGroup, type: e.target.value as any})}
                  >
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Expense">Expense</option>
                  </select>
                </div>
                <button 
                  onClick={handleAddLedgerGroup}
                  className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Add to Tree
                </button>
              </div>

              {/* Existing Groups */}
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Current Structure</p>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 scrollbar-hide">
                  {ledgerGroups.length > 0 ? (
                    ledgerGroups.map(group => (
                      <div key={group.id} className="flex items-center justify-between p-4 bg-white border border-zinc-100 rounded-2xl hover:border-primary/20 transition-all group">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${
                            group.type === 'Asset' ? 'bg-emerald-500' :
                            group.type === 'Liability' ? 'bg-red-500' :
                            group.type === 'Equity' ? 'bg-blue-500' :
                            group.type === 'Revenue' ? 'bg-indigo-500' : 'bg-orange-500'
                          }`} />
                          <div>
                            <p className="text-sm font-bold text-zinc-900">{group.name}</p>
                            <p className="text-[10px] text-zinc-400 font-medium uppercase">{group.type}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => deleteLedgerGroup(group.id)}
                          className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-zinc-400 italic">No custom ledger groups defined yet.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffSection({ staff }: { staff: any[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'waiter', email: '', phone: '', password: '' });
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setError('');
    if (!form.name || !form.email || !form.password) {
      setError('Name, email, and password are required.');
      return;
    }
    try {
      // Create user in Firebase Auth using secondary app to avoid logging out admin
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      await signOut(secondaryAuth); // Sign out the secondary instance immediately

      // Create auth user profile in 'users' collection
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: form.name,
        email: form.email,
        role: form.role,
        createdAt: serverTimestamp()
      });

      // Create staff record
      await addDoc(collection(db, 'staff'), {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        uid: userCredential.user.uid,
        createdAt: serverTimestamp(),
        active: true
      });

      setForm({ name: '', role: 'waiter', email: '', phone: '', password: '' });
      setIsAdding(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add staff');
      if (err.code !== 'auth/email-already-in-use') {
        handleFirestoreError(err, OperationType.CREATE, 'staff');
      }
    }
  };

  const handleUpdateRole = async (id: string, role: string, email: string) => {
    try {
      await updateDoc(doc(db, 'staff', id), { role });
      
      // Also update the user profile if it exists
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', userDoc.id), { role });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `staff/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <Users size={24} />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Staff Management</h2>
        </div>
        <button 
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} /> Add Staff
        </button>
      </div>

      {isAdding && (
        <div className="p-8 bg-zinc-50 border border-zinc-200 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
          {error && (
            <div className="md:col-span-2 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Full Name</label>
            <input type="text" className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Role</label>
            <select className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              <option value="manager">Manager</option>
              <option value="waiter">Waiter</option>
              <option value="chef">Chef</option>
              <option value="driver">Driver</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Email</label>
            <input type="email" className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Phone</label>
            <input type="text" className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Password</label>
            <input type="password" placeholder="Set login password" className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          </div>
          <div className="md:col-span-2 flex gap-4 pt-4">
            <button onClick={handleAdd} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">Save Staff</button>
            <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-300 transition-all">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.map(member => (
          <div key={member.id} className="p-6 bg-white border border-zinc-100 rounded-[2.5rem] hover:shadow-xl hover:shadow-zinc-200/50 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-400 font-black text-xl">
                {member.name[0]}
              </div>
              <div>
                <h4 className="font-bold text-zinc-900">{member.name}</h4>
                <select 
                  className="text-[10px] text-primary font-bold uppercase tracking-widest bg-transparent outline-none cursor-pointer"
                  value={member.role}
                  onChange={(e) => handleUpdateRole(member.id, e.target.value, member.email)}
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="waiter">Waiter</option>
                  <option value="chef">Chef</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 text-sm text-zinc-500">
              <p className="flex items-center gap-2"><Phone size={14} /> {member.phone || 'No phone'}</p>
              <p className="flex items-center gap-2"><FileText size={14} /> {member.email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WastageSection({ wastage, inventory }: { wastage: any[], inventory: InventoryItem[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ itemId: '', quantity: 0, reason: '' });

  const handleAdd = async () => {
    if (!form.itemId || !form.quantity) return;
    try {
      const item = inventory.find(i => i.id === form.itemId);
      await addDoc(collection(db, 'wastage'), {
        ...form,
        itemName: item?.name || 'Unknown',
        timestamp: serverTimestamp()
      });
      
      // Deduct from inventory
      if (item) {
        await updateDoc(doc(db, 'inventory', item.id), {
          stock: Math.max(0, item.stock - form.quantity)
        });

        // Add to journal as expense
        await addDoc(collection(db, 'journal'), {
          type: 'wastage',
          amount: (item.costPerUnit || 0) * form.quantity,
          description: `Wastage: ${item.name} (${form.reason})`,
          timestamp: serverTimestamp(),
          items: [{
            name: item.name,
            quantity: form.quantity,
            price: item.costPerUnit || 0
          }]
        });
      }

      setForm({ itemId: '', quantity: 0, reason: '' });
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'wastage');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <Trash2 size={24} />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Wastage Management</h2>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} /> Record Wastage
        </button>
      </div>

      {isAdding && (
        <div className="p-8 bg-zinc-50 border border-zinc-200 rounded-[2.5rem] grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Inventory Item</label>
            <select className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.itemId} onChange={e => setForm({...form, itemId: e.target.value})}>
              <option value="">Select Item...</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Quantity</label>
            <input type="number" className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Reason</label>
            <input type="text" className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="e.g., Expired, Damaged" />
          </div>
          <div className="md:col-span-3 flex gap-4 pt-4">
            <button onClick={handleAdd} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">Record Wastage</button>
            <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-300 transition-all">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Item</th>
              <th className="px-6 py-4">Quantity</th>
              <th className="px-6 py-4">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {wastage.map(entry => (
              <tr key={entry.id} className="hover:bg-zinc-50/50 transition-all">
                <td className="px-6 py-4 text-sm text-zinc-500">
                  {entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleString() : 'Processing...'}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-zinc-900">{entry.itemName}</td>
                <td className="px-6 py-4 text-sm font-black text-red-600">-{entry.quantity}</td>
                <td className="px-6 py-4 text-sm text-zinc-500 italic">{entry.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ManagementSection({ title, data, collectionName, icon }: { title: string, data: any[], collectionName: string, icon: React.ReactNode }) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!name) return;
    try {
      await addDoc(collection(db, collectionName), {
        name,
        createdAt: serverTimestamp(),
        active: true
      });
      setName('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, collectionName);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteDoc(doc(db, collectionName, deletingId));
      setDeletingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${deletingId}`);
    }
  };

  return (
    <div className="space-y-6">
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">Delete Item?</h3>
            <p className="text-zinc-500 mb-8">Are you sure you want to delete this item? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            {icon}
          </div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">{title}</h2>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} /> Add New
        </button>
      </div>

      {isAdding && (
        <div className="p-6 bg-zinc-50 border border-zinc-200 rounded-3xl flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
          <input 
            type="text" 
            placeholder="Enter Name..."
            className="flex-1 p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <button 
            onClick={handleAdd}
            className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            Save
          </button>
          <button 
            onClick={() => setIsAdding(false)}
            className="px-6 py-3 bg-zinc-200 text-zinc-600 rounded-xl font-bold hover:bg-zinc-300 transition-all"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map(item => (
          <div key={item.id} className="p-6 bg-white border border-zinc-100 rounded-3xl hover:shadow-xl hover:shadow-zinc-200/50 transition-all group flex items-center justify-between">
            <div>
              <h4 className="font-bold text-zinc-900">{item.name}</h4>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">ID: {item.id.slice(-6).toUpperCase()}</p>
            </div>
            <button 
              onClick={() => setDeletingId(item.id)}
              className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {data.length === 0 && (
          <div className="col-span-full py-12 text-center text-zinc-400 font-bold uppercase tracking-widest text-xs bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
            No items found
          </div>
        )}
      </div>
    </div>
  );
}

function SuppliersSection({ suppliers, inventory }: { suppliers: any[], inventory: InventoryItem[] }) {
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [isAddingInvoice, setIsAddingInvoice] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    items: [] as { inventoryItemId: string, quantity: number, costPerUnit: number }[],
    amountPaid: 0,
    totalAmount: 0
  });

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return;
    try {
      await addDoc(collection(db, 'vendors'), {
        ...supplierForm,
        createdAt: serverTimestamp()
      });
      setIsAddingSupplier(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vendors');
    }
  };

  const handleAddInvoiceItem = () => {
    if (inventory.length === 0) return;
    setInvoiceForm({
      ...invoiceForm,
      items: [...invoiceForm.items, { inventoryItemId: inventory[0].id, quantity: 1, costPerUnit: 0 }]
    });
  };

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    const newTotal = newItems.reduce((sum, item) => sum + (item.quantity * item.costPerUnit), 0);
    setInvoiceForm({ ...invoiceForm, items: newItems, totalAmount: newTotal });
  };

  const removeInvoiceItem = (index: number) => {
    const newItems = invoiceForm.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((sum, item) => sum + (item.quantity * item.costPerUnit), 0);
    setInvoiceForm({ ...invoiceForm, items: newItems, totalAmount: newTotal });
  };

  const handleSaveInvoice = async () => {
    if (!selectedSupplier || invoiceForm.items.length === 0) return;
    
    try {
      // 1. Save the invoice (Bill)
      const billRef = await addDoc(collection(db, 'bills'), {
        vendorId: selectedSupplier.id,
        vendorName: selectedSupplier.name,
        invoiceNumber: invoiceForm.invoiceNumber,
        date: invoiceForm.date,
        items: invoiceForm.items,
        totalAmount: invoiceForm.totalAmount,
        amountPaid: invoiceForm.amountPaid,
        status: invoiceForm.amountPaid >= invoiceForm.totalAmount ? 'paid' : 'pending',
        createdAt: serverTimestamp()
      });

      // 2. Update Inventory
      for (const item of invoiceForm.items) {
        const invItem = inventory.find(i => i.id === item.inventoryItemId);
        if (invItem) {
          await updateDoc(doc(db, 'inventory', invItem.id), {
            stock: invItem.stock + item.quantity,
            lastUpdated: serverTimestamp()
          });
        }
      }

      // 3. Record Accounting Journal Entry for the amount paid
      if (invoiceForm.amountPaid > 0) {
        await addDoc(collection(db, 'journal'), {
          type: 'expense',
          amount: invoiceForm.amountPaid,
          description: `Payment for Invoice #${invoiceForm.invoiceNumber} from ${selectedSupplier.name}`,
          timestamp: serverTimestamp(),
          billId: billRef.id,
          vendorId: selectedSupplier.id
        });
      }

      setIsAddingInvoice(false);
      setInvoiceForm({
        invoiceNumber: '',
        date: new Date().toISOString().split('T')[0],
        items: [],
        amountPaid: 0,
        totalAmount: 0
      });
      setSelectedSupplier(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bills');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Suppliers & Purchases</h2>
          <p className="text-sm text-zinc-500 font-medium">Manage vendors, purchase orders, and stock intake</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsAddingSupplier(true)}
            className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
          >
            <Plus size={14} /> Add Supplier
          </button>
          <button 
            onClick={() => setIsAddingInvoice(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
          >
            <Plus size={18} /> Record Purchase
          </button>
        </div>
      </div>

      {isAddingSupplier && (
        <div className="p-6 bg-white rounded-3xl border border-zinc-200 mb-6">
          <h4 className="font-bold text-zinc-900 mb-4">Add New Supplier</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Supplier Name"
              className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.name}
              onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
            />
            <input
              type="text"
              placeholder="Phone"
              className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.phone}
              onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.email}
              onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
            />
            <input
              type="text"
              placeholder="Address"
              className="p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.address}
              onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setIsAddingSupplier(false)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSupplier}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              Save Supplier
            </button>
          </div>
        </div>
      )}

      {isAddingInvoice && (
        <div className="p-6 bg-white rounded-3xl border border-zinc-200 mb-6 space-y-6">
          <h4 className="font-bold text-zinc-900">Record Purchase Invoice</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 block">Supplier</label>
              <select
                className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                value={selectedSupplier?.id || ''}
                onChange={e => setSelectedSupplier(suppliers.find(s => s.id === e.target.value) || null)}
              >
                <option value="">Select Supplier...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 block">Invoice Number</label>
              <input
                type="text"
                placeholder="INV-..."
                className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                value={invoiceForm.invoiceNumber}
                onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 block">Date</label>
              <input
                type="date"
                className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                value={invoiceForm.date}
                onChange={e => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h5 className="font-bold text-zinc-700">Purchased Items</h5>
              <button 
                onClick={handleAddInvoiceItem}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
            
            {invoiceForm.items.map((item, index) => (
              <div key={index} className="flex gap-4 items-center bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                <div className="flex-1">
                  <select
                    className="w-full p-2 rounded-lg border border-zinc-200 text-sm"
                    value={item.inventoryItemId}
                    onChange={e => updateInvoiceItem(index, 'inventoryItemId', e.target.value)}
                  >
                    {inventory.map(inv => (
                      <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    placeholder="Qty"
                    className="w-full p-2 rounded-lg border border-zinc-200 text-sm"
                    value={item.quantity || ''}
                    onChange={e => updateInvoiceItem(index, 'quantity', Number(e.target.value))}
                  />
                </div>
                <div className="w-32">
                  <input
                    type="number"
                    placeholder="Cost/Unit"
                    className="w-full p-2 rounded-lg border border-zinc-200 text-sm"
                    value={item.costPerUnit || ''}
                    onChange={e => updateInvoiceItem(index, 'costPerUnit', Number(e.target.value))}
                  />
                </div>
                <div className="w-32 text-right font-bold text-zinc-700">
                  {formatCurrency(item.quantity * item.costPerUnit)}
                </div>
                <button 
                  onClick={() => removeInvoiceItem(index)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {invoiceForm.items.length === 0 && (
              <div className="text-center py-8 text-zinc-400 text-sm font-bold border-2 border-dashed border-zinc-200 rounded-2xl">
                No items added to this invoice
              </div>
            )}
          </div>

          <div className="border-t border-zinc-100 pt-6 flex justify-between items-end">
            <div className="w-64">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1 block">Amount Paid Now</label>
              <input
                type="number"
                className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none font-bold text-lg"
                value={invoiceForm.amountPaid || ''}
                onChange={e => setInvoiceForm({ ...invoiceForm, amountPaid: Number(e.target.value) })}
              />
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Total Invoice Amount</p>
              <p className="text-3xl font-black text-zinc-900">{formatCurrency(invoiceForm.totalAmount)}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setIsAddingInvoice(false)}
              className="px-6 py-3 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveInvoice}
              disabled={!selectedSupplier || invoiceForm.items.length === 0}
              className="px-6 py-3 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Purchase & Update Stock
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {suppliers.map(supplier => (
          <div key={supplier.id} className="p-6 bg-white rounded-3xl border border-zinc-200 hover:shadow-xl hover:shadow-zinc-200/50 transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                <Truck size={24} />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900">{supplier.name}</h3>
                <p className="text-xs text-zinc-500 font-medium">{supplier.phone}</p>
              </div>
            </div>
            {supplier.email && <p className="text-sm text-zinc-600 mb-1">Email: {supplier.email}</p>}
            {supplier.address && <p className="text-sm text-zinc-600">Address: {supplier.address}</p>}
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-zinc-50 rounded-[2.5rem] border-2 border-dashed border-zinc-200">
            <Truck size={48} className="text-zinc-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-zinc-900">No suppliers found</h3>
            <p className="text-zinc-500">Add your first supplier to start tracking purchases</p>
          </div>
        )}
      </div>
    </div>
  );
}
