import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError, secondaryAuth } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs, setDoc, limit, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { MenuItem, Category, InventoryItem, Journal, Order, LedgerGroup } from '../types';
import { Plus, Edit2, Trash2, Eye, EyeOff, Save, X, ShoppingBag, LayoutGrid, CheckCircle2, Clock, Ban, ShieldCheck, Monitor, Package, ChefHat, Truck, FileText, BarChart3, Boxes, History, Utensils, Printer, Move, Search, Filter, Calendar, Phone, MapPin, User, Hash, ChevronDown, ChevronUp, RotateCcw, Users, BookOpen, Building, Warehouse, Settings, Menu as MenuIcon, Upload, Download, FileSpreadsheet, ChevronRight, CreditCard, Wallet, ArrowRightLeft, Receipt, Percent, TrendingUp, UserPlus, Scale, Book, Grid, UserCheck, PieChart as PieChartIcon, Split } from 'lucide-react';
import TableDesigner from './TableDesigner';
import AccountingReportsIFRS from './AccountingReportsIFRS';
import CRM from './CRM';
import Dashboard from './Dashboard';
import RecipeManager from './RecipeManager';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatCurrencyDirect } from '../utils/format';
import { exportToExcel } from '../utils/excel';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const calculateAccountBalance = (accountId: string) => {
    let balance = 0;
    const account = ledgerGroups.find(g => g.id === accountId || g.code === accountId);
    if (!account) return 0;

    // Helper to get all child account IDs (including the account itself)
    const getAllAccountIds = (groupId: string): string[] => {
      const group = ledgerGroups.find(g => g.id === groupId);
      if (!group) return [];
      
      let ids: string[] = [];
      if (group.isAccount) {
        ids.push(group.code || group.id);
      }
      
      const children = ledgerGroups.filter(g => g.parentGroupId === groupId || g.parentGroupId === group.code);
      children.forEach(c => {
        ids = [...ids, ...getAllAccountIds(c.id)];
      });
      
      return Array.from(new Set(ids));
    };

    const targetIds = getAllAccountIds(account.id);

    journalEntries.forEach(entry => {
      entry.lines.forEach((line: any) => {
        if (targetIds.includes(line.accountId)) {
          if (account.type === 'Asset' || account.type === 'Expense') {
            balance += (line.debit || 0) - (line.credit || 0);
          } else {
            balance += (line.credit || 0) - (line.debit || 0);
          }
        }
      });
    });

    return balance;
  };

  const renderTree = () => {
    const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;
    
    return (
      <div className="space-y-4">
        {types.map(type => {
          const isExpanded = expandedGroups.has(type);
          const rootNodes = ledgerGroups.filter(g => 
            g.type.toLowerCase() === type.toLowerCase() && 
            (!g.parentGroupId || !ledgerGroups.some(pg => pg.id === g.parentGroupId))
          );

          const typeBalance = journalEntries.reduce((sum, entry) => {
            return sum + entry.lines.reduce((lineSum: number, line: any) => {
              const acc = ledgerGroups.find(g => g.code === line.accountId || g.id === line.accountId);
              if (acc && acc.type === type) {
                if (type === 'Asset' || type === 'Expense') {
                  return lineSum + (line.debit - line.credit);
                } else {
                  return lineSum + (line.credit - line.debit);
                }
              }
              return lineSum;
            }, 0);
          }, 0);
          
          return (
            <div key={type} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
              <div 
                onClick={() => toggleGroup(type)}
                className={`flex items-center justify-between p-4 cursor-pointer transition-all ${
                  isExpanded ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${
                    isExpanded ? 'bg-white/20 text-white' : 
                    type === 'Asset' ? 'bg-emerald-50 text-emerald-600' :
                    type === 'Liability' ? 'bg-red-50 text-red-600' :
                    type === 'Equity' ? 'bg-blue-50 text-blue-600' :
                    type === 'Revenue' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
                  }`}>
                    {type === 'Asset' ? <Building size={18} /> :
                     type === 'Liability' ? <Scale size={18} /> :
                     type === 'Equity' ? <Wallet size={18} /> :
                     type === 'Revenue' ? <TrendingUp size={18} /> : <Receipt size={18} />}
                  </div>
                  <div>
                    <span className="text-sm font-black uppercase tracking-tight">{type}s</span>
                    <p className={`text-[10px] uppercase tracking-widest font-bold ${isExpanded ? 'text-white/50' : 'text-zinc-400'}`}>
                      {rootNodes.length} Root {rootNodes.length === 1 ? 'Node' : 'Nodes'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-black ${isExpanded ? 'text-white' : 'text-zinc-900'}`}>
                    {formatCurrency(typeBalance)}
                  </span>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>
              
              {isExpanded && (
                <div className="p-4 bg-zinc-50/30 space-y-2">
                  {rootNodes.length > 0 ? (
                    rootNodes.map(node => renderNode(node, 0))
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-[10px] text-zinc-400 italic font-medium">No {type.toLowerCase()} accounts or groups defined yet.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderNode = (node: LedgerGroup, level: number) => {
    const isExpanded = expandedGroups.has(node.id);
    const children = ledgerGroups.filter(g => g.parentGroupId === node.id);
    const hasChildren = children.length > 0;
    const balance = calculateAccountBalance(node.id);

    return (
      <div key={node.id} className="space-y-1">
        <div 
          className={`group/node flex items-center justify-between p-2.5 rounded-xl border transition-all ${
            node.isAccount 
              ? 'bg-card border-border hover:border-primary/30 hover:bg-primary/5' 
              : 'bg-card border-border hover:border-zinc-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {!node.isAccount && hasChildren ? (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleGroup(node.id); }}
                className={`p-1 rounded-md transition-all ${
                  isExpanded ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <div className="w-6 flex justify-center">
                <div className={`w-1.5 h-1.5 rounded-full ${node.isAccount ? 'bg-primary animate-pulse' : 'bg-zinc-200'}`} />
              </div>
            )}
            
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`p-1.5 rounded-lg ${
                node.isAccount ? 'bg-zinc-100 text-zinc-500' : 'bg-primary/10 text-primary'
              }`}>
                {node.isAccount ? <Book size={12} /> : <BookOpen size={12} />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className={`text-xs truncate ${node.isAccount ? 'font-semibold text-zinc-700' : 'font-black text-zinc-900 uppercase tracking-tight'}`}>
                  {node.code ? <span className="text-zinc-400 mr-1.5 font-mono">{node.code}</span> : null}
                  {node.name}
                </span>
                {node.description && (
                  <span className="text-[9px] text-zinc-400 truncate max-w-[200px]">{node.description}</span>
                )}
              </div>
              {node.isAccount && (
                <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-400 text-[8px] font-black uppercase tracking-tighter">Account</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${balance < 0 ? 'text-red-500' : 'text-zinc-900'}`}>
              {formatCurrency(balance)}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover/node:opacity-100 transition-all shrink-0">
              <button 
                onClick={() => handleEditLedgerGroup(node)}
                className="p-2 text-zinc-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                title="Edit Node"
              >
                <Edit2 size={12} />
              </button>
              <button 
                onClick={() => deleteLedgerGroup(node.id)}
                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Delete Node"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
        
        {!node.isAccount && isExpanded && hasChildren && (
          <div className="ml-5 border-l-2 border-zinc-100 pl-4 space-y-1 mt-1">
            {children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu' | 'orders' | 'kitchen' | 'inventory' | 'accounting' | 'finance' | 'tables' | 'crm' | 'users' | 'stores' | 'warehouses' | 'mobile' | 'terminals' | 'settings' | 'wastage' | 'recipes' | 'suppliers' | 'production' | 'purchases' | 'delivery'>('dashboard');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [isAddingDriver, setIsAddingDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', phone: '', vehicle: '', status: 'active' });
  const [accountingSubTab, setAccountingSubTab] = useState<'dashboard' | 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'equity' | 'trial_balance' | 'general_ledger' | 'inventory_report' | 'sales_report' | 'pos_summary'>('dashboard');
  const [isReportsDropdownOpen, setIsReportsDropdownOpen] = useState(false);
  const [financeSubTab, setFinanceSubTab] = useState<'journal' | 'vouchers' | 'bills' | 'banking' | 'taxes'>('journal');
  const [accountingDateRange, setAccountingDateRange] = useState({ start: '', end: '' });
  const [accountingSearch, setAccountingSearch] = useState('');
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [expandedJournalId, setExpandedJournalId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newLedgerGroup, setNewLedgerGroup] = useState({ name: '', code: '', type: 'Asset' as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense', parentGroupId: '', isAccount: false });
  const [editingLedgerGroupId, setEditingLedgerGroupId] = useState<string | null>(null);
  const [editLedgerGroupForm, setEditLedgerGroupForm] = useState({ name: '', code: '', type: 'Asset' as 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense', parentGroupId: '', isAccount: false });
  const [newCategory, setNewCategory] = useState({ name: '', order: 0 });
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [isManageTreeOpen, setIsManageTreeOpen] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [reportView, setReportView] = useState<'cards' | 'spreadsheet'>('cards');
  const [spreadsheetTab, setSpreadsheetTab] = useState<'journal' | 'trial_balance' | 'profit_loss'>('journal');

  // Settlement States
  const [isSettlingBill, setIsSettlingBill] = useState(false);
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'multi'>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [multiPayment, setMultiPayment] = useState({ cash: '', card: '' });
  const [isSplitBill, setIsSplitBill] = useState(false);
  const [numberOfSplits, setNumberOfSplits] = useState(2);
  const [isSplitByItem, setIsSplitByItem] = useState(false);
  const [isSplitByAmount, setIsSplitByAmount] = useState(false);
  const [selectedSplitItems, setSelectedSplitItems] = useState<any[]>([]);
  const [splitAmount, setSplitAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddLedgerGroup = async () => {
    if (!newLedgerGroup.name) return;
    try {
      if (newLedgerGroup.code) {
        await setDoc(doc(db, 'ledgerGroups', newLedgerGroup.code), {
          ...newLedgerGroup,
          createdAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'ledgerGroups'), {
          ...newLedgerGroup,
          createdAt: serverTimestamp()
        });
      }
      setNewLedgerGroup({ name: '', code: '', type: 'Asset', parentGroupId: '', isAccount: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'ledgerGroups');
    }
  };

  const handleEditLedgerGroup = (group: any) => {
    setEditingLedgerGroupId(group.id);
    setEditLedgerGroupForm({
      name: group.name,
      code: group.code || '',
      type: group.type,
      parentGroupId: group.parentGroupId || '',
      isAccount: group.isAccount || false
    });
  };

  const handleSaveLedgerGroup = async () => {
    if (!editingLedgerGroupId || !editLedgerGroupForm.name) return;
    try {
      await updateDoc(doc(db, 'ledgerGroups', editingLedgerGroupId), {
        ...editLedgerGroupForm,
        updatedAt: serverTimestamp()
      });
      setEditingLedgerGroupId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ledgerGroups/${editingLedgerGroupId}`);
    }
  };

  const deleteLedgerGroup = async (id: string) => {
    // Removed window.confirm for iframe compatibility
    // if (!window.confirm('Are you sure you want to delete this ledger group?')) return;
    try {
      await deleteDoc(doc(db, 'ledgerGroups', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ledgerGroups/${id}`);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.name) return;
    try {
      await addDoc(collection(db, 'categories'), {
        ...newCategory,
        createdAt: serverTimestamp()
      });
      setNewCategory({ name: '', order: categories.length });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSystemReset = async () => {
    setIsResetting(true);
    try {
      console.log('Starting system reset...');
      
      // 1. Clear Orders
      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      console.log(`Deleting ${ordersSnapshot.size} orders...`);
      const orderDeletes = ordersSnapshot.docs.map(d => deleteDoc(doc(db, 'orders', d.id)));
      
      // 2. Clear Journal & Journal Entries
      const journalSnapshot = await getDocs(collection(db, 'journal'));
      console.log(`Deleting ${journalSnapshot.size} journal entries...`);
      const journalDeletes = journalSnapshot.docs.map(d => deleteDoc(doc(db, 'journal', d.id)));
      
      const entriesSnapshot = await getDocs(collection(db, 'journal_entries'));
      console.log(`Deleting ${entriesSnapshot.size} formal journal entries...`);
      const entryDeletes = entriesSnapshot.docs.map(d => deleteDoc(doc(db, 'journal_entries', d.id)));
      
      // 3. Clear Bills (Purchases)
      const billsSnapshot = await getDocs(collection(db, 'bills'));
      console.log(`Deleting ${billsSnapshot.size} bills...`);
      const billDeletes = billsSnapshot.docs.map(d => deleteDoc(doc(db, 'bills', d.id)));

      // 4. Clear Wastage
      const wastageSnapshot = await getDocs(collection(db, 'wastage'));
      console.log(`Deleting ${wastageSnapshot.size} wastage records...`);
      const wastageDeletes = wastageSnapshot.docs.map(d => deleteDoc(doc(db, 'wastage', d.id)));

      // 5. Clear Production
      const productionSnapshot = await getDocs(collection(db, 'production'));
      console.log(`Deleting ${productionSnapshot.size} production records...`);
      const productionDeletes = productionSnapshot.docs.map(d => deleteDoc(doc(db, 'production', d.id)));

      // Execute all deletes
      await Promise.all([
        ...orderDeletes, 
        ...journalDeletes, 
        ...entryDeletes, 
        ...billDeletes, 
        ...wastageDeletes, 
        ...productionDeletes
      ]);

      // 6. Reset Inventory Stock and Cost
      const inventorySnapshot = await getDocs(collection(db, 'inventory'));
      console.log(`Resetting ${inventorySnapshot.size} inventory items...`);
      const inventoryUpdates = inventorySnapshot.docs.map(d => 
        updateDoc(doc(db, 'inventory', d.id), {
          stock: 0,
          costPerUnit: 0,
          lastUpdated: serverTimestamp()
        })
      );
      await Promise.all(inventoryUpdates);

      // 7. Reset Tables
      const tablesSnapshot = await getDocs(collection(db, 'tables'));
      console.log(`Resetting ${tablesSnapshot.size} tables...`);
      const tableUpdates = tablesSnapshot.docs.map(d => 
        updateDoc(doc(db, 'tables', d.id), {
          status: 'available',
          currentOrderId: null
        })
      );
      await Promise.all(tableUpdates);

      console.log('System reset complete.');
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 5000);
      setIsResetConfirmOpen(false);
    } catch (error) {
      console.error('Reset failed:', error);
      handleFirestoreError(error, OperationType.WRITE, 'system-reset');
    } finally {
      setIsResetting(false);
    }
  };

  const deleteCategory = async (id: string) => {
    // Removed window.confirm for iframe compatibility
    // if (!window.confirm('Are you sure you want to delete this category? Items in this category will become uncategorized.')) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
    }
  };
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedJournalEntryId, setExpandedJournalEntryId] = useState<string | null>(null);
  const [expandedStockItemId, setExpandedStockItemId] = useState<string | null>(null);
  
  const filteredJournalEntries = journalEntries.filter(entry => {
    const date = new Date(entry.date);
    const isAfterStart = !accountingDateRange.start || date >= new Date(accountingDateRange.start);
    const isBeforeEnd = !accountingDateRange.end || date <= new Date(accountingDateRange.end);
    const matchesSearch = !accountingSearch || 
      entry.description?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
      entry.reference?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
      entry.lines.some((l: any) => l.accountName.toLowerCase().includes(accountingSearch.toLowerCase()));
    return isAfterStart && isBeforeEnd && matchesSearch;
  });

  const totalRevenue = filteredJournalEntries.reduce((acc, entry) => {
    // Revenue accounts usually have credit balance
    const revenueLines = entry.lines.filter((l: any) => {
      const lg = ledgerGroups.find(g => g.id === l.accountId);
      return lg?.type === 'Revenue' || l.accountName.toLowerCase().includes('sales') || l.accountName.toLowerCase().includes('revenue');
    });
    return acc + revenueLines.reduce((sum: number, l: any) => sum + l.credit - l.debit, 0);
  }, 0);

  const totalExpenses = filteredJournalEntries.reduce((acc, entry) => {
    // Expense accounts usually have debit balance
    const expenseLines = entry.lines.filter((l: any) => {
      const lg = ledgerGroups.find(g => g.id === l.accountId);
      return lg?.type === 'Expense' || 
        l.accountName.toLowerCase().includes('expense') || 
        l.accountName.toLowerCase().includes('purchase') ||
        l.accountName.toLowerCase().includes('cost of goods sold') ||
        l.accountName.toLowerCase().includes('wastage');
    });
    return acc + expenseLines.reduce((sum: number, l: any) => sum + l.debit - l.credit, 0);
  }, 0);

  const totalOrdersCount = filteredJournalEntries.filter(e => 
    e.reference?.startsWith('POS-') || 
    e.description?.toLowerCase().includes('order') ||
    e.description?.toLowerCase().includes('sale')
  ).length;

  const isSuperAdmin = user?.email === 'ashkan.yaghtin@gmail.com';
  const userRole = profile?.role || 'waiter';

  const canAccess = (tab: string) => {
    if (isSuperAdmin || userRole === 'admin') return true;
    
    // Check for granular permissions if available
    const userProfile = staff.find(s => s.uid === user?.uid);
    if (userProfile?.permissions) {
      if (userProfile.permissions[tab] === true) return true;
    }

    switch (tab) {
      case 'dashboard':
      case 'orders':
      case 'tables':
      case 'crm':
      case 'pos':
        return ['manager', 'chef', 'driver', 'waiter'].includes(userRole);
      case 'suppliers':
      case 'purchases':
      case 'production':
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
  const [journal, setJournal] = useState<Journal[]>([]);
  const [accountingFilters, setAccountingFilters] = useState({
    fromDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
    type: 'all'
  });
  const [bills, setBills] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [cheques, setCheques] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
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
  const [adjustingStock, setAdjustingStock] = useState<{ id: string, type: 'add' | 'remove', amount: number, price?: number, supplierId?: string } | null>(null);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [editInventoryForm, setEditInventoryForm] = useState<Partial<InventoryItem>>({});

  // Order Management Filters
  const [orderFilters, setOrderFilters] = useState({
    store: '',
    orderNo: '',
    orderType: '',
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
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
  const [isAddingTransfer, setIsAddingTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromAccount: 'cash', toAccount: 'bank', amount: 0, reference: '', date: new Date().toISOString().split('T')[0] });

  const initializeDefaultCOA = async () => {
    try {
      const DEFAULT_COA = [
        // Assets
        { code: '1000', name: 'Assets', type: 'Asset', isAccount: false },
        { code: '1100', name: 'Current Assets', type: 'Asset', parentCode: '1000', isAccount: false },
        { code: '1101', name: 'Cash on Hand', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1102', name: 'Bank Accounts', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1103', name: 'Accounts Receivable', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1104', name: 'Allowance for Doubtful Debts', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1105', name: 'Inventory', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1106', name: 'Prepaid Expenses', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1107', name: 'VAT Receivable', type: 'Asset', parentCode: '1100', isAccount: true },
        { code: '1200', name: 'Non-Current Assets', type: 'Asset', parentCode: '1000', isAccount: false },
        { code: '1201', name: 'Property, Plant & Equipment (PPE)', type: 'Asset', parentCode: '1200', isAccount: true },
        { code: '1202', name: 'Accumulated Depreciation', type: 'Asset', parentCode: '1200', isAccount: true },
        { code: '1203', name: 'Intangible Assets', type: 'Asset', parentCode: '1200', isAccount: true },
        { code: '1204', name: 'Right-of-Use Assets (IFRS 16)', type: 'Asset', parentCode: '1200', isAccount: true },
        { code: '1205', name: 'Long-term Investments', type: 'Asset', parentCode: '1200', isAccount: true },
        // Liabilities
        { code: '2000', name: 'Liabilities', type: 'Liability', isAccount: false },
        { code: '2100', name: 'Current Liabilities', type: 'Liability', parentCode: '2000', isAccount: false },
        { code: '2101', name: 'Accounts Payable', type: 'Liability', parentCode: '2100', isAccount: true },
        { code: '2102', name: 'Accrued Expenses', type: 'Liability', parentCode: '2100', isAccount: true },
        { code: '2103', name: 'Short-term Loans', type: 'Liability', parentCode: '2100', isAccount: true },
        { code: '2104', name: 'VAT Payable', type: 'Liability', parentCode: '2100', isAccount: true },
        { code: '2105', name: 'Unearned Revenue', type: 'Liability', parentCode: '2100', isAccount: true },
        { code: '2200', name: 'Non-Current Liabilities', type: 'Liability', parentCode: '2000', isAccount: false },
        { code: '2201', name: 'Long-term Loans', type: 'Liability', parentCode: '2200', isAccount: true },
        { code: '2202', name: 'Lease Liabilities (IFRS 16)', type: 'Liability', parentCode: '2200', isAccount: true },
        { code: '2203', name: 'Provisions (IAS 37)', type: 'Liability', parentCode: '2200', isAccount: true },
        // Equity
        { code: '3000', name: 'Equity', type: 'Equity', isAccount: false },
        { code: '3101', name: 'Share Capital', type: 'Equity', parentCode: '3000', isAccount: true },
        { code: '3102', name: 'Retained Earnings', type: 'Equity', parentCode: '3000', isAccount: true },
        { code: '3103', name: 'Current Year Profit/Loss', type: 'Equity', parentCode: '3000', isAccount: true },
        { code: '3104', name: 'Dividends', type: 'Equity', parentCode: '3000', isAccount: true },
        // Revenue
        { code: '4000', name: 'Revenue', type: 'Revenue', isAccount: false },
        { code: '4101', name: 'Sales Revenue', type: 'Revenue', parentCode: '4000', isAccount: true },
        { code: '4102', name: 'Service Revenue', type: 'Revenue', parentCode: '4000', isAccount: true },
        { code: '4103', name: 'Other Income', type: 'Revenue', parentCode: '4000', isAccount: true },
        { code: '4104', name: 'Discounts Given', type: 'Revenue', parentCode: '4000', isAccount: true },
        // Cost of Sales
        { code: '5000', name: 'Cost of Sales', type: 'Expense', isAccount: false },
        { code: '5101', name: 'Cost of Goods Sold', type: 'Expense', parentCode: '5000', isAccount: true },
        { code: '5102', name: 'Direct Labor', type: 'Expense', parentCode: '5000', isAccount: true },
        { code: '5103', name: 'Manufacturing Costs', type: 'Expense', parentCode: '5000', isAccount: true },
        { code: '5104', name: 'Wastage Expense', type: 'Expense', parentCode: '5000', isAccount: true },
        // Operating Expenses
        { code: '6000', name: 'Operating Expenses', type: 'Expense', isAccount: false },
        { code: '6100', name: 'Administrative Expenses', type: 'Expense', parentCode: '6000', isAccount: false },
        { code: '6101', name: 'Salaries', type: 'Expense', parentCode: '6100', isAccount: true },
        { code: '6102', name: 'Office Rent', type: 'Expense', parentCode: '6100', isAccount: true },
        { code: '6103', name: 'Utilities', type: 'Expense', parentCode: '6100', isAccount: true },
        { code: '6104', name: 'Depreciation', type: 'Expense', parentCode: '6100', isAccount: true },
        { code: '6199', name: 'Other Operating Expenses', type: 'Expense', parentCode: '6100', isAccount: true },
        { code: '6200', name: 'Selling & Distribution', type: 'Expense', parentCode: '6000', isAccount: false },
        { code: '6201', name: 'Marketing Expenses', type: 'Expense', parentCode: '6200', isAccount: true },
        { code: '6202', name: 'Delivery Expenses', type: 'Expense', parentCode: '6200', isAccount: true },
        { code: '6203', name: 'Commission', type: 'Expense', parentCode: '6200', isAccount: true },
        // Finance & Other
        { code: '8000', name: 'Finance & Other', type: 'Expense', isAccount: false },
        { code: '8101', name: 'Interest Expense', type: 'Expense', parentCode: '8000', isAccount: true },
        { code: '8102', name: 'Bank Charges', type: 'Expense', parentCode: '8000', isAccount: true },
        { code: '8103', name: 'Foreign Exchange Gain/Loss', type: 'Expense', parentCode: '8000', isAccount: true },
      ];

      for (const item of DEFAULT_COA) {
        const docRef = doc(db, 'ledgerGroups', item.code);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          await setDoc(docRef, {
            name: item.name,
            code: item.code,
            type: item.type,
            isAccount: item.isAccount,
            parentGroupId: item.parentCode || '',
            createdAt: serverTimestamp()
          });
        }
      }
      alert('Chart of Accounts synchronized successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'ledgerGroups');
    }
  };

  const handleAddTransfer = async () => {
    if (!transferForm.amount || transferForm.amount <= 0) return;
    try {
      const amountInCents = Math.round(transferForm.amount * 100);
      
      // Create a formal journal entry for the transfer
      await addDoc(collection(db, 'journal_entries'), {
        date: transferForm.date,
        reference: transferForm.reference || `TRF-${Date.now().toString().slice(-6)}`,
        description: `Fund Transfer: ${transferForm.fromAccount.toUpperCase()} to ${transferForm.toAccount.toUpperCase()}`,
        timestamp: serverTimestamp(),
        lines: [
          { accountId: transferForm.toAccount, accountName: transferForm.toAccount === 'cash' ? 'Cash' : 'Bank', debit: amountInCents, credit: 0 },
          { accountId: transferForm.fromAccount, accountName: transferForm.fromAccount === 'cash' ? 'Cash' : 'Bank', debit: 0, credit: amountInCents }
        ]
      });

      // Also record in simple journal for dashboard visibility
      await addDoc(collection(db, 'journal'), {
        type: 'transfer',
        amount: amountInCents,
        description: `Fund Transfer: ${transferForm.fromAccount.toUpperCase()} to ${transferForm.toAccount.toUpperCase()}`,
        timestamp: serverTimestamp()
      });

      setIsAddingTransfer(false);
      setTransferForm({ fromAccount: 'cash', toAccount: 'bank', amount: 0, reference: '', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'journal_entries');
    }
  };
  const [isAddingVendor, setIsAddingVendor] = useState(false);
  const [isAddingCheque, setIsAddingCheque] = useState(false);
  const [journalError, setJournalError] = useState('');
  const [isAddingJournalEntry, setIsAddingJournalEntry] = useState(false);
  
  const [voucherForm, setVoucherForm] = useState({ type: 'receipt', amount: 0, description: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'cash' });
  const [billForm, setBillForm] = useState({ 
    vendorId: '', 
    amount: 0, 
    dueDate: new Date().toISOString().split('T')[0], 
    description: '', 
    status: 'unpaid',
    items: [] as { inventoryItemId: string, name: string, quantity: number, price: number }[]
  });
  const [chequeForm, setChequeForm] = useState({ chequeNumber: '', bank: '', amount: 0, date: new Date().toISOString().split('T')[0], status: 'pending', vendorId: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [journalEntryForm, setJournalEntryForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
    lines: [
      { accountId: '', accountName: '', debit: 0, credit: 0 },
      { accountId: '', accountName: '', debit: 0, credit: 0 }
    ]
  });

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
    const q = query(collection(db, 'staff'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'staff'));
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
      setJournal(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Journal)));
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
    const unsubJournalEntries = onSnapshot(collection(db, 'journal_entries'), (snapshot) => {
      setJournalEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journal_entries'));

    return () => {
      unsubBills();
      unsubVendors();
      unsubVouchers();
      unsubCheques();
      unsubJournalEntries();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubLedgerGroups = onSnapshot(collection(db, 'ledgerGroups'), (snapshot) => {
      const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LedgerGroup));
      setLedgerGroups(groups);
      
      // Auto-initialize if empty
      if (snapshot.empty && isSuperAdmin) {
        initializeDefaultCOA();
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ledgerGroups'));
    
    return () => unsubLedgerGroups();
  }, [user, isSuperAdmin]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'inventory'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'));
    return () => unsubscribe();
  }, [user]);

  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    type: 'expense' as 'sale' | 'expense' | 'wastage',
    amount: 0,
    description: ''
  });

  const handleAddTransaction = async () => {
    try {
      const amountInCents = Math.round(newTransaction.amount * 100);
      
      // 1. Record in simple journal for backward compatibility
      await addDoc(collection(db, 'journal'), {
        ...newTransaction,
        amount: amountInCents,
        timestamp: serverTimestamp()
      });

      // 2. Create a formal journal entry for the dashboard
      await addDoc(collection(db, 'journal_entries'), {
        date: new Date().toISOString().split('T')[0],
        reference: `MAN-${Date.now().toString().slice(-6)}`,
        description: newTransaction.description,
        type: newTransaction.type,
        timestamp: serverTimestamp(),
        lines: [
          { 
            accountId: newTransaction.type === 'sale' ? '1101' : '6199', 
            accountName: newTransaction.type === 'sale' ? 'Cash on Hand' : 'Other Operating Expenses', 
            debit: amountInCents, 
            credit: 0 
          },
          { 
            accountId: newTransaction.type === 'sale' ? '4101' : '1101', 
            accountName: newTransaction.type === 'sale' ? 'Sales Revenue' : 'Cash on Hand', 
            debit: 0, 
            credit: amountInCents 
          }
        ]
      });

      setShowAddTransaction(false);
      setNewTransaction({ type: 'expense', amount: 0, description: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'journal');
    }
  };

  const handleAddVoucher = async () => {
    try {
      const voucherData = {
        ...voucherForm,
        amount: Math.round(voucherForm.amount * 100),
        createdAt: serverTimestamp()
      };
      
      const voucherRef = await addDoc(collection(db, 'vouchers'), voucherData);

      // Create Journal Entry for the Voucher
      let debitAccount = '';
      let debitName = '';
      let creditAccount = '';
      let creditName = '';

      if (voucherForm.type === 'receipt') {
        debitAccount = voucherForm.paymentMethod === 'cash' ? '1101' : '1102';
        debitName = voucherForm.paymentMethod === 'cash' ? 'Cash on Hand' : 'Bank Accounts';
        creditAccount = '1103';
        creditName = 'Accounts Receivable';
      } else {
        debitAccount = '2101';
        debitName = 'Accounts Payable';
        creditAccount = voucherForm.paymentMethod === 'cash' ? '1101' : '1102';
        creditName = voucherForm.paymentMethod === 'cash' ? 'Cash on Hand' : 'Bank Accounts';
      }

      await addDoc(collection(db, 'journal_entries'), {
        date: voucherForm.date,
        reference: `VCH-${voucherRef.id.slice(-6).toUpperCase()}`,
        description: voucherForm.description,
        timestamp: serverTimestamp(),
        lines: [
          { accountId: debitAccount, accountName: debitName, debit: voucherData.amount, credit: 0 },
          { accountId: creditAccount, accountName: creditName, debit: 0, credit: voucherData.amount }
        ]
      });

      setIsAddingVoucher(false);
      setVoucherForm({ type: 'receipt', amount: 0, description: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'cash' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vouchers');
    }
  };

  const handleAddBill = async () => {
    try {
      const billData = {
        ...billForm,
        amount: Math.round(billForm.amount * 100),
        createdAt: serverTimestamp()
      };
      
      const billRef = await addDoc(collection(db, 'bills'), billData);

      // Update Inventory Stock and Average Cost
      for (const item of billForm.items) {
        const invRef = doc(db, 'inventory', item.inventoryItemId);
        const invDoc = await getDoc(invRef);
        if (invDoc.exists()) {
          const data = invDoc.data();
          const currentStock = data.stock || 0;
          const currentAvgCost = data.averageCost || data.costPerUnit || 0;
          const newQty = item.quantity;
          const newPrice = Math.round(item.price * 100);
          
          // Calculate new average cost: (OldValue + NewValue) / TotalQty
          const totalQty = currentStock + newQty;
          const totalValue = (currentStock * currentAvgCost) + (newQty * newPrice);
          const newAvgCost = totalQty > 0 ? Math.round(totalValue / totalQty) : newPrice;

          await updateDoc(invRef, {
            stock: totalQty,
            averageCost: newAvgCost,
            costPerUnit: newAvgCost, // Keep for backward compatibility
            lastUpdated: serverTimestamp()
          });
        }
      }

      // Create Journal Entry for the Bill
      const journalLines = [
        { accountId: '1105', accountName: 'Inventory Asset', debit: billData.amount, credit: 0 },
        { accountId: '2101', accountName: 'Accounts Payable', debit: 0, credit: billData.amount }
      ];

      await addDoc(collection(db, 'journal_entries'), {
        date: new Date().toISOString().split('T')[0],
        reference: `BILL-${billRef.id.slice(-6).toUpperCase()}`,
        description: `Purchase from ${vendors.find(v => v.id === billForm.vendorId)?.name || 'Vendor'}`,
        timestamp: serverTimestamp(),
        lines: journalLines
      });

      setIsAddingBill(false);
      setBillForm({ 
        vendorId: '', 
        amount: 0, 
        dueDate: new Date().toISOString().split('T')[0], 
        description: '', 
        status: 'unpaid',
        items: []
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bills');
    }
  };

  const handleAddCheque = async () => {
    try {
      await addDoc(collection(db, 'cheques'), {
        ...chequeForm,
        amount: Math.round(chequeForm.amount * 100),
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

  const handleAddJournalEntry = async () => {
    setJournalError('');
    const totalDebit = journalEntryForm.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = journalEntryForm.lines.reduce((sum, line) => sum + line.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      setJournalError("Debits and Credits must balance!");
      return;
    }

    try {
      const formattedLines = journalEntryForm.lines.map(line => ({
        ...line,
        debit: Math.round(line.debit * 100),
        credit: Math.round(line.credit * 100)
      }));

      await addDoc(collection(db, 'journal_entries'), {
        ...journalEntryForm,
        lines: formattedLines,
        timestamp: serverTimestamp()
      });
      
      // Also add to the general journal for the dashboard
      for (const line of formattedLines) {
        if (line.debit > 0 || line.credit > 0) {
          await addDoc(collection(db, 'journal'), {
            type: line.debit > 0 ? 'expense' : 'sale', // Simplified for dashboard
            amount: line.debit > 0 ? line.debit : line.credit,
            description: `${journalEntryForm.description} (${line.accountName})`,
            timestamp: serverTimestamp(),
            accountId: line.accountId
          });
        }
      }

      setIsAddingJournalEntry(false);
      setJournalEntryForm({
        date: new Date().toISOString().split('T')[0],
        reference: '',
        description: '',
        lines: [
          { accountId: '', accountName: '', debit: 0, credit: 0 },
          { accountId: '', accountName: '', debit: 0, credit: 0 }
        ]
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'journal_entries');
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
              price: Math.round((Number(row.Price) || 0) * 100),
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
    setEditForm({
      ...item,
      price: item.price / 100 // Convert cents to simple form for editing
    });
  };

  const handleSave = async (id: string) => {
    try {
      const itemRef = doc(db, 'menu', id);
      const { id: _, ...dataToUpdate } = editForm;
      const updatedItem = {
        ...dataToUpdate,
        price: Math.round((Number(dataToUpdate.price) || 0) * 100), // Convert to cents
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
    setEditInventoryForm({
      ...item,
      costPerUnit: (item.costPerUnit || 0) / 100 // Convert cents to dollars for input
    });
  };

  const handleSaveInventory = async (id: string) => {
    try {
      const itemRef = doc(db, 'inventory', id);
      const { id: _, ...dataToUpdate } = editInventoryForm;
      await updateDoc(itemRef, {
        ...dataToUpdate,
        costPerUnit: Math.round((dataToUpdate.costPerUnit || 0) * 100) // Convert dollars to cents for storage
      });
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
        price: Math.round((Number(newForm.price) || 0) * 100), // Convert to cents
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

  const printKOT = (order: Order, isReprint: boolean = false) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = order.items.map(item => `
      <div style="margin-bottom: 8px; font-family: monospace;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 16px;">
          <span>${item.quantity}x ${item.name}</span>
        </div>
        ${item.notes ? `<div style="font-size: 12px; margin-left: 20px; color: #555;">- ${item.notes}</div>` : ''}
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
            .reprint { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 10px; border: 3px solid #ff0000; color: #ff0000; padding: 10px; }
            .notes { border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px; font-style: italic; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${isReprint ? '<div class="reprint">*** REPRINT ***</div>' : ''}
          <div class="header">
            <h2 style="margin: 0;">KITCHEN ORDER</h2>
            <h3 style="margin: 5px 0;">KOT #${order.kotNo || 'N/A'}</h3>
            <p style="margin: 5px 0;">Order: #${order.id.slice(-6).toUpperCase()}</p>
            <p style="margin: 5px 0;">Type: ${order.orderType?.toUpperCase() || 'DELIVERY'}</p>
            ${order.tableNumber ? `<p style="margin: 5px 0; font-size: 20px; font-weight: bold;">TABLE: ${order.tableNumber}</p>` : ''}
            <p style="margin: 5px 0;">Date: ${new Date().toLocaleString()}</p>
          </div>
          <div class="items">
            ${itemsHtml}
          </div>
          ${order.notes ? `
          <div class="notes">
            <strong>Notes:</strong><br/>
            ${order.notes}
          </div>
          ` : ''}
          <div class="footer">
            <p>*** END OF KOT ***</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getAmountToPay = () => {
    if (!settlingOrder) return 0;
    if (isSplitByItem) {
      const subtotal = selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const orderSubtotal = settlingOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      let discountAmount = 0;
      
      if (settlingOrder.discount && settlingOrder.discount > 0) {
        if (settlingOrder.discountType === 'percentage') {
          discountAmount = Math.round(subtotal * (settlingOrder.discount / 100));
        } else {
          const proportion = subtotal / orderSubtotal;
          discountAmount = Math.round((settlingOrder.discount * 100) * proportion);
        }
      }
      
      return Math.max(0, subtotal - discountAmount);
    } else if (isSplitByAmount) {
      return parseFloat(splitAmount) * 100 || 0;
    } else if (isSplitBill) {
      return Math.round(settlingOrder.total / numberOfSplits);
    }
    return settlingOrder.total;
  };

  const settleBill = async () => {
    if (!settlingOrder) return;
    setIsSubmitting(true);
    try {
      let amountToPay = settlingOrder.total;
      let itemsToPay = settlingOrder.items;

      if (isSplitByItem) {
        const subtotal = selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const orderSubtotal = settlingOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        let discountAmount = 0;
        
        if (settlingOrder.discount && settlingOrder.discount > 0) {
          if (settlingOrder.discountType === 'percentage') {
            discountAmount = Math.round(subtotal * (settlingOrder.discount / 100));
          } else {
            const proportion = subtotal / orderSubtotal;
            discountAmount = Math.round((settlingOrder.discount * 100) * proportion);
          }
        }
        
        amountToPay = Math.max(0, subtotal - discountAmount);
        
        itemsToPay = selectedSplitItems.map(si => ({
          itemId: si.itemId,
          name: si.name,
          price: si.price,
          quantity: si.quantity
        }));
      } else if (isSplitByAmount) {
        amountToPay = parseFloat(splitAmount) * 100;
        itemsToPay = [];
      } else if (isSplitBill) {
        amountToPay = Math.round(settlingOrder.total / numberOfSplits);
        itemsToPay = [];
      }

      const amount = paymentMethod === 'multi' ? (parseFloat(multiPayment.cash) * 100 || 0) + (parseFloat(multiPayment.card) * 100 || 0) : parseFloat(amountReceived) * 100 || 0;
      let change = 0;
      let cashAmount = 0;
      let cardAmount = 0;

      if (paymentMethod === 'multi') {
        const cashGiven = parseFloat(multiPayment.cash) * 100 || 0;
        cardAmount = parseFloat(multiPayment.card) * 100 || 0;
        change = Math.max(0, (cashGiven + cardAmount) - amountToPay);
        cashAmount = cashGiven - change;
      } else if (paymentMethod === 'cash') {
        change = Math.max(0, amount - amountToPay);
        cashAmount = amountToPay;
      } else if (paymentMethod === 'card') {
        cardAmount = amountToPay;
      }

      const currentPayments = settlingOrder.payments || [];
      const newPayment = {
        method: paymentMethod,
        amount: amountToPay,
        timestamp: new Date().toISOString(),
        cashAmount: cashAmount,
        cardAmount: cardAmount
      };
      const updatedPayments = [...currentPayments, newPayment];

      // Calculate COGS
      let totalCOGS = 0;
      const itemsToProcess = isSplitByItem ? selectedSplitItems : settlingOrder.items;
      const paymentRatio = isSplitByItem ? 1 : (amountToPay / settlingOrder.total);

      for (const item of itemsToProcess) {
        const menuItem = items.find(mi => mi.id === item.itemId);
        if (menuItem?.recipe) {
          for (const ingredient of menuItem.recipe) {
            const invItem = inventory.find(inv => inv.id === ingredient.inventoryItemId);
            if (invItem) {
              const cost = invItem.averageCost || invItem.costPerUnit || 0;
              totalCOGS += cost * (ingredient.quantity || 0) * (item.quantity || 0) * paymentRatio;
            }
          }
        } else {
          const invItem = inventory.find(inv => inv.name === item.name);
          if (invItem) {
            const cost = invItem.averageCost || invItem.costPerUnit || 0;
            totalCOGS += cost * (item.quantity || 0) * paymentRatio;
          }
        }
      }

      const taxAmount = Math.round(amountToPay - (amountToPay / 1.05));
      const netAmount = amountToPay - taxAmount;

      const journalLines = [
        ...(cashAmount > 0 ? [{ accountId: 'cash', accountName: 'Cash', debit: cashAmount, credit: 0 }] : []),
        ...(cardAmount > 0 ? [{ accountId: 'bank', accountName: 'Bank', debit: cardAmount, credit: 0 }] : []),
        { accountId: 'sales', accountName: 'Sales Revenue', debit: 0, credit: netAmount },
        { accountId: 'tax_payable', accountName: 'VAT Payable', debit: 0, credit: taxAmount },
        ...(totalCOGS > 0 ? [
          { accountId: 'cogs', accountName: 'Cost of Goods Sold', debit: Math.round(totalCOGS), credit: 0 },
          { accountId: 'inventory', accountName: 'Inventory Asset', debit: 0, credit: Math.round(totalCOGS) }
        ] : [])
      ];

      if (isSplitByItem) {
        const remainingItems = [...settlingOrder.items];
        selectedSplitItems.forEach(splitItem => {
          const idx = remainingItems.findIndex(i => i.itemId === splitItem.itemId);
          if (idx !== -1) {
            remainingItems[idx].quantity -= splitItem.quantity;
            if (remainingItems[idx].quantity <= 0) {
              remainingItems.splice(idx, 1);
            }
          }
        });

        const newTotal = remainingItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        
        if (remainingItems.length === 0) {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            status: 'finalized',
            paymentMethod,
            payments: updatedPayments,
            amountReceived: amount,
            changeGiven: change,
            completedAt: serverTimestamp()
          });
          if (settlingOrder.tableId) {
            const tableIds = settlingOrder.tableId.split(',');
            for (const tId of tableIds) {
              const trimmedId = tId.trim();
              if (trimmedId) {
                await updateDoc(doc(db, 'tables', trimmedId), { status: 'available' });
              }
            }
          }
        } else {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            items: remainingItems,
            total: newTotal,
            payments: updatedPayments,
            notes: (settlingOrder.notes || '') + `\n[Partial Payment: ${formatCurrency(amountToPay)}]`
          });
        }

        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: amountToPay,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: itemsToPay
        });

        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${settlingOrder.id.slice(-6).toUpperCase()}`,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          lines: journalLines
        });

        await deductInventory({ ...settlingOrder, items: itemsToPay });

        if (remainingItems.length === 0) {
          setIsSettlingBill(false);
          setSettlingOrder(null);
        } else {
          setSettlingOrder({ ...settlingOrder, items: remainingItems, total: newTotal });
          setSelectedSplitItems([]);
        }
      } else if (isSplitByAmount || isSplitBill) {
        const remainingTotal = settlingOrder.total - amountToPay;
        if (remainingTotal <= 0) {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            status: 'finalized',
            paymentMethod,
            payments: updatedPayments,
            amountReceived: amount,
            changeGiven: change,
            total: 0,
            completedAt: serverTimestamp()
          });
          if (settlingOrder.tableId) {
            const tableIds = settlingOrder.tableId.split(',');
            for (const tId of tableIds) {
              await updateDoc(doc(db, 'tables', tId), { status: 'available' });
            }
          }
        } else {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            total: remainingTotal,
            payments: updatedPayments,
            notes: (settlingOrder.notes || '') + `\n[Partial Payment: ${formatCurrency(amountToPay)}]`
          });
        }

        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: amountToPay,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp()
        });

        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${settlingOrder.id.slice(-6).toUpperCase()}`,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          lines: journalLines
        });

        if (remainingTotal <= 0) {
          setIsSettlingBill(false);
          setSettlingOrder(null);
        } else {
          setSettlingOrder({ ...settlingOrder, total: remainingTotal });
        }
      } else {
        await updateDoc(doc(db, 'orders', settlingOrder.id), {
          status: 'finalized',
          paymentMethod,
          payments: updatedPayments,
          amountReceived: amount,
          changeGiven: change,
          completedAt: serverTimestamp()
        });
        if (settlingOrder.tableId) {
          const tableIds = settlingOrder.tableId.split(',');
          for (const tId of tableIds) {
            const trimmedId = tId.trim();
            if (trimmedId) {
              await updateDoc(doc(db, 'tables', trimmedId), { status: 'available' });
            }
          }
        }
        await deductInventory(settlingOrder);

        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: settlingOrder.total,
          description: `Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: settlingOrder.items
        });

        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${settlingOrder.id.slice(-6).toUpperCase()}`,
          description: `Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          lines: journalLines
        });

        setIsSettlingBill(false);
        setSettlingOrder(null);
      }

      printBill({
        ...settlingOrder,
        items: itemsToPay.length > 0 ? itemsToPay : [{ name: 'Partial Payment', quantity: 1, price: amountToPay, itemId: 'partial' }],
        total: amountToPay,
        isPartial: true
      } as any);

      const isFullyPaid = isSplitByItem ? (settlingOrder.items.length === 0) : (settlingOrder.total - amountToPay <= 0);
      
      if (isFullyPaid) {
        setIsSplitBill(false);
        setIsSplitByItem(false);
        setIsSplitByAmount(false);
        setSelectedSplitItems([]);
        setSplitAmount('');
      } else {
        setSelectedSplitItems([]);
        setSplitAmount('');
      }
      
      setAmountReceived('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${settlingOrder?.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const printBill = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-family: monospace;">
        <span>${item.quantity}x ${item.name}</span>
        <span>${formatCurrency(item.price * item.quantity)}</span>
      </div>
    `).join('');

    const subtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const discountAmount = order.discountType === 'percentage' ? (subtotal * ((order.discount || 0) / 100)) : ((order.discount || 0) * 100);
    const taxAmount = (subtotal - discountAmount) * 0.05; // Assuming 5% VAT
    const html = `
      <html>
        <head>
          <title>Bill - #${order.id.slice(-6).toUpperCase()}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .footer { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; text-align: center; font-size: 12px; }
            .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .totals { border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; }
            .info-row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h2 style="margin: 0;">RIVAS RESTAURANT</h2>
            <p style="margin: 5px 0; font-size: 12px;">TRN: 100000000000000</p>
            <p style="margin: 5px 0; font-size: 12px;">Tel: +971 4 123 4567</p>
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
            <div class="info-row"><span>Order:</span><span>#${order.id.slice(-6).toUpperCase()}</span></div>
            <div class="info-row"><span>Type:</span><span>${order.orderType.toUpperCase()}</span></div>
            ${order.tableNumber ? `<div class="info-row"><span>Table:</span><span>${order.tableNumber}</span></div>` : ''}
            ${order.waiter ? `<div class="info-row"><span>Waiter:</span><span>${order.waiter}</span></div>` : ''}
            ${order.occupancy ? `<div class="info-row"><span>Guests:</span><span>${order.occupancy}</span></div>` : ''}
            <div class="info-row"><span>Date:</span><span>${new Date().toLocaleString()}</span></div>
          </div>
          <div class="items">
            ${itemsHtml}
          </div>
          <div class="totals">
            <div class="item-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            ${order.discount ? `<div class="item-row"><span>Discount ${order.discountType === 'percentage' ? `(${order.discount}%)` : ''}:</span><span>-${formatCurrency(discountAmount)}</span></div>` : ''}
            <div class="item-row">
              <span>VAT (5%):</span>
              <span>${formatCurrency(taxAmount)}</span>
            </div>
            <div class="total-row">
              <span>TOTAL:</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
            ${order.paymentMethod ? `
            <div style="border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px;">
              <div class="info-row"><span>Payment Method:</span><span style="text-transform: uppercase;">${order.paymentMethod}</span></div>
              ${order.paymentMethod === 'multi' && order.multiPayment ? `
                <div class="info-row"><span>- Cash:</span><span>${formatCurrency(order.multiPayment.cash)}</span></div>
                <div class="info-row"><span>- Card:</span><span>${formatCurrency(order.multiPayment.card)}</span></div>
              ` : ''}
              ${order.amountReceived ? `<div class="info-row"><span>Amount Received:</span><span>${formatCurrency(order.amountReceived)}</span></div>` : ''}
              ${order.changeGiven ? `<div class="info-row"><span>Change:</span><span>${formatCurrency(order.changeGiven)}</span></div>` : ''}
            </div>` : ''}
          </div>
          <div class="footer">
            <p>Thank you for your visit!</p>
            <p style="font-size: 10px; margin-top: 5px;">Powered by AI Studio</p>
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
        
        // Update table status if it was a dine-in order
        if (order.tableId) {
          const tableIds = order.tableId.split(',');
          for (const tId of tableIds) {
            await updateDoc(doc(db, 'tables', tId), { status: 'available' });
          }
        }
        
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

        // Also create a formal journal entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${order.id.slice(-6).toUpperCase()}`,
          description: `Sale: Order #${order.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          lines: [
            { accountId: order.paymentMethod === 'cash' ? 'cash' : 'bank', accountName: order.paymentMethod === 'cash' ? 'Cash' : 'Bank', debit: order.total, credit: 0 },
            { accountId: 'sales', accountName: 'Sales Revenue', debit: 0, credit: order.total }
          ]
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
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar (Desktop) */}
      <div className={`bg-card border-r border-border flex-col h-screen sticky top-0 hidden md:flex transition-all duration-300 ${isMenuOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-6 border-b border-border flex items-center gap-4 whitespace-nowrap">
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
            { id: 'dashboard', name: 'Dashboard', icon: <LayoutGrid size={18} /> },
            { id: 'orders', name: 'Order Management', icon: <ShoppingBag size={18} /> },
            { id: 'menu', name: 'Menu Items', icon: <LayoutGrid size={18} /> },
            { id: 'recipes', name: 'Recipe Management', icon: <BookOpen size={18} /> },
            { id: 'production', name: 'Production', icon: <ChefHat size={18} /> },
            { id: 'kitchen', name: 'Kitchen (KDS)', icon: <ChefHat size={18} /> },
            { id: 'inventory', name: 'Inventory', icon: <Boxes size={18} /> },
            { id: 'suppliers', name: 'Suppliers', icon: <Truck size={18} /> },
            { id: 'purchases', name: 'Purchases', icon: <Receipt size={18} /> },
            { id: 'delivery', name: 'Delivery', icon: <Truck size={18} /> },
            { id: 'accounting', name: 'Reports', icon: <BarChart3 size={18} /> },
            { id: 'finance', name: 'Accounting', icon: <Wallet size={18} /> },
            { id: 'wastage', name: 'Wastage', icon: <Trash2 size={18} /> },
            { id: 'tables', name: 'Tables', icon: <Move size={18} /> },
            { id: 'crm', name: 'CRM', icon: <Users size={18} /> },
            { id: 'users', name: 'Users', icon: <ShieldCheck size={18} /> },
            { id: 'stores', name: 'Stores', icon: <Building size={18} /> },
            { id: 'warehouses', name: 'Warehouses', icon: <Warehouse size={18} /> },
            { id: 'settings', name: 'Settings', icon: <Settings size={18} /> },
          ].filter(m => canAccess(m.id)).map(module => (
            <div key={module.id}>
              <button
                onClick={() => {
                  if (module.id === 'accounting') {
                    setActiveTab('accounting');
                    setAccountingSubTab('dashboard');
                    setIsReportsDropdownOpen(!isReportsDropdownOpen);
                  } else {
                    setActiveTab(module.id as any);
                  }
                }}
                className={`w-full flex items-center justify-between px-6 py-3 transition-all hover:bg-muted group ${activeTab === module.id ? 'bg-primary/5 border-r-4 border-primary' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className={activeTab === module.id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}>
                    {module.icon}
                  </span>
                  <div className="text-left">
                    <p className={`text-sm font-bold ${activeTab === module.id ? 'text-primary' : 'text-foreground/80'}`}>{module.name}</p>
                  </div>
                </div>
                {module.id === 'accounting' && (
                  <span className="text-muted-foreground">
                    {isReportsDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                )}
              </button>
              {module.id === 'accounting' && isReportsDropdownOpen && (
                <div className="bg-muted/30 py-2">
                  {[
                    { id: 'dashboard', name: 'Dashboard' },
                    { id: 'profit_loss', name: 'Profit & Loss' },
                    { id: 'balance_sheet', name: 'Balance Sheet' },
                    { id: 'cash_flow', name: 'Cash Flow' },
                    { id: 'equity', name: 'Statement of Equity' },
                    { id: 'trial_balance', name: 'Trial Balance' },
                    { id: 'general_ledger', name: 'General Ledger' },
                    { id: 'inventory_report', name: 'Inventory Report' },
                    { id: 'sales_report', name: 'Sales Report' },
                    { id: 'sales_by_category', name: 'Sales by Category' },
                    { id: 'sales_by_item', name: 'Sales by Item' },
                    { id: 'pos_summary', name: 'POS Summary' },
                    { id: 'tax_report', name: 'Tax Report (VAT)' },
                    { id: 'waiter_performance', name: 'Waiter Performance' },
                  ].map(report => (
                    <button
                      key={report.id}
                      onClick={() => {
                        setActiveTab('accounting');
                        setAccountingSubTab(report.id as any);
                      }}
                      className={`w-full text-left pl-14 pr-6 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'accounting' && accountingSubTab === report.id
                          ? 'text-primary bg-primary/5'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      {report.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-8 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 hover:bg-muted rounded-xl transition-all text-foreground"
            >
              <MenuIcon size={24} />
            </button>
            <h1 className="text-xl md:text-2xl font-black text-foreground uppercase tracking-tight">{activeTab.replace('-', ' ')}</h1>
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
          <div className="md:hidden absolute top-[73px] left-0 right-0 bg-card border-b border-border z-50 max-h-[60vh] overflow-y-auto shadow-xl">
            {[
              { id: 'dashboard', name: 'Dashboard', icon: <LayoutGrid size={18} /> },
              { id: 'orders', name: 'Order Management', icon: <ShoppingBag size={18} /> },
              { id: 'menu', name: 'Menu Items', icon: <LayoutGrid size={18} /> },
              { id: 'recipes', name: 'Recipe Management', icon: <BookOpen size={18} /> },
              { id: 'production', name: 'Production', icon: <ChefHat size={18} /> },
              { id: 'kitchen', name: 'Kitchen (KDS)', icon: <ChefHat size={18} /> },
              { id: 'inventory', name: 'Inventory', icon: <Boxes size={18} /> },
              { id: 'suppliers', name: 'Suppliers', icon: <Truck size={18} /> },
              { id: 'purchases', name: 'Purchases', icon: <Receipt size={18} /> },
              { id: 'accounting', name: 'Reports', icon: <BarChart3 size={18} /> },
              { id: 'finance', name: 'Accounting', icon: <Wallet size={18} /> },
              { id: 'wastage', name: 'Wastage', icon: <Trash2 size={18} /> },
              { id: 'tables', name: 'Tables', icon: <Move size={18} /> },
              { id: 'crm', name: 'CRM', icon: <Users size={18} /> },
              { id: 'users', name: 'Users', icon: <ShieldCheck size={18} /> },
              { id: 'stores', name: 'Stores', icon: <Building size={18} /> },
              { id: 'warehouses', name: 'Warehouses', icon: <Warehouse size={18} /> },
              { id: 'settings', name: 'Settings', icon: <Settings size={18} /> },
            ].filter(m => canAccess(m.id)).map(module => (
              <div key={module.id}>
                <button
                  onClick={() => {
                    if (module.id === 'accounting') {
                      setIsReportsDropdownOpen(!isReportsDropdownOpen);
                    } else {
                      setActiveTab(module.id as any);
                      setIsMenuOpen(false);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-6 py-4 border-b border-zinc-50 ${activeTab === module.id ? 'bg-primary/5 text-primary' : 'text-zinc-600'}`}
                >
                  <div className="flex items-center gap-3">
                    {module.icon}
                    <span className="font-bold text-sm">{module.name}</span>
                  </div>
                  {module.id === 'accounting' && (
                    <span className="text-zinc-400">
                      {isReportsDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  )}
                </button>
                {module.id === 'accounting' && isReportsDropdownOpen && (
                  <div className="bg-zinc-50 py-2 border-b border-zinc-100">
                    {[
                      { id: 'dashboard', name: 'Dashboard' },
                      { id: 'profit_loss', name: 'Profit & Loss' },
                      { id: 'balance_sheet', name: 'Balance Sheet' },
                      { id: 'cash_flow', name: 'Cash Flow' },
                      { id: 'equity', name: 'Statement of Equity' },
                      { id: 'trial_balance', name: 'Trial Balance' },
                      { id: 'general_ledger', name: 'General Ledger' },
                      { id: 'inventory_report', name: 'Inventory Report' },
                      { id: 'sales_report', name: 'Sales Report' },
                      { id: 'sales_by_category', name: 'Sales by Category' },
                      { id: 'sales_by_item', name: 'Sales by Item' },
                      { id: 'pos_summary', name: 'POS Summary' },
                      { id: 'tax_report', name: 'Tax Report (VAT)' },
                      { id: 'waiter_performance', name: 'Waiter Performance' },
                    ].map(report => (
                      <button
                        key={report.id}
                        onClick={() => {
                          setActiveTab('accounting');
                          setAccountingSubTab(report.id as any);
                          setIsMenuOpen(false);
                        }}
                        className={`w-full text-left pl-14 pr-6 py-3 text-sm font-medium transition-colors ${
                          activeTab === 'accounting' && accountingSubTab === report.id
                            ? 'text-primary bg-primary/5'
                            : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                        }`}
                      >
                        {report.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-muted/30">
          {activeTab === 'dashboard' ? (
            <Dashboard />
          ) : activeTab === 'crm' ? (
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
                    onClick={() => exportToExcel(items.map(i => ({ name: i.name, category: i.category, price: i.price / 100, recipe: JSON.stringify(i.recipe || []) })), 'Recipes')}
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
                  <div key={item.id} className="p-6 bg-card border border-border rounded-[2.5rem] hover:shadow-xl hover:shadow-primary/5 transition-all group">
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
            <SuppliersSection suppliers={vendors} />
          ) : activeTab === 'purchases' ? (
            <PurchasesSection suppliers={vendors} inventory={inventory} bills={bills} ledgerGroups={ledgerGroups} />
          ) : activeTab === 'delivery' ? (
            <DeliverySection drivers={drivers} />
          ) : activeTab === 'settings' ? (
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                  <Settings size={24} />
                </div>
                <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">System Settings</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm">
                  <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
                    <Building size={18} className="text-muted-foreground" />
                    Company Information
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Company Name</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.companyName || ''} 
                        onChange={e => setSystemSettings({...systemSettings, companyName: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Logo URL</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.logo || ''} 
                        onChange={e => setSystemSettings({...systemSettings, logo: e.target.value})}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Tax ID</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.taxId || ''} 
                        onChange={e => setSystemSettings({...systemSettings, taxId: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Print Server URLs (Comma Separated)</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                        value={systemSettings?.printServerUrls || ''} 
                        onChange={e => setSystemSettings({...systemSettings, printServerUrls: e.target.value})}
                        placeholder="http://192.168.1.100:5000, http://192.168.1.101:5000"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1 italic">Used for KOT and multi-printer support. Separate multiple URLs with commas.</p>
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm">
                  <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
                    <Monitor size={18} className="text-muted-foreground" />
                    POS Configuration
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-foreground">Sold by Piece</p>
                        <p className="text-xs text-muted-foreground">Automatically deduct ingredients on each sale</p>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 accent-primary" 
                        checked={systemSettings?.soldByPiece !== false} 
                        onChange={e => setSystemSettings({...systemSettings, soldByPiece: e.target.checked})}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-foreground">Auto-Finalize Orders</p>
                        <p className="text-xs text-muted-foreground">Automatically finalize orders after payment</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 accent-primary" defaultChecked={false} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-foreground">Print Receipt Automatically</p>
                        <p className="text-xs text-muted-foreground">Print receipt when order is finalized</p>
                      </div>
                      <input type="checkbox" className="w-5 h-5 accent-primary" defaultChecked={true} />
                    </div>
                  </div>
                </div>
                <div className="p-8 bg-white border border-zinc-100 rounded-[2.5rem] shadow-sm md:col-span-2">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <Settings size={18} className="text-zinc-400" />
                    Frontend Theme Configuration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Primary Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-12 h-12 p-1 border border-zinc-200 rounded-xl cursor-pointer" 
                          value={systemSettings?.theme?.primaryColor || '#8B1E3F'} 
                          onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, primaryColor: e.target.value}})}
                        />
                        <input 
                          type="text" 
                          className="flex-1 p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                          value={systemSettings?.theme?.primaryColor || '#8B1E3F'} 
                          onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, primaryColor: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Secondary Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-12 h-12 p-1 border border-zinc-200 rounded-xl cursor-pointer" 
                          value={systemSettings?.theme?.secondaryColor || '#64748b'} 
                          onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, secondaryColor: e.target.value}})}
                        />
                        <input 
                          type="text" 
                          className="flex-1 p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                          value={systemSettings?.theme?.secondaryColor || '#64748b'} 
                          onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, secondaryColor: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Accent Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-12 h-12 p-1 border border-zinc-200 rounded-xl cursor-pointer" 
                          value={systemSettings?.theme?.accentColor || '#76B947'} 
                          onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, accentColor: e.target.value}})}
                        />
                        <input 
                          type="text" 
                          className="flex-1 p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                          value={systemSettings?.theme?.accentColor || '#76B947'} 
                          onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, accentColor: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="md:col-span-3 flex items-center justify-between p-4 bg-zinc-50 rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">Frontend Dark Mode</p>
                        <p className="text-xs text-zinc-500">Enable dark mode for the frontend</p>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 accent-primary" 
                        checked={systemSettings?.theme?.darkMode || false} 
                        onChange={e => setSystemSettings({...systemSettings, theme: {...systemSettings?.theme, darkMode: e.target.checked}})}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-white border border-zinc-100 rounded-[2.5rem] shadow-sm md:col-span-2">
                  <h3 className="font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <Settings size={18} className="text-zinc-400" />
                    Backend Theme Configuration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Primary Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-12 h-12 p-1 border border-zinc-200 rounded-xl cursor-pointer" 
                          value={systemSettings?.backEndTheme?.primaryColor || '#8B1E3F'} 
                          onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, primaryColor: e.target.value}})}
                        />
                        <input 
                          type="text" 
                          className="flex-1 p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                          value={systemSettings?.backEndTheme?.primaryColor || '#8B1E3F'} 
                          onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, primaryColor: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Secondary Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-12 h-12 p-1 border border-zinc-200 rounded-xl cursor-pointer" 
                          value={systemSettings?.backEndTheme?.secondaryColor || '#64748b'} 
                          onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, secondaryColor: e.target.value}})}
                        />
                        <input 
                          type="text" 
                          className="flex-1 p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                          value={systemSettings?.backEndTheme?.secondaryColor || '#64748b'} 
                          onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, secondaryColor: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Accent Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-12 h-12 p-1 border border-zinc-200 rounded-xl cursor-pointer" 
                          value={systemSettings?.backEndTheme?.accentColor || '#76B947'} 
                          onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, accentColor: e.target.value}})}
                        />
                        <input 
                          type="text" 
                          className="flex-1 p-3 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                          value={systemSettings?.backEndTheme?.accentColor || '#76B947'} 
                          onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, accentColor: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="md:col-span-3 flex items-center justify-between p-4 bg-zinc-50 rounded-2xl">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">Backend Dark Mode</p>
                        <p className="text-xs text-zinc-500">Enable dark mode for the backend</p>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 accent-primary" 
                        checked={systemSettings?.backEndTheme?.darkMode || false} 
                        onChange={e => setSystemSettings({...systemSettings, backEndTheme: {...systemSettings?.backEndTheme, darkMode: e.target.checked}})}
                      />
                    </div>
                  </div>
                </div>

                {/* System Reset Section */}
                <div className="p-8 bg-white border border-red-100 rounded-[2.5rem] shadow-sm md:col-span-2">
                  <h3 className="font-bold text-red-600 mb-6 flex items-center gap-2">
                    <RotateCcw size={18} />
                    System Reset & Data Maintenance
                  </h3>
                  <div className="space-y-4">
                    <p className="text-sm text-zinc-500 max-w-2xl">
                      Use this tool to clear all transaction history and reset the system to a fresh state. 
                      This will delete all <strong>Orders, Journal Entries, Purchases, and Wastage records</strong>. 
                      It will also reset all <strong>Inventory Stock and Average Costs</strong> to zero.
                    </p>
                    
                    {resetSuccess && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-600 animate-in fade-in slide-in-from-top-2">
                        <CheckCircle2 size={20} />
                        <p className="font-bold">System reset successfully! All data has been cleared.</p>
                      </div>
                    )}

                    {isResetConfirmOpen ? (
                      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl space-y-4 animate-in fade-in zoom-in-95">
                        <div className="flex items-center gap-3 text-red-600">
                          <Trash2 size={20} />
                          <p className="font-black uppercase tracking-tight">Confirm System Wipe</p>
                        </div>
                        <p className="text-sm text-red-700 font-medium">
                          Are you absolutely sure? This action will permanently delete all transaction history. This cannot be undone.
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={handleSystemReset}
                            disabled={isResetting}
                            className="px-6 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-50"
                          >
                            {isResetting ? 'Wiping Data...' : 'Yes, Wipe Everything'}
                          </button>
                          <button
                            onClick={() => setIsResetConfirmOpen(false)}
                            disabled={isResetting}
                            className="px-6 py-2 bg-card text-muted-foreground border border-border rounded-xl text-sm font-bold hover:bg-muted transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 flex flex-col sm:flex-row gap-4">
                        <button
                          onClick={() => setIsResetConfirmOpen(true)}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all border border-red-200"
                        >
                          <Trash2 size={18} />
                          Wipe All Transaction Data
                        </button>
                        
                        <button
                          onClick={async () => {
                            // Simple inventory reset without full system wipe
                            if (isResetting) return;
                            setIsResetting(true);
                            try {
                              const inventorySnapshot = await getDocs(collection(db, 'inventory'));
                              const inventoryUpdates = inventorySnapshot.docs.map(d => 
                                updateDoc(doc(db, 'inventory', d.id), {
                                  stock: 0,
                                  costPerUnit: 0,
                                  lastUpdated: serverTimestamp()
                                })
                              );
                              await Promise.all(inventoryUpdates);
                              setResetSuccess(true);
                              setTimeout(() => setResetSuccess(false), 5000);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.UPDATE, 'inventory-reset');
                            } finally {
                              setIsResetting(false);
                            }
                          }}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-50 text-zinc-600 rounded-xl text-sm font-bold hover:bg-zinc-100 transition-all border border-zinc-200"
                        >
                          <RotateCcw size={18} />
                          Reset Inventory Only
                        </button>
                      </div>
                    )}
                    
                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">
                      Warning: This action is permanent and cannot be reversed.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end items-center gap-4">
                {saveSuccess && <span className="text-emerald-600 font-bold animate-in fade-in">Settings saved successfully!</span>}
                <button 
                  onClick={async () => {
                    if (!systemSettings) return;
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
          ) : activeTab === 'production' ? (
            <ProductionSection inventory={inventory} items={items} />
          ) : activeTab === 'orders' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Bar */}
              <div className="p-6 bg-muted/50 border-b border-border flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground">Order Filters</h3>
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
                      className="flex items-center gap-2 bg-muted text-muted-foreground px-6 py-2 rounded-xl text-xs font-bold hover:bg-muted/80 transition-all"
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
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/30">
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-20">
                    <ShoppingBag size={48} className="text-zinc-200 mx-auto mb-4" />
                    <p className="text-zinc-400 font-bold uppercase text-xs tracking-widest">No matching orders found</p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-all">
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

                          {/* Amount & Actions */}
                          <div className="lg:col-span-2 p-6 bg-muted/30 flex flex-col justify-between gap-4">
                            <div className="space-y-2">
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Payment Method</p>
                                <p className="text-xs font-black text-foreground uppercase">{order.paymentMethod || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Amount</p>
                                <p className="text-sm font-black text-foreground">{formatCurrency(order.total)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Amount Paid</p>
                                <div className="space-y-1">
                                  {order.payments && order.payments.length > 0 ? (
                                    order.payments.map((p: any, pIdx: number) => (
                                      <div key={pIdx} className="flex justify-between items-center bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase">{p.method}</span>
                                        <span className="text-xs font-black text-emerald-600">{formatCurrency(p.amount)}</span>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm font-black text-emerald-600">{formatCurrency(order.status === 'finalized' ? order.total : 0)}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <button 
                                onClick={() => printBill(order)}
                                className="w-full flex items-center justify-center gap-2 bg-foreground text-background px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                              >
                                <Printer size={14} /> Print Bill
                              </button>
                              
                              <button 
                                onClick={() => printKOT(order, true)}
                                className="w-full flex items-center justify-center gap-2 bg-muted text-muted-foreground px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-muted/80 transition-all"
                              >
                                <ChefHat size={14} /> Reprint KOT
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
                                  onClick={() => {
                                    setSettlingOrder(order);
                                    setIsSettlingBill(true);
                                    setPaymentMethod('cash');
                                    setAmountReceived(order.total);
                                  }}
                                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                                >
                                  <CreditCard size={14} /> Settle Bill
                                </button>
                              )}
                              {order.status !== 'finalized' && order.status !== 'cancelled' && (
                                <button 
                                  onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                  className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive border border-destructive/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-destructive/20 transition-all"
                                >
                                  <Ban size={14} /> Cancel
                                </button>
                              )}
                            </div>
                          </div>
                      </div>
                      
                      {/* Expanded Details */}
                      {expandedOrderId === order.id && (
                        <div className="p-6 bg-muted/30 border-t border-border space-y-8">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2">
                              <h4 className="font-bold text-foreground mb-4">Order Items</h4>
                              <div className="space-y-3">
                                {order.items.map((item, idx) => (
                                  <div key={idx} className="flex items-start justify-between bg-card p-4 rounded-xl border border-border">
                                    <div className="flex items-start gap-3">
                                      <span className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center font-black text-sm text-foreground">{item.quantity}</span>
                                      <div>
                                        <span className="font-bold text-foreground block">{item.name}</span>
                                        {item.notes && <span className="text-xs text-muted-foreground mt-1 block">Note: {item.notes}</span>}
                                      </div>
                                    </div>
                                    <span className="font-bold text-foreground">{formatCurrency(item.price * item.quantity)}</span>
                                  </div>
                                ))}
                              </div>
                              {order.notes && (
                                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                  <p className="text-xs font-bold text-amber-600 uppercase mb-1">Order Notes</p>
                                  <p className="text-sm text-foreground">{order.notes}</p>
                                </div>
                              )}
                            </div>
                            
                            <div className="space-y-6">
                              <div>
                                <h4 className="font-bold text-foreground mb-4">Customer Details</h4>
                                <div className="bg-card p-4 rounded-xl border border-border space-y-3">
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Name</p>
                                    <p className="text-sm font-medium text-foreground">{order.customerName || 'Guest'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Phone</p>
                                    <p className="text-sm font-medium text-foreground">{order.customerPhone || order.address?.phone || 'N/A'}</p>
                                  </div>
                                  {order.address && (
                                    <div>
                                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Delivery Address</p>
                                      <p className="text-sm font-medium text-foreground">
                                        {order.address.apartment && `${order.address.apartment}, `}
                                        {order.address.building && `${order.address.building}, `}
                                        {order.address.street}, {order.address.city}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div>
                                <h4 className="font-bold text-foreground mb-4">Payment Details</h4>
                                <div className="bg-card p-4 rounded-xl border border-border space-y-3">
                                  {(() => {
                                    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                                    const discountAmount = order.discountType === 'percentage' 
                                      ? (subtotal * ((order.discount || 0) / 100)) 
                                      : ((order.discount || 0) * 100);
                                    return (
                                      <>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-muted-foreground">Subtotal</span>
                                          <span className="text-sm font-medium text-foreground">{formatCurrency(subtotal)}</span>
                                        </div>
                                        {order.discount && order.discount > 0 && (
                                          <div className="flex justify-between text-emerald-600">
                                            <span className="text-sm">Discount {order.discountType === 'percentage' ? `(${order.discount}%)` : ''}</span>
                                            <span className="text-sm font-medium">-{formatCurrency(discountAmount)}</span>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                  <div className="flex justify-between border-t border-border pt-3">
                                    <span className="text-sm font-bold text-foreground">Total</span>
                                    <span className="text-sm font-black text-foreground">{formatCurrency(order.total)}</span>
                                  </div>
                                  {order.amountReceived && (
                                    <>
                                      <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Amount Received</span>
                                        <span className="text-sm font-medium text-foreground">{formatCurrency(order.amountReceived)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm text-muted-foreground">Change Given</span>
                                        <span className="text-sm font-medium text-foreground">{formatCurrency(order.changeGiven || 0)}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Accounting & Stock Flow (Expanded Section) */}
                          <div className="p-6 bg-card border border-border rounded-[2rem] space-y-6">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                                <BarChart3 size={14} className="text-primary" />
                                Accounting & Stock Flow
                              </h4>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              {/* Journal Entries */}
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Journal Entries</p>
                                
                                <div className="bg-background rounded-2xl border border-border overflow-hidden">
                                  {journalEntries.filter(j => j.reference === `ORD-${order.id.slice(-6).toUpperCase()}`).length > 0 || journal.filter(j => j.orderId === order.id).length > 0 ? (
                                    <>
                                      {journalEntries.filter(j => j.reference === `ORD-${order.id.slice(-6).toUpperCase()}`).map((entry, idx) => (
                                        <div key={`je-${idx}`} className="border-b border-border last:border-0">
                                          <button 
                                            onClick={() => setExpandedJournalEntryId(expandedJournalEntryId === entry.id ? null : entry.id)}
                                            className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                                          >
                                            <p className="text-xs font-bold text-foreground">{entry.description}</p>
                                            <div className="flex items-center gap-2">
                                              <p className="text-[10px] text-muted-foreground">{entry.date}</p>
                                              <span className="text-muted-foreground text-[10px]">{expandedJournalEntryId === entry.id ? '▼' : '▶'}</span>
                                            </div>
                                          </button>
                                          
                                          {expandedJournalEntryId === entry.id && (
                                            <div className="p-3 bg-muted/20 space-y-1 border-t border-border">
                                              {entry.lines.map((line: any, lIdx: number) => (
                                                <div key={lIdx} className="flex items-center justify-between text-[10px]">
                                                  <span className="text-muted-foreground">{line.accountName}</span>
                                                  <div className="flex gap-4">
                                                    <span className={line.debit > 0 ? 'text-emerald-500 font-bold' : 'text-muted-foreground'}>{formatCurrency(line.debit)}</span>
                                                    <span className={line.credit > 0 ? 'text-blue-500 font-bold' : 'text-muted-foreground'}>{formatCurrency(line.credit)}</span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      {journal.filter(j => j.orderId === order.id).map((entry, idx) => (
                                        <div key={`j-${idx}`} className="border-b border-border last:border-0 p-3 flex items-center justify-between">
                                          <p className="text-xs font-bold text-foreground">{entry.description}</p>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-emerald-500">+{formatCurrency(entry.amount)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </>
                                  ) : (
                                    <div className="p-4 text-center">
                                      <p className="text-[10px] text-muted-foreground italic">No journal entries found for this order.</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Stock Flow */}
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Associated Stock Flow</p>
                                
                                <div className="bg-background rounded-2xl border border-border overflow-hidden">
                                  {order.items.map((orderItem, idx) => {
                                    const menuItem = items.find(i => i.id === orderItem.itemId);
                                    const recipe = menuItem?.recipe || [];
                                    const itemKey = `${order.id}-${idx}`;
                                    
                                    return (
                                      <div key={idx} className="border-b border-border last:border-0">
                                        <button 
                                          onClick={() => setExpandedStockItemId(expandedStockItemId === itemKey ? null : itemKey)}
                                          className="w-full p-3 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
                                        >
                                          <p className="text-xs font-black text-foreground">{orderItem.name} <span className="text-muted-foreground font-bold ml-1">x{orderItem.quantity}</span></p>
                                          <span className="text-muted-foreground text-[10px]">{expandedStockItemId === itemKey ? '▼' : '▶'}</span>
                                        </button>
                                        
                                        {expandedStockItemId === itemKey && (
                                          <div className="p-3 bg-muted/20 space-y-2 border-t border-border">
                                            {recipe.length > 0 ? (
                                              recipe.map((ing, iIdx) => {
                                                const invItem = inventory.find(inv => inv.id === ing.inventoryItemId);
                                                return (
                                                  <div key={iIdx} className="flex justify-between items-center">
                                                    <p className="text-[10px] font-bold text-muted-foreground">{invItem?.name || 'Unknown Ingredient'}</p>
                                                    <p className="text-[10px] font-black text-destructive">-{ (ing.quantity * orderItem.quantity).toFixed(2) } {invItem?.unit}</p>
                                                  </div>
                                                );
                                              })
                                            ) : (
                                              <div className="flex justify-between items-center">
                                                <p className="text-[10px] font-bold text-muted-foreground italic">No recipe defined</p>
                                                <p className="text-[10px] font-black text-destructive">-{orderItem.quantity} pcs</p>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
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
                        onClick={() => printKOT(order, true)}
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
                      step="0.01"
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
                            costPerUnit: Math.round((inventoryForm.costPerUnit || 0) * 100), // Convert to cents
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
                            <div className="mt-4 p-3 bg-white rounded-xl border border-zinc-200 flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-zinc-600">
                                  {adjustingStock.type === 'add' ? 'Add Qty' : 'Remove Qty'}:
                                </span>
                                <input
                                  type="number"
                                  className="w-20 p-1.5 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-primary outline-none"
                                  value={adjustingStock.amount || ''}
                                  onChange={e => setAdjustingStock({ ...adjustingStock, amount: Number(e.target.value) })}
                                  autoFocus
                                />
                              </div>
                              
                              {adjustingStock.type === 'add' && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-zinc-600">Unit Price:</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-20 p-1.5 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-primary outline-none"
                                      placeholder="Price"
                                      value={adjustingStock.price || ''}
                                      onChange={e => setAdjustingStock({ ...adjustingStock, price: Number(e.target.value) })}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-zinc-600">Supplier:</span>
                                    <select
                                      className="flex-1 p-1.5 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-primary outline-none"
                                      value={adjustingStock.supplierId || ''}
                                      onChange={e => setAdjustingStock({ ...adjustingStock, supplierId: e.target.value })}
                                    >
                                      <option value="">Select Supplier...</option>
                                      {vendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  disabled={adjustingStock.type === 'add' && !adjustingStock.supplierId}
                                  onClick={async () => {
                                    if (!adjustingStock.amount || isNaN(adjustingStock.amount)) return;
                                    if (adjustingStock.type === 'add' && !adjustingStock.supplierId) return;
                                    try {
                                      const currentStock = item.stock || 0;
                                      const currentCost = item.costPerUnit || 0; // Already in cents
                                      const newAmount = adjustingStock.amount;
                                      const purchasePrice = Math.round((adjustingStock.price || 0) * 100); // Convert to cents

                                      let newStock = currentStock;
                                      let newAverageCost = currentCost;

                                      if (adjustingStock.type === 'add') {
                                        newStock = currentStock + newAmount;
                                        // Average Costing Formula: (Old Total Value + New Purchase Value) / (Old Total Quantity + New Purchase Quantity)
                                        if (newStock > 0) {
                                          newAverageCost = Math.round(((currentStock * currentCost) + (newAmount * purchasePrice)) / newStock);
                                        } else {
                                          newAverageCost = purchasePrice;
                                        }
                                        
                                        // Record purchase expense in journal
                                        if (purchasePrice > 0) {
                                          const supplier = vendors.find(v => v.id === adjustingStock.supplierId);
                                          await addDoc(collection(db, 'journal'), {
                                            type: 'expense',
                                            amount: newAmount * purchasePrice, // Now in cents
                                            description: `Inventory Purchase: ${item.name} (${newAmount} ${item.unit} @ ${formatCurrency(purchasePrice)})${supplier ? ` from ${supplier.name}` : ''}`,
                                            timestamp: serverTimestamp(),
                                            vendorId: adjustingStock.supplierId
                                          });
                                          
                                          // Also create a formal journal entry
                                          await addDoc(collection(db, 'journal_entries'), {
                                            date: new Date().toISOString().split('T')[0],
                                            reference: `INV-ADD-${item.name.substring(0, 3).toUpperCase()}`,
                                            description: `Inventory Purchase: ${item.name}${supplier ? ` from ${supplier.name}` : ''}`,
                                            timestamp: serverTimestamp(),
                                            lines: [
                                              { accountId: '1105', accountName: 'Inventory', debit: newAmount * purchasePrice, credit: 0 },
                                              { accountId: '1101', accountName: 'Cash on Hand', debit: 0, credit: newAmount * purchasePrice }
                                            ]
                                          });
                                        }
                                      } else {
                                        newStock = Math.max(0, currentStock - newAmount);
                                        // Cost per unit remains the same for removals (consumption)
                                      }
                                      
                                      await updateDoc(doc(db, 'inventory', item.id), {
                                        stock: newStock,
                                        costPerUnit: newAverageCost,
                                        lastUpdated: serverTimestamp()
                                      });
                                      setAdjustingStock(null);
                                    } catch (err) {
                                      handleFirestoreError(err, OperationType.UPDATE, `inventory/${item.id}`);
                                    }
                                  }}
                                  className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
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
                  <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Reports & Analytics</h2>
                  <p className="text-sm text-zinc-500 font-medium">View financial reports, cash flow, and POS summaries</p>
                </div>
              </div>

              {accountingSubTab === 'dashboard' ? (
                <div className="space-y-6">
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
                    {formatCurrency(totalRevenue)}
                  </h3>
                </div>
                <div className="p-8 bg-blue-50 rounded-[2.5rem] border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Total Orders</p>
                  <h3 className="text-4xl font-black text-blue-900">
                    {totalOrdersCount}
                  </h3>
                </div>
                <div className="p-8 bg-orange-50 rounded-[2.5rem] border border-orange-100">
                  <p className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-2">Total Expenses</p>
                  <h3 className="text-4xl font-black text-orange-900">
                    {formatCurrency(totalExpenses)}
                  </h3>
                </div>
              </div>

              <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden mb-8">
                <div className="p-6 border-b bg-zinc-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <BookOpen size={18} className="text-zinc-400" />
                    Chart of Accounts
                  </h3>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={initializeDefaultCOA}
                      className="text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                    >
                      <Plus size={14} />
                      Sync Default COA
                    </button>
                    <button 
                      onClick={() => setIsManageTreeOpen(true)}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Manage Accounts
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  {renderTree()}
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
                <div className="p-6 border-b bg-zinc-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <History size={18} className="text-zinc-400" />
                    Transaction Journal
                  </h3>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input 
                        type="text" 
                        placeholder="Search journal..."
                        className="pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-xs focus:ring-2 focus:ring-primary outline-none w-48"
                        value={accountingSearch}
                        onChange={e => setAccountingSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="date" 
                        className="p-2 bg-white border border-zinc-200 rounded-xl text-[10px] font-bold outline-none"
                        value={accountingDateRange.start}
                        onChange={e => setAccountingDateRange({...accountingDateRange, start: e.target.value})}
                      />
                      <span className="text-zinc-400">-</span>
                      <input 
                        type="date" 
                        className="p-2 bg-white border border-zinc-200 rounded-xl text-[10px] font-bold outline-none"
                        value={accountingDateRange.end}
                        onChange={e => setAccountingDateRange({...accountingDateRange, end: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Description</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4 text-right">Amount</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredJournalEntries.map(entry => (
                        <React.Fragment key={entry.id}>
                          <tr className="hover:bg-zinc-50/50 transition-all group">
                            <td className="px-6 py-4 text-sm text-zinc-500">
                              {entry.date}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                              <div className="flex flex-col">
                                <span>{entry.description}</span>
                                <span className="text-[10px] text-zinc-400 font-medium">Ref: {entry.reference}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                                entry.lines.some((l: any) => l.credit > 0 && (l.accountName.toLowerCase().includes('sales') || l.accountName.toLowerCase().includes('revenue'))) 
                                  ? 'bg-emerald-100 text-emerald-700' 
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {entry.lines.some((l: any) => l.credit > 0 && (l.accountName.toLowerCase().includes('sales') || l.accountName.toLowerCase().includes('revenue'))) ? 'Income' : 'Expense'}
                              </span>
                            </td>
                            <td className={`px-6 py-4 text-sm font-black text-right ${
                              entry.lines.some((l: any) => l.credit > 0 && (l.accountName.toLowerCase().includes('sales') || l.accountName.toLowerCase().includes('revenue'))) ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(Math.max(
                                entry.lines.reduce((sum: number, l: any) => sum + l.debit, 0),
                                entry.lines.reduce((sum: number, l: any) => sum + l.credit, 0)
                              ))}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setExpandedJournalId(expandedJournalId === entry.id ? null : entry.id)}
                                className="p-2 hover:bg-zinc-100 rounded-lg transition-colors text-zinc-400 hover:text-primary"
                              >
                                {expandedJournalId === entry.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            </td>
                          </tr>
                          {expandedJournalId === entry.id && (
                            <tr className="bg-zinc-50/50">
                              <td colSpan={5} className="px-12 py-6">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Transaction Details</h4>
                                    <span className="text-[10px] font-bold text-zinc-400">ID: {entry.id}</span>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                                    <div>
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Method</p>
                                      <p className="text-sm font-bold text-zinc-900">{entry.paymentMethod || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Reference</p>
                                      <p className="text-sm font-bold text-zinc-900">{entry.reference || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Account</p>
                                      <p className="text-sm font-bold text-zinc-900">{entry.accountId || 'N/A'}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Recorded By</p>
                                      <p className="text-sm font-bold text-zinc-900">{entry.recordedBy || 'System'}</p>
                                    </div>
                                  </div>
                                  {entry.lines && (
                                    <div className="mt-4 border-t border-zinc-200 pt-4">
                                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">Ledger Impact</p>
                                      <div className="space-y-1">
                                        {entry.lines.map((line: any, idx: number) => (
                                          <div key={idx} className="flex justify-between text-xs font-medium py-1">
                                            <span className="text-zinc-600">{line.accountName}</span>
                                            <div className="flex gap-8">
                                              <span className="w-24 text-right text-emerald-600">{line.debit > 0 ? formatCurrency(line.debit) : '-'}</span>
                                              <span className="w-24 text-right text-red-600">{line.credit > 0 ? formatCurrency(line.credit) : '-'}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <AccountingReportsIFRS 
              reportType={accountingSubTab as any}
              journalEntries={journalEntries}
              journal={journal}
              orders={orders}
              inventory={inventory}
              items={items}
              categories={categories}
              ledgerGroups={ledgerGroups}
              formatCurrency={formatCurrency}
              exportToExcel={exportToExcel}
            />
          )}
        </div>
      ) : activeTab === 'finance' ? (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Finance & Accounting</h2>
              <p className="text-sm text-zinc-500 font-medium">Manage your journal entries, vouchers, bills, and taxes</p>
            </div>
            <div className="flex items-center gap-2 bg-zinc-100 p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar">
              {(['journal', 'vouchers', 'bills', 'banking', 'taxes'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFinanceSubTab(tab)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    financeSubTab === tab 
                      ? 'bg-white text-primary shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {financeSubTab === 'journal' ? (
            <div className="space-y-6">
              {isAddingJournalEntry && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl p-8 animate-in zoom-in-95 overflow-y-auto max-h-[90vh]">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">New Journal Entry</h3>
                      <button onClick={() => setIsAddingJournalEntry(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
                        <X size={20} />
                      </button>
                    </div>
                    {journalError && (
                      <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold flex items-center gap-2">
                        <Ban size={16} />
                        {journalError}
                      </div>
                    )}
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Date</label>
                          <input 
                            type="date" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={journalEntryForm.date}
                            onChange={e => setJournalEntryForm({...journalEntryForm, date: e.target.value})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Reference</label>
                          <input 
                            type="text" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={journalEntryForm.reference}
                            onChange={e => setJournalEntryForm({...journalEntryForm, reference: e.target.value})}
                            placeholder="e.g. JV-001"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Description</label>
                          <input 
                            type="text" 
                            className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={journalEntryForm.description}
                            onChange={e => setJournalEntryForm({...journalEntryForm, description: e.target.value})}
                            placeholder="Entry description..."
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Entry Lines</h4>
                          <button 
                            onClick={() => setJournalEntryForm({
                              ...journalEntryForm,
                              lines: [...journalEntryForm.lines, { accountId: '', accountName: '', debit: 0, credit: 0 }]
                            })}
                            className="text-xs font-bold text-primary hover:underline"
                          >
                            + Add Line
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-4 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                            <div className="col-span-6">Account</div>
                            <div className="col-span-2 text-right">Debit</div>
                            <div className="col-span-2 text-right">Credit</div>
                            <div className="col-span-2"></div>
                          </div>
                          {journalEntryForm.lines.map((line, index) => (
                            <div key={index} className="grid grid-cols-12 gap-4 items-center">
                              <div className="col-span-6">
                                <select 
                                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                                  value={line.accountId}
                                  onChange={e => {
                                    const account = [...ledgerGroups, { id: 'cash', name: 'Cash' }, { id: 'bank', name: 'Bank' }].find(a => a.id === e.target.value);
                                    const newLines = [...journalEntryForm.lines];
                                    newLines[index] = { ...line, accountId: e.target.value, accountName: account?.name || '' };
                                    setJournalEntryForm({ ...journalEntryForm, lines: newLines });
                                  }}
                                >
                                  <option value="">Select Account</option>
                                  <optgroup label="System Accounts">
                                    <option value="cash">Cash</option>
                                    <option value="bank">Bank</option>
                                    <option value="sales">Sales Revenue</option>
                                    <option value="inventory">Inventory Asset</option>
                                    <option value="wastage">Wastage Expense</option>
                                  </optgroup>
                                  <optgroup label="Ledger Groups">
                                    {ledgerGroups.map(lg => (
                                      <option key={lg.id} value={lg.id}>{lg.name}</option>
                                    ))}
                                  </optgroup>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <input 
                                  type="number" 
                                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm font-bold text-right focus:ring-2 focus:ring-primary outline-none"
                                  value={line.debit}
                                  onChange={e => {
                                    const newLines = [...journalEntryForm.lines];
                                    newLines[index] = { ...line, debit: parseFloat(e.target.value) || 0, credit: 0 };
                                    setJournalEntryForm({ ...journalEntryForm, lines: newLines });
                                  }}
                                />
                              </div>
                              <div className="col-span-2">
                                <input 
                                  type="number" 
                                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-sm font-bold text-right focus:ring-2 focus:ring-primary outline-none"
                                  value={line.credit}
                                  onChange={e => {
                                    const newLines = [...journalEntryForm.lines];
                                    newLines[index] = { ...line, credit: parseFloat(e.target.value) || 0, debit: 0 };
                                    setJournalEntryForm({ ...journalEntryForm, lines: newLines });
                                  }}
                                />
                              </div>
                              <div className="col-span-2 flex justify-end">
                                <button 
                                  onClick={() => {
                                    const newLines = journalEntryForm.lines.filter((_, i) => i !== index);
                                    setJournalEntryForm({ ...journalEntryForm, lines: newLines });
                                  }}
                                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-12 gap-4 px-4 pt-4 border-t border-zinc-100">
                          <div className="col-span-6 text-sm font-bold text-zinc-900">Total</div>
                          <div className="col-span-2 text-right text-sm font-black text-zinc-900">
                            {formatCurrency(journalEntryForm.lines.reduce((sum, line) => sum + line.debit, 0))}
                          </div>
                          <div className="col-span-2 text-right text-sm font-black text-zinc-900">
                            {formatCurrency(journalEntryForm.lines.reduce((sum, line) => sum + line.credit, 0))}
                          </div>
                          <div className="col-span-2"></div>
                        </div>
                      </div>

                      <button 
                        onClick={handleAddJournalEntry}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                      >
                        Post Journal Entry
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900">Journal Entries</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => exportToExcel(journalEntries, 'Journal_Entries')}
                    className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all"
                  >
                    <Download size={14} /> Export
                  </button>
                  <button 
                    onClick={() => setIsAddingJournalEntry(true)}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                  >
                    <Plus size={14} /> New Entry
                  </button>
                </div>
              </div>

              <div className="bg-white border border-zinc-300 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-100 text-xs font-bold text-zinc-700 uppercase tracking-wider border-b border-zinc-300">
                        <th className="px-4 py-3 border-r border-zinc-200 w-32">Date</th>
                        <th className="px-4 py-3 border-r border-zinc-200">Account & Description</th>
                        <th className="px-4 py-3 border-r border-zinc-200 w-48">Reference</th>
                        <th className="px-4 py-3 border-r border-zinc-200 text-right w-32">Debit</th>
                        <th className="px-4 py-3 text-right w-32">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {journalEntries.map(entry => (
                        <React.Fragment key={entry.id}>
                          {entry.lines.map((line: any, idx: number) => (
                            <tr key={`${entry.id}-${idx}`} className="hover:bg-zinc-50 transition-colors">
                              {idx === 0 ? (
                                <td className="px-4 py-3 text-sm text-zinc-900 border-r border-zinc-200 align-top" rowSpan={entry.lines.length}>
                                  <div className="font-medium">{entry.date}</div>
                                </td>
                              ) : null}
                              <td className="px-4 py-3 text-sm border-r border-zinc-200">
                                <div className={line.credit > 0 ? "pl-8 text-zinc-600" : "font-medium text-zinc-900"}>
                                  {line.accountName}
                                </div>
                                {idx === entry.lines.length - 1 && entry.description && (
                                  <div className="text-xs text-zinc-500 italic mt-2">({entry.description})</div>
                                )}
                              </td>
                              {idx === 0 ? (
                                <td className="px-4 py-3 text-sm text-zinc-600 border-r border-zinc-200 align-top" rowSpan={entry.lines.length}>
                                  {entry.reference}
                                </td>
                              ) : null}
                              <td className="px-4 py-3 text-sm font-medium text-right border-r border-zinc-200 text-zinc-900">
                                {line.debit > 0 ? formatCurrency(line.debit) : ''}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-right text-zinc-900">
                                {line.credit > 0 ? formatCurrency(line.credit) : ''}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : financeSubTab === 'vouchers' ? (
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
          ) : financeSubTab === 'bills' ? (
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

                      {/* Bill Items */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Items / Purchases</label>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {billForm.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-zinc-50 p-2 rounded-xl border border-zinc-100">
                              <span className="text-xs font-bold flex-1 truncate">{item.name}</span>
                              <span className="text-[10px] text-zinc-500">{item.quantity} x {formatCurrency(item.price * 100)}</span>
                              <button 
                                onClick={() => {
                                  const newItems = [...billForm.items];
                                  newItems.splice(idx, 1);
                                  const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                                  setBillForm({...billForm, items: newItems, amount: newTotal});
                                }}
                                className="text-red-500 p-1 hover:bg-red-50 rounded-lg"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <select 
                            className="col-span-5 p-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none"
                            onChange={(e) => {
                              const inv = inventory.find(i => i.id === e.target.value);
                              if (inv) {
                                const newItem = { inventoryItemId: inv.id, name: inv.name, quantity: 1, price: (inv.averageCost || inv.costPerUnit || 0) / 100 };
                                const newItems = [...billForm.items, newItem];
                                const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                                setBillForm({...billForm, items: newItems, amount: newTotal});
                                e.target.value = '';
                              }
                            }}
                          >
                            <option value="">Add Item...</option>
                            {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                          <input 
                            type="number" 
                            placeholder="Qty"
                            className="col-span-3 p-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const qty = parseFloat((e.target as HTMLInputElement).value);
                                if (billForm.items.length > 0 && !isNaN(qty)) {
                                  const newItems = [...billForm.items];
                                  newItems[newItems.length - 1].quantity = qty;
                                  const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                                  setBillForm({...billForm, items: newItems, amount: newTotal});
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                          <input 
                            type="number" 
                            placeholder="Price"
                            className="col-span-4 p-2 bg-zinc-50 border border-zinc-100 rounded-xl text-xs outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const price = parseFloat((e.target as HTMLInputElement).value);
                                if (billForm.items.length > 0 && !isNaN(price)) {
                                  const newItems = [...billForm.items];
                                  newItems[newItems.length - 1].price = price;
                                  const newTotal = newItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                                  setBillForm({...billForm, items: newItems, amount: newTotal});
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Total Amount</label>
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
          ) : financeSubTab === 'banking' ? (
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
                    <button 
                      onClick={() => setIsAddingTransfer(true)}
                      className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all"
                    >
                      <Plus size={14} /> New Transfer
                    </button>
                  </div>

                  {isAddingTransfer && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">New Transfer</h3>
                          <button onClick={() => setIsAddingTransfer(false)} className="p-2 bg-zinc-100 text-zinc-500 rounded-full hover:bg-zinc-200 transition-colors">
                            <X size={20} />
                          </button>
                        </div>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">From</label>
                              <select 
                                className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                                value={transferForm.fromAccount}
                                onChange={e => setTransferForm({...transferForm, fromAccount: e.target.value})}
                              >
                                <option value="cash">Cash</option>
                                <option value="bank">Bank</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">To</label>
                              <select 
                                className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                                value={transferForm.toAccount}
                                onChange={e => setTransferForm({...transferForm, toAccount: e.target.value})}
                              >
                                <option value="bank">Bank</option>
                                <option value="cash">Cash</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Amount</label>
                            <input 
                              type="number" 
                              className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                              value={transferForm.amount || ''}
                              onChange={e => setTransferForm({...transferForm, amount: parseFloat(e.target.value)})}
                              placeholder="0.00"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Reference (Optional)</label>
                            <input 
                              type="text" 
                              className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                              value={transferForm.reference}
                              onChange={e => setTransferForm({...transferForm, reference: e.target.value})}
                              placeholder="e.g. TRF-001"
                            />
                          </div>
                          <button 
                            onClick={handleAddTransfer}
                            disabled={transferForm.fromAccount === transferForm.toAccount || !transferForm.amount}
                            className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                          >
                            Record Transfer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {journalEntries.filter(j => j.description.includes('Fund Transfer')).length > 0 ? (
                      <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                        {journalEntries.filter(j => j.description.includes('Fund Transfer')).map((entry, idx) => (
                          <div key={idx} className="p-4 border-b border-zinc-50 last:border-0 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-zinc-900">{entry.description}</p>
                              <p className="text-[10px] text-zinc-500">{entry.date} • {entry.reference}</p>
                            </div>
                            <p className="text-sm font-black text-zinc-900">{formatCurrency(entry.lines[0].debit)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 bg-zinc-50 rounded-[2rem] border border-dashed border-zinc-200 text-center">
                        <p className="text-sm text-zinc-400 italic">No recent transfers recorded</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : financeSubTab === 'taxes' ? (
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
                    onClick={() => setIsManageCategoriesOpen(true)}
                    className="flex items-center gap-2 bg-zinc-100 text-zinc-600 px-6 py-3 rounded-2xl text-sm font-bold border border-zinc-200 hover:bg-zinc-200 transition-all"
                  >
                    <LayoutGrid size={18} /> Manage Categories
                  </button>
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
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Price</label>
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="e.g. 10.50" 
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all"
                        value={newForm.price}
                        onChange={e => setNewForm({...newForm, price: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-zinc-400 uppercase ml-1">Category</label>
                      <select 
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none bg-white"
                        value={newForm.category || ''}
                        onChange={e => setNewForm({...newForm, category: e.target.value})}
                      >
                        <option value="" disabled>Select a category</option>
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

              {items.length > 0 ? (
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
                              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Price</label>
                              <input 
                                type="number" 
                                step="0.01"
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
                            <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Category</label>
                            <select 
                              className="w-full p-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none bg-white"
                              value={editForm.category || ''}
                              onChange={e => setEditForm({...editForm, category: e.target.value})}
                            >
                              <option value="" disabled>Select a category</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                              ))}
                            </select>
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
                            onClick={() => setManagingRecipeId(item.id)}
                            className="p-3 text-primary bg-primary/5 hover:bg-primary/10 rounded-2xl transition-all flex items-center gap-2"
                            title="Manage Recipe"
                          >
                            <ChefHat size={20} />
                            <span className="text-[10px] font-bold uppercase tracking-widest hidden lg:inline">Recipe</span>
                          </button>
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
            ) : null}
          </div>
        ) : null}
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

      {/* Manage Categories Modal */}
      {isManageCategoriesOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden border border-zinc-100">
            <div className="p-8 border-b flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                  <LayoutGrid size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">Manage Categories</h3>
                  <p className="text-sm text-zinc-500">Add or remove menu categories</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManageCategoriesOpen(false)}
                className="p-2 hover:bg-zinc-200 rounded-xl transition-all text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-zinc-50 p-6 rounded-3xl border border-zinc-100 space-y-4">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Add New Category</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Category Name (e.g. Desserts)" 
                    className="flex-1 p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm"
                    value={newCategory.name}
                    onChange={e => setNewCategory({...newCategory, name: e.target.value})}
                  />
                  <button 
                    onClick={handleAddCategory}
                    className="bg-zinc-900 text-white px-6 rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Existing Categories</p>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 scrollbar-hide">
                  {categories.sort((a, b) => a.order - b.order).map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-4 bg-white border border-zinc-100 rounded-2xl hover:border-primary/20 transition-all group">
                      <span className="text-sm font-bold text-zinc-900">{cat.name}</span>
                      <button 
                        onClick={() => deleteCategory(cat.id)}
                        className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Tree Modal */}
      {isManageTreeOpen && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-[1.5rem] sm:rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden border border-zinc-100 flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-6 lg:p-8 border-b flex items-center justify-between bg-zinc-50/50 shrink-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-primary/10 rounded-xl sm:rounded-2xl text-primary">
                  <BarChart3 size={20} className="sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-zinc-900">Manage Account Tree</h3>
                  <p className="text-xs sm:text-sm text-zinc-500 hidden sm:block">Define your ledger groups and structure</p>
                </div>
              </div>
              <button 
                onClick={() => setIsManageTreeOpen(false)}
                className="p-2 hover:bg-zinc-200 rounded-xl transition-all text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 overflow-y-auto custom-scrollbar">
              {/* Add/Edit Group */}
              <div className="bg-zinc-50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-zinc-100 space-y-3 sm:space-y-4 shrink-0">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {editingLedgerGroupId ? 'Edit Ledger Group' : 'Add New Ledger Group'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <input 
                    type="text" 
                    placeholder="Code (e.g. 1100)" 
                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm"
                    value={editingLedgerGroupId ? editLedgerGroupForm.code : newLedgerGroup.code}
                    onChange={e => editingLedgerGroupId 
                      ? setEditLedgerGroupForm({...editLedgerGroupForm, code: e.target.value})
                      : setNewLedgerGroup({...newLedgerGroup, code: e.target.value})
                    }
                  />
                  <input 
                    type="text" 
                    placeholder="Group Name (e.g. Cash at Bank)" 
                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm"
                    value={editingLedgerGroupId ? editLedgerGroupForm.name : newLedgerGroup.name}
                    onChange={e => editingLedgerGroupId 
                      ? setEditLedgerGroupForm({...editLedgerGroupForm, name: e.target.value})
                      : setNewLedgerGroup({...newLedgerGroup, name: e.target.value})
                    }
                  />
                  <select 
                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm bg-white"
                    value={editingLedgerGroupId ? editLedgerGroupForm.type : newLedgerGroup.type}
                    onChange={e => editingLedgerGroupId
                      ? setEditLedgerGroupForm({...editLedgerGroupForm, type: e.target.value as any})
                      : setNewLedgerGroup({...newLedgerGroup, type: e.target.value as any})
                    }
                  >
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Expense">Expense</option>
                  </select>
                  <select 
                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none transition-all text-sm bg-white"
                    value={editingLedgerGroupId ? editLedgerGroupForm.parentGroupId : newLedgerGroup.parentGroupId}
                    onChange={e => editingLedgerGroupId
                      ? setEditLedgerGroupForm({...editLedgerGroupForm, parentGroupId: e.target.value})
                      : setNewLedgerGroup({...newLedgerGroup, parentGroupId: e.target.value})
                    }
                  >
                    <option value="">No Parent (Root)</option>
                    {ledgerGroups.filter(g => g.id !== editingLedgerGroupId).map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 px-2 sm:px-4 col-span-1 sm:col-span-2">
                    <input 
                      type="checkbox"
                      id="isAccount"
                      className="w-4 h-4 accent-primary"
                      checked={editingLedgerGroupId ? editLedgerGroupForm.isAccount : newLedgerGroup.isAccount}
                      onChange={e => editingLedgerGroupId
                        ? setEditLedgerGroupForm({...editLedgerGroupForm, isAccount: e.target.checked})
                        : setNewLedgerGroup({...newLedgerGroup, isAccount: e.target.checked})
                      }
                    />
                    <label htmlFor="isAccount" className="text-xs sm:text-sm font-bold text-zinc-600 cursor-pointer">Is Transactional Account?</label>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  {editingLedgerGroupId && (
                    <button 
                      onClick={() => setEditingLedgerGroupId(null)}
                      className="flex-1 bg-zinc-200 text-zinc-600 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm hover:bg-zinc-300 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  <button 
                    onClick={() => editingLedgerGroupId ? handleSaveLedgerGroup() : handleAddLedgerGroup()}
                    className="flex-[2] bg-zinc-900 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
                  >
                    {editingLedgerGroupId ? <Save size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />}
                    {editingLedgerGroupId ? 'Save Changes' : 'Add to Tree'}
                  </button>
                </div>
              </div>

              {/* Existing Groups (Tree View) */}
              <div className="space-y-3 sm:space-y-4 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between shrink-0">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Account Hierarchy</p>
                  <button 
                    onClick={initializeDefaultCOA}
                    className="text-[10px] sm:text-xs font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} className="sm:w-[14px] sm:h-[14px]" />
                    Sync Default COA
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar min-h-[200px]">
                  {ledgerGroups.length > 0 ? (
                    renderTree()
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
  </div>
  );
}

function StaffSection({ staff }: { staff: any[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'waiter', email: '', phone: '', password: '', vehicle: '', permissions: {} as any });
  const [error, setError] = useState('');
  const [editingPermissionsId, setEditingPermissionsId] = useState<string | null>(null);

  const modules = [
    { id: 'dashboard', name: 'Dashboard', icon: <BarChart3 size={14} /> },
    { id: 'orders', name: 'Orders', icon: <ShoppingBag size={14} /> },
    { id: 'menu', name: 'Menu', icon: <LayoutGrid size={14} /> },
    { id: 'recipes', name: 'Recipes', icon: <Book size={14} /> },
    { id: 'kitchen', name: 'Kitchen', icon: <Utensils size={14} /> },
    { id: 'inventory', name: 'Inventory', icon: <Package size={14} /> },
    { id: 'suppliers', name: 'Suppliers', icon: <Truck size={14} /> },
    { id: 'accounting', name: 'Accounting', icon: <BookOpen size={14} /> },
    { id: 'wastage', name: 'Wastage', icon: <Trash2 size={14} /> },
    { id: 'production', name: 'Production', icon: <ChefHat size={14} /> },
    { id: 'tables', name: 'Tables', icon: <Grid size={14} /> },
    { id: 'crm', name: 'CRM', icon: <Users size={14} /> },
    { id: 'users', name: 'Users', icon: <UserCheck size={14} /> },
    { id: 'settings', name: 'Settings', icon: <Settings size={14} /> },
    { id: 'delivery', name: 'Delivery', icon: <Truck size={14} /> },
  ];

  const handleAdd = async () => {
    setError('');
    if (!form.name || !form.email) {
      setError('Name and email are required.');
      return;
    }
    const email = form.email;
    try {
      console.log('Attempting to add staff with email:', email);
      
      // Check if user already exists in 'users' collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      let existingUid = '';
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        existingUid = userDoc.id;
        // Update existing user profile
        await updateDoc(doc(db, 'users', existingUid), {
          role: form.role,
          permissions: form.permissions,
          vehicle: form.vehicle || null
        });
        console.log('Updated existing user profile in users collection');
      }

      // Create staff record
      await addDoc(collection(db, 'staff'), {
        name: form.name,
        email: email,
        phone: form.phone,
        role: form.role,
        vehicle: form.vehicle || null,
        ...(existingUid ? { uid: existingUid } : {}),
        createdAt: serverTimestamp(),
        active: true,
        permissions: form.permissions
      });
      console.log('Staff record created in Firestore');

      setForm({ name: '', role: 'waiter', email: '', phone: '', password: '', vehicle: '', permissions: {} });
      setIsAdding(false);
      alert('Staff member added successfully!');
    } catch (err: any) {
      console.error('Error adding staff:', err);
      setError(err.message || 'Failed to add staff');
      handleFirestoreError(err, OperationType.CREATE, 'staff');
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

  const togglePermission = async (staffId: string, moduleId: string, currentPermissions: any) => {
    try {
      const newPermissions = {
        ...(currentPermissions || {}),
        [moduleId]: !currentPermissions?.[moduleId]
      };
      
      await updateDoc(doc(db, 'staff', staffId), { permissions: newPermissions });
      
      const member = staff.find(s => s.id === staffId);
      if (member && member.uid) {
        await updateDoc(doc(db, 'users', member.uid), { permissions: newPermissions });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `staff/${staffId}/permissions`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <Users size={24} />
          </div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Staff Management</h2>
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
        <div className="p-8 bg-card border border-border rounded-[2.5rem] grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
          {error && (
            <div className="md:col-span-2 p-4 bg-destructive/10 text-destructive rounded-xl text-sm font-bold">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Full Name</label>
            <input type="text" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Role</label>
            <select className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
              <option value="manager">Manager</option>
              <option value="waiter">Waiter</option>
              <option value="chef">Chef</option>
              <option value="driver">Driver</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Email</label>
            <input type="email" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Phone</label>
            <input type="text" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Password</label>
            <input type="password" placeholder="For mobile app login" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          </div>
          {form.role === 'driver' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Vehicle Details</label>
              <input type="text" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.vehicle} onChange={e => setForm({...form, vehicle: e.target.value})} placeholder="e.g. Bike, Car (Plate No)" />
            </div>
          )}
            <div className="md:col-span-2 space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Assign Modules</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 bg-background border border-border rounded-xl">
                {modules.map(mod => (
                  <label key={mod.id} className={`flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer group ${
                    form.permissions[mod.id] ? 'bg-primary/5 border-primary/20' : 'bg-transparent border-transparent hover:bg-muted'
                  }`}>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-primary rounded"
                      checked={form.permissions[mod.id] === true}
                      onChange={() => setForm({
                        ...form,
                        permissions: {
                          ...form.permissions,
                          [mod.id]: !form.permissions[mod.id]
                        }
                      })}
                    />
                    <div className="flex items-center gap-2">
                      <span className={`${form.permissions[mod.id] ? 'text-primary' : 'text-muted-foreground'}`}>
                        {mod.icon}
                      </span>
                      <span className={`text-[10px] font-bold ${form.permissions[mod.id] ? 'text-foreground' : 'text-muted-foreground'}`}>{mod.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          <div className="md:col-span-2 flex gap-4 pt-4">
            <button onClick={handleAdd} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">Save Staff</button>
            <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-muted text-muted-foreground rounded-xl font-bold hover:bg-muted/80 transition-all">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.map(member => (
          <div key={member.id} className="p-6 bg-card border border-border rounded-[2.5rem] hover:shadow-xl hover:shadow-primary/5 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center text-muted-foreground font-black text-xl">
                {member.name[0]}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground">{member.name}</h4>
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
              <button 
                onClick={() => setEditingPermissionsId(editingPermissionsId === member.id ? null : member.id)}
                className="p-2 text-muted-foreground hover:text-primary transition-colors"
                title="Manage Permissions"
              >
                <ShieldCheck size={20} />
              </button>
            </div>
            
            {editingPermissionsId === member.id && (
              <div className="mb-4 p-5 bg-muted/30 rounded-[2rem] border border-border animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Module Permissions</p>
                  <button 
                    onClick={() => {
                      const allPerms = modules.reduce((acc, mod) => ({ ...acc, [mod.id]: true }), {});
                      updateDoc(doc(db, 'staff', member.id), { permissions: allPerms });
                    }}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    Grant All
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {modules.map(mod => (
                    <label key={mod.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                      member.permissions?.[mod.id] 
                        ? 'bg-card border-primary/20 shadow-sm' 
                        : 'bg-transparent border-transparent hover:bg-muted/50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${member.permissions?.[mod.id] ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {mod.icon}
                        </div>
                        <span className={`text-xs font-bold ${member.permissions?.[mod.id] ? 'text-foreground' : 'text-muted-foreground'}`}>{mod.name}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-primary rounded"
                        checked={member.permissions?.[mod.id] === true}
                        onChange={() => togglePermission(member.id, mod.id, member.permissions)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2"><Phone size={14} /> {member.phone || 'No phone'}</p>
              <p className="flex items-center gap-2"><FileText size={14} /> {member.email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductionSection({ inventory, items }: { inventory: InventoryItem[], items: MenuItem[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({ 
    menuItemId: '', 
    quantity: 1,
    laborCost: 0,
    overheadCost: 0,
    ingredients: [] as { inventoryItemId: string, name: string, quantity: number, unit: string }[]
  });
  const [productionHistory, setProductionHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedMenuItem = items.find(i => i.id === form.menuItemId);

  useEffect(() => {
    const q = query(collection(db, 'production'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProductionHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'production'));
    return () => unsubscribe();
  }, []);

  const handleMenuItemChange = (menuItemId: string) => {
    const item = items.find(i => i.id === menuItemId);
    if (item) {
      const recipeWithDetails = (item.recipe || []).map(r => {
        const inv = inventory.find(i => i.id === r.inventoryItemId);
        return {
          inventoryItemId: r.inventoryItemId,
          name: inv?.name || 'Unknown',
          quantity: r.quantity,
          unit: inv?.unit || ''
        };
      });
      setForm({
        ...form,
        menuItemId,
        ingredients: recipeWithDetails,
        laborCost: 0,
        overheadCost: 0
      });
    } else {
      setForm({ ...form, menuItemId: '', ingredients: [], laborCost: 0, overheadCost: 0 });
    }
  };

  const handleProduce = async () => {
    if (!form.menuItemId || form.quantity <= 0) return;
    setLoading(true);
    try {
      // Check for sufficient stock
      for (const ingredient of form.ingredients) {
        const inv = inventory.find(i => i.id === ingredient.inventoryItemId);
        const required = ingredient.quantity * form.quantity;
        if (!inv || (inv.stock || 0) < required) {
          alert(`Insufficient stock for ${ingredient.name}. Required: ${required}, Available: ${inv?.stock || 0}`);
          setLoading(false);
          return;
        }
      }

      const menuItem = items.find(i => i.id === form.menuItemId);
      if (!menuItem) throw new Error("Menu item not found");

      // Calculate actual cost from raw materials + labor + overhead
      let rawMaterialCost = 0;
      for (const ingredient of form.ingredients) {
        const inv = inventory.find(i => i.id === ingredient.inventoryItemId);
        if (inv && inv.costPerUnit) {
          rawMaterialCost += inv.costPerUnit * ingredient.quantity * form.quantity;
        }
      }

      const totalLaborCost = Math.round(form.laborCost * 100);
      const totalOverheadCost = Math.round(form.overheadCost * 100);
      const actualTotalCost = rawMaterialCost + totalLaborCost + totalOverheadCost;
      const costPerUnit = Math.round(actualTotalCost / form.quantity);

      // Find or create matching inventory item for the finished good
      let finishedGood = inventory.find(i => i.name === menuItem.name);
      if (!finishedGood) {
        // Create it if it doesn't exist
        const newInvRef = await addDoc(collection(db, 'inventory'), {
          name: menuItem.name,
          stock: 0,
          unit: 'pcs',
          costPerUnit: costPerUnit,
          lowStockThreshold: 5,
          lastUpdated: serverTimestamp(),
          isFinishedGood: true
        });
        finishedGood = { id: newInvRef.id, name: menuItem.name, stock: 0, unit: 'pcs', costPerUnit: costPerUnit, lowStockThreshold: 5 } as any;
      } else {
        // Update average cost for finished good
        const oldTotalValue = finishedGood.stock * (finishedGood.costPerUnit || 0);
        const newTotalQuantity = finishedGood.stock + form.quantity;
        const newAverageCost = Math.round((oldTotalValue + actualTotalCost) / newTotalQuantity);
        
        await updateDoc(doc(db, 'inventory', finishedGood.id), {
          costPerUnit: newAverageCost,
          isFinishedGood: true
        });
      }

      // Deduct raw materials
      for (const ingredient of form.ingredients) {
        const invRef = doc(db, 'inventory', ingredient.inventoryItemId);
        const invDoc = await getDoc(invRef);
        if (invDoc.exists()) {
          const currentStock = invDoc.data().stock || 0;
          const deduction = ingredient.quantity * form.quantity;
          await updateDoc(invRef, {
            stock: Math.max(0, currentStock - deduction),
            lastUpdated: serverTimestamp()
          });
        }
      }

      // Add finished good to inventory
      await updateDoc(doc(db, 'inventory', finishedGood.id), {
        stock: (finishedGood.stock || 0) + form.quantity,
        lastUpdated: serverTimestamp()
      } as any);

      // Record production
      await addDoc(collection(db, 'production'), {
        menuItemId: menuItem.id || '',
        menuItemName: menuItem.name || '',
        quantity: form.quantity || 0,
        timestamp: serverTimestamp(),
        ingredients: form.ingredients.map(ing => ({
          inventoryItemId: ing.inventoryItemId || '',
          name: ing.name || '',
          quantity: ing.quantity || 0,
          unit: ing.unit || ''
        })),
        rawMaterialCost: rawMaterialCost || 0,
        laborCost: totalLaborCost || 0,
        overheadCost: totalOverheadCost || 0,
        totalCost: actualTotalCost || 0,
        costPerUnit: costPerUnit || 0
      });

      // Accounting Entry
      await addDoc(collection(db, 'journal_entries'), {
        date: new Date().toISOString().split('T')[0],
        reference: 'PROD',
        description: `Production: ${form.quantity}x ${menuItem.name}`,
        timestamp: serverTimestamp(),
        lines: [
          { accountId: 'inventory_fg', accountName: 'Inventory (Finished Goods)', debit: Math.round(actualTotalCost), credit: 0 },
          { accountId: 'inventory_rm', accountName: 'Inventory (Raw Materials)', debit: 0, credit: Math.round(rawMaterialCost) },
          ...(totalLaborCost > 0 ? [{ accountId: 'labor_expense', accountName: 'Labor Expense', debit: 0, credit: totalLaborCost }] : []),
          ...(totalOverheadCost > 0 ? [{ accountId: 'overhead_expense', accountName: 'Overhead Expense', debit: 0, credit: totalOverheadCost }] : [])
        ]
      });

      setForm({ menuItemId: '', quantity: 1, laborCost: 0, overheadCost: 0, ingredients: [] });
      setIsAdding(false);
      alert('Production successful!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'production');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <ChefHat size={24} />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Production Management</h2>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} /> New Production Run
        </button>
      </div>

      {isAdding && (
        <div className="p-8 bg-zinc-50 border border-zinc-200 rounded-[2.5rem] space-y-6 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Menu Item to Produce</label>
              <select 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.menuItemId} 
                onChange={e => handleMenuItemChange(e.target.value)}
              >
                <option value="">Select Item...</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Quantity</label>
              <input 
                type="number" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.quantity} 
                onChange={e => setForm({...form, quantity: Number(e.target.value)})} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Labor Cost (Total)</label>
              <input 
                type="number" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.laborCost} 
                onChange={e => setForm({...form, laborCost: Number(e.target.value)})} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 uppercase ml-1">Overhead (Total)</label>
              <input 
                type="number" 
                className="w-full p-3 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.overheadCost} 
                onChange={e => setForm({...form, overheadCost: Number(e.target.value)})} 
              />
            </div>
          </div>

          {selectedMenuItem && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Recipe & Ingredients</h4>
                <button 
                  onClick={() => {
                    const invItem = inventory[0];
                    if (invItem) {
                      setForm({
                        ...form,
                        ingredients: [...form.ingredients, { inventoryItemId: invItem.id, name: invItem.name, quantity: 1, unit: invItem.unit }]
                      });
                    }
                  }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  + Add Extra Ingredient
                </button>
              </div>
              
              <div className="space-y-2">
                {form.ingredients.map((ing, idx) => {
                  const inv = inventory.find(i => i.id === ing.inventoryItemId);
                  const required = ing.quantity * form.quantity;
                  const isLow = !inv || (inv.stock || 0) < required;
                  return (
                    <div key={idx} className={`flex items-center gap-4 p-3 border rounded-xl transition-all ${isLow ? 'bg-red-50 border-red-100' : 'bg-white border-zinc-100'}`}>
                      <select 
                        className="flex-1 p-2 bg-zinc-50 border border-zinc-100 rounded-lg text-xs font-bold outline-none"
                        value={ing.inventoryItemId}
                        onChange={e => {
                          const inv = inventory.find(i => i.id === e.target.value);
                          if (inv) {
                            const newIngs = [...form.ingredients];
                            newIngs[idx] = { ...newIngs[idx], inventoryItemId: inv.id, name: inv.name, unit: inv.unit };
                            setForm({ ...form, ingredients: newIngs });
                          }
                        }}
                      >
                        {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <input 
                            type="number"
                            className="w-20 p-2 bg-zinc-50 border border-zinc-100 rounded-lg text-xs font-bold text-center outline-none"
                            value={ing.quantity}
                            onChange={e => {
                              const newIngs = [...form.ingredients];
                              newIngs[idx].quantity = Number(e.target.value);
                              setForm({ ...form, ingredients: newIngs });
                            }}
                          />
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">{ing.unit}</span>
                        </div>
                        <p className={`text-[10px] font-bold ${isLow ? 'text-red-600' : 'text-zinc-400'}`}>
                          {isLow ? `Shortage: ${required - (inv?.stock || 0)}` : `Stock: ${inv?.stock || 0}`} {ing.unit}
                        </p>
                      </div>
                      <button 
                        onClick={() => {
                          const newIngs = [...form.ingredients];
                          newIngs.splice(idx, 1);
                          setForm({ ...form, ingredients: newIngs });
                        }}
                        className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <button 
              onClick={handleProduce}
              disabled={loading || !form.menuItemId || form.quantity <= 0}
              className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Start Production'}
            </button>
            <button 
              onClick={() => setIsAdding(false)}
              className="flex-1 py-4 bg-zinc-200 text-zinc-600 rounded-2xl font-bold hover:bg-zinc-300 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-zinc-100 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Produced Item</th>
              <th className="px-6 py-4">Quantity</th>
              <th className="px-6 py-4 text-right">Cost/Unit</th>
              <th className="px-6 py-4 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {productionHistory.map(run => (
              <tr key={run.id} className="hover:bg-zinc-50/50 transition-all">
                <td className="px-6 py-4 text-sm text-zinc-500">
                  {run.timestamp?.toDate ? run.timestamp.toDate().toLocaleString() : 'Processing...'}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-zinc-900">{run.menuItemName}</td>
                <td className="px-6 py-4 text-sm font-black text-primary">+{run.quantity}</td>
                <td className="px-6 py-4 text-sm font-bold text-zinc-600 text-right">{formatCurrency(run.costPerUnit || 0)}</td>
                <td className="px-6 py-4 text-sm font-bold text-zinc-900 text-right">{formatCurrency(run.totalCost || 0)}</td>
              </tr>
            ))}
            {productionHistory.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-zinc-400 italic text-sm">No production history yet.</td>
              </tr>
            )}
          </tbody>
        </table>
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

        // Also create a formal journal entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: 'WASTAGE',
          description: `Wastage: ${item.name} (${form.reason})`,
          timestamp: serverTimestamp(),
          lines: [
            { accountId: '5104', accountName: 'Wastage Expense', debit: (item.costPerUnit || 0) * form.quantity, credit: 0 },
            { accountId: '1105', accountName: 'Inventory Asset', debit: 0, credit: (item.costPerUnit || 0) * form.quantity }
          ]
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

function SuppliersSection({ suppliers }: { suppliers: any[] }) {
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '' });

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

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Suppliers</h2>
          <p className="text-sm text-muted-foreground font-medium">Manage your vendors and contact information</p>
        </div>
        <button 
          onClick={() => setIsAddingSupplier(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {isAddingSupplier && (
        <div className="p-6 bg-card rounded-3xl border border-border mb-6">
          <h4 className="font-bold text-foreground mb-4">Add New Supplier</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <input
              type="text"
              placeholder="Supplier Name"
              className="p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.name}
              onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
            />
            <input
              type="text"
              placeholder="Phone"
              className="p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.phone}
              onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              className="p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.email}
              onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
            />
            <input
              type="text"
              placeholder="Address"
              className="p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
              value={supplierForm.address}
              onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setIsAddingSupplier(false)}
              className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {suppliers.map(supplier => (
          <div key={supplier.id} className="p-6 bg-card rounded-3xl border border-border hover:shadow-xl hover:shadow-primary/5 transition-all">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                <Truck size={24} />
              </div>
              <div>
                <h3 className="font-bold text-foreground">{supplier.name}</h3>
                <p className="text-xs text-muted-foreground font-medium">{supplier.phone}</p>
              </div>
            </div>
            {supplier.email && <p className="text-sm text-foreground/80 mb-1">Email: {supplier.email}</p>}
            {supplier.address && <p className="text-sm text-foreground/80">Address: {supplier.address}</p>}
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="col-span-full py-20 text-center bg-muted/20 rounded-[2.5rem] border-2 border-dashed border-border">
            <Truck size={48} className="text-muted-foreground/20 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">No suppliers found</h3>
            <p className="text-muted-foreground">Add your first supplier to start tracking purchases</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliverySection({ drivers }: { drivers: any[] }) {
  const [isAddingDriver, setIsAddingDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', email: '', phone: '', vehicle: '', role: 'driver', status: 'active' });

  const handleAddDriver = async () => {
    if (!newDriver.name || !newDriver.email || !newDriver.phone) {
      alert('Name, email, and phone are required.');
      return;
    }
    try {
      // Check if user already exists in 'users' collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', newDriver.email));
      const querySnapshot = await getDocs(q);
      
      let existingUid = '';
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        existingUid = userDoc.id;
        await updateDoc(doc(db, 'users', existingUid), {
          role: 'driver',
          vehicle: newDriver.vehicle || null
        });
      }

      await addDoc(collection(db, 'staff'), {
        ...newDriver,
        ...(existingUid ? { uid: existingUid } : {}),
        createdAt: serverTimestamp(),
        active: true,
        permissions: { delivery: true }
      });
      
      setIsAddingDriver(false);
      setNewDriver({ name: '', email: '', phone: '', vehicle: '', role: 'driver', status: 'active' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'staff');
    }
  };

  const deleteDriver = async (id: string) => {
    // Removed window.confirm for iframe compatibility
    // if (!window.confirm('Are you sure you want to delete this driver?')) return;
    try {
      await deleteDoc(doc(db, 'staff', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staff/${id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Delivery Management</h2>
          <p className="text-sm text-muted-foreground font-medium">Manage drivers and delivery assignments</p>
        </div>
        <button 
          onClick={() => setIsAddingDriver(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          <Plus size={18} /> Add New Driver
        </button>
      </div>

      {isAddingDriver && (
        <div className="p-6 bg-card rounded-3xl border border-border mb-6 space-y-6">
          <h4 className="font-bold text-foreground">Add New Driver</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Driver Name</label>
              <input 
                type="text" 
                className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                value={newDriver.name}
                onChange={e => setNewDriver({...newDriver, name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Email Address</label>
              <input 
                type="email" 
                className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                value={newDriver.email}
                onChange={e => setNewDriver({...newDriver, email: e.target.value})}
                placeholder="driver@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Phone Number</label>
              <input 
                type="text" 
                className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                value={newDriver.phone}
                onChange={e => setNewDriver({...newDriver, phone: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Vehicle Details</label>
              <input 
                type="text" 
                className="w-full p-3 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-primary outline-none" 
                value={newDriver.vehicle}
                onChange={e => setNewDriver({...newDriver, vehicle: e.target.value})}
                placeholder="e.g. Bike, Car (Plate No)"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setIsAddingDriver(false)} className="px-6 py-3 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleAddDriver} className="px-6 py-3 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors">Save Driver</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drivers.map(driver => (
          <div key={driver.id} className="bg-card p-6 rounded-[2.5rem] border border-border shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                <Truck size={24} />
              </div>
              <button 
                onClick={() => deleteDriver(driver.id)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <h3 className="text-lg font-black text-foreground mb-1">{driver.name}</h3>
            <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
              <Phone size={14} /> {driver.phone}
            </p>
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${driver.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                <span className="text-[10px] font-bold text-muted-foreground uppercase">{driver.status}</span>
              </div>
              <span className="text-[10px] font-black text-primary uppercase bg-primary/5 px-2 py-1 rounded">{driver.vehicle || 'No Vehicle'}</span>
            </div>
          </div>
        ))}
        {drivers.length === 0 && !isAddingDriver && (
          <div className="col-span-full py-20 text-center bg-muted/20 rounded-[2.5rem] border-2 border-dashed border-border">
            <Truck size={48} className="text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">No drivers registered yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PurchasesSection({ suppliers, inventory, bills, ledgerGroups }: { suppliers: any[], inventory: InventoryItem[], bills: any[], ledgerGroups: LedgerGroup[] }) {
  const [isAddingInvoice, setIsAddingInvoice] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<LedgerGroup[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    items: [] as { inventoryItemId: string, quantity: number, price: number }[],
    amountPaid: 0,
    totalAmount: 0,
    accountId: '1101' // Default to Cash on Hand
  });

  useEffect(() => {
    // Filter Asset and Liability accounts that are marked as accounts (not groups)
    const accounts = ledgerGroups.filter(g => (g.type === 'Asset' || g.type === 'Liability') && g.isAccount);
    setPaymentAccounts(accounts);
  }, [ledgerGroups]);

  const handleAddInvoiceItem = () => {
    if (inventory.length === 0) return;
    setInvoiceForm({
      ...invoiceForm,
      items: [...invoiceForm.items, { inventoryItemId: inventory[0].id, quantity: 1, price: 0 }]
    });
  };

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    const newTotal = newItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    setInvoiceForm({ ...invoiceForm, items: newItems, totalAmount: newTotal });
  };

  const removeInvoiceItem = (index: number) => {
    const newItems = invoiceForm.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    setInvoiceForm({ ...invoiceForm, items: newItems, totalAmount: newTotal });
  };

  const handleSaveInvoice = async () => {
    if (!selectedSupplier || invoiceForm.items.length === 0) return;
    try {
      // 1. Save the bill
      const billRef = await addDoc(collection(db, 'bills'), {
        ...invoiceForm,
        items: invoiceForm.items.map(item => ({
          ...item,
          price: Math.round(item.price * 100)
        })),
        totalAmount: Math.round(invoiceForm.totalAmount * 100),
        amountPaid: Math.round(invoiceForm.amountPaid * 100),
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        type: 'purchase',
        timestamp: serverTimestamp()
      });

      // 2. Update inventory stock, average cost and record in journal
      for (const item of invoiceForm.items) {
        const invItem = inventory.find(i => i.id === item.inventoryItemId);
        if (invItem) {
          const currentStock = invItem.stock || 0;
          const currentCost = invItem.costPerUnit || 0; // in cents
          const newQty = item.quantity;
          const newUnitPrice = Math.round(item.price * 100); // in cents
          
          let newAverageCost = currentCost;
          const newTotalStock = currentStock + newQty;
          
          if (newTotalStock > 0) {
            newAverageCost = Math.round(((currentStock * currentCost) + (newQty * newUnitPrice)) / newTotalStock);
          } else {
            newAverageCost = newUnitPrice;
          }

          await updateDoc(doc(db, 'inventory', item.inventoryItemId), {
            stock: newTotalStock,
            costPerUnit: newAverageCost,
            averageCost: newAverageCost,
            lastUpdated: serverTimestamp()
          });

          // Record individual item purchase in journal for tracking
          await addDoc(collection(db, 'journal'), {
            type: 'expense',
            amount: Math.round(item.quantity * item.price * 100),
            description: `Purchase: ${invItem.name} (${item.quantity} ${invItem.unit} @ ${formatCurrency(Math.round(item.price * 100))}) from ${selectedSupplier.name}`,
            timestamp: serverTimestamp(),
            vendorId: selectedSupplier.id,
            billId: billRef.id
          });
        }
      }

      // 3. Create a formal journal entry for the whole invoice
      await addDoc(collection(db, 'journal_entries'), {
        date: invoiceForm.date,
        reference: invoiceForm.invoiceNumber,
        description: `Purchase from ${selectedSupplier.name}`,
        timestamp: serverTimestamp(),
        lines: [
          { accountId: '1105', accountName: 'Inventory', debit: Math.round(invoiceForm.totalAmount * 100), credit: 0 },
          ...(invoiceForm.amountPaid > 0 ? [
            { 
              accountId: invoiceForm.accountId, 
              accountName: paymentAccounts.find(a => a.code === invoiceForm.accountId || a.id === invoiceForm.accountId)?.name || 'Payment Account', 
              debit: 0, 
              credit: Math.round(invoiceForm.amountPaid * 100) 
            }
          ] : []),
          ...(invoiceForm.totalAmount > invoiceForm.amountPaid ? [
            { accountId: '2101', accountName: 'Accounts Payable', debit: 0, credit: Math.round((invoiceForm.totalAmount - invoiceForm.amountPaid) * 100) }
          ] : [])
        ]
      });

      setIsAddingInvoice(false);
      setInvoiceForm({
        invoiceNumber: '',
        date: new Date().toISOString().split('T')[0],
        items: [],
        amountPaid: 0,
        totalAmount: 0,
        accountId: '1101'
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
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Purchases</h2>
          <p className="text-sm text-muted-foreground font-medium">Record and track inventory purchases</p>
        </div>
        <button 
          onClick={() => setIsAddingInvoice(true)}
          className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
        >
          <Plus size={18} /> Record Purchase
        </button>
      </div>

      {isAddingInvoice && (
        <div className="p-6 bg-card rounded-3xl border border-border mb-6 space-y-6">
          <h4 className="font-bold text-foreground">Record Purchase Invoice</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Supplier</label>
              <select
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
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
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Invoice Number</label>
              <input
                type="text"
                placeholder="INV-..."
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
                value={invoiceForm.invoiceNumber}
                onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Date</label>
              <input
                type="date"
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
                value={invoiceForm.date}
                onChange={e => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Payment Account</label>
              <select
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none"
                value={invoiceForm.accountId}
                onChange={e => setInvoiceForm({ ...invoiceForm, accountId: e.target.value })}
              >
                {paymentAccounts.map(acc => (
                  <option key={acc.id} value={acc.code || acc.id}>{acc.name} ({acc.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h5 className="font-bold text-foreground/80">Purchased Items</h5>
              <button 
                onClick={handleAddInvoiceItem}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
            
            {invoiceForm.items.map((item, index) => (
              <div key={index} className="flex gap-4 items-center bg-muted/20 p-4 rounded-2xl border border-border">
                <div className="flex-1">
                  <select
                    className="w-full p-2 rounded-lg border border-border bg-background text-foreground text-sm"
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
                    className="w-full p-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    value={item.quantity || ''}
                    onChange={e => updateInvoiceItem(index, 'quantity', Number(e.target.value))}
                  />
                </div>
                <div className="w-32">
                  <input
                    type="number"
                    placeholder="Cost/Unit"
                    className="w-full p-2 rounded-lg border border-border bg-background text-foreground text-sm"
                    value={item.price || ''}
                    onChange={e => updateInvoiceItem(index, 'price', Number(e.target.value))}
                  />
                </div>
                <div className="w-32 text-right font-bold text-foreground">
                  {formatCurrencyDirect(item.quantity * item.price)}
                </div>
                <button 
                  onClick={() => removeInvoiceItem(index)}
                  className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {invoiceForm.items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm font-bold border-2 border-dashed border-border rounded-2xl">
                No items added to this invoice
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6 flex justify-between items-end">
            <div className="w-64">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1 block">Amount Paid Now</label>
              <input
                type="number"
                className="w-full p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none font-bold text-lg"
                value={invoiceForm.amountPaid || ''}
                onChange={e => setInvoiceForm({ ...invoiceForm, amountPaid: Number(e.target.value) })}
              />
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Total Invoice Amount</p>
              <p className="text-3xl font-black text-foreground">{formatCurrencyDirect(invoiceForm.totalAmount)}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setIsAddingInvoice(false)}
              className="px-6 py-3 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
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

      <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-muted/50 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Supplier</th>
              <th className="px-6 py-4">Invoice #</th>
              <th className="px-6 py-4">Items</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4 text-right">Paid</th>
              <th className="px-6 py-4 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bills.filter(b => b.type === 'purchase').map(bill => (
              <tr key={bill.id} className="hover:bg-muted/30 transition-all">
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {bill.timestamp?.toDate ? bill.timestamp.toDate().toLocaleDateString() : bill.date}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-foreground">{bill.supplierName}</td>
                <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{bill.invoiceNumber}</td>
                <td className="px-6 py-4 text-sm text-foreground/80">
                  {bill.items?.length || 0} items
                </td>
                <td className="px-6 py-4 text-sm font-bold text-foreground text-right">{formatCurrency(bill.totalAmount || 0)}</td>
                <td className="px-6 py-4 text-sm font-bold text-emerald-500 text-right">{formatCurrency(bill.amountPaid || 0)}</td>
                <td className="px-6 py-4 text-sm font-bold text-destructive text-right">{formatCurrency((bill.totalAmount || 0) - (bill.amountPaid || 0))}</td>
              </tr>
            ))}
            {bills.filter(b => b.type === 'purchase').length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground italic text-sm">No purchase records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
