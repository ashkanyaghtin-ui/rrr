import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, OperationType, handleFirestoreError, secondaryAuth } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs, setDoc, limit, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { MenuItem, Category, InventoryItem, Journal, Order, LedgerGroup } from '../types';
import { Plus, Edit2, Trash2, Eye, EyeOff, Save, X, ShoppingBag, LayoutGrid, CheckCircle2, Clock, Ban, ShieldCheck, Monitor, Package, ChefHat, Truck, FileText, BarChart3, Boxes, History, Utensils, Printer, Move, Search, Filter, Calendar, Phone, MapPin, User, Hash, ChevronDown, ChevronUp, RotateCcw, Users, BookOpen, Building, Warehouse, Settings, Menu as MenuIcon, Upload, Download, FileSpreadsheet, ChevronRight, CreditCard, Wallet, ArrowRightLeft, Receipt, Percent, TrendingUp, UserPlus, Scale, Book, Grid, UserCheck, PieChart as PieChartIcon, Split, Mail, Tag, Bell, AlertCircle, MessageSquare, Maximize2, Minimize2, DollarSign } from 'lucide-react';
import DigitalClock from './DigitalClock';
import TableDesigner from './TableDesigner';
import AccountingReportsIFRS from './AccountingReportsIFRS';
import CRM from './CRM';
import Dashboard from './Dashboard';
import RecipeManager from './RecipeManager';
import ReservationsSection from './ReservationsSection';
import HRSection from './HRSection';
import PromotionsSection from './PromotionsSection';
import FeedbackSection from './FeedbackSection';
import StockLedgerSection from './StockLedgerSection';
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

const SettingsField = ({ label, type = 'text', value, onChange, placeholder = '' }: any) => (
  <div className="space-y-1">
    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">{label}</label>
    <input
      type={type}
      className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
    />
  </div>
);

export default function AdminPanel({ items, categories, onClose, onLogout, onOpenPOS }: AdminPanelProps) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [accountingDateRange, setAccountingDateRange] = useState({ start: '', end: '' });
  const [accountingSearch, setAccountingSearch] = useState('');
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroup[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
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
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuPage, setMenuPage] = useState(1);
  const [recipePage, setRecipePage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [wastageSearchQuery, setWastageSearchQuery] = useState('');
  const [productionSearchQuery, setProductionSearchQuery] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newSetupName, setNewSetupName] = useState('');
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
  const [deliverySearchQuery, setDeliverySearchQuery] = useState('');

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

  const handleDeleteLedgerGroup = async (id: string) => {
    // Removed window.confirm for iframe compatibility
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
                  isExpanded ? 'bg-card border border-border text-white' : 'hover:bg-background'
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
                    <p className={`text-[10px] uppercase tracking-widest font-bold ${isExpanded ? 'text-white/50' : 'text-muted-foreground'}`}>
                      {rootNodes.length} Root {rootNodes.length === 1 ? 'Node' : 'Nodes'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-black ${isExpanded ? 'text-white' : 'text-foreground'}`}>
                    {formatCurrency(typeBalance)}
                  </span>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
              </div>
              
              {isExpanded && (
                <div className="p-4 bg-background/30 space-y-2">
                  {rootNodes.length > 0 ? (
                    rootNodes.map(node => renderNode(node, 0))
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-[10px] text-muted-foreground italic font-medium">No {type.toLowerCase()} accounts or groups defined yet.</p>
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
              : 'bg-card border-border hover:border-border'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {!node.isAccount && hasChildren ? (
              <button 
                onClick={(e) => { e.stopPropagation(); toggleGroup(node.id); }}
                className={`p-1 rounded-md transition-all ${
                  isExpanded ? 'bg-card border border-border text-white' : 'bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <div className="w-6 flex justify-center">
                <div className={`w-1.5 h-1.5 rounded-full ${node.isAccount ? 'bg-primary animate-pulse' : 'bg-accent'}`} />
              </div>
            )}
            
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`p-1.5 rounded-lg ${
                node.isAccount ? 'bg-background text-muted-foreground' : 'bg-primary/10 text-primary'
              }`}>
                {node.isAccount ? <Book size={12} /> : <BookOpen size={12} />}
              </div>
              <div className="flex flex-col min-w-0">
                <span className={`text-xs truncate ${node.isAccount ? 'font-semibold text-foreground' : 'font-black text-foreground uppercase tracking-tight'}`}>
                  {node.code ? <span className="text-muted-foreground mr-1.5 font-mono">{node.code}</span> : null}
                  {node.name}
                </span>
                {node.description && (
                  <span className="text-[9px] text-muted-foreground truncate max-w-[200px]">{node.description}</span>
                )}
              </div>
              {node.isAccount && (
                <span className="px-1.5 py-0.5 rounded-md bg-background text-muted-foreground text-[8px] font-black uppercase tracking-tighter">Account</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold ${balance < 0 ? 'text-red-500' : 'text-foreground'}`}>
              {formatCurrency(balance)}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover/node:opacity-100 transition-all shrink-0">
              <button 
                onClick={() => handleEditLedgerGroup(node)}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                title="Edit Node"
              >
                <Edit2 size={12} />
              </button>
              <button 
                onClick={() => handleDeleteLedgerGroup(node.id)}
                className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                title="Delete Node"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
        
        {!node.isAccount && isExpanded && hasChildren && (
          <div className="ml-5 border-l-2 border-border pl-4 space-y-1 mt-1">
            {children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu' | 'orders' | 'kitchen' | 'inventory' | 'accounting' | 'finance' | 'tables' | 'crm' | 'users' | 'stores' | 'warehouses' | 'mobile' | 'terminals' | 'settings' | 'wastage' | 'recipes' | 'suppliers' | 'production' | 'purchases' | 'delivery' | 'reservations' | 'hr' | 'promotions' | 'feedback'>('dashboard');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [isAddingDriver, setIsAddingDriver] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', phone: '', vehicle: '', status: 'active' });
  const [recipeSearchTerm, setRecipeSearchTerm] = useState('');
  const [accountingSubTab, setAccountingSubTab] = useState<'dashboard' | 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'equity' | 'trial_balance' | 'general_ledger' | 'inventory_report' | 'sales_report' | 'pos_summary' | 'sales_by_category' | 'sales_by_item' | 'tax_report' | 'waiter_performance' | 'raw_material_consumption'>('dashboard');
  const [accountingTab, setAccountingTab] = useState<'reports' | 'setup'>('reports');
  const [setupSubTab, setSetupSubTab] = useState<'ledger' | 'subsidiaries' | 'classes'>('ledger');
  const [isReportsDropdownOpen, setIsReportsDropdownOpen] = useState(false);
  const [financeSubTab, setFinanceSubTab] = useState<'journal' | 'vouchers' | 'bills' | 'banking' | 'taxes' | 'expenses'>('journal');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const handleMarkAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => 
        updateDoc(doc(db, 'notifications', n.id), { read: true })
      ));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications/all');
    }
  };

  // Sub-rendering functions for cleaner code
  const renderInventoryTab = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold text-foreground">Inventory Management</h3>
            <div className="flex bg-background p-1 rounded-xl border border-border">
              <button 
                onClick={() => setInventoryCategoryFilter('all')}
                className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${inventoryCategoryFilter === 'all' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                ALL
              </button>
              <button 
                onClick={() => setInventoryCategoryFilter('raw_material')}
                className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${inventoryCategoryFilter === 'raw_material' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                RAW MATERIALS
              </button>
              <button 
                onClick={() => setInventoryCategoryFilter('finished_good')}
                className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all ${inventoryCategoryFilter === 'finished_good' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                FINISHED GOODS
              </button>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input 
                type="text"
                placeholder="Search inventory..."
                className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-xs focus:ring-2 focus:ring-primary outline-none"
                value={inventorySearchQuery}
                onChange={e => setInventorySearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => exportToExcel(inventory, 'Inventory')}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-muted-foreground rounded-2xl text-[10px] font-bold hover:bg-background transition-all"
            >
              <Download size={14} /> Export
            </button>
            <div className="flex items-center gap-2 bg-background p-1.5 rounded-2xl border border-border">
              <button 
                onClick={() => downloadTemplate('inventory')}
                className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-muted-foreground hover:bg-card hover:shadow-sm rounded-xl transition-all"
              >
                <Download size={14} /> Template
              </button>
              <label className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold text-primary hover:bg-card hover:shadow-sm rounded-xl transition-all cursor-pointer">
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
          <div className="p-6 bg-background rounded-3xl border-2 border-dashed border-border mb-6">
            <h4 className="font-bold text-foreground mb-4">Add New Inventory Item</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <input
                type="text"
                placeholder="Item Name"
                className="p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                value={inventoryForm.name}
                onChange={e => setInventoryForm({ ...inventoryForm, name: e.target.value })}
              />
              <input
                type="number"
                placeholder="Initial Stock"
                className="p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                value={inventoryForm.stock || ''}
                onChange={e => setInventoryForm({ ...inventoryForm, stock: Number(e.target.value) })}
              />
              <input
                type="text"
                placeholder="Unit (e.g. kg, pcs)"
                className="p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                value={inventoryForm.unit}
                onChange={e => setInventoryForm({ ...inventoryForm, unit: e.target.value })}
              />
              <input
                type="number"
                step="0.01"
                placeholder="Cost per Unit"
                className="p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                value={inventoryForm.costPerUnit || ''}
                onChange={e => setInventoryForm({ ...inventoryForm, costPerUnit: Number(e.target.value) })}
              />
              <input
                type="number"
                placeholder="Low Stock Threshold"
                className="p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                value={inventoryForm.lowStockThreshold || ''}
                onChange={e => setInventoryForm({ ...inventoryForm, lowStockThreshold: Number(e.target.value) })}
              />
              <select
                className="p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none bg-card"
                value={inventoryForm.category}
                onChange={e => setInventoryForm({ ...inventoryForm, category: e.target.value as any })}
              >
                <option value="raw_material">Raw Material</option>
                <option value="finished_good">Finished Good</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setIsAddingInventory(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!inventoryForm.name || !inventoryForm.unit) return;
                  try {
                    const initialCostCents = Math.round((inventoryForm.costPerUnit || 0) * 100);
                    await addDoc(collection(db, 'inventory'), {
                      name: inventoryForm.name,
                      stock: inventoryForm.stock || 0,
                      unit: inventoryForm.unit,
                      costPerUnit: initialCostCents,
                      averageCost: initialCostCents,
                      lowStockThreshold: inventoryForm.lowStockThreshold || 10,
                      category: inventoryForm.category || 'raw_material',
                      lastUpdated: serverTimestamp()
                    });
                    setIsAddingInventory(false);
                    setInventoryForm({ name: '', stock: 0, unit: '', costPerUnit: 0, lowStockThreshold: 10, category: 'raw_material' });
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
          <div className="text-center py-20 bg-background rounded-[2.5rem] border-2 border-dashed border-border">
            <Boxes size={48} className="text-zinc-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">No inventory items</h3>
            <p className="text-muted-foreground">Add items to start tracking your stock</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventory
              .filter(item => {
                const matchesCategory = inventoryCategoryFilter === 'all' || (item.category || 'raw_material') === inventoryCategoryFilter;
                const matchesSearch = item.name.toLowerCase().includes(inventorySearchQuery.toLowerCase());
                return matchesCategory && matchesSearch;
              })
              .map(item => (
              <div key={item.id} className="p-6 bg-background rounded-3xl border border-border">
                {editingInventoryId === item.id ? (
                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="Item Name"
                      className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                      value={editInventoryForm.name}
                      onChange={e => setEditInventoryForm({ ...editInventoryForm, name: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Stock"
                        className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                        value={editInventoryForm.stock ?? ''}
                        onChange={e => setEditInventoryForm({ ...editInventoryForm, stock: Number(e.target.value) })}
                      />
                      <input
                        type="text"
                        placeholder="Unit"
                        className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                        value={editInventoryForm.unit}
                        onChange={e => setEditInventoryForm({ ...editInventoryForm, unit: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Cost per Unit"
                        className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                        value={editInventoryForm.costPerUnit ?? ''}
                        onChange={e => setEditInventoryForm({ ...editInventoryForm, costPerUnit: Number(e.target.value) })}
                      />
                      <input
                        type="number"
                        placeholder="Low Stock Threshold"
                        className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none"
                        value={editInventoryForm.lowStockThreshold ?? ''}
                        onChange={e => setEditInventoryForm({ ...editInventoryForm, lowStockThreshold: Number(e.target.value) })}
                      />
                      <select
                        className="w-full p-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none bg-card"
                        value={editInventoryForm.category}
                        onChange={e => setEditInventoryForm({ ...editInventoryForm, category: e.target.value as any })}
                      >
                        <option value="raw_material">Raw Material</option>
                        <option value="finished_good">Finished Good</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingInventoryId(null)}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:bg-accent transition-colors"
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
                        <h4 className="font-bold text-foreground">{item.name}</h4>
                        <p className="text-xs text-muted-foreground uppercase font-bold tracking-widest">{item.unit}</p>
                        <p className="text-xs text-muted-foreground mt-1">Cost: {formatCurrency(item.averageCost ?? item.costPerUnit ?? 0)} / {item.unit}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {item.stock <= item.lowStockThreshold && (
                          <span className="px-2 py-1 bg-red-100 text-red-600 text-[10px] font-bold rounded-lg animate-pulse">LOW STOCK</span>
                        )}
                        <button
                          onClick={() => handleEditInventory(item)}
                          className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-background rounded-xl transition-all"
                          title="Edit Item"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-black text-foreground">
                        {Number(item.stock.toFixed(4))}
                        <span className="text-sm font-bold text-muted-foreground ml-1">{item.unit}</span>
                      </div>
                      <div className="flex gap-2">
                        {item.stock <= item.lowStockThreshold && (
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const poNumber = `PO-${Date.now().toString().slice(-6)}`;
                                await addDoc(collection(db, 'purchase_orders'), {
                                  poNumber,
                                  vendorId: '', 
                                  vendorName: 'Pending Selection',
                                  items: [{
                                    inventoryItemId: item.id,
                                    name: item.name,
                                    quantity: Math.ceil(item.lowStockThreshold * 2),
                                    expectedPrice: item.averageCost || 0
                                  }],
                                  totalAmount: (item.averageCost || 0) * Math.ceil(item.lowStockThreshold * 2),
                                  status: 'draft',
                                  createdAt: serverTimestamp()
                                });
                                alert(`Draft Purchase Order ${poNumber} created for ${item.name}`);
                              } catch (err) {
                                handleFirestoreError(err, OperationType.CREATE, 'purchase_orders');
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary hover:text-white transition-all text-[10px] font-black uppercase tracking-tight"
                            title="Create Draft PO"
                          >
                            <ShoppingBag size={14} /> RE-ORDER
                          </button>
                        )}
                        <button 
                          onClick={() => setAdjustingStock({ id: item.id, type: 'add', amount: 0 })}
                          className="p-2 bg-card border border-border rounded-xl hover:bg-background transition-all"
                          title="Add Stock"
                        >
                          <Plus size={16} className="text-emerald-600" />
                        </button>
                        <button 
                          onClick={() => setAdjustingStock({ id: item.id, type: 'remove', amount: 0 })}
                          className="p-2 bg-card border border-border rounded-xl hover:bg-background transition-all"
                          title="Remove Stock"
                        >
                          <X size={16} className="text-red-600" />
                        </button>
                      </div>
                    </div>
                    
                    {adjustingStock?.id === item.id && (
                      <div className="mt-4 p-3 bg-card rounded-xl border border-border flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-muted-foreground">
                            {adjustingStock.type === 'add' ? 'Add Qty' : 'Remove Qty'}:
                          </span>
                          <input
                            type="number"
                            className="w-20 p-1.5 rounded-lg border border-border text-sm focus:ring-2 focus:ring-primary outline-none"
                            value={adjustingStock.amount || ''}
                            onChange={e => setAdjustingStock({ ...adjustingStock, amount: Number(e.target.value) })}
                            autoFocus
                          />
                        </div>
                        
                        {adjustingStock.type === 'add' && (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-muted-foreground">Unit Price:</span>
                              <input
                                type="number"
                                step="0.01"
                                className="w-20 p-1.5 rounded-lg border border-border text-sm focus:ring-2 focus:ring-primary outline-none"
                                placeholder="Price"
                                value={adjustingStock.price || ''}
                                onChange={e => setAdjustingStock({ ...adjustingStock, price: Number(e.target.value) })}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-muted-foreground">Supplier:</span>
                              <select
                                className="flex-1 p-1.5 rounded-lg border border-border text-sm focus:ring-2 focus:ring-primary outline-none"
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
                                const currentCost = item.averageCost || item.costPerUnit || 0;
                                const newAmount = adjustingStock.amount;
                                const purchasePrice = Math.round((adjustingStock.price || 0) * 100);

                                let newStock = currentStock;
                                let newAverageCost = currentCost;

                                if (adjustingStock.type === 'add') {
                                  newStock = currentStock + newAmount;
                                  if (newStock > 0) {
                                    newAverageCost = Math.round(((currentStock * currentCost) + (newAmount * purchasePrice)) / newStock);
                                  } else {
                                    newAverageCost = purchasePrice;
                                  }
                                  
                                  if (purchasePrice > 0) {
                                    const supplier = vendors.find(v => v.id === adjustingStock.supplierId);
                                    await addDoc(collection(db, 'journal'), {
                                      type: 'expense',
                                      amount: newAmount * purchasePrice,
                                      description: `Inventory Purchase: ${item.name} (${newAmount} ${item.unit} @ ${formatCurrency(purchasePrice)})${supplier ? ` from ${supplier.name}` : ''}`,
                                      timestamp: serverTimestamp(),
                                      vendorId: adjustingStock.supplierId
                                    });
                                    
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
                                  newStock = currentStock - newAmount;
                                }

                                await updateDoc(doc(db, 'inventory', item.id), {
                                  stock: newStock,
                                  averageCost: newAverageCost,
                                  lastUpdated: serverTimestamp()
                                });
                                setAdjustingStock(null);
                              } catch (err) {
                                handleFirestoreError(err, OperationType.UPDATE, `inventory/${item.id}`);
                              }
                            }}
                            className="flex-1 bg-primary text-white py-2 rounded-lg text-xs font-bold shadow-sm"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setAdjustingStock(null)}
                            className="px-3 py-2 bg-background border border-border rounded-lg text-xs font-bold text-muted-foreground"
                          >
                            Cancel
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
    );
  };

  const renderAccountingTab = () => {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Reports & Analytics</h2>
              <p className="text-sm text-muted-foreground font-medium">View financial reports, cash flow, and POS summaries</p>
            </div>
            <div className="flex bg-muted p-1 rounded-2xl">
              <button onClick={() => setAccountingTab('reports')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${accountingTab === 'reports' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Reports</button>
              <button onClick={() => setAccountingTab('setup')} className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${accountingTab === 'setup' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Setup</button>
            </div>
          </div>
          {accountingTab === 'reports' && (
            <div className="flex items-center gap-1 bg-background p-1 rounded-2xl border border-border overflow-x-auto max-w-full">
              {([
                { id: 'dashboard', label: 'Overview' },
                { id: 'profit_loss', label: 'P&L' },
                { id: 'balance_sheet', label: 'Balance Sheet' },
                { id: 'cash_flow', label: 'Cash Flow' },
                { id: 'equity', label: 'Equity' },
                { id: 'trial_balance', label: 'Trial Balance' },
                { id: 'general_ledger', label: 'General Ledger' },
                { id: 'sales_report', label: 'Sales' },
                { id: 'sales_by_category', label: 'Sales by Category' },
                { id: 'sales_by_item', label: 'Sales by Item' },
                { id: 'pos_summary', label: 'POS Summary' },
                { id: 'tax_report', label: 'Tax Report' },
                { id: 'waiter_performance', label: 'Waiter Performance' },
                { id: 'inventory_report', label: 'Inventory' },
                { id: 'raw_material_consumption', label: 'Raw Materials' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAccountingSubTab(tab.id)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all whitespace-nowrap ${
                    accountingSubTab === tab.id
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {accountingTab === 'setup' ? (
          <div className="space-y-8">
            <div className="flex bg-muted p-1.5 rounded-2xl w-fit">
              <button onClick={() => setSetupSubTab('ledger')} className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${setupSubTab === 'ledger' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Ledger Groups</button>
              <button onClick={() => setSetupSubTab('subsidiaries')} className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${setupSubTab === 'subsidiaries' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Subsidiaries</button>
              <button onClick={() => setSetupSubTab('classes')} className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${setupSubTab === 'classes' ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Classes</button>
            </div>

          {setupSubTab === 'ledger' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Ledger Group Form */}
              <div className="lg:col-span-1 bg-card p-8 rounded-[2.5rem] border border-border shadow-sm space-y-6">
                <h3 className="text-xl font-black text-foreground tracking-tight">Add Ledger Group</h3>
                <div className="space-y-4">
                  <SettingsField label="Name" value={newLedgerGroup.name} onChange={(e: any) => setNewLedgerGroup({ ...newLedgerGroup, name: e.target.value })} />
                  <SettingsField label="Code" value={newLedgerGroup.code} onChange={(e: any) => setNewLedgerGroup({ ...newLedgerGroup, code: e.target.value })} />
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Type</label>
                    <select className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" value={newLedgerGroup.type} onChange={(e) => setNewLedgerGroup({ ...newLedgerGroup, type: e.target.value as any })}>
                      <option value="Asset">Asset</option>
                      <option value="Liability">Liability</option>
                      <option value="Equity">Equity</option>
                      <option value="Revenue">Revenue</option>
                      <option value="Expense">Expense</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Parent Group</label>
                    <select className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" value={newLedgerGroup.parentGroupId} onChange={(e) => setNewLedgerGroup({ ...newLedgerGroup, parentGroupId: e.target.value })}>
                      <option value="">None (Top Level)</option>
                      {ledgerGroups.filter(g => !g.isAccount).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-2xl cursor-pointer hover:bg-muted transition-colors">
                    <input type="checkbox" checked={newLedgerGroup.isAccount} onChange={(e) => setNewLedgerGroup({ ...newLedgerGroup, isAccount: e.target.checked })} className="w-5 h-5 rounded border-border text-primary focus:ring-primary" />
                    <span className="text-sm font-bold text-foreground">Is this an Account?</span>
                  </label>
                  <button onClick={handleAddLedgerGroup} className="w-full bg-primary text-white p-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Add Ledger Group</button>
                </div>
              </div>

              {/* Ledger Tree View */}
              <div className="lg:col-span-2 bg-card p-8 rounded-[2.5rem] border border-border shadow-sm overflow-hidden">
                <h3 className="text-xl font-black text-foreground tracking-tight mb-6">Chart of Accounts</h3>
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                  {ledgerGroups.filter(g => !g.parentGroupId).map(group => (
                    <div key={group.id} className="space-y-2">
                      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50 group hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${group.isAccount ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                            {group.isAccount ? <Book size={18} /> : <Grid size={18} />}
                          </div>
                          <div>
                            <p className="text-sm font-black text-foreground">{group.name}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{group.code} • {group.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingLedgerGroupId(group.id); setEditLedgerGroupForm(group); }} className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => handleDeleteLedgerGroup(group.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      {/* Subgroups/Accounts */}
                      <div className="ml-8 space-y-2 border-l-2 border-muted pl-4">
                        {ledgerGroups.filter(g => g.parentGroupId === group.id).map(sub => (
                          <div key={sub.id} className="flex items-center justify-between p-3 bg-muted/10 rounded-xl border border-border/30 group hover:border-primary/20 transition-all">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${sub.isAccount ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                                {sub.isAccount ? <Book size={14} /> : <Grid size={14} />}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-foreground">{sub.name}</p>
                                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{sub.code}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingLedgerGroupId(sub.id); setEditLedgerGroupForm(sub); }} className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeleteLedgerGroup(sub.id)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : setupSubTab === 'subsidiaries' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-card p-8 rounded-[2.5rem] border border-border shadow-sm space-y-6">
                <h3 className="text-xl font-black text-foreground tracking-tight">Add Subsidiary</h3>
                <div className="space-y-4">
                  <SettingsField label="Name" placeholder="e.g., Dubai Branch" value={newSetupName} onChange={(e: any) => setNewSetupName(e.target.value)} />
                  <button 
                    onClick={async () => {
                      if (!newSetupName) return;
                      await addDoc(collection(db, 'subsidiaries'), { name: newSetupName, createdAt: serverTimestamp() });
                      setNewSetupName('');
                    }}
                    className="w-full bg-primary text-white p-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Add Subsidiary
                  </button>
                </div>
              </div>
              <div className="bg-card p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-xl font-black text-foreground tracking-tight mb-6">Active Subsidiaries</h3>
                <div className="space-y-3">
                  {subsidiaries.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50 group hover:border-primary/30 transition-all">
                      <span className="font-bold text-foreground">{s.name}</span>
                      <button onClick={() => deleteDoc(doc(db, 'subsidiaries', s.id))} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-card p-8 rounded-[2.5rem] border border-border shadow-sm space-y-6">
                <h3 className="text-xl font-black text-foreground tracking-tight">Add Class</h3>
                <div className="space-y-4">
                  <SettingsField label="Name" placeholder="e.g., Marketing Dept" value={newSetupName} onChange={(e: any) => setNewSetupName(e.target.value)} />
                  <button 
                    onClick={async () => {
                      if (!newSetupName) return;
                      await addDoc(collection(db, 'classes'), { name: newSetupName, createdAt: serverTimestamp() });
                      setNewSetupName('');
                    }}
                    className="w-full bg-primary text-white p-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    Add Class
                  </button>
                </div>
              </div>
              <div className="bg-card p-8 rounded-[2.5rem] border border-border shadow-sm">
                <h3 className="text-xl font-black text-foreground tracking-tight mb-6">Active Classes</h3>
                <div className="space-y-3">
                  {classes.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/50 group hover:border-primary/30 transition-all">
                      <span className="font-bold text-foreground">{c.name}</span>
                      <button onClick={() => deleteDoc(doc(db, 'classes', c.id))} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex-1">
            <h4 className="text-xs font-black text-primary uppercase tracking-widest">Operational Hub</h4>
            <p className="text-[10px] text-primary/60 font-bold uppercase mt-0.5">Automated EOD Reconciliation & Z-Reports</p>
          </div>
          <button 
            onClick={async () => {
              const today = new Date().toISOString().split('T')[0];
              const todayOrders = orders.filter(o => {
                const orderDate = o.createdAt?.toDate ? o.createdAt.toDate().toISOString().split('T')[0] : '';
                return orderDate === today && ['paid', 'finalized'].includes(o.status);
              });

              // Enhanced Data Check: Orders vs Ledger
              const ledgerSales = journalEntries.filter(e => {
                const isToday = e.date === today;
                const isRevenue = e.lines?.some((l: any) => l.credit > 0 && (l.accountName.toLowerCase().includes('sales') || l.accountName.toLowerCase().includes('revenue')));
                return isToday && isRevenue;
              }).reduce((sum, e) => sum + e.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0), 0);

              const orderTotal = todayOrders.reduce((sum, o) => sum + o.total, 0);
              const discrepancy = Math.abs(orderTotal - ledgerSales);

              if (todayOrders.length === 0) {
                alert('No sales recorded today to generate a report.');
                return;
              }

              const sales = todayOrders.reduce((acc, o) => {
                acc.total += (o.total || 0);
                if (o.payments && o.payments.length > 0) {
                  o.payments.forEach((p: any) => {
                    acc.cash += (p.cashAmount || 0);
                    acc.card += (p.cardAmount || 0);
                    acc.online += (p.onlineAmount || 0);
                    if (p.method === 'open bill') acc.openBill += (p.amount || 0);
                  });
                } else {
                  // Fallback for orders without itemized payments
                  if (o.paymentMethod === 'cash') acc.cash += (o.total || 0);
                  else if (o.paymentMethod === 'card') acc.card += (o.total || 0);
                  else if (o.paymentMethod === 'online') acc.online += (o.total || 0);
                  else if (o.paymentMethod === 'open bill') acc.openBill += (o.total || 0);
                }
                return acc;
              }, { total: 0, cash: 0, card: 0, online: 0, openBill: 0 });

              const reportData = {
                date: today,
                totalSales: sales.total,
                ledgerSales,
                discrepancy,
                cashSales: sales.cash,
                cardSales: sales.card,
                onlineSales: sales.online,
                openBillSales: sales.openBill,
                totalOrders: todayOrders.length,
                generatedBy: user?.email || 'System',
                createdAt: serverTimestamp()
              };

              try {
                await addDoc(collection(db, 'zreports'), reportData);
                alert(`Z-Report generated successfully!\n\nOrder Total: ${formatCurrency(sales.total)}\nLedger Sync: ${formatCurrency(ledgerSales)}\nDiscrepancy: ${formatCurrency(discrepancy)}\nOrders: ${todayOrders.length}`);
              } catch (err) {
                handleFirestoreError(err, OperationType.CREATE, 'zreports');
              }
            }}
            className="px-6 py-3 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
          >
            Run Daily Z-Report
          </button>

        {accountingSubTab === 'dashboard' ? (
          <div className="space-y-6">
            {showAddTransaction && (
          <div className="fixed inset-0 bg-card border border-border/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-card rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Record Transaction</h3>
                <button onClick={() => setShowAddTransaction(false)} className="p-2 hover:bg-background rounded-full transition-colors">
                  <X size={20} className="text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Type</label>
                  <select 
                    className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                    value={newTransaction.type}
                    onChange={e => setNewTransaction({...newTransaction, type: e.target.value as any})}
                  >
                    <option value="expense">Expense</option>
                    <option value="sale">Sale (Manual)</option>
                    <option value="wastage">Wastage</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Amount</label>
                  <input 
                    type="number" 
                    className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                    value={newTransaction.amount}
                    onChange={e => setNewTransaction({...newTransaction, amount: e.target.value as any})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Description</label>
                  <textarea 
                    className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
                    value={newTransaction.description}
                    onChange={e => setNewTransaction({...newTransaction, description: e.target.value})}
                    placeholder="e.g. Utility bill, Supplier payment..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subsidiary</label>
                    <select 
                      className="w-full p-3 bg-background border border-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                      value={newTransaction.subsidiaryId}
                      onChange={e => setNewTransaction({...newTransaction, subsidiaryId: e.target.value})}
                    >
                      <option value="">None</option>
                      {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Class</label>
                    <select 
                      className="w-full p-3 bg-background border border-border rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary outline-none"
                      value={newTransaction.classId}
                      onChange={e => setNewTransaction({...newTransaction, classId: e.target.value})}
                    >
                      <option value="">None</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveTab('inventory')}
                  className="w-full bg-primary/10 hover:bg-primary/20 text-primary font-bold py-4 rounded-xl transition-all"
                >
                  Manage Inventory
                </button>
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
          <div className="p-6 border-b bg-background/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <BookOpen size={18} className="text-muted-foreground" />
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

        <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden">
          <div className="p-6 border-b bg-background/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <History size={18} className="text-muted-foreground" />
              Transaction Journal
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search journal..."
                  className="pl-9 pr-4 py-2 bg-card border border-border rounded-xl text-xs focus:ring-2 focus:ring-primary outline-none w-48"
                  value={accountingSearch}
                  onChange={e => setAccountingSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  className="p-2 bg-card border border-border rounded-xl text-[10px] font-bold outline-none"
                  value={accountingDateRange.start}
                  onChange={e => setAccountingDateRange({...accountingDateRange, start: e.target.value})}
                />
                <span className="text-muted-foreground">-</span>
                <input 
                  type="date" 
                  className="p-2 bg-card border border-border rounded-xl text-[10px] font-bold outline-none"
                  value={accountingDateRange.end}
                  onChange={e => setAccountingDateRange({...accountingDateRange, end: e.target.value})}
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase tracking-widest">
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
                    <tr className="hover:bg-background/50 transition-all group">
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {entry.date}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-foreground">
                        <div className="flex flex-col">
                          <span>{entry.description}</span>
                          <span className="text-[10px] text-muted-foreground font-medium">Ref: {entry.reference}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                          entry.lines.some((l: any) => l.credit > 0 && (l.accountName.toLowerCase().includes('sales') || l.accountName.toLowerCase().includes('revenue'))) 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-red-500/20 text-red-400'
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
                          className="p-2 hover:bg-background rounded-lg transition-colors text-muted-foreground hover:text-primary"
                        >
                          {expandedJournalId === entry.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                    {expandedJournalId === entry.id && (
                      <tr className="bg-background/50">
                        <td colSpan={5} className="px-12 py-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Transaction Details</h4>
                              <span className="text-[10px] font-bold text-muted-foreground">ID: {entry.id}</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Method</p>
                                <p className="text-sm font-bold text-foreground">{entry.paymentMethod || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Reference</p>
                                <p className="text-sm font-bold text-foreground">{entry.reference || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Account</p>
                                <p className="text-sm font-bold text-foreground">{entry.accountId || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Recorded By</p>
                                <p className="text-sm font-bold text-foreground">{entry.recordedBy || 'System'}</p>
                              </div>
                            </div>
                            {entry.lines && (
                              <div className="mt-4 border-t border-border pt-4">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Ledger Impact</p>
                                <div className="space-y-1">
                                  {entry.lines.map((line: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs font-medium py-1">
                                      <span className="text-muted-foreground">{line.accountName}</span>
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
        bills={bills}
        categories={categories}
        ledgerGroups={ledgerGroups}
        formatCurrency={formatCurrency}
        exportToExcel={exportToExcel}
        systemSettings={systemSettings}
      />
    )}
  </div>
  )}
</div>
    );
  };

  const renderFinanceTab = () => {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Finance & Accounting</h2>
            <p className="text-sm text-muted-foreground font-medium">Manage your journal entries, vouchers, bills, and taxes</p>
          </div>
          <div className="flex items-center gap-2 bg-background p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar">
            {(['journal', 'vouchers', 'bills', 'expenses', 'banking', 'taxes'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFinanceSubTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  financeSubTab === tab 
                    ? 'bg-card text-primary shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder={`Search ${financeSubTab}...`}
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none w-full shadow-sm"
              value={accountingSearch}
              onChange={e => setAccountingSearch(e.target.value)}
            />
          </div>
        </div>

        {financeSubTab === 'journal' ? (
          <div className="space-y-6">
            {isAddingJournalEntry && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-4xl p-8 animate-in zoom-in-95 overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">New Journal Entry</h3>
                    <button onClick={() => setIsAddingJournalEntry(false)} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent transition-colors">
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
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Date</label>
                        <input 
                          type="date" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={journalEntryForm.date}
                          onChange={e => setJournalEntryForm({...journalEntryForm, date: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Reference</label>
                        <input 
                          type="text" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={journalEntryForm.reference}
                          onChange={e => setJournalEntryForm({...journalEntryForm, reference: e.target.value})}
                          placeholder="e.g. JV-001"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Description</label>
                        <input 
                          type="text" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={journalEntryForm.description}
                          onChange={e => setJournalEntryForm({...journalEntryForm, description: e.target.value})}
                          placeholder="Entry description..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subsidiary</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={journalEntryForm.subsidiaryId}
                          onChange={e => setJournalEntryForm({...journalEntryForm, subsidiaryId: e.target.value})}
                        >
                          <option value="">Select Subsidiary</option>
                          {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Class</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={journalEntryForm.classId}
                          onChange={e => setJournalEntryForm({...journalEntryForm, classId: e.target.value})}
                        >
                          <option value="">Select Class</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {journalClasses.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Predefined Classes</label>
                        <div className="flex flex-wrap gap-2">
                          {journalClasses.map(cls => (
                            <button
                              key={cls.id}
                              disabled={isSubmitting}
                              onClick={() => {
                                const current = journalEntryForm.classes || [];
                                if (current.includes(cls.id)) {
                                  setJournalEntryForm({...journalEntryForm, classes: current.filter(id => id !== cls.id)});
                                } else {
                                  setJournalEntryForm({...journalEntryForm, classes: [...current, cls.id]});
                                }
                              }}
                              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                                (journalEntryForm.classes || []).includes(cls.id) 
                                  ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' 
                                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
                              }`}
                            >
                              {cls.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">Entry Lines</h4>
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
                        <div className="grid grid-cols-12 gap-4 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          <div className="col-span-6">Account</div>
                          <div className="col-span-2 text-right">Debit</div>
                          <div className="col-span-2 text-right">Credit</div>
                          <div className="col-span-2"></div>
                        </div>
                        {journalEntryForm.lines.map((line, index) => (
                          <div key={index} className="grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-6">
                              <select 
                                className="w-full p-3 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
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
                                className="w-full p-3 bg-background border border-border rounded-xl text-sm font-bold text-right focus:ring-2 focus:ring-primary outline-none"
                                value={line.debit}
                                onChange={e => {
                                  const newLines = [...journalEntryForm.lines];
                                  newLines[index] = { ...line, debit: e.target.value as any, credit: 0 };
                                  setJournalEntryForm({ ...journalEntryForm, lines: newLines });
                                }}
                              />
                            </div>
                            <div className="col-span-2">
                              <input 
                                type="number" 
                                className="w-full p-3 bg-background border border-border rounded-xl text-sm font-bold text-right focus:ring-2 focus:ring-primary outline-none"
                                value={line.credit}
                                onChange={e => {
                                  const newLines = [...journalEntryForm.lines];
                                  newLines[index] = { ...line, credit: e.target.value as any, debit: 0 };
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
                      <div className="grid grid-cols-12 gap-4 px-4 pt-4 border-t border-border">
                        <div className="col-span-6 text-sm font-bold text-foreground">Total</div>
                        <div className="col-span-2 text-right text-sm font-black text-foreground">
                          {formatCurrency(journalEntryForm.lines.reduce((sum, line) => sum + line.debit, 0))}
                        </div>
                        <div className="col-span-2 text-right text-sm font-black text-foreground">
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
              <h3 className="text-lg font-bold text-foreground">Journal Entries</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => exportToExcel(journalEntries, 'Journal_Entries')}
                  className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-4 py-2 rounded-xl text-xs font-bold hover:bg-background transition-all"
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

            <div className="bg-card border border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-background text-xs font-bold text-foreground uppercase tracking-wider border-b border-border">
                      <th className="px-4 py-3 border-r border-border w-32">Date</th>
                      <th className="px-4 py-3 border-r border-border">Account & Description</th>
                      <th className="px-4 py-3 border-r border-border w-48">Reference</th>
                      <th className="px-4 py-3 border-r border-border text-right w-32">Debit</th>
                      <th className="px-4 py-3 text-right w-32">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {journalEntries
                      .filter(entry => 
                        entry.description?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                        entry.reference?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                        entry.lines.some((l: any) => l.accountName?.toLowerCase().includes(accountingSearch.toLowerCase()))
                      )
                      .map(entry => (
                        <React.Fragment key={entry.id}>
                        {entry.lines.map((line: any, idx: number) => (
                          <tr key={`${entry.id}-${idx}`} className="hover:bg-background transition-colors">
                            {idx === 0 ? (
                              <td className="px-4 py-3 text-sm text-foreground border-r border-border align-top" rowSpan={entry.lines.length}>
                                <div className="font-medium">{entry.date}</div>
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-sm border-r border-border">
                              <div className={line.credit > 0 ? "pl-8 text-muted-foreground" : "font-medium text-foreground"}>
                                {line.accountName}
                              </div>
                              {idx === entry.lines.length - 1 && entry.description && (
                                <div className="text-xs text-muted-foreground italic mt-2">({entry.description})</div>
                              )}
                            </td>
                            {idx === 0 ? (
                              <td className="px-4 py-3 text-sm text-muted-foreground border-r border-border align-top" rowSpan={entry.lines.length}>
                                {entry.reference}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-sm font-medium text-right border-r border-border text-foreground">
                              {line.debit > 0 ? formatCurrency(line.debit) : ''}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-right text-foreground">
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
                <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">New Voucher</h3>
                    <button onClick={() => setIsAddingVoucher(false)} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Type</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={voucherForm.type}
                          onChange={e => setVoucherForm({...voucherForm, type: e.target.value})}
                        >
                          <option value="receipt">Receipt</option>
                          <option value="payment">Payment</option>
                          <option value="cash_receipt">Cash Receipt</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Date</label>
                        <input 
                          type="date" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={voucherForm.date}
                          onChange={e => setVoucherForm({...voucherForm, date: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Amount</label>
                      <input 
                        type="number" 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                        value={voucherForm.amount}
                        onChange={e => setVoucherForm({...voucherForm, amount: e.target.value as any})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Payment Method</label>
                      <select 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
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
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Description</label>
                      <textarea 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
                        value={voucherForm.description}
                        onChange={e => setVoucherForm({...voucherForm, description: e.target.value})}
                        placeholder="Voucher description..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subsidiary</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={voucherForm.subsidiaryId}
                          onChange={e => setVoucherForm({...voucherForm, subsidiaryId: e.target.value})}
                        >
                          <option value="">Select Subsidiary</option>
                          {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Class</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={voucherForm.classId}
                          onChange={e => setVoucherForm({...voucherForm, classId: e.target.value})}
                        >
                          <option value="">Select Class</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
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
              <h3 className="text-lg font-bold text-foreground">Vouchers</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => exportToExcel(vouchers, 'Vouchers')}
                  className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-4 py-2 rounded-xl text-xs font-bold hover:bg-background transition-all"
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
            <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {vouchers
                    .filter(v => 
                      v.description?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                      v.type?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                      v.paymentMethod?.toLowerCase().includes(accountingSearch.toLowerCase())
                    )
                    .map(v => (
                      <tr key={v.id} className="hover:bg-background/50 transition-all">
                      <td className="px-6 py-4 text-sm text-muted-foreground">{v.date}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-background text-foreground">
                          {v.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-foreground">{v.description}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{v.paymentMethod}</td>
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
                <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">New Bill</h3>
                    <button onClick={() => setIsAddingBill(false)} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Vendor</label>
                      <select 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
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
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Items / Purchases</label>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {billForm.items.map((item, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-2 bg-background p-3 rounded-xl border border-border">
                            <span className="text-xs font-bold flex-1 truncate min-w-[120px]">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                className="w-16 p-2 bg-card border border-border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary"
                                value={item.quantity || ''}
                                placeholder="Qty"
                                onChange={(e) => {
                                  const newItems = [...billForm.items];
                                  newItems[idx].quantity = e.target.value as any;
                                  const newTotal = newItems.reduce((sum, i) => sum + ((parseFloat(i.price as any) || 0) * (parseFloat(i.quantity as any) || 0)), 0);
                                  setBillForm({...billForm, items: newItems, amount: newTotal});
                                }}
                              />
                              <span className="text-muted-foreground font-bold text-[10px]">x</span>
                              <input 
                                type="number" 
                                className="w-20 p-2 bg-card border border-border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary"
                                value={item.price || ''}
                                placeholder="Price"
                                onChange={(e) => {
                                  const newItems = [...billForm.items];
                                  newItems[idx].price = e.target.value as any;
                                  const newTotal = newItems.reduce((sum, i) => sum + ((parseFloat(i.price as any) || 0) * (parseFloat(i.quantity as any) || 0)), 0);
                                  setBillForm({...billForm, items: newItems, amount: newTotal});
                                }}
                              />
                              <span className="text-[10px] text-muted-foreground font-bold ml-1 min-w-[50px]">
                                = {formatCurrency((parseFloat(item.price as any) || 0) * (parseFloat(item.quantity as any) || 0) * 100)}
                             </span>
                              <button 
                                onClick={() => {
                                  const newItems = [...billForm.items];
                                  newItems.splice(idx, 1);
                                  const newTotal = newItems.reduce((sum, i) => sum + ((parseFloat(i.price as any) || 0) * (parseFloat(i.quantity as any) || 0)), 0);
                                  setBillForm({...billForm, items: newItems, amount: newTotal});
                                }}
                                className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg ml-1 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-dashed border-border">
                        <select 
                          className="w-full p-3 bg-background border border-border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
                          onChange={(e) => {
                            const inv = inventory.find(i => i.id === e.target.value);
                            if (inv) {
                              const newItem = { inventoryItemId: inv.id, name: inv.name, quantity: 1, price: (inv.averageCost || inv.costPerUnit || 0) / 100 };
                              const newItems = [...billForm.items, newItem];
                              const newTotal = newItems.reduce((sum, i) => sum + ((parseFloat(i.price as any) || 0) * (parseFloat(i.quantity as any) || 0)), 0);
                              setBillForm({...billForm, items: newItems, amount: newTotal});
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">+ Add Item to Bill...</option>
                          {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subsidiary</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={billForm.subsidiaryId}
                          onChange={e => setBillForm({...billForm, subsidiaryId: e.target.value})}
                        >
                          <option value="">Select Subsidiary</option>
                          {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Class</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={billForm.classId}
                          onChange={e => setBillForm({...billForm, classId: e.target.value})}
                        >
                          <option value="">Select Class</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Total Amount</label>
                        <input 
                          type="number" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={billForm.amount}
                          onChange={e => setBillForm({...billForm, amount: e.target.value as any})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Due Date</label>
                        <input 
                          type="date" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={billForm.dueDate}
                          onChange={e => setBillForm({...billForm, dueDate: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Status</label>
                      <select 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                        value={billForm.status}
                        onChange={e => setBillForm({...billForm, status: e.target.value})}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Description</label>
                      <textarea 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
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
                <h3 className="text-lg font-bold text-foreground">Bills & Payables</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => exportToExcel(bills, 'Bills')}
                    className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-4 py-2 rounded-xl text-xs font-bold hover:bg-background transition-all"
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
              <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      <th className="px-6 py-4">Due Date</th>
                      <th className="px-6 py-4">Vendor</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {bills
                      .filter(b => 
                        b.description?.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                        vendors.find(v => v.id === b.vendorId)?.name.toLowerCase().includes(accountingSearch.toLowerCase())
                      )
                      .map(b => (
                        <React.Fragment key={b.id}>
                          <tr 
                            onClick={() => setExpandedBillId(expandedBillId === b.id ? null : b.id)}
                            className={`transition-all cursor-pointer ${expandedBillId === b.id ? 'bg-background' : 'hover:bg-background/50'}`}
                          >
                            <td className="px-6 py-4 text-sm text-muted-foreground flex items-center gap-2">
                              {expandedBillId === b.id ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                              {b.dueDate}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-foreground">
                              {vendors.find(v => v.id === b.vendorId)?.name || 'Unknown Vendor'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                                b.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                              }`}>
                                {b.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-right">{formatCurrency(b.amount)}</td>
                          </tr>
                          {expandedBillId === b.id && (
                             <tr className="bg-background/50 border-b border-border">
                               <td colSpan={4} className="p-6">
                                  <div className="grid grid-cols-2 gap-6 bg-card rounded-2xl p-6 border border-border/60 shadow-sm animate-in zoom-in-95 duration-200">
                                     <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                          <ShoppingBag size={14} /> Purchased Items
                                        </h4>
                                        <div className="bg-background rounded-xl border border-border p-2 space-y-1">
                                          {b.items?.map((item, iIdx) => (
                                            <div key={iIdx} className="flex flex-wrap justify-between items-center text-xs p-2 hover:bg-card rounded-lg transition-colors">
                                              <span className="font-bold text-foreground truncate max-w-[150px]">{item.name}</span>
                                              <span className="text-muted-foreground font-medium">
                                                {item.quantity} x {formatCurrency(item.price)} = <span className="font-black text-foreground ml-1">{formatCurrency(item.quantity * item.price)}</span>
                                              </span>
                                            </div>
                                          ))}
                                          {(!b.items || b.items.length === 0) && (
                                            <div className="p-4 text-center text-xs text-muted-foreground italic">No items listed.</div>
                                          )}
                                        </div>
                                        {b.description && (
                                          <div className="mt-4 p-4 bg-background rounded-xl border border-border">
                                            <p className="text-[11px] font-bold uppercase text-muted-foreground mb-1">Description</p>
                                            <p className="text-xs text-muted-foreground font-medium">{b.description}</p>
                                          </div>
                                        )}
                                     </div>
                                     <div className="space-y-4">
                                        <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                                          <BookOpen size={14} /> Associated Journal Entry
                                        </h4>
                                         {(() => {
                                          const matchingJournal = journalEntries.find(j => j.reference === `BILL-${b.id.slice(-6).toUpperCase()}`);
                                          if (matchingJournal) {
                                            return (
                                              <div className="bg-background rounded-xl border border-border overflow-hidden shadow-sm">
                                                <div className="flex justify-between items-center p-3 border-b border-border/50 bg-muted/50">
                                                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{matchingJournal.reference}</span>
                                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{matchingJournal.date}</span>
                                                </div>
                                                <div className="p-2 space-y-1">
                                                  {matchingJournal.lines?.map((line, lIdx) => (
                                                    <div key={lIdx} className="grid grid-cols-12 gap-2 text-[11px] p-2 hover:bg-card rounded-lg transition-colors">
                                                      <span className="col-span-6 font-bold text-foreground truncate">{line.accountName}</span>
                                                      <span className={`col-span-3 text-right font-black ${line.debit > 0 ? 'text-emerald-600' : 'text-zinc-300'}`}>
                                                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                                      </span>
                                                      <span className={`col-span-3 text-right font-black ${line.credit > 0 ? 'text-rose-500' : 'text-zinc-300'}`}>
                                                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )
                                          }
                                          return <div className="bg-background rounded-xl border border-dashed border-border py-8 text-center text-[11px] font-bold text-muted-foreground">No linked journal found.</div>
                                        })()}
                                        {b.status !== 'paid' && (
                                          <div className="mt-4 flex justify-end">
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                  // Update bill to paid
                                                  await updateDoc(doc(db, 'bills', b.id), {
                                                    status: 'paid',
                                                    amountPaid: b.totalAmount || b.amount || 0,
                                                    paidAt: serverTimestamp()
                                                  });
                                                  
                                                  // If it has a purchase order linked, we might want to update it, but here it's mainly bills
                                                  const poId = b.poId;
                                                  if (poId) {
                                                    // In our updated purchasing flow we might not need this if PO is 'received'
                                                    // But just in case
                                                  }

                                                  // We also need to record a journal entry for the payment
                                                  await addDoc(collection(db, 'journal_entries'), {
                                                    date: new Date().toISOString().split('T')[0],
                                                    reference: `PAY-${b.id.slice(-6).toUpperCase()}`,
                                                    description: `Payment for Bill ${b.invoiceNumber || b.id.slice(-6).toUpperCase()}`,
                                                    timestamp: serverTimestamp(),
                                                    lines: [
                                                      { accountId: '2101', accountName: 'Accounts Payable', debit: Math.round((b.totalAmount || b.amount || 0) * 100), credit: 0 },
                                                      { accountId: '1101', accountName: 'Cash on Hand', debit: 0, credit: Math.round((b.totalAmount || b.amount || 0) * 100) }
                                                    ]
                                                  });
                                                } catch (err) {
                                                  console.error("Error settling bill:", err);
                                                  alert("Failed to settle bill.");
                                                }
                                              }}
                                              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                                            >
                                              Settle Payment
                                            </button>
                                          </div>
                                        )}
                                     </div>
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
            <div className="space-y-6">
              {isAddingVendor && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">New Vendor</h3>
                      <button onClick={() => setIsAddingVendor(false)} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent transition-colors">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Name</label>
                        <input 
                          type="text" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={vendorForm.name}
                          onChange={e => setVendorForm({...vendorForm, name: e.target.value})}
                          placeholder="Vendor Name"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Phone</label>
                        <input 
                          type="text" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={vendorForm.phone}
                          onChange={e => setVendorForm({...vendorForm, phone: e.target.value})}
                          placeholder="Phone Number"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Email</label>
                        <input 
                          type="email" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={vendorForm.email}
                          onChange={e => setVendorForm({...vendorForm, email: e.target.value})}
                          placeholder="Email Address"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Address</label>
                        <textarea 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-24"
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
                <h3 className="text-lg font-bold text-foreground">Vendors</h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => exportToExcel(vendors, 'Vendors')}
                    className="p-2 bg-card border border-border text-muted-foreground rounded-xl hover:bg-background transition-all"
                  >
                    <Download size={16} />
                  </button>
                  <button 
                    onClick={() => setIsAddingVendor(true)}
                    className="p-2 bg-background text-muted-foreground rounded-xl hover:bg-accent transition-all"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {vendors
                  .filter(v => 
                    v.name.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                    v.phone.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                    v.email?.toLowerCase().includes(accountingSearch.toLowerCase())
                  )
                  .map(v => (
                    <div key={v.id} className="p-4 bg-card border border-border rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.phone}</p>
                    </div>
                    <button className="p-2 text-muted-foreground hover:text-primary transition-colors">
                      <ArrowRightLeft size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : financeSubTab === 'expenses' ? (
          renderExpensesSubTab()
        ) : financeSubTab === 'banking' ? (
          <div className="space-y-8">
            {/* Z-Report Section */}
            <div className="p-8 bg-zinc-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] -mr-32 -mt-32" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                    <History size={24} className="text-primary" /> End of Day (Z-Report)
                  </h3>
                  <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mt-2">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <button className="hidden">
                  Generate EOD Report
                </button>
              </div>
            </div>
            {isAddingCheque && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">Record Cheque</h3>
                    <button onClick={() => setIsAddingCheque(false)} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Cheque Number</label>
                      <input 
                        type="text" 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                        value={chequeForm.chequeNumber}
                        onChange={e => setChequeForm({...chequeForm, chequeNumber: e.target.value})}
                        placeholder="e.g. 100234"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Bank Name</label>
                      <input 
                        type="text" 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                        value={chequeForm.bank}
                        onChange={e => setChequeForm({...chequeForm, bank: e.target.value})}
                        placeholder="e.g. Chase Bank"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Amount</label>
                        <input 
                          type="number" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.amount}
                          onChange={e => setChequeForm({...chequeForm, amount: e.target.value as any})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Date</label>
                        <input 
                          type="date" 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.date}
                          onChange={e => setChequeForm({...chequeForm, date: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Status</label>
                      <select 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                        value={chequeForm.status}
                        onChange={e => setChequeForm({...chequeForm, status: e.target.value})}
                      >
                        <option value="pending">Pending</option>
                        <option value="cleared">Cleared</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subsidiary</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.subsidiaryId}
                          onChange={e => setChequeForm({...chequeForm, subsidiaryId: e.target.value})}
                        >
                          <option value="">Select Subsidiary</option>
                          {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Class</label>
                        <select 
                          className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                          value={chequeForm.classId}
                          onChange={e => setChequeForm({...chequeForm, classId: e.target.value})}
                        >
                          <option value="">Select Class</option>
                          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Vendor (Optional)</label>
                      <select 
                        className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
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
                  <h3 className="text-lg font-bold text-foreground">Cheques</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => exportToExcel(cheques, 'Cheques')}
                      className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-4 py-2 rounded-xl text-xs font-bold hover:bg-background transition-all"
                    >
                      <Download size={14} /> Export
                    </button>
                    <button 
                      onClick={() => setIsAddingCheque(true)}
                      className="flex items-center gap-2 bg-card border border-border text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-muted-foreground transition-all"
                    >
                      <Plus size={14} /> Record Cheque
                    </button>
                  </div>
                </div>
                <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        <th className="px-6 py-4">No.</th>
                        <th className="px-6 py-4">Bank</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {cheques
                        .filter(c => 
                          c.chequeNumber.toLowerCase().includes(accountingSearch.toLowerCase()) ||
                          c.bank.toLowerCase().includes(accountingSearch.toLowerCase())
                        )
                        .map(c => (
                          <tr key={c.id} className="hover:bg-background/50 transition-all">
                          <td className="px-6 py-4 text-sm font-bold text-foreground">{c.chequeNumber}</td>
                          <td className="px-6 py-4 text-sm text-muted-foreground">{c.bank}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase bg-background text-foreground">
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
                  <h3 className="text-lg font-bold text-foreground">Fund Transfers</h3>
                  <button 
                    onClick={() => setIsAddingTransfer(true)}
                    className="flex items-center gap-2 bg-card border border-border text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-muted-foreground transition-all"
                  >
                    <Plus size={14} /> New Transfer
                  </button>
                </div>

                {isAddingTransfer && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">New Transfer</h3>
                        <button onClick={() => setIsAddingTransfer(false)} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent transition-colors">
                          <X size={20} />
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">From</label>
                            <select 
                              className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                              value={transferForm.fromAccount}
                              onChange={e => setTransferForm({...transferForm, fromAccount: e.target.value})}
                            >
                              <option value="cash">Cash</option>
                              <option value="bank">Bank</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">To</label>
                            <select 
                              className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                              value={transferForm.toAccount}
                              onChange={e => setTransferForm({...transferForm, toAccount: e.target.value})}
                            >
                              <option value="bank">Bank</option>
                              <option value="cash">Cash</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Amount</label>
                          <input 
                            type="number" 
                            className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                            value={transferForm.amount || ''}
                            onChange={e => setTransferForm({...transferForm, amount: e.target.value as any})}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Reference (Optional)</label>
                          <input 
                            type="text" 
                            className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
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
                    <div className="bg-card rounded-2xl border border-border overflow-hidden">
                      {journalEntries.filter(j => j.description.includes('Fund Transfer')).map((entry, idx) => (
                        <div key={idx} className="p-4 border-b border-zinc-50 last:border-0 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-foreground">{entry.description}</p>
                            <p className="text-[10px] text-muted-foreground">{entry.date} • {entry.reference}</p>
                          </div>
                          <p className="text-sm font-black text-foreground">{formatCurrency(entry.lines[0].debit)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-background rounded-[2rem] border border-dashed border-border text-center">
                      <p className="text-sm text-muted-foreground italic">No recent transfers recorded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : financeSubTab === 'taxes' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-8 bg-card border border-border rounded-[2.5rem] text-white">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Total Tax Payable</p>
                <h3 className="text-4xl font-black">
                  {formatCurrency(journal.reduce((acc, curr) => acc + (curr.amount * ((systemSettings?.taxRate || 0) / 100)), 0))}
                </h3>
                <p className="text-xs text-muted-foreground mt-4">Estimated at {systemSettings?.taxRate || 0}% VAT</p>
              </div>
              {/* More tax cards */}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderOrdersTab = () => {
    const stats = getStats();
    return (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Bar */}
              <div className="p-6 bg-muted/50 border-b border-border flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground">Order Filters</h3>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => exportToExcel(orders, 'Orders')}
                      className="flex items-center gap-2 bg-white border border-border text-muted-foreground px-4 py-2 rounded-xl text-xs font-bold hover:bg-muted/30 transition-all"
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
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <select
                    value={orderFilters.status}
                    onChange={(e) => setOrderFilters({ ...orderFilters, status: e.target.value })}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
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
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
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
                      className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                    <input
                      type="date"
                      value={orderFilters.toDate}
                      onChange={(e) => setOrderFilters({ ...orderFilters, toDate: e.target.value })}
                      className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Customer Name..."
                    value={orderFilters.customer}
                    onChange={(e) => setOrderFilters({ ...orderFilters, customer: e.target.value })}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Customer Phone..."
                    value={orderFilters.phone}
                    onChange={(e) => setOrderFilters({ ...orderFilters, phone: e.target.value })}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Table Number..."
                    value={orderFilters.table}
                    onChange={(e) => setOrderFilters({ ...orderFilters, table: e.target.value })}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  />
                  <select
                    value={orderFilters.payment}
                    onChange={(e) => setOrderFilters({ ...orderFilters, payment: e.target.value })}
                    className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="">All Payments</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>

              {/* Statistics Bar */}
              <div className="px-6 py-3 bg-card border border-border flex items-center gap-2 overflow-x-auto scrollbar-hide">
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
                    <p className="text-muted-foreground/80 font-bold uppercase text-xs tracking-widest">No matching orders found</p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div key={order.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-all">
                      <div 
                        className="grid grid-cols-1 lg:grid-cols-12 cursor-pointer hover:bg-muted/30/50 transition-colors"
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      >
                        {/* Left Info */}
                        <div className="lg:col-span-3 p-6 border-r border-border space-y-4">
                          <div className="space-y-1">
                            <div className="bg-card border border-border text-white text-[10px] font-black px-2 py-0.5 rounded inline-block uppercase">{order.store || 'Main Store'}</div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${order.orderType === 'dine-in' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {order.orderType}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground/80 uppercase">Order No</p>
                              <p className="text-sm font-black text-foreground">{order.orderNo ? `#${order.orderNo}` : order.id.slice(-6).toUpperCase()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground/80 uppercase">KOT No</p>
                              <p className="text-sm font-black text-foreground">{order.kotNo ? `#${order.kotNo}` : 'N/A'}</p>
                            </div>
                            {order.orderType === 'dine-in' && (
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground/80 uppercase">Table</p>
                                <p className="text-sm font-black text-foreground">{order.tableNumber || 'N/A'}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Customer Info */}
                        <div className="lg:col-span-3 p-6 border-r border-border">
                          <p className="text-[10px] font-bold text-muted-foreground/80 uppercase mb-2">Customer</p>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                              <User size={20} className="text-muted-foreground/80" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-foreground">{order.customerName || 'Guest'}</p>
                              <p className="text-xs text-muted-foreground">{order.customerPhone || order.address?.phone || 'No phone'}</p>
                            </div>
                          </div>
                        </div>

                        {/* Date Info */}
                        <div className="lg:col-span-2 p-6 border-r border-border space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-muted-foreground/80 uppercase mb-1">Order date/time</p>
                            <div className="flex items-center gap-2 text-foreground">
                              <Calendar size={14} className="text-muted-foreground/80" />
                              <span className="text-xs font-bold">{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'Processing...'}</span>
                            </div>
                          </div>
                          {order.invoicedAt && (
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground/80 uppercase mb-1">Invoiced Date</p>
                              <div className="flex items-center gap-2 text-foreground">
                                <Calendar size={14} className="text-muted-foreground/80" />
                                <span className="text-xs font-bold">{order.invoicedAt?.toDate ? order.invoicedAt.toDate().toLocaleString() : 'N/A'}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Status */}
                        <div className="lg:col-span-2 p-6 border-r border-border flex flex-col justify-center items-center gap-2">
                          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>
                            <CheckCircle2 size={14} />
                            {order.status}
                          </div>
                          {order.orderType === 'delivery' && (
                            <>
                              <p className="text-[10px] font-bold text-muted-foreground/80">Delivered by</p>
                              <p className="text-xs font-black text-blue-600">{order.waiter || 'Unassigned'}</p>
                            </>
                          )}
                          {order.orderType === 'dine-in' && order.waiter && (
                            <>
                              <p className="text-[10px] font-bold text-muted-foreground/80">Waiter</p>
                              <p className="text-xs font-black text-blue-600">{order.waiter}</p>
                            </>
                          )}
                        </div>

                          {/* Amount & Actions */}
                          <div className="lg:col-span-2 p-6 bg-muted/30 flex flex-col justify-between gap-4">
                            <div className="space-y-2">
                              <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">Payment Method</p>
                                  <p className="text-xs font-black text-foreground uppercase">
                                    {order.paymentMethod === 'multi' ? 'Multi-Payment' : (order.paymentMethod || 'N/A')}
                                  </p>
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
                                      <div key={pIdx} className="space-y-0.5">
                                        <div className="flex justify-between items-center bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                                          <span className="text-[10px] font-bold text-emerald-600 uppercase">{p.method}</span>
                                          <span className="text-xs font-black text-emerald-600">{formatCurrency(p.amount)}</span>
                                        </div>
                                        {p.method === 'multi' && (
                                          <div className="pl-4 text-[9px] font-bold text-muted-foreground/70 uppercase">
                                            {p.cashAmount > 0 && <div>Cash: {formatCurrency(p.cashAmount)}</div>}
                                            {p.cardAmount > 0 && <div>Card: {formatCurrency(p.cardAmount)}</div>}
                                            {p.onlineAmount > 0 && <div>Online: {formatCurrency(p.onlineAmount)}</div>}
                                          </div>
                                        )}
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
    );
  };

  const renderSettingsTab = () => {
    const handleSaveSettings = async () => {
      try {
        await setDoc(doc(db, 'settings', 'system'), {
          ...(systemSettings || {}),
          updatedAt: serverTimestamp()
        }, { merge: true });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'settings/system');
      }
    };

    return (
      <div className="space-y-8 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">System Settings</h2>
            <p className="text-sm text-muted-foreground font-medium">Configure restaurant identity, taxes, and operations</p>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="flex items-center gap-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-200">
                <CheckCircle2 size={16} /> Saved!
              </span>
            )}
            <button onClick={handleSaveSettings} className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold hover:scale-105 transition-all shadow-lg shadow-primary/20">
              <Save size={16} /> Save Settings
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Store Identity */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-5">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <Building size={16} className="text-primary" /> Store Identity
            </h3>
            <SettingsField label="Restaurant Name" value={systemSettings?.restaurantName} onChange={(e: any) => setSystemSettings({...systemSettings, restaurantName: e.target.value})} placeholder="e.g. Rivas Fine Dining" />
            <SettingsField label="Tagline / Subtitle" value={systemSettings?.tagline} onChange={(e: any) => setSystemSettings({...systemSettings, tagline: e.target.value})} placeholder="e.g. Mediterranean Cuisine" />
            <SettingsField label="Business Registration No." value={systemSettings?.businessReg} onChange={(e: any) => setSystemSettings({...systemSettings, businessReg: e.target.value})} />
            <SettingsField label="Logo URL" value={systemSettings?.logoUrl} onChange={(e: any) => setSystemSettings({...systemSettings, logoUrl: e.target.value})} placeholder="https://..." />
          </div>

          {/* Contact & Location */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-5">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <Phone size={16} className="text-primary" /> Contact & Location
            </h3>
            <SettingsField label="Phone Number" type="tel" value={systemSettings?.phone} onChange={(e: any) => setSystemSettings({...systemSettings, phone: e.target.value})} />
            <SettingsField label="Email Address" type="email" value={systemSettings?.email} onChange={(e: any) => setSystemSettings({...systemSettings, email: e.target.value})} />
            <SettingsField label="Address Line 1" value={systemSettings?.address1} onChange={(e: any) => setSystemSettings({...systemSettings, address1: e.target.value})} />
            <SettingsField label="City / Country" value={systemSettings?.city} onChange={(e: any) => setSystemSettings({...systemSettings, city: e.target.value})} />
          </div>

          {/* Tax & Currency */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-5">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <Percent size={16} className="text-primary" /> Tax & Currency
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <SettingsField label="Tax Rate (%)" type="number" value={systemSettings?.taxRate} onChange={(e: any) => setSystemSettings({...systemSettings, taxRate: parseFloat(e.target.value)})} placeholder="e.g. 5" />
              <SettingsField label="Service Charge (%)" type="number" value={systemSettings?.serviceCharge} onChange={(e: any) => setSystemSettings({...systemSettings, serviceCharge: parseFloat(e.target.value)})} placeholder="e.g. 10" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Currency</label>
              <select className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" value={systemSettings?.currency || 'AED'} onChange={e => setSystemSettings({...systemSettings, currency: e.target.value})}>
                <option value="AED">AED – UAE Dirham</option>
                <option value="USD">USD – US Dollar</option>
                <option value="EUR">EUR – Euro</option>
                <option value="GBP">GBP – British Pound</option>
                <option value="SAR">SAR – Saudi Riyal</option>
                <option value="QAR">QAR – Qatari Riyal</option>
                <option value="KWD">KWD – Kuwaiti Dinar</option>
                <option value="BHD">BHD – Bahraini Dinar</option>
                <option value="OMR">OMR – Omani Rial</option>
              </select>
            </div>
            <div className="flex items-center gap-3 p-4 bg-background rounded-2xl border border-border">
              <label className="flex items-center gap-3 cursor-pointer flex-1">
                <span className="text-sm font-bold text-foreground">Enable VAT / Tax on Bills</span>
                <div className="ml-auto">
                  <input type="checkbox" className="w-5 h-5 accent-primary" checked={systemSettings?.taxEnabled || false} onChange={e => setSystemSettings({...systemSettings, taxEnabled: e.target.checked})} />
                </div>
              </label>
            </div>
          </div>

          {/* Operations */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-5">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <Settings size={16} className="text-primary" /> Operations
            </h3>
            <div className="space-y-3">
              {[
                { key: 'enableDelivery', label: 'Enable Delivery Orders' },
                { key: 'enableTakeaway', label: 'Enable Takeaway Orders' },
                { key: 'enableOnlineOrdering', label: 'Enable Online Ordering (Storefront)' },
                { key: 'enableKitchenDisplay', label: 'Enable Kitchen Display System (KDS)' },
                { key: 'enableLoyalty', label: 'Enable Customer Loyalty Points' },
                { key: 'requireTableForDineIn', label: 'Require Table Number for Dine-In' },
              ].map(opt => (
                <div key={opt.key} className="flex items-center justify-between p-3 bg-background rounded-2xl border border-border">
                  <span className="text-sm font-bold text-foreground">{opt.label}</span>
                  <input type="checkbox" className="w-5 h-5 accent-primary" checked={systemSettings?.[opt.key] || false} onChange={e => setSystemSettings({...systemSettings, [opt.key]: e.target.checked})} />
                </div>
              ))}
            </div>
          </div>

          {/* Receipt Customization */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-5">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText size={16} className="text-primary" /> Receipt / Bill Settings
            </h3>
            <SettingsField label="Receipt Header Note" value={systemSettings?.receiptHeader} onChange={(e: any) => setSystemSettings({...systemSettings, receiptHeader: e.target.value})} placeholder="e.g. Thank you for dining with us!" />
            <SettingsField label="Receipt Footer Note" value={systemSettings?.receiptFooter} onChange={(e: any) => setSystemSettings({...systemSettings, receiptFooter: e.target.value})} placeholder="e.g. All prices include VAT" />
            <SettingsField label="WiFi Password (printed on receipt)" value={systemSettings?.wifiPassword} onChange={(e: any) => setSystemSettings({...systemSettings, wifiPassword: e.target.value})} />
            <div className="pt-4 border-t border-border mt-4">
              <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-3">Hardware Integration</h4>
              <SettingsField 
                label="Multi Print Server URLs (comma separated)" 
                value={systemSettings?.printServerUrls} 
                onChange={(e: any) => setSystemSettings({...systemSettings, printServerUrls: e.target.value})} 
                placeholder="e.g. http://localhost:5000, http://192.168.1.50:5000" 
              />
              <p className="text-[9px] text-muted-foreground font-medium mt-1 leading-relaxed">
                Provide full URLs to your Rivas Print Server instances. KOTs and bills will be sent to all configured servers.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 bg-background rounded-2xl border border-border">
              <span className="text-sm font-bold text-foreground">Auto-print KOT on Order Confirm</span>
              <input type="checkbox" className="w-5 h-5 accent-primary" checked={systemSettings?.autoPrintKOT || false} onChange={e => setSystemSettings({...systemSettings, autoPrintKOT: e.target.checked})} />
            </div>
          </div>
        </div>

        {/* Global Branding & Theming */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backend Theme Section */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-6">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <Monitor size={16} className="text-primary" /> Backend / Admin Theme
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase font-bold">Configure how the management console appears for staff</p>
            
            <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border">
              <span className="text-sm font-bold text-foreground">Dark Mode Appearance</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={systemSettings?.backEndTheme?.darkMode !== false}
                  onChange={e => setSystemSettings({...systemSettings, backEndTheme: { ...systemSettings?.backEndTheme, darkMode: e.target.checked }})}
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-muted-foreground uppercase ml-1">Primary Backend Color (Hex)</p>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={systemSettings?.backEndTheme?.primaryColor || '#0ea5e9'}
                  onChange={e => setSystemSettings({...systemSettings, backEndTheme: { ...systemSettings?.backEndTheme, primaryColor: e.target.value }})}
                  className="w-14 h-14 rounded-2xl bg-background border border-border cursor-pointer overflow-hidden p-0 shadow-sm"
                />
                <input
                  type="text"
                  value={systemSettings?.backEndTheme?.primaryColor || '#0ea5e9'}
                  onChange={e => setSystemSettings({...systemSettings, backEndTheme: { ...systemSettings?.backEndTheme, primaryColor: e.target.value }})}
                  className="flex-1 p-4 bg-background border border-border rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-primary outline-none uppercase"
                  placeholder="#0EA5E9"
                />
              </div>
            </div>
          </div>

          {/* Storefront Theme Section */}
          <div className="p-8 bg-card border border-border rounded-[2.5rem] shadow-sm space-y-6">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider flex items-center gap-2">
              <Monitor size={16} className="text-primary" /> Storefront / Customer Theme
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase font-bold">Manage the look and feel of your public digital menu</p>

            <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border">
              <span className="text-sm font-bold text-foreground">Dark Mode Appearance</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={systemSettings?.theme?.darkMode || false}
                  onChange={e => setSystemSettings({...systemSettings, theme: { ...systemSettings?.theme, darkMode: e.target.checked }})}
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-muted-foreground uppercase ml-1">Primary Storefront Color (Hex)</p>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={systemSettings?.theme?.primaryColor || '#0ea5e9'}
                  onChange={e => setSystemSettings({...systemSettings, theme: { ...systemSettings?.theme, primaryColor: e.target.value }})}
                  className="w-14 h-14 rounded-2xl bg-background border border-border cursor-pointer overflow-hidden p-0 shadow-sm"
                />
                <input
                  type="text"
                  value={systemSettings?.theme?.primaryColor || '#0ea5e9'}
                  onChange={e => setSystemSettings({...systemSettings, theme: { ...systemSettings?.theme, primaryColor: e.target.value }})}
                  className="flex-1 p-4 bg-background border border-border rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-primary outline-none uppercase"
                  placeholder="#0EA5E9"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-8 bg-red-950/30 border border-red-800/40 rounded-[2.5rem] space-y-5 lg:col-span-2">
            <h3 className="text-sm font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
              <Ban size={16} /> Danger Zone
            </h3>
            <p className="text-xs text-red-400 font-medium">These actions are irreversible. Proceed with caution.</p>
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
            >
              Reset All Data
            </button>
          </div>
        </div>
      </div>
    );
  };


  const renderMenuTab = () => {
    const searchLower = (menuSearch || '').toLowerCase();
    const filteredItems = items.filter(item =>
      (!menuSearch || item.name.toLowerCase().includes(searchLower) || item.description?.toLowerCase().includes(searchLower)) &&
      (!selectedCategory || item.category === selectedCategory)
    );

    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice((menuPage - 1) * ITEMS_PER_PAGE, menuPage * ITEMS_PER_PAGE);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Menu Management</h2>
            <p className="text-sm text-muted-foreground font-medium">{items.length} items across {categories.length} categories</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-background p-1 rounded-2xl border border-border">
              <button onClick={() => downloadTemplate('menu')} className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-muted-foreground hover:bg-card rounded-xl transition-all">
                <Download size={13} /> Template
              </button>
              <label className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-primary hover:bg-card rounded-xl transition-all cursor-pointer">
                <Upload size={13} /> Import
                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && handleBulkImport('menu', e.target.files[0])} />
              </label>
            </div>
            <button onClick={() => setIsManageCategoriesOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border text-muted-foreground rounded-2xl text-xs font-bold hover:bg-accent transition-all">
              <LayoutGrid size={14} /> Categories
            </button>
            <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-2xl text-xs font-bold hover:scale-105 transition-transform shadow-lg shadow-primary/20">
              <Plus size={16} /> Add Item
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search menu items..." value={menuSearch || ''} onChange={e => { setMenuSearch(e.target.value); setMenuPage(1); }}
              className="w-full pl-11 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => { setSelectedCategory(''); setMenuPage(1); }} className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${ !selectedCategory ? 'bg-primary text-white shadow-lg' : 'bg-card border border-border text-muted-foreground hover:bg-accent'}` }>
              All
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => { setSelectedCategory(cat.id); setMenuPage(1); }} className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${ selectedCategory === cat.id ? 'bg-primary text-white shadow-lg' : 'bg-card border border-border text-muted-foreground hover:bg-accent'}`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Add Item Form */}
        {isAdding && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Add Menu Item</h3>
                <button onClick={() => setIsAdding(false)} className="p-2 bg-background text-muted-foreground rounded-full"><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <input type="text" placeholder="Item Name" value={newForm.name || ''} onChange={e => setNewForm({...newForm, name: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Price" value={newForm.price || ''} onChange={e => setNewForm({...newForm, price: e.target.value as any})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none" />
                  <select value={newForm.category || ''} onChange={e => setNewForm({...newForm, category: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <textarea placeholder="Description" value={newForm.description || ''} onChange={e => setNewForm({...newForm, description: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none h-24 resize-none" />
                <input type="text" placeholder="Image URL or Drive ID" value={newForm.image || ''} onChange={e => setNewForm({...newForm, image: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none" />
                <button onClick={handleAddItem} className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">Add to Menu</button>
              </div>
            </div>
          </div>
        )}

        {/* Menu Grid */}
        {filteredItems.length === 0 ? (
          <div className="text-center py-20">
            <Utensils size={48} className="text-zinc-200 mx-auto mb-4" />
            <p className="text-muted-foreground font-bold">No menu items found</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedItems.map(item => (
                <div key={item.id} className="bg-card rounded-3xl border border-border overflow-hidden hover:shadow-lg transition-all group">
                {item.image && (
                  <div className="h-36 bg-muted overflow-hidden">
                    <img src={formatImageUrl(item.image)} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                )}
                <div className="p-4">
                  {editingId === item.id ? (
                    <div className="space-y-3">
                      <input type="text" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none font-bold" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="number" value={editForm.price || ''} onChange={e => setEditForm({...editForm, price: e.target.value as any})} className="w-full p-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" />
                        <select value={editForm.category || ''} onChange={e => setEditForm({...editForm, category: e.target.value})} className="w-full p-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none">
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <textarea value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full p-2.5 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none h-16 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={() => handleSave(item.id)} className="flex-1 bg-primary text-white py-2 rounded-xl text-xs font-bold"><Save size={14} className="inline mr-1" />Save</button>
                        <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-background border border-border text-muted-foreground rounded-xl text-xs font-bold">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-black text-foreground text-sm truncate">{item.name}</h4>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{categories.find(c => c.id === item.category)?.name || 'Uncategorized'}</p>
                        </div>
                        <span className="text-sm font-black text-primary ml-2 shrink-0">{formatCurrency(item.price)}</span>
                      </div>
                      {item.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3">{item.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => handleToggleAvailable(item)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${ item.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {item.available ? 'Available' : 'Unavailable'}
                        </button>
                        <div className="ml-auto flex gap-1.5">
                          <button onClick={() => setManagingRecipeId(item.id)} className="p-2 text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-all" title="Manage Recipe"><ChefHat size={15} /></button>
                          <button onClick={() => handleEdit(item)} className="p-2 text-muted-foreground bg-background hover:bg-accent rounded-xl transition-all"><Edit2 size={15} /></button>
                          <button onClick={() => handleDelete(item.id)} className="p-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-all"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t border-border mt-6">
              <button 
                onClick={() => setMenuPage(p => Math.max(1, p - 1))} 
                disabled={menuPage === 1}
                className="px-6 py-2.5 bg-card border border-border rounded-xl text-xs font-bold text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-muted-foreground">Page {menuPage} of {totalPages}</span>
              </div>
              <button 
                onClick={() => setMenuPage(p => Math.min(totalPages, p + 1))} 
                disabled={menuPage === totalPages}
                className="px-6 py-2.5 bg-card border border-border rounded-xl text-xs font-bold text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>
        )}

        {/* Delete Confirmation */}
        {deletingItemId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-sm p-8 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4"><Trash2 size={28} /></div>
              <h3 className="text-xl font-bold text-foreground mb-2">Delete this item?</h3>
              <p className="text-muted-foreground text-sm mb-6">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletingItemId(null)} className="flex-1 py-3 rounded-xl font-bold text-muted-foreground bg-background hover:bg-accent border border-border">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKitchenTab = () => {
    const kitchenOrders = orders.filter(o => ['awaiting-confirmation', 'confirmed', 'preparing', 'serving', 'done-serving', 'awaiting-bill'].includes(o.status));
    const getKitchenStatusColor = (status: string) => {
      switch (status) {
        case 'confirmed': return 'bg-amber-500';
        case 'preparing': return 'bg-orange-500';
        case 'serving': return 'bg-blue-500';
        case 'done-serving': return 'bg-purple-500';
        case 'awaiting-bill': return 'bg-pink-500';
        default: return 'bg-zinc-400';
      }
    };
    const getNextStatus = (status: string): Order['status'] | null => {
      switch (status) {
        case 'awaiting-confirmation': return 'confirmed';
        case 'confirmed': return 'preparing';
        case 'preparing': return 'serving';
        case 'serving': return 'done-serving';
        case 'done-serving': return 'awaiting-bill';
        default: return null;
      }
    };
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Kitchen Display System</h2>
            <p className="text-sm text-muted-foreground">{kitchenOrders.length} active orders</p>
          </div>
          <div className="flex gap-2 text-[10px] font-bold">
            {[{label: 'Confirmed', color: 'bg-amber-500'}, {label: 'Preparing', color: 'bg-orange-500'}, {label: 'Serving', color: 'bg-blue-500'}].map(s => (
              <span key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-xl uppercase">
                <span className={`w-2 h-2 rounded-full ${s.color}`} />{s.label}
              </span>
            ))}
          </div>
        </div>

        {kitchenOrders.length === 0 ? (
          <div className="text-center py-24 bg-card rounded-3xl border border-border">
            <ChefHat size={56} className="text-zinc-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-foreground">Kitchen is clear</h3>
            <p className="text-muted-foreground text-sm">No orders currently in preparation</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {kitchenOrders.map(order => {
              const nextStatus = getNextStatus(order.status);
              const elapsed = order.createdAt ? Math.floor((Date.now() - (order.createdAt.toDate ? order.createdAt.toDate().getTime() : order.createdAt.seconds * 1000)) / 60000) : 0;
              const isUrgent = elapsed > 15;
              return (
                <div key={order.id} className={`bg-card rounded-3xl border-2 flex flex-col overflow-hidden transition-all ${ isUrgent ? 'border-red-400 shadow-lg shadow-red-200' : 'border-border'}`}>
                  <div className={`${getKitchenStatusColor(order.status)} px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-2 text-white">
                      <span className="font-black text-sm">#{order.kotNo || order.id.slice(-4).toUpperCase()}</span>
                      {order.tableNumber && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-lg">Table {order.tableNumber}</span>}
                      {order.orderType && <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-lg uppercase">{order.orderType}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-1 text-white text-xs font-bold ${ isUrgent ? 'animate-pulse' : ''}`}>
                        <Clock size={12} />{elapsed}m
                      </div>
                      <button onClick={() => setMaximizedOrderId(order.id)} className="p-1 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors">
                        <Maximize2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 flex-1 space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4 py-2 border-b border-border last:border-0">
                        <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center overflow-hidden border border-border shrink-0">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Utensils size={14} className="text-zinc-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-primary">{item.quantity}x</span>
                            <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                          </div>
                          {item.notes && <p className="text-[10px] text-amber-600 font-medium mt-0.5 leading-tight">{item.notes}</p>}
                        </div>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                        <p className="text-xs text-amber-700 font-bold">{order.notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t border-border flex gap-2">
                    {nextStatus && (
                      <button onClick={() => updateOrderStatus(order.id, nextStatus)} className="flex-1 py-2.5 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-wider hover:scale-[1.02] transition-all shadow-sm">
                        {nextStatus.replace('-', ' ')}
                      </button>
                    )}
                    <button onClick={() => printKOT(order)} className="p-2.5 bg-background border border-border text-muted-foreground hover:text-foreground rounded-2xl transition-all" title="Reprint KOT">
                      <Printer size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderRecipesTab = () => {
    // Recipes logic to be moved here
    return <div>Recipes Content</div>;
  };
  
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={(tab) => setActiveTab(tab as any)} systemSettings={systemSettings} />;
      case 'crm':
        return <CRM systemSettings={systemSettings} />;
      case 'users':
        return <StaffSection staff={staff} stores={stores} terminals={terminals} />;
      case 'classes':
        return <ManagementSection title="Financial Classes" data={journalClasses} collectionName="journal_classes" icon={<Tag size={24} />} fields={[
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' }
        ]} />;
      case 'stores':
        return <ManagementSection title="Store Management" data={stores} collectionName="stores" icon={<Building size={24} />} fields={[
          { key: 'address', label: 'Address', type: 'text' },
          { key: 'contact', label: 'Contact Info', type: 'text' },
          { key: 'staff', label: 'Assigned Staff', type: 'text' }
        ]} />;
      case 'warehouses':
        return <ManagementSection title="Warehouse Management" data={warehouses} collectionName="warehouses" icon={<Warehouse size={24} />} fields={[
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'capacity', label: 'Capacity (Units)', type: 'number' },
          { key: 'staff', label: 'Assigned Staff', type: 'text' }
        ]} />;
      case 'mobile':
        return <ManagementSection title="Mobile Units" data={mobileUnits} collectionName="mobileUnits" icon={<Truck size={24} />} fields={[
          { key: 'vehicleType', label: 'Vehicle Type', type: 'text' },
          { key: 'capacity', label: 'Capacity', type: 'number' },
          { key: 'driver', label: 'Assigned Driver', type: 'text' }
        ]} />;
      case 'terminals':
        return <ManagementSection title="Terminals" data={terminals} collectionName="terminals" icon={<Monitor size={24} />} fields={[
          { key: 'storeId', label: 'Assigned Store', type: 'select', options: stores.map(s => ({ value: s.id, label: s.name })) },
          { key: 'location', label: 'Terminal Location (e.g. Counter 1)', type: 'text' },
          { key: 'cashier', label: 'Default Cashier', type: 'text' }
        ]} />;
      case 'wastage':
        return <WastageSection wastage={wastage} inventory={inventory} />;
      case 'recipes':
        return managingRecipeId ? (
          <RecipeManager 
            item={items.find(i => i.id === managingRecipeId)!} 
            inventory={inventory} 
            onClose={() => setManagingRecipeId(null)} 
            systemSettings={systemSettings}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-[2.5rem] border border-border shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Recipe Book</h2>
                <p className="text-sm text-muted-foreground font-medium">Select a menu item to define or modify its recipe</p>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input 
                  type="text" 
                  placeholder="Search dishes..."
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={recipeSearchTerm}
                  onChange={e => setRecipeSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {(() => {
                 const filteredRecipes = items.filter(i => i.name.toLowerCase().includes(recipeSearchTerm.toLowerCase()));
                 const totalPages = Math.ceil(filteredRecipes.length / 10);
                 const paginatedRecipes = filteredRecipes.slice((recipePage - 1) * 10, recipePage * 10);
                 return (
                   <>
                     {paginatedRecipes.map(item => (
                       <div key={item.id} onClick={() => setManagingRecipeId(item.id)} className="bg-card p-4 rounded-2xl border border-border cursor-pointer hover:border-primary hover:shadow-md transition-all group">
                         <div className="flex items-center gap-3">
                           {item.image ? (
                             <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover" />
                           ) : (
                             <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center">
                               <Utensils size={20} className="text-muted-foreground" />
                             </div>
                           )}
                           <div>
                             <h3 className="font-bold text-foreground text-sm group-hover:text-primary transition-colors line-clamp-1">{item.name}</h3>
                             <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.category}</p>
                           </div>
                         </div>
                       </div>
                     ))}
                     {totalPages > 1 && (
                       <div className="col-span-full flex items-center justify-center gap-4 mt-6">
                         <button
                           onClick={() => setRecipePage(p => Math.max(1, p - 1))}
                           disabled={recipePage === 1}
                           className="px-6 py-2 bg-card border border-border rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-muted transition-colors text-foreground"
                         >
                           Previous
                         </button>
                         <span className="text-xs font-black text-muted-foreground uppercase">Page {recipePage} of {totalPages}</span>
                         <button
                           onClick={() => setRecipePage(p => Math.min(totalPages, p + 1))}
                           disabled={recipePage === totalPages}
                           className="px-6 py-2 bg-card border border-border rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-muted transition-colors text-foreground"
                         >
                           Next
                         </button>
                       </div>
                     )}
                   </>
                 );
               })()}
            </div>
          </div>
        );
      case 'suppliers':
        return <SuppliersSection suppliers={vendors} bills={bills} />;
      case 'purchases':
        return <PurchasesSection suppliers={vendors} inventory={inventory} bills={bills} ledgerGroups={ledgerGroups} />;
      case 'delivery':
        return <DeliverySection drivers={drivers} searchQuery={deliverySearchQuery} setSearchQuery={setDeliverySearchQuery} />;
      case 'production':
        return <ProductionSection inventory={inventory} items={items} />;
      case 'inventory':
        return renderInventoryTab();
      case 'accounting':
        return renderAccountingTab();
      case 'finance':
        return renderFinanceTab();
      case 'orders':
        return renderOrdersTab();
      case 'stock_flow':
        return <StockLedgerSection />;
      case 'settings':
        return renderSettingsTab();
      case 'menu':
        return renderMenuTab();
      case 'kitchen':
        return renderKitchenTab();
      case 'tables':
        return <TableDesigner />;
      case 'reservations':
        return <ReservationsSection />;
      case 'hr':
        return <HRSection staff={staff} systemSettings={systemSettings} />;
      case 'promotions':
        return <PromotionsSection systemSettings={systemSettings} />;
      case 'feedback':
        return <FeedbackSection />;
      default:
        return <Dashboard onNavigate={(tab) => setActiveTab(tab as any)} />;
    }
  };

  const renderExpensesSubTab = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-card p-6 rounded-[2.5rem] border border-border">
          <div>
            <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Expense Tracker</h3>
            <p className="text-xs text-muted-foreground font-medium">Manage daily operational costs, utilities, and rent</p>
          </div>
          <button 
            onClick={() => {
              setNewTransaction({ type: 'expense', amount: 0, category: 'Utilities', description: '', date: new Date().toISOString().split('T')[0] });
              setShowAddTransaction(true);
            }}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> Record Expense
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-3xl p-6">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Utilities</p>
            <p className="text-2xl font-black text-foreground">{systemSettings?.currency || 'AED'} {journalEntries.filter(e => e.type === 'expense' && e.category === 'Utilities').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</p>
          </div>
          <div className="bg-card border border-border rounded-3xl p-6">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Rent & Maintenance</p>
            <p className="text-2xl font-black text-foreground">{systemSettings?.currency || 'AED'} {journalEntries.filter(e => e.type === 'expense' && e.category === 'Rent').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</p>
          </div>
          <div className="bg-card border border-border rounded-3xl p-6">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Supplies</p>
            <p className="text-2xl font-black text-foreground">{systemSettings?.currency || 'AED'} {journalEntries.filter(e => e.type === 'expense' && e.category === 'Supplies').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-[2.5rem] overflow-hidden">
          <div className="p-6 border-b border-border bg-background/50">
            <h4 className="font-black text-foreground uppercase text-xs tracking-wider">Recent Operational Expenses</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase">
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {journalEntries.filter(e => e.type === 'expense').length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm font-medium">No operational expenses recorded yet.</td>
                  </tr>
                ) : journalEntries.filter(e => e.type === 'expense').map(e => (
                  <tr key={e.id} className="hover:bg-background/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-muted-foreground">{new Date(e.timestamp?.toDate()).toLocaleDateString() || e.date}</td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black px-2 py-1 bg-muted text-foreground/80 rounded-lg uppercase">{e.category || 'General'}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{e.description}</td>
                    <td className="px-6 py-4 text-sm font-black text-red-600">{systemSettings?.currency || 'AED'} {e.amount.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-black text-[10px] uppercase">
                        <CheckCircle2 size={12} /> Reconciled
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };
  const handleSystemReset = async () => {
    setIsResetting(true);
    try {
      console.log('Starting system reset...');
      
      // 1. Clear Orders
      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      const orderDeletes = ordersSnapshot.docs.map(d => deleteDoc(doc(db, 'orders', d.id)));
      
      // 2. Clear Financial Data
      const journalSnapshot = await getDocs(collection(db, 'journal'));
      const journalDeletes = journalSnapshot.docs.map(d => deleteDoc(doc(db, 'journal', d.id)));
      
      const entriesSnapshot = await getDocs(collection(db, 'journal_entries'));
      const entryDeletes = entriesSnapshot.docs.map(d => deleteDoc(doc(db, 'journal_entries', d.id)));
      
      const billsSnapshot = await getDocs(collection(db, 'bills'));
      const billDeletes = billsSnapshot.docs.map(d => deleteDoc(doc(db, 'bills', d.id)));

      // 3. Clear Module Data
      const reservationsSnapshot = await getDocs(collection(db, 'reservations'));
      const reservationDeletes = reservationsSnapshot.docs.map(d => deleteDoc(doc(db, 'reservations', d.id)));

      const promotionsSnapshot = await getDocs(collection(db, 'promotions'));
      const promotionDeletes = promotionsSnapshot.docs.map(d => deleteDoc(doc(db, 'promotions', d.id)));

      const feedbackSnapshot = await getDocs(collection(db, 'feedback'));
      const feedbackDeletes = feedbackSnapshot.docs.map(d => deleteDoc(doc(db, 'feedback', d.id)));

      const shiftsSnapshot = await getDocs(collection(db, 'shifts'));
      const shiftDeletes = shiftsSnapshot.docs.map(d => deleteDoc(doc(db, 'shifts', d.id)));

      const payrollSnapshot = await getDocs(collection(db, 'payroll_runs'));
      const payrollDeletes = payrollSnapshot.docs.map(d => deleteDoc(doc(db, 'payroll_runs', d.id)));

      const wastageSnapshot = await getDocs(collection(db, 'wastage'));
      const wastageDeletes = wastageSnapshot.docs.map(d => deleteDoc(doc(db, 'wastage', d.id)));

      const productionSnapshot = await getDocs(collection(db, 'production'));
      const productionDeletes = productionSnapshot.docs.map(d => deleteDoc(doc(db, 'production', d.id)));

      const notificationsSnapshot = await getDocs(collection(db, 'notifications'));
      const notificationDeletes = notificationsSnapshot.docs.map(d => deleteDoc(doc(db, 'notifications', d.id)));

      const poSnapshot = await getDocs(collection(db, 'purchase_orders'));
      const poDeletes = poSnapshot.docs.map(d => deleteDoc(doc(db, 'purchase_orders', d.id)));

      const stockMovementsSnapshot = await getDocs(collection(db, 'stock_movements'));
      const stockMovementsDeletes = stockMovementsSnapshot.docs.map(d => deleteDoc(doc(db, 'stock_movements', d.id)));

      // Execute all deletes
      await Promise.all([
        ...orderDeletes, 
        ...journalDeletes, 
        ...entryDeletes, 
        ...billDeletes, 
        ...reservationDeletes,
        ...promotionDeletes,
        ...feedbackDeletes,
        ...shiftDeletes,
        ...payrollDeletes,
        ...wastageDeletes, 
        ...productionDeletes,
        ...notificationDeletes,
        ...poDeletes,
        ...stockMovementsDeletes
      ]);

      // 6. Reset Inventory Stock and Cost
      const inventorySnapshot = await getDocs(collection(db, 'inventory'));
      console.log(`Resetting ${inventorySnapshot.size} inventory items...`);
      const inventoryUpdates = inventorySnapshot.docs.map(d => 
        updateDoc(doc(db, 'inventory', d.id), {
          stock: 0,
          costPerUnit: 0,
          averageCost: 0,
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
      alert('System successfully reset to factory settings.');
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

  const isDeveloper = user?.email === 'ashkan.yaghtin@gmail.com';
  // PROTOTYPE POLICY: Anonymous (Guest) is the primary Restaurant Admin. 
  // Regular Email sign-in (non-developer) is treated as a Customer.
  const isAdmin = user?.isAnonymous || profile?.role === 'admin' || isDeveloper;
  const userRole = isAdmin ? 'admin' : (profile?.role || 'waiter');

  const canAccess = (tab: string) => {
    // Feature Toggles (Global override)
    if (tab === 'kitchen' && systemSettings?.enableKitchenDisplay === false) return false;
    if (tab === 'crm' && systemSettings?.enableLoyalty === false) return false;

    // Full Admin Bypass
    if (isAdmin) return true;
    
    // Check for granular permissions in the user profile
    if (profile?.permissions) {
      if (profile.permissions[tab] === true) return true;
    }

    // Default Role-Based Fallbacks for basic modules
    switch (tab) {
      case 'dashboard':
      case 'orders':
      case 'tables':
      case 'pos':
        return ['manager', 'chef', 'driver', 'waiter'].includes(userRole);
      case 'kitchen':
      case 'inventory':
      case 'stock_flow':
      case 'menu':
        return ['manager', 'chef'].includes(userRole);
      case 'delivery':
        return ['driver', 'manager'].includes(userRole);
      default:
        return false;
    }
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [maximizedOrderId, setMaximizedOrderId] = useState<string | null>(null);
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
    lowStockThreshold: 10,
    category: 'raw_material'
  });
  const [adjustingStock, setAdjustingStock] = useState<{ id: string, type: 'add' | 'remove', amount: number, price?: number, supplierId?: string } | null>(null);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [editInventoryForm, setEditInventoryForm] = useState<Partial<InventoryItem>>({});
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<'all' | 'raw_material' | 'finished_good'>('all');

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
  const [systemSettings, setSystemSettings] = useState<any>({});
  const [journalClasses, setJournalClasses] = useState<any[]>([]);

  // Accounting Modals
  const [isAddingVoucher, setIsAddingVoucher] = useState(false);
  const [isAddingBill, setIsAddingBill] = useState(false);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
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
  
  const [voucherForm, setVoucherForm] = useState({ type: 'receipt', amount: 0, description: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'cash', subsidiaryId: '', classId: '' });
  const [billForm, setBillForm] = useState({ 
    vendorId: '', 
    amount: 0, 
    dueDate: new Date().toISOString().split('T')[0], 
    description: '', 
    status: 'unpaid',
    subsidiaryId: '',
    classId: '',
    items: [] as { inventoryItemId: string, name: string, quantity: number, price: number }[]
  });
  const [chequeForm, setChequeForm] = useState({ chequeNumber: '', bank: '', amount: 0, date: new Date().toISOString().split('T')[0], status: 'pending', vendorId: '', subsidiaryId: '', classId: '' });
  const [vendorForm, setVendorForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [journalEntryForm, setJournalEntryForm] = useState({
    date: new Date().toISOString().split('T')[0],
    reference: '',
    description: '',
    subsidiaryId: '',
    classId: '',
    classes: [] as string[],
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
    const q = query(collection(db, 'journal_classes'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJournalClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journal_classes'));
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
      if (snapshot.empty && isDeveloper) {
        initializeDefaultCOA();
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'ledgerGroups'));

    const unsubSubsidiaries = onSnapshot(collection(db, 'subsidiaries'), (snapshot) => {
      setSubsidiaries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'subsidiaries'));

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'classes'));
    
    return () => {
      unsubLedgerGroups();
      unsubSubsidiaries();
      unsubClasses();
    };
  }, [user, isDeveloper]);

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
    description: '',
    subsidiaryId: '',
    classId: ''
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
        subsidiaryId: newTransaction.subsidiaryId,
        classId: newTransaction.classId,
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
        subsidiaryId: voucherForm.subsidiaryId,
        classId: voucherForm.classId,
        timestamp: serverTimestamp(),
        lines: [
          { accountId: debitAccount, accountName: debitName, debit: voucherData.amount, credit: 0 },
          { accountId: creditAccount, accountName: creditName, debit: 0, credit: voucherData.amount }
        ]
      });

      setIsAddingVoucher(false);
      setVoucherForm({ type: 'receipt', amount: 0, description: '', date: new Date().toISOString().split('T')[0], paymentMethod: 'cash', subsidiaryId: '', classId: '' });
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
          const newQty = parseFloat(item.quantity.toString()) || 0;
          const newPrice = Math.round((parseFloat(item.price.toString()) || 0) * 100);
          
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
        subsidiaryId: billForm.subsidiaryId,
        classId: billForm.classId,
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
        subsidiaryId: '',
        classId: '',
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
      setChequeForm({ chequeNumber: '', bank: '', amount: 0, date: new Date().toISOString().split('T')[0], status: 'pending', vendorId: '', subsidiaryId: '', classId: '' });
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
        classes: [],
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
            const costCents = Math.round((Number(row.CostPerUnit) || 0) * 100);
            await addDoc(collection(db, 'inventory'), {
              name: row.Name,
              stock: row.Stock || 0,
              unit: row.Unit || 'pcs',
              costPerUnit: costCents,
              averageCost: costCents,
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
      const originalItem = inventory.find(i => i.id === id);
      const { id: _, ...dataToUpdate } = editInventoryForm;
      const newCostCents = Math.round((dataToUpdate.costPerUnit || 0) * 100);
      
      const oldStock = originalItem?.stock || 0;
      const newStock = dataToUpdate.stock || 0;
      const variance = newStock - oldStock;

      await updateDoc(itemRef, {
        ...dataToUpdate,
        costPerUnit: newCostCents,
        averageCost: newCostCents
      });

      // Log difference as Stock Adjustment
      if (variance !== 0) {
        const adjustmentCost = Math.abs(variance) * (originalItem?.averageCost || newCostCents || 0);
        const type = variance > 0 ? 'income' : 'expense'; // Gain vs Shrinkage
        const description = `Stock Assessment: ${variance > 0 ? 'Gain' : 'Shrinkage'} of ${Math.abs(variance)} ${originalItem?.unit} for ${originalItem?.name}`;
        
        await addDoc(collection(db, 'journal'), {
          type,
          amount: adjustmentCost,
          description,
          timestamp: serverTimestamp()
        });

        // Record stock movement
        await addDoc(collection(db, 'stock_movements'), {
          inventoryItemId: id,
          itemName: originalItem?.name || 'Unknown',
          type: 'adjustment',
          quantityChange: variance,
          stockAfter: newStock,
          reference: `Manual Adjustment: ${variance > 0 ? 'Found' : 'Lost'} stock`,
          timestamp: serverTimestamp()
        });

        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ADJ-${Date.now().toString().slice(-6)}`,
          description,
          timestamp: serverTimestamp(),
          lines: [
            { accountId: '1105', accountName: 'Inventory', debit: variance > 0 ? adjustmentCost : 0, credit: variance < 0 ? adjustmentCost : 0 },
            { accountId: variance > 0 ? '4102' : '5102', accountName: variance > 0 ? 'Other Incomes' : 'Inventory Shrinkage', debit: variance < 0 ? adjustmentCost : 0, credit: variance > 0 ? adjustmentCost : 0 }
          ]
        });
      }

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

      let onlineAmount = 0;

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
      } else if (paymentMethod === 'online') {
        onlineAmount = amountToPay;
      }

      const currentPayments = settlingOrder.payments || [];
      const newPayment = {
        method: paymentMethod,
        amount: amountToPay,
        timestamp: new Date().toISOString(),
        cashAmount: cashAmount,
        cardAmount: cardAmount,
        onlineAmount: onlineAmount || 0
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
        ...(cashAmount > 0 ? [{ accountId: '1101', accountName: 'Cash on Hand', debit: cashAmount, credit: 0 }] : []),
        ...(cardAmount > 0 ? [{ accountId: '1102', accountName: 'Bank Accounts', debit: cardAmount, credit: 0 }] : []),
        ...(onlineAmount > 0 ? [{ accountId: '1102', accountName: 'Bank Accounts (Online Delivery)', debit: onlineAmount, credit: 0 }] : []),
        ...(paymentMethod === 'open bill' ? [{ accountId: '1103', accountName: 'Accounts Receivable', debit: amountToPay, credit: 0 }] : []),
        { accountId: '4101', accountName: 'Sales Revenue', debit: 0, credit: netAmount },
        { accountId: '2104', accountName: 'VAT Payable', debit: 0, credit: taxAmount },
        ...(totalCOGS > 0 ? [
          { accountId: '5101', accountName: 'Cost of Goods Sold', debit: Math.round(totalCOGS), credit: 0 },
          { accountId: '1105', accountName: 'Inventory', debit: 0, credit: Math.round(totalCOGS) }
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
          orderId: settlingOrder.id,
          customerName: settlingOrder.customerName || 'Guest',
          paymentMethod,
          orderType: settlingOrder.orderType,
          store: settlingOrder.store || 'Main',
          cashAmount,
          cardAmount,
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
          await deductInventory(settlingOrder);
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
          orderId: settlingOrder.id,
          customerName: settlingOrder.customerName || 'Guest',
          paymentMethod,
          orderType: settlingOrder.orderType,
          store: settlingOrder.store || 'Main',
          cashAmount,
          cardAmount,
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
          description: `Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()} — ${settlingOrder.customerName || 'Guest'} [${paymentMethod.toUpperCase()}]`,
          timestamp: serverTimestamp(),
          orderId: settlingOrder.id,
          customerName: settlingOrder.customerName || 'Guest',
          paymentMethod,
          orderType: settlingOrder.orderType,
          store: settlingOrder.store || 'Main',
          tableNumber: settlingOrder.tableNumber || null,
          cashAmount,
          cardAmount,
          changeGiven: change,
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
    const taxAmount = (subtotal - discountAmount) * ((systemSettings?.taxRate || 0) / 100);
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
    const deductRecursive = async (itemId: string, itemName: string, qty: number) => {
        const menuItem = items.find(m => m.id === itemId || m.name.toLowerCase() === itemName?.toLowerCase());
        if (menuItem && menuItem.recipe && menuItem.recipe.length > 0) {
          for (const ingredient of menuItem.recipe) {
            const invDoc = inventory.find(i => i.id === ingredient.inventoryItemId);
            if (invDoc) {
              const currentStock = invDoc.stock || 0;
              const deduction = ingredient.quantity * qty;
              await updateDoc(doc(db, 'inventory', invDoc.id), {
                stock: Math.max(0, currentStock - deduction),
                lastUpdated: serverTimestamp()
              });
            } else {
              await deductRecursive(ingredient.inventoryItemId, '', ingredient.quantity * qty);
            }
          }
        } else {
          const invItem = inventory.find(i => i.name.toLowerCase() === itemName?.toLowerCase());
          if (invItem) {
            await updateDoc(doc(db, 'inventory', invItem.id), {
              stock: Math.max(0, invItem.stock - qty),
              lastUpdated: serverTimestamp()
            });
          }
        }
    };

    try {
      for (const orderItem of order.items) {
        await deductRecursive(orderItem.itemId, orderItem.name, orderItem.quantity);
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
      case 'paid': return 'bg-blue-500/20 text-blue-400 border-blue-200';
      case 'confirmed': return 'bg-amber-500/20 text-amber-400 border-amber-200';
      case 'preparing': return 'bg-orange-500/20 text-orange-400 border-orange-200';
      case 'serving': return 'bg-purple-500/20 text-purple-400 border-purple-200';
      case 'done-serving': return 'bg-indigo-500/20 text-indigo-400 border-indigo-200';
      case 'awaiting-bill': return 'bg-pink-500/20 text-pink-400 border-pink-200';
      case 'finalized': return 'bg-emerald-500/20 text-emerald-400 border-emerald-200';
      case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-200';
      default: return 'bg-background text-foreground border-border';
    }
  };

  const filteredOrders = orders.filter(order => {
    // Basic null checks
    if (!order) return false;

    // Search by Order ID or Order Number
    if (orderFilters.orderNo) {
      const search = orderFilters.orderNo.toLowerCase();
      const matchId = order.id?.toLowerCase().includes(search) || false;
      const matchNo = order.orderNo?.toString().toLowerCase().includes(search) || false;
      if (!matchId && !matchNo) return false;
    }

    if (orderFilters.status && order.status !== orderFilters.status) return false;
    if (orderFilters.orderType && order.orderType !== orderFilters.orderType) return false;
    if (orderFilters.table && order.tableNumber?.toString() !== orderFilters.table.toString()) return false;
    if (orderFilters.deliveryZone && order.deliveryZone !== orderFilters.deliveryZone) return false;
    if (orderFilters.deliveryArea && order.deliveryArea !== orderFilters.deliveryArea) return false;
    if (orderFilters.driver && order.driverId !== orderFilters.driver) return false;
    if (orderFilters.kotNo && !order.kotNo?.toString().includes(orderFilters.kotNo)) return false;
    if (orderFilters.payment && order.paymentMethod !== orderFilters.payment) return false;
    
    if (orderFilters.customer) {
      const search = orderFilters.customer.toLowerCase();
      const matchName = order.customerName?.toLowerCase().includes(search) || false;
      const matchPhone = order.customerPhone?.toString().includes(search) || false;
      if (!matchName && !matchPhone) return false;
    }

    if (orderFilters.store && orderFilters.store !== 'all' && order.storeId !== orderFilters.store) return false;
    
    // Helper to safely parse dates
    const parseOrderDate = (created: any) => {
      if (!created) return new Date();
      if (typeof created === 'string') return new Date(created);
      if (typeof created === 'number') return new Date(created);
      if (created.toDate) return created.toDate();
      if (created.seconds) return new Date(created.seconds * 1000);
      return new Date();
    };

    // Date filters (Order Date)
    if (orderFilters.fromDate && order.createdAt) {
      try {
        const orderDate = parseOrderDate(order.createdAt);
        const fromDate = new Date(orderFilters.fromDate);
        fromDate.setHours(0, 0, 0, 0);
        if (orderDate < fromDate) return false;
      } catch (e) { console.error("Filter error:", e); }
    }
    if (orderFilters.toDate && order.createdAt) {
      const orderDate = parseOrderDate(order.createdAt);
      const toDate = new Date(orderFilters.toDate);
      toDate.setHours(23, 59, 59, 999);
      if (orderDate > toDate) return false;
    }

    // Date filters (Sales Date - only for finalized orders)
    if (orderFilters.salesFromDate && order.status === 'finalized' && order.createdAt) {
      const orderDate = parseOrderDate(order.createdAt);
      const fromDate = new Date(orderFilters.salesFromDate);
      fromDate.setHours(0, 0, 0, 0);
      if (orderDate < fromDate) return false;
    }
    if (orderFilters.salesToDate && order.status === 'finalized' && order.createdAt) {
      const orderDate = parseOrderDate(order.createdAt);
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
    const totalSales = finalizedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const cashSales = finalizedOrders.filter(o => o.paymentMethod === 'cash').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const cardSales = finalizedOrders.filter(o => o.paymentMethod === 'card').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const onlineSales = finalizedOrders.filter(o => o.paymentMethod === 'online').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    
    const dineInCount = orders.filter(o => o.orderType === 'dine-in').length;
    const takeOutCount = orders.filter(o => o.orderType === 'take-out').length;
    const deliveryCount = orders.filter(o => o.orderType === 'delivery').length;
    const pickupCount = orders.filter(o => o.orderType === 'pickup').length;
    const openBillsCount = orders.filter(o => o.status !== 'finalized' && o.status !== 'cancelled').length;
    const openBillsTotal = orders.filter(o => o.status !== 'finalized' && o.status !== 'cancelled').reduce((sum, o) => sum + (Number(o.total) || 0), 0);

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
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Sidebar */}
      <aside className={`bg-zinc-950 border-r border-white/5 flex flex-col h-screen sticky top-0 hidden md:flex transition-all duration-500 z-50 shadow-[20px_0_40px_rgba(0,0,0,0.3)] ${isMenuOpen ? 'w-72' : 'w-0 overflow-hidden'}`}>
        <div className="p-8 border-b border-white/5 flex flex-col items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-500/10 to-transparent opacity-30" />
          <div className="w-16 h-16 mb-4 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-inner group relative z-10 transition-transform hover:scale-105 duration-500 overflow-hidden">
            {systemSettings?.logoUrl ? (
              <img src={systemSettings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <>
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
                <span className="text-3xl font-black text-white relative z-10">
                  {systemSettings?.restaurantName?.charAt(0) || 'R'}
                </span>
              </>
            )}
          </div>
          <div className="relative z-10 text-center">
            <h1 className="text-lg font-black text-white uppercase tracking-tighter truncate max-w-[180px]">
              {systemSettings?.restaurantName || 'Rivas Admin'}
            </h1>
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] mt-1">
              {systemSettings?.tagline || 'Restaurant Management'}
            </p>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto px-6 py-10 space-y-1.5 custom-scrollbar-hidden">
          {[
            { id: 'dashboard', name: 'Dashboard', icon: <LayoutGrid size={18} /> },
            { id: 'reservations', name: 'Reservations', icon: <Calendar size={18} /> },
            { id: 'orders', name: 'Orders', icon: <ShoppingBag size={18} /> },
            { id: 'menu', name: 'Menu Items', icon: <Utensils size={18} /> },
            { id: 'recipes', name: 'Recipes', icon: <BookOpen size={18} /> },
            { id: 'production', name: 'Production', icon: <ChefHat size={18} /> },
            { id: 'kitchen', name: 'Kitchen (KDS)', icon: <Monitor size={18} /> },
            { id: 'promotions', name: 'Promotions', icon: <Tag size={18} /> },
            { isSection: true, name: 'Stock Flow' },
            { id: 'stock_flow', name: 'Stock Movement', icon: <ArrowRightLeft size={18} /> },
            { id: 'inventory', name: 'Inventory', icon: <Boxes size={18} /> },
            { id: 'suppliers', name: 'Suppliers', icon: <Truck size={18} /> },
            { id: 'purchases', name: 'Purchases', icon: <Receipt size={18} /> },
            { isSection: true, name: 'Operations' },
            { id: 'crm', name: 'CRM', icon: <Users size={18} /> },
            { id: 'accounting', name: 'Reports', icon: <BarChart3 size={18} /> },
            { id: 'finance', name: 'Accounting', icon: <Wallet size={18} /> },
            { id: 'wastage', name: 'Wastage', icon: <Trash2 size={18} /> },
            { id: 'hr', name: 'HR & Payroll', icon: <UserCheck size={18} /> },
            { id: 'feedback', name: 'Feedback', icon: <MessageSquare size={18} /> },
            { id: 'users', name: 'Staff', icon: <ShieldCheck size={18} /> },
            { id: 'stores', name: 'Stores', icon: <Building size={18} /> },
            { id: 'warehouses', name: 'Warehouses', icon: <Warehouse size={18} /> },
            { id: 'mobile', name: 'Mobile Units', icon: <Truck size={18} /> },
            { id: 'terminals', name: 'Terminals', icon: <Monitor size={18} /> },
            { id: 'classes', name: 'Financial Classes', icon: <Tag size={18} /> },
            { id: 'settings', name: 'Settings', icon: <Settings size={18} /> },
          ].filter(m => m.isSection || canAccess(m.id as string)).map((module, index) => (
            module.isSection ? (
              <div key={`section-${index}`} className="pt-6 pb-2 px-5">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{module.name}</span>
              </div>
            ) : (
            <button
              key={module.id}
              onClick={() => setActiveTab(module.id as any)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-300 group ${
                activeTab === module.id 
                  ? 'bg-white/10 text-white shadow-xl border border-white/5 backdrop-blur-md' 
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              <span className={`transition-colors duration-300 ${activeTab === module.id ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`}>{module.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-[0.15em]">{module.name}</span>
              {activeTab === module.id && (
                <div className="ml-auto w-1 h-4 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
              )}
            </button>
            )
          ))}
        </nav>

        <div className="p-8 border-t border-white/5">
          <button onClick={onLogout} className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-rose-500 hover:bg-rose-500/10 transition-all font-black group border border-transparent hover:border-rose-500/20">
            <div className="p-2.5 bg-rose-500/10 rounded-xl group-hover:bg-rose-500 group-hover:text-white transition-all">
              <Ban size={18} />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em]">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-24 border-b border-border bg-card/40 backdrop-blur-2xl flex items-center justify-between px-10 shrink-0 z-40 relative">
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)} 
              className="p-3 hover:bg-muted/50 rounded-2xl transition-all text-muted-foreground hover:text-foreground border border-border shadow-sm active:scale-95"
            >
              <MenuIcon size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">
                {activeTab === 'dashboard' ? 'Overview' : 
                 activeTab === 'accounting' ? 'Reports' : 
                 activeTab === 'finance' ? 'Accounting' : 
                 activeTab === 'crm' ? 'Concierge' : 
                 activeTab === 'wastage' ? 'Wastage' : 
                 activeTab === 'production' ? 'Production' : 
                 activeTab === 'hr' ? 'HR & Payroll' : 
                 activeTab?.replace('-', ' ')}
              </h1>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mt-1.5 ml-0.5">ADVANCED MANAGEMENT CONSOLE</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative group/notify">
              <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="p-3 hover:bg-muted/50 rounded-2xl transition-all text-muted-foreground hover:text-foreground border border-border shadow-sm relative active:scale-95"
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-3 right-3 w-2 h-2 bg-primary border-2 border-white rounded-full shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-card border border-border rounded-3xl shadow-2xl z-[60] overflow-hidden">
                  <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30/50">
                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Alerts & Notifications</h3>
                    <button onClick={() => setIsNotificationsOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-border">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground text-xs font-medium">
                        No new notifications.
                      </div>
                    ) : notifications.map(n => (
                      <div key={n.id} className={`p-4 hover:bg-muted/30 transition-colors ${!n.read ? 'bg-primary/5' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl shrink-0 ${n.type === 'stock' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {n.type === 'stock' ? <Package size={14} /> : <AlertCircle size={14} />}
                          </div>
                          <div>
                            <p className="text-xs font-black text-foreground leading-snug">{n.title}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mt-1">{n.time}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-muted/30/50 text-center border-t border-border">
                    <button 
                      onClick={handleMarkAllAsRead}
                      className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                    >
                      Mark all as read
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <DigitalClock />
              {onOpenPOS && (
                <button onClick={onOpenPOS} className="hidden md:flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-primary/20">
                  <Monitor size={16} /> Open POS
                </button>
              )}
            </div>
            {onClose && (
              <button onClick={onClose} className="p-2.5 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-xl transition-all border border-border shadow-sm">
                <X size={20} />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-muted/30/10 custom-scrollbar">
          {renderContent()}
        </main>

        {/* System Reset Confirmation Modal */}
        {isResetConfirmOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-card border border-border w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={32} />
              </div>
              <h3 className="text-xl font-black text-foreground text-center uppercase tracking-tight mb-2">System Reset</h3>
              <p className="text-sm text-muted-foreground text-center mb-8 font-medium">This will permanently delete all orders, financial data, and module records. This action cannot be undone.</p>
              
              <div className="space-y-3">
                <button 
                  onClick={handleSystemReset}
                  disabled={isResetting}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  {isResetting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Resetting...
                    </>
                  ) : 'Yes, Reset All Data'}
                </button>
                <button 
                  onClick={() => setIsResetConfirmOpen(false)}
                  disabled={isResetting}
                  className="w-full py-4 bg-muted text-foreground rounded-2xl font-bold hover:bg-muted/80 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Maximized Overlay */}
        {maximizedOrderId && orders.find(o => o.id === maximizedOrderId) && (
          <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-8">
            {(() => {
              const order = orders.find(o => o.id === maximizedOrderId)!;
              const elapsed = order.createdAt ? Math.floor((Date.now() - (order.createdAt.toDate ? order.createdAt.toDate().getTime() : order.createdAt.seconds * 1000)) / 60000) : 0;
              
              return (
                <div className="w-full max-w-5xl h-full bg-card rounded-[3rem] border-4 border-primary shadow-[0_0_100px_rgba(var(--primary),0.2)] flex flex-col overflow-hidden animate-in zoom-in duration-300">
                  <div className="p-8 bg-primary flex items-center justify-between text-white">
                    <div>
                      <h2 className="text-6xl font-black uppercase tracking-tighter">
                        {order.tableNumber ? `TABLE ${order.tableNumber}` : `ORDER #${order.id.slice(-4).toUpperCase()}`}
                      </h2>
                      <p className="text-xl font-bold uppercase tracking-[0.3em] mt-2 opacity-80">{order.orderType || 'Standard'}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-6xl font-black font-mono tracking-widest">{elapsed}m</div>
                      <button onClick={() => setMaximizedOrderId(null)} className="p-4 bg-white/20 hover:bg-white/30 rounded-full transition-all">
                        <Minimize2 size={48} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar bg-card">
                    {order.notes && (
                      <div className="p-8 bg-amber-500/10 border-4 border-dashed border-amber-500/20 rounded-[2rem]">
                        <h4 className="text-2xl font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                          <AlertCircle size={32} /> INSTRUCTIONS
                        </h4>
                        <p className="text-4xl font-bold text-amber-200 leading-tight">{order.notes}</p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 gap-6">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex gap-8 items-center p-8 bg-background border border-border rounded-[2.5rem] shadow-sm transform transition-all">
                          <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center text-4xl font-black">
                            {item.quantity}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-4xl font-black text-foreground tracking-tight">{item.name}</h3>
                            {item.notes && <p className="text-xl font-bold text-amber-500 mt-2 italic">* {item.notes}</p>}
                          </div>
                          {item.image && (
                            <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-border">
                              <img src={item.image} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffSection({ staff, stores, terminals }: { staff: any[], stores: any[], terminals: any[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ name: '', role: 'waiter', email: '', phone: '', password: '', vehicle: '', storeId: '', terminalId: '', hourlyRate: 30, permissions: {} as any });
  const [error, setError] = useState('');
  const [editingPermissionsId, setEditingPermissionsId] = useState<string | null>(null);

  const permissionGroups = [
    {
      name: 'Management',
      modules: [
        { id: 'dashboard', name: 'Dashboard', icon: <BarChart3 size={14} /> },
        { id: 'users', name: 'Staff Management', icon: <UserCheck size={14} /> },
        { id: 'hr', name: 'HR & Payroll', icon: <ShieldCheck size={14} /> },
        { id: 'settings', name: 'System Settings', icon: <Settings size={14} /> },
        { id: 'stores', name: 'Stores', icon: <Building size={14} /> },
        { id: 'warehouses', name: 'Warehouses', icon: <Warehouse size={14} /> },
      ]
    },
    {
      name: 'Operations',
      modules: [
        { id: 'reservations', name: 'Reservations', icon: <Calendar size={14} /> },
        { id: 'orders', name: 'Orders & Sales', icon: <ShoppingBag size={14} /> },
        { id: 'kitchen', name: 'Kitchen (KDS)', icon: <Utensils size={14} /> },
        { id: 'pos', name: 'POS Control', icon: <Monitor size={14} /> },
        { id: 'menu', name: 'Menu Items', icon: <LayoutGrid size={14} /> },
        { id: 'recipes', name: 'Recipe Manager', icon: <Book size={14} /> },
        { id: 'production', name: 'Production', icon: <ChefHat size={14} /> },
        { id: 'crm', name: 'CRM & Loyalty', icon: <Users size={14} /> },
      ]
    },
    {
      name: 'Inventory & Finance',
      modules: [
        { id: 'inventory', name: 'Inventory Control', icon: <Package size={14} /> },
        { id: 'stock_flow', name: 'Stock Movement Flow', icon: <ArrowRightLeft size={14} /> },
        { id: 'suppliers', name: 'Suppliers', icon: <Truck size={14} /> },
        { id: 'purchases', name: 'Purchases', icon: <Receipt size={14} /> },
        { id: 'accounting', name: 'Reports', icon: <BarChart3 size={14} /> },

        { id: 'finance', name: 'Accounting', icon: <Wallet size={14} /> },
        { id: 'wastage', name: 'Wastage', icon: <Trash2 size={14} /> },
        { id: 'delivery', name: 'Delivery', icon: <Truck size={14} /> },
      ]
    }
  ];

  const allModules = permissionGroups.flatMap(g => g.modules);

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
        storeId: form.storeId || null,
        terminalId: form.terminalId || null,
        ...(existingUid ? { uid: existingUid } : {}),
        createdAt: serverTimestamp(),
        active: true,
        permissions: form.permissions
      });
      console.log('Staff record created in Firestore');

      setForm({ name: '', role: 'waiter', email: '', phone: '', password: '', vehicle: '', storeId: '', terminalId: '', permissions: {} });
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
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder="Search staff..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none w-64 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} /> Add Staff
          </button>
        </div>
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
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Assigned Store</label>
            <select className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.storeId} onChange={e => setForm({...form, storeId: e.target.value})}>
              <option value="">Any Store</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Assigned Store</label>
            <select className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.storeId} onChange={e => setForm({...form, storeId: e.target.value})}>
              <option value="">Any Store</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Assigned Terminal</label>
            <select className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.terminalId} onChange={e => setForm({...form, terminalId: e.target.value})}>
              <option value="">Any Terminal</option>
              {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Hourly Rate (AED)</label>
            <input type="number" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.hourlyRate} onChange={e => setForm({...form, hourlyRate: parseFloat(e.target.value)})} placeholder="e.g. 30" />
          </div>
          {form.role === 'driver' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Vehicle Details</label>
              <input type="text" className="w-full p-3 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-foreground" value={form.vehicle} onChange={e => setForm({...form, vehicle: e.target.value})} placeholder="e.g. Bike, Car (Plate No)" />
            </div>
          )}
            <div className="md:col-span-2 space-y-2">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Access Permissions</label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <span className="text-[9px] font-black text-muted-foreground uppercase group-hover:text-primary transition-colors">Full Admin Access</span>
                  <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <input 
                      type="checkbox" 
                      className="sr-only"
                      checked={form.role === 'admin'}
                      onChange={() => {
                        const newRole = form.role === 'admin' ? 'manager' : 'admin';
                        const newPerms = newRole === 'admin' ? allModules.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}) : {};
                        setForm({ ...form, role: newRole, permissions: newPerms });
                      }}
                    />
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-300 ${form.role === 'admin' ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </label>
              </div>

              <div className="space-y-6">
                {permissionGroups.map(group => (
                  <div key={group.name} className="space-y-2">
                    <p className="text-[8px] font-black text-primary/60 uppercase tracking-[0.2em] ml-2">{group.name}</p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-4 bg-background border border-border rounded-3xl shadow-inner">
                      {group.modules.map(mod => (
                        <label key={mod.id} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer group hover:scale-[1.02] ${
                          form.permissions[mod.id] ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-transparent border-transparent hover:bg-muted/10'
                        } ${form.role === 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input 
                            type="checkbox" 
                            disabled={form.role === 'admin'}
                            className="w-4 h-4 accent-primary rounded-lg cursor-pointer"
                            checked={form.permissions[mod.id] === true || form.role === 'admin'}
                            onChange={() => setForm({
                              ...form,
                              permissions: {
                                ...form.permissions,
                                [mod.id]: !form.permissions[mod.id]
                              }
                            })}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`${form.permissions[mod.id] || form.role === 'admin' ? 'text-primary' : 'text-muted-foreground'} transition-colors`}>
                              {mod.icon}
                            </span>
                            <span className={`text-[9px] font-black truncate uppercase tracking-tight ${form.permissions[mod.id] || form.role === 'admin' ? 'text-foreground' : 'text-muted-foreground'}`}>{mod.name}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>
          <div className="md:col-span-2 flex gap-4 pt-4">
            <button onClick={handleAdd} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">Save Staff</button>
            <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-background text-muted-foreground rounded-xl font-bold hover:bg-background/80 transition-all">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.filter(member => 
          member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          member.role.toLowerCase().includes(searchTerm.toLowerCase())
        ).map(member => (
          <div key={member.id} className="p-6 bg-card border border-border rounded-[2.5rem] hover:shadow-xl hover:shadow-primary/5 transition-all group">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-background rounded-2xl flex items-center justify-center text-muted-foreground font-black text-xl">
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
                </select>
                <div className="flex items-center gap-2 mt-1">
                  <DollarSign size={10} className="text-muted-foreground" />
                  <span className="text-[9px] font-black text-muted-foreground uppercase">{member.hourlyRate || 30} / hr</span>
                </div>
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
              <div className="mb-4 p-5 bg-background/30 rounded-[2rem] border border-border animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Module Permissions</p>
                  <button 
                    onClick={() => {
                      const allPerms = allModules.reduce((acc, mod) => ({ ...acc, [mod.id]: true }), {});
                      updateDoc(doc(db, 'staff', member.id), { permissions: allPerms, role: 'admin' });
                    }}
                    className="text-[10px] font-bold text-primary hover:underline"
                  >
                    Grant All Admin
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {allModules.map(mod => (
                    <label key={mod.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                      member.permissions?.[mod.id] 
                        ? 'bg-card border-primary/20 shadow-sm' 
                        : 'bg-transparent border-transparent hover:bg-background/50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${member.permissions?.[mod.id] ? 'bg-primary/10 text-primary' : 'bg-background text-muted-foreground'}`}>
                          {mod.icon}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-tight ${member.permissions?.[mod.id] ? 'text-foreground' : 'text-muted-foreground'}`}>{mod.name}</span>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-primary rounded"
                        checked={member.permissions?.[mod.id] === true || member.role === 'admin'}
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
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredHistory = productionHistory.filter(run => 
    run.menuItemName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        const itemCost = inv?.averageCost || inv?.costPerUnit || 0;
        if (inv && itemCost) {
          rawMaterialCost += itemCost * ingredient.quantity * form.quantity;
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
          category: 'finished_good'
        });
        finishedGood = { id: newInvRef.id, name: menuItem.name, stock: 0, unit: 'pcs', costPerUnit: costPerUnit, lowStockThreshold: 5, category: 'finished_good' } as any;
      } else {
        // Update average cost for finished good
        const oldTotalValue = (finishedGood.stock || 0) * (finishedGood.averageCost || finishedGood.costPerUnit || 0);
        const newTotalQuantity = (finishedGood.stock || 0) + form.quantity;
        const newAverageCost = Math.round((oldTotalValue + actualTotalCost) / newTotalQuantity);
        
        await updateDoc(doc(db, 'inventory', finishedGood.id), {
          costPerUnit: newAverageCost,
          averageCost: newAverageCost,
          category: 'finished_good'
        });
      }

      // Deduct raw materials
      for (const ingredient of form.ingredients) {
        const invRef = doc(db, 'inventory', ingredient.inventoryItemId);
        const invDoc = await getDoc(invRef);
        if (invDoc.exists()) {
          const currentStock = invDoc.data().stock || 0;
          const deduction = ingredient.quantity * form.quantity;
          const newStock = Math.max(0, currentStock - deduction);
          await updateDoc(invRef, {
            stock: newStock,
            lastUpdated: serverTimestamp()
          });
          
          await addDoc(collection(db, 'stock_movements'), {
            inventoryItemId: invDoc.id,
            itemName: invDoc.data().name,
            type: 'production_out',
            quantityChange: -deduction,
            stockAfter: newStock,
            reference: `Production of ${menuItem.name}`,
            timestamp: serverTimestamp()
          });
        }
      }

      // Add finished good to inventory
      const newFinishedStock = (finishedGood.stock || 0) + form.quantity;
      await updateDoc(doc(db, 'inventory', finishedGood.id), {
        stock: newFinishedStock,
        lastUpdated: serverTimestamp()
      } as any);

      await addDoc(collection(db, 'stock_movements'), {
        inventoryItemId: finishedGood.id,
        itemName: finishedGood.name,
        type: 'production_in',
        quantityChange: form.quantity,
        stockAfter: newFinishedStock,
        reference: `Produced ${form.quantity} ${menuItem.name}`,
        timestamp: serverTimestamp()
      });

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
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Production Management</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder="Search production..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none w-64 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} /> New Production Run
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="p-8 bg-background border border-border rounded-[2.5rem] space-y-6 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Menu Item to Produce</label>
              <select 
                className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.menuItemId} 
                onChange={e => handleMenuItemChange(e.target.value)}
              >
                <option value="">Select Item...</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Quantity</label>
              <input 
                type="number" 
                className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.quantity} 
                onChange={e => setForm({...form, quantity: Number(e.target.value)})} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Labor Cost (Total)</label>
              <input 
                type="number" 
                className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.laborCost} 
                onChange={e => setForm({...form, laborCost: Number(e.target.value)})} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Overhead (Total)</label>
              <input 
                type="number" 
                className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" 
                value={form.overheadCost} 
                onChange={e => setForm({...form, overheadCost: Number(e.target.value)})} 
              />
            </div>
          </div>

          {selectedMenuItem && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest">Recipe & Ingredients</h4>
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
                    <div key={idx} className={`flex items-center gap-4 p-3 border rounded-xl transition-all ${isLow ? 'bg-red-50 border-red-100' : 'bg-card border-border'}`}>
                      <select 
                        className="flex-1 p-2 bg-background border border-border rounded-lg text-xs font-bold outline-none"
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
                            className="w-20 p-2 bg-background border border-border rounded-lg text-xs font-bold text-center outline-none"
                            value={ing.quantity}
                            onChange={e => {
                              const newIngs = [...form.ingredients];
                              newIngs[idx].quantity = Number(e.target.value);
                              setForm({ ...form, ingredients: newIngs });
                            }}
                          />
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">{ing.unit}</span>
                        </div>
                        <p className={`text-[10px] font-bold ${isLow ? 'text-red-600' : 'text-muted-foreground'}`}>
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
              className="flex-1 py-4 bg-accent text-muted-foreground rounded-2xl font-bold hover:bg-zinc-300 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Produced Item</th>
              <th className="px-6 py-4">Quantity</th>
              <th className="px-6 py-4 text-right">Cost/Unit</th>
              <th className="px-6 py-4 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredHistory.map(run => (
              <tr key={run.id} className="hover:bg-background/50 transition-all">
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {run.timestamp?.toDate ? run.timestamp.toDate().toLocaleString() : 'Processing...'}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-foreground">{run.menuItemName}</td>
                <td className="px-6 py-4 text-sm font-black text-primary">+{run.quantity}</td>
                <td className="px-6 py-4 text-sm font-bold text-muted-foreground text-right">{formatCurrency(run.costPerUnit || 0)}</td>
                <td className="px-6 py-4 text-sm font-bold text-foreground text-right">{formatCurrency(run.totalCost || 0)}</td>
              </tr>
            ))}
            {filteredHistory.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic text-sm">No production history found.</td>
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
  const [searchTerm, setSearchTerm] = useState('');
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
        const newStock = Math.max(0, item.stock - form.quantity);
        await updateDoc(doc(db, 'inventory', item.id), {
          stock: newStock
        });

        // Record stock movement
        await addDoc(collection(db, 'stock_movements'), {
          inventoryItemId: item.id,
          itemName: item.name,
          type: 'wastage',
          quantityChange: -form.quantity,
          stockAfter: newStock,
          reference: `Wastage: ${form.reason}`,
          timestamp: serverTimestamp()
        });

        // Add to journal as expense
        await addDoc(collection(db, 'journal'), {
          type: 'wastage',
          amount: (item.averageCost || item.costPerUnit || 0) * form.quantity,
          description: `Wastage: ${item.name} (${form.reason})`,
          timestamp: serverTimestamp(),
          items: [{
            name: item.name,
            quantity: form.quantity,
            price: item.averageCost || item.costPerUnit || 0
          }]
        });

        // Also create a formal journal entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: 'WASTAGE',
          description: `Wastage: ${item.name} (${form.reason})`,
          timestamp: serverTimestamp(),
          lines: [
            { accountId: '5104', accountName: 'Wastage Expense', debit: (item.averageCost || item.costPerUnit || 0) * form.quantity, credit: 0 },
            { accountId: '1105', accountName: 'Inventory Asset', debit: 0, credit: (item.averageCost || item.costPerUnit || 0) * form.quantity }
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
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Wastage Management</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder="Search wastage..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none w-64 shadow-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} /> Record Wastage
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="p-8 bg-background border border-border rounded-[2.5rem] grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Inventory Item</label>
            <select className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.itemId} onChange={e => setForm({...form, itemId: e.target.value})}>
              <option value="">Select Item...</option>
              {inventory.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Quantity</label>
            <input type="number" className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.quantity} onChange={e => setForm({...form, quantity: Number(e.target.value)})} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Reason</label>
            <input type="text" className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none" value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="e.g., Expired, Damaged" />
          </div>
          <div className="md:col-span-3 flex gap-4 pt-4">
            <button onClick={handleAdd} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">Record Wastage</button>
            <button onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-accent text-muted-foreground rounded-xl font-bold hover:bg-zinc-300 transition-all">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-background text-[10px] font-black text-muted-foreground uppercase tracking-widest">
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Item</th>
              <th className="px-6 py-4">Quantity</th>
              <th className="px-6 py-4">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {wastage.filter(entry => 
              entry.itemName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              entry.reason?.toLowerCase().includes(searchTerm.toLowerCase())
            ).map(entry => (
              <tr key={entry.id} className="hover:bg-background/50 transition-all">
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {entry.timestamp?.toDate ? entry.timestamp.toDate().toLocaleString() : 'Processing...'}
                </td>
                <td className="px-6 py-4 text-sm font-bold text-foreground">{entry.itemName}</td>
                <td className="px-6 py-4 text-sm font-black text-red-600">-{entry.quantity}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground italic">{entry.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ManagementField {
  key: string;
  label: string;
  type: string;
  options?: { value: string, label: string }[];
}

function ManagementSection({ title, data, collectionName, icon, fields = [] }: { title: string, data: any[], collectionName: string, icon: React.ReactNode, fields?: ManagementField[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({ name: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!formData.name) return;
    try {
      await addDoc(collection(db, collectionName), {
        ...formData,
        createdAt: serverTimestamp(),
        active: true
      });
      setFormData({ name: '' });
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, collectionName);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !formData.name) return;
    try {
      await updateDoc(doc(db, collectionName, editingId), {
        ...formData,
        updatedAt: serverTimestamp()
      });
      setFormData({ name: '' });
      setEditingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${collectionName}/${editingId}`);
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

  const filteredData = data.filter(item => {
    const searchLower = searchQuery.toLowerCase();
    return (
      item.name?.toLowerCase().includes(searchLower) ||
      fields.some(f => String(item[f.key] || '').toLowerCase().includes(searchLower)) ||
      item.id?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Delete Item?</h3>
            <p className="text-muted-foreground mb-8">Are you sure you want to delete this item? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-muted-foreground bg-background hover:bg-accent transition-colors"
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
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none w-64 shadow-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => {
              setFormData({ name: '' });
              setIsAdding(true);
            }}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={20} /> Add New
          </button>
        </div>
      </div>

      {(isAdding || editingId) && (
        <div className="p-6 bg-background border border-border rounded-3xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-lg text-foreground">{editingId ? 'Edit Item' : 'Add New Item'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Name <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                placeholder="Enter Name..."
                className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                autoFocus
              />
            </div>
            {fields.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">{f.label}</label>
                {f.type === 'select' ? (
                  <select 
                    className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={formData[f.key] || ''}
                    onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                  >
                    <option value="">Select {f.label}...</option>
                    {f.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input 
                    type={f.type}
                    placeholder={`Enter ${f.label}...`}
                    className="w-full p-3 bg-card border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={formData[f.key] || ''}
                    onChange={e => setFormData({ ...formData, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              onClick={editingId ? handleUpdate : handleAdd}
              disabled={!formData.name}
              className="px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId ? 'Update' : 'Save'}
            </button>
            <button 
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '' });
              }}
              className="px-8 py-3 bg-accent text-muted-foreground rounded-xl font-bold hover:bg-zinc-300 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredData.map(item => (
          <div key={item.id} className="p-6 bg-card border border-border rounded-3xl hover:shadow-xl hover:shadow-zinc-200/50 transition-all group flex flex-col justify-between gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-foreground text-lg">{item.name}</h4>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">ID: {item.id.slice(-6).toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setEditingId(item.id);
                    setFormData({ ...item });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="p-2 text-primary bg-primary/5 hover:bg-primary/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => setDeletingId(item.id)}
                  className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            
            {fields.length > 0 && (
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border mt-auto">
                {fields.map(f => (
                  <div key={f.key}>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">{f.label}</p>
                    <p className="text-sm font-medium text-foreground truncate">{item[f.key] || '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {filteredData.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground font-bold uppercase tracking-widest text-xs bg-background rounded-3xl border border-dashed border-border">
            No items found
          </div>
        )}
      </div>
    </div>
  );
}

function SuppliersSection({ suppliers, bills }: { suppliers: any[], bills: any[] }) {
  const [isAddingSupplier, setIsAddingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddSupplier = async () => {
    if (!supplierForm.name) return;
    try {
      const vendorDoc = await addDoc(collection(db, 'vendors'), {
        ...supplierForm,
        createdAt: serverTimestamp()
      });
      
      // Auto-create Accounts Payable ledger mapping
      await addDoc(collection(db, 'ledger_groups'), {
        code: `2101-${vendorDoc.id.slice(0,4).toUpperCase()}`,
        name: `AP - ${supplierForm.name}`,
        type: 'Liability',
        parentCode: '2101',
        isAccount: true,
        description: `Accounts Payable for ${supplierForm.name}`
      });
      
      setIsAddingSupplier(false);
      setSupplierForm({ name: '', phone: '', email: '', address: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vendors');
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Suppliers</h2>
          <p className="text-sm text-muted-foreground font-medium">Manage your vendors and contact information</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="Search suppliers..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAddingSupplier(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all whitespace-nowrap"
          >
            <Plus size={18} /> Add Supplier
          </button>
        </div>
      </div>

      {isAddingSupplier && (
        <div className="p-8 bg-card rounded-[2.5rem] border border-border mb-6 shadow-xl animate-in fade-in slide-in-from-top-4">
          <h4 className="text-lg font-black text-foreground mb-6 uppercase tracking-tight">Add New Supplier</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Supplier Name</label>
              <input
                type="text"
                placeholder="e.g. Fresh Produce Co."
                className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                value={supplierForm.name}
                onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Phone Number</label>
              <input
                type="text"
                placeholder="+1 234 567 890"
                className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                value={supplierForm.phone}
                onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
              <input
                type="email"
                placeholder="contact@supplier.com"
                className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                value={supplierForm.email}
                onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Physical Address</label>
              <input
                type="text"
                placeholder="123 Business St, City"
                className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                value={supplierForm.address}
                onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-4 mt-8">
            <button
              onClick={() => setIsAddingSupplier(false)}
              className="px-8 py-4 rounded-2xl text-sm font-bold text-muted-foreground hover:bg-background transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSupplier}
              className="px-8 py-4 rounded-2xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              Save Supplier
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSuppliers.map(supplier => {
          const supplierBills = bills.filter(b => b.supplierId === supplier.id);
          const totalPurchased = supplierBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
          const totalPaid = supplierBills.reduce((sum, b) => sum + (b.amountPaid || 0), 0);
          const balance = totalPurchased - totalPaid;

          return (
            <div key={supplier.id} className="p-8 bg-card rounded-[2.5rem] border border-border hover:shadow-2xl hover:shadow-primary/5 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-all group-hover:scale-150" />
              
              <div className="flex items-center gap-5 mb-8 relative">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
                  <Truck size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground leading-tight">{supplier.name}</h3>
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">{supplier.phone || 'No Phone'}</p>
                </div>
              </div>

              <div className="space-y-4 relative">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Mail size={16} className="shrink-0" />
                  <span className="truncate font-medium">{supplier.email || 'No Email'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <MapPin size={16} className="shrink-0" />
                  <span className="truncate font-medium">{supplier.address || 'No Address'}</span>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border grid grid-cols-2 gap-4 relative">
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Orders</p>
                  <p className="text-lg font-black text-foreground">{supplierBills.length}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Balance Due</p>
                  <p className={`text-lg font-black ${balance > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                    {formatCurrency(balance)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {filteredSuppliers.length === 0 && (
          <div className="col-span-full py-32 text-center bg-background/10 rounded-[3rem] border-4 border-dashed border-border">
            <div className="w-24 h-24 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Truck size={48} className="text-muted-foreground/30" />
            </div>
            <h3 className="text-2xl font-black text-foreground mb-2">No suppliers found</h3>
            <p className="text-muted-foreground font-medium max-w-xs mx-auto">
              {searchQuery ? `No results for "${searchQuery}"` : "Add your first supplier to start tracking purchases and inventory."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliverySection({ drivers, searchQuery, setSearchQuery }: { drivers: any[], searchQuery: string, setSearchQuery: (q: string) => void }) {
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

  const filteredDrivers = drivers.filter(d => 
    d.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.vehicle?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Delivery Management</h2>
          <p className="text-sm text-muted-foreground font-medium">Manage drivers and delivery assignments</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input 
              type="text"
              placeholder="Search drivers..."
              className="pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none w-64"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => setIsAddingDriver(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
          >
            <Plus size={18} /> Add New Driver
          </button>
        </div>
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
            <button onClick={() => setIsAddingDriver(false)} className="px-6 py-3 rounded-xl text-sm font-bold text-muted-foreground hover:bg-background transition-colors">Cancel</button>
            <button onClick={handleAddDriver} className="px-6 py-3 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors">Save Driver</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDrivers.map(driver => (
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
        {filteredDrivers.length === 0 && !isAddingDriver && (
          <div className="col-span-full py-20 text-center bg-background/20 rounded-[2.5rem] border-2 border-dashed border-border">
            <Truck size={48} className="text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">No drivers found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PurchasesSection({ suppliers, inventory, bills, ledgerGroups }: { suppliers: any[], inventory: InventoryItem[], bills: any[], ledgerGroups: LedgerGroup[] }) {
  const [activeSubTab, setActiveSubTab] = useState<'purchases' | 'orders'>('purchases');
  const [isAddingInvoice, setIsAddingInvoice] = useState(false);
  const [isAddingPO, setIsAddingPO] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [expandedPOId, setExpandedPOId] = useState<string | null>(null);
  const [paymentAccounts, setPaymentAccounts] = useState<LedgerGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    date: new Date().toISOString().split('T')[0],
    items: [] as { inventoryItemId: string, quantity: number, price: number, name?: string }[],
    amountPaid: 0,
    totalAmount: 0,
    accountId: '1101',
    poId: '' // Track linked PO
  });

  const [poForm, setPOForm] = useState({
    poNumber: `PO-${Date.now().toString().slice(-6)}`,
    date: new Date().toISOString().split('T')[0],
    expectedDate: '',
    items: [] as { inventoryItemId: string, quantity: number, price: number, name?: string }[],
    totalAmount: 0,
    notes: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'purchase_orders'), (snapshot) => {
      setPurchaseOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'purchase_orders'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Filter Asset and Liability accounts that are marked as accounts (not groups)
    const accounts = ledgerGroups.filter(g => (g.type === 'Asset' || g.type === 'Liability') && g.isAccount);
    setPaymentAccounts(accounts);
  }, [ledgerGroups]);

  const handleAddInvoiceItem = () => {
    if (inventory.length === 0) return;
    setInvoiceForm({
      ...invoiceForm,
      items: [...invoiceForm.items, { inventoryItemId: inventory[0].id, quantity: 1, price: 0, name: inventory[0].name }]
    });
  };

  const handleAddPOItem = () => {
    if (inventory.length === 0) return;
    setPOForm({
      ...poForm,
      items: [...poForm.items, { inventoryItemId: inventory[0].id, quantity: 1, price: 0, name: inventory[0].name }]
    });
  };

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const newItems = [...invoiceForm.items];
    if (field === 'inventoryItemId') {
      const inv = inventory.find(i => i.id === value);
      newItems[index] = { ...newItems[index], [field]: value, name: inv?.name };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    
    const newTotal = newItems.reduce((sum, item) => sum + ((parseFloat(item.quantity as any) || 0) * (parseFloat(item.price as any) || 0)), 0);
    setInvoiceForm({ ...invoiceForm, items: newItems, totalAmount: newTotal });
  };

  const updatePOItem = (index: number, field: string, value: any) => {
    const newItems = [...poForm.items];
    if (field === 'inventoryItemId') {
      const inv = inventory.find(i => i.id === value);
      newItems[index] = { ...newItems[index], [field]: value, name: inv?.name };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    
    const newTotal = newItems.reduce((sum, item) => sum + ((parseFloat(item.quantity as any) || 0) * (parseFloat(item.price as any) || 0)), 0);
    setPOForm({ ...poForm, items: newItems, totalAmount: newTotal });
  };

  const handleSavePO = async () => {
    if (!selectedSupplier || poForm.items.length === 0) return;
    try {
      await addDoc(collection(db, 'purchase_orders'), {
        ...poForm,
        items: poForm.items.map(item => ({
          ...item,
          price: Math.round(item.price * 100)
        })),
        totalAmount: Math.round(poForm.totalAmount * 100),
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        status: 'sent',
        timestamp: serverTimestamp()
      });
      setIsAddingPO(false);
      setPOForm({
        poNumber: `PO-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        expectedDate: '',
        items: [],
        totalAmount: 0,
        notes: ''
      });
      setSelectedSupplier(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'purchase_orders');
    }
  };

  const convertPOToBill = (po: any) => {
    setSelectedSupplier(suppliers.find(s => s.id === po.supplierId));
    setInvoiceForm({
      invoiceNumber: po.poNumber.replace('PO-', 'INV-'),
      date: new Date().toISOString().split('T')[0],
      items: po.items.map((item: any) => ({
        ...item,
        price: item.price / 100 // Convert back to dollars for the form
      })),
      amountPaid: 0,
      totalAmount: po.totalAmount / 100,
      accountId: '1101',
      poId: po.id
    });
    setIsAddingInvoice(true);
    setActiveSubTab('purchases');
  };

  const removeInvoiceItem = (index: number) => {
    const newItems = invoiceForm.items.filter((_, i) => i !== index);
    const newTotal = newItems.reduce((sum, item) => sum + ((parseFloat(item.quantity as any) || 0) * (parseFloat(item.price as any) || 0)), 0);
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
        poId: invoiceForm.poId || null,
        timestamp: serverTimestamp()
      });

      // Update linked PO status if exists
      if (invoiceForm.poId) {
        await updateDoc(doc(db, 'purchase_orders', invoiceForm.poId), {
          status: 'received',
          receivedAt: serverTimestamp()
        });
      }

      // 2. Update inventory stock, average cost and record in journal
      for (const item of invoiceForm.items) {
        const invItem = inventory.find(i => i.id === item.inventoryItemId);
        if (invItem) {
          const currentStock = invItem.stock || 0;
          const currentCost = invItem.averageCost || invItem.costPerUnit || 0; // in cents
          const newQty = item.quantity;
          const newUnitPrice = Math.round(item.price * 100); // in cents
          
          let newAverageCost = currentCost;
          const newTotalStock = currentStock + newQty;
          
          if (newTotalStock > 0) {
            // If current stock is negative, we assume the cost of the deficit is the new purchase price
            if (currentStock < 0) {
              newAverageCost = newUnitPrice;
            } else {
              newAverageCost = Math.round(((currentStock * currentCost) + (newQty * newUnitPrice)) / newTotalStock);
            }
          } else {
            newAverageCost = newUnitPrice;
          }

          await updateDoc(doc(db, 'inventory', item.inventoryItemId), {
            stock: newTotalStock,
            costPerUnit: newAverageCost,
            averageCost: newAverageCost,
            lastUpdated: serverTimestamp()
          });

          // Record stock movement
          await addDoc(collection(db, 'stock_movements'), {
            inventoryItemId: item.inventoryItemId,
            itemName: invItem.name,
            type: 'purchase',
            quantityChange: newQty,
            stockAfter: newTotalStock,
            reference: `Bill ${invoiceForm.invoiceNumber} (${selectedSupplier.name})`,
            timestamp: serverTimestamp()
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
        accountId: '1101',
        poId: ''
      });
      setSelectedSupplier(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bills');
    }
  };

  const purchaseBills = bills.filter(b => b.type === 'purchase');
  const filteredBills = purchaseBills.filter(b => 
    b.supplierName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPurchases = filteredBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalPaid = filteredBills.reduce((sum, b) => sum + (b.amountPaid || 0), 0);
  const totalBalance = totalPurchases - totalPaid;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Procurement</h2>
            <p className="text-sm text-muted-foreground font-medium">Manage purchases and purchase orders</p>
          </div>
          <div className="flex bg-muted/50 p-1 rounded-2xl border border-border">
            <button 
              onClick={() => setActiveSubTab('purchases')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'purchases' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Purchases
            </button>
            <button 
              onClick={() => setActiveSubTab('orders')}
              className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeSubTab === 'orders' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Purchase Orders
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-2xl text-sm focus:ring-2 focus:ring-primary outline-none"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            onClick={() => activeSubTab === 'purchases' ? setIsAddingInvoice(true) : setIsAddingPO(true)}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all whitespace-nowrap"
          >
            <Plus size={18} /> {activeSubTab === 'purchases' ? 'Record Purchase' : 'Create PO'}
          </button>
        </div>
      </div>

      {activeSubTab === 'purchases' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card p-6 rounded-[2rem] border border-border shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Purchases</p>
                  <p className="text-2xl font-black text-foreground">{formatCurrency(totalPurchases)}</p>
                </div>
              </div>
              <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="bg-card p-6 rounded-[2rem] border border-border shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                  <Wallet size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Paid</p>
                  <p className="text-2xl font-black text-foreground">{formatCurrency(totalPaid)}</p>
                </div>
              </div>
              <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full" style={{ width: `${totalPurchases > 0 ? (totalPaid / totalPurchases) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="bg-card p-6 rounded-[2rem] border border-border shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                  <Scale size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Outstanding Balance</p>
                  <p className="text-2xl font-black text-foreground">{formatCurrency(totalBalance)}</p>
                </div>
              </div>
              <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full" style={{ width: `${totalPurchases > 0 ? (totalBalance / totalPurchases) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {isAddingInvoice && (
            <div className="p-8 bg-card rounded-[3rem] border border-border mb-6 shadow-2xl animate-in fade-in slide-in-from-top-4">
              <h4 className="text-xl font-black text-foreground mb-8 uppercase tracking-tight">Record Purchase Invoice</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Supplier</label>
                  <select
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={selectedSupplier?.id || ''}
                    onChange={e => setSelectedSupplier(suppliers.find(s => s.id === e.target.value) || null)}
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Invoice Number</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2024-001"
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={invoiceForm.invoiceNumber}
                    onChange={e => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Invoice Date</label>
                  <input
                    type="date"
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={invoiceForm.date}
                    onChange={e => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Payment Account</label>
                  <select
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={invoiceForm.accountId}
                    onChange={e => setInvoiceForm({ ...invoiceForm, accountId: e.target.value })}
                  >
                    {paymentAccounts.map(acc => (
                      <option key={acc.id} value={acc.code || acc.id}>{acc.name} ({acc.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center px-2">
                  <h5 className="text-sm font-black text-foreground uppercase tracking-widest">Purchased Items</h5>
                  <button 
                    onClick={handleAddInvoiceItem}
                    className="text-xs font-black text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={16} /> ADD ITEM
                  </button>
                </div>
                
                <div className="space-y-3">
                  {invoiceForm.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-background/20 p-5 rounded-[2rem] border border-border group transition-all hover:bg-background/30">
                      <div className="md:col-span-5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 mb-1 block">Item</label>
                        <select
                          className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={item.inventoryItemId}
                          onChange={e => updateInvoiceItem(index, 'inventoryItemId', e.target.value)}
                        >
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 mb-1 block">Quantity</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={item.quantity || ''}
                          onChange={e => updateInvoiceItem(index, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 mb-1 block">Cost/Unit</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={item.price || ''}
                          onChange={e => updateInvoiceItem(index, 'price', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2 text-right">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1 mb-1 block">Subtotal</label>
                        <p className="text-lg font-black text-foreground pr-1">{formatCurrencyDirect((parseFloat(item.quantity as any) || 0) * (parseFloat(item.price as any) || 0))}</p>
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <button 
                          onClick={() => removeInvoiceItem(index)}
                          className="p-3 text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {invoiceForm.items.length === 0 && (
                  <div className="text-center py-16 bg-background/10 border-4 border-dashed border-border rounded-[2.5rem]">
                    <Boxes size={48} className="text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">No items added to this invoice</p>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div className="w-full md:w-72 space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Amount Paid Now</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                    <input
                      type="number"
                      className="w-full pl-8 pr-4 py-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none font-black text-2xl"
                      value={invoiceForm.amountPaid || ''}
                      onChange={e => setInvoiceForm({ ...invoiceForm, amountPaid: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="text-right bg-primary/5 p-6 rounded-[2rem] border border-primary/10 w-full md:w-auto min-w-[240px]">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Total Invoice Amount</p>
                  <p className="text-4xl font-black text-primary">{formatCurrencyDirect(invoiceForm.totalAmount)}</p>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-10">
                <button
                  onClick={() => setIsAddingInvoice(false)}
                  className="px-10 py-4 rounded-2xl text-sm font-bold text-muted-foreground hover:bg-background transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveInvoice}
                  disabled={!selectedSupplier || invoiceForm.items.length === 0}
                  className="px-10 py-4 rounded-2xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Purchase & Update Stock
                </button>
              </div>
            </div>
          )}

          <div className="bg-card rounded-[3rem] border border-border overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-background/50 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    <th className="px-8 py-6">Date</th>
                    <th className="px-8 py-6">Supplier</th>
                    <th className="px-8 py-6">Invoice #</th>
                    <th className="px-8 py-6">Items</th>
                    <th className="px-8 py-6 text-right">Total</th>
                    <th className="px-8 py-6 text-right">Paid</th>
                    <th className="px-8 py-6 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredBills.map(bill => (
                    <React.Fragment key={bill.id}>
                      <tr 
                        onClick={() => setExpandedBillId(expandedBillId === bill.id ? null : bill.id)}
                        className={`transition-all cursor-pointer group ${expandedBillId === bill.id ? 'bg-background/50' : 'hover:bg-background/30'}`}
                      >
                        <td className="px-8 py-6 text-sm text-muted-foreground font-medium flex items-center gap-2">
                          {expandedBillId === bill.id ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                          {bill.timestamp?.toDate ? bill.timestamp.toDate().toLocaleDateString() : bill.date}
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-sm font-black text-foreground">{bill.supplierName}</p>
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">ID: {bill.supplierId?.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 bg-background/60 rounded-lg text-xs font-mono font-bold text-muted-foreground">
                            {bill.invoiceNumber}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-sm text-foreground/80 font-medium">
                          {bill.items?.length || 0} items
                        </td>
                        <td className="px-8 py-6 text-sm font-black text-foreground text-right">{formatCurrency(bill.totalAmount || 0)}</td>
                        <td className="px-8 py-6 text-sm font-black text-emerald-500 text-right">{formatCurrency(bill.amountPaid || 0)}</td>
                        <td className="px-8 py-6 text-sm font-black text-destructive text-right">
                          <span className={((bill.totalAmount || 0) - (bill.amountPaid || 0)) > 0 ? 'bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100' : 'text-zinc-300'}>
                            {formatCurrency((bill.totalAmount || 0) - (bill.amountPaid || 0))}
                          </span>
                        </td>
                      </tr>
                      {expandedBillId === bill.id && (
                        <tr className="bg-background/10 border-b border-border animate-in fade-in zoom-in-95 duration-200">
                          <td colSpan={7} className="p-8">
                            <div className="bg-card w-full max-w-4xl rounded-[2rem] border border-border p-8 shadow-xl">
                              <h4 className="text-sm font-black uppercase text-foreground tracking-widest mb-6 flex items-center gap-3">
                                <ShoppingBag size={18} className="text-primary" /> Invoice Breakdown
                              </h4>
                              <div className="grid grid-cols-1 gap-4">
                                {bill.items?.map((item: any, iIdx: number) => {
                                  const invItem = inventory.find(i => i.id === item.inventoryItemId);
                                  return (
                                    <div key={iIdx} className="flex justify-between items-center bg-background/30 p-4 rounded-2xl border border-border hover:bg-background transition-all">
                                      <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-background rounded-full flex items-center justify-center border border-border shadow-sm">
                                          <span className="font-black text-primary text-xs">{item.quantity}</span>
                                        </div>
                                        <div>
                                          <p className="font-black text-foreground text-sm">{invItem?.name || 'Unknown Item'}</p>
                                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{invItem?.category || 'Inventory'}</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-black text-foreground">{formatCurrencyDirect(item.quantity * (item.price / 100))}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{formatCurrencyDirect(item.price / 100)} / {invItem?.unit || 'unit'}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {filteredBills.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-8 py-24 text-center">
                        <div className="w-16 h-16 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <FileText size={32} className="text-muted-foreground/30" />
                        </div>
                        <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">No purchase records found</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {isAddingPO && (
            <div className="p-8 bg-card rounded-[3rem] border border-border mb-6 shadow-2xl animate-in fade-in slide-in-from-top-4">
              <h4 className="text-xl font-black text-foreground mb-8 uppercase tracking-tight">Create Purchase Order</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Supplier</label>
                  <select
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={selectedSupplier?.id || ''}
                    onChange={e => setSelectedSupplier(suppliers.find(s => s.id === e.target.value) || null)}
                  >
                    <option value="">Select Supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">PO Number</label>
                  <input
                    type="text"
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={poForm.poNumber}
                    onChange={e => setPOForm({ ...poForm, poNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Date</label>
                  <input
                    type="date"
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={poForm.date}
                    onChange={e => setPOForm({ ...poForm, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Expected Delivery</label>
                  <input
                    type="date"
                    className="w-full p-4 rounded-2xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={poForm.expectedDate}
                    onChange={e => setPOForm({ ...poForm, expectedDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center px-2">
                  <h5 className="text-sm font-black text-foreground uppercase tracking-widest">Order Items</h5>
                  <button 
                    onClick={handleAddPOItem}
                    className="text-xs font-black text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={16} /> ADD ITEM
                  </button>
                </div>
                
                <div className="space-y-3">
                  {poForm.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-background/20 p-5 rounded-[2rem] border border-border group transition-all hover:bg-background/30">
                      <div className="md:col-span-5">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 mb-1 block">Item</label>
                        <select
                          className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={item.inventoryItemId}
                          onChange={e => updatePOItem(index, 'inventoryItemId', e.target.value)}
                        >
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 mb-1 block">Quantity</label>
                        <input
                          type="number"
                          className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={item.quantity || ''}
                          onChange={e => updatePOItem(index, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 mb-1 block">Est. Cost/Unit</label>
                        <input
                          type="number"
                          className="w-full p-3 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                          value={item.price || ''}
                          onChange={e => updatePOItem(index, 'price', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2 text-right">
                        <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1 mb-1 block">Subtotal</label>
                        <p className="text-lg font-black text-foreground pr-1">{formatCurrencyDirect((parseFloat(item.quantity as any) || 0) * (parseFloat(item.price as any) || 0))}</p>
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <button 
                          onClick={() => {
                            const newItems = poForm.items.filter((_, i) => i !== index);
                            const newTotal = newItems.reduce((sum, i) => sum + ((parseFloat(i.quantity as any) || 0) * (parseFloat(i.price as any) || 0)), 0);
                            setPOForm({ ...poForm, items: newItems, totalAmount: newTotal });
                          }}
                          className="p-3 text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-10">
                <button
                  onClick={() => setIsAddingPO(false)}
                  className="px-10 py-4 rounded-2xl text-sm font-bold text-muted-foreground hover:bg-background transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePO}
                  disabled={!selectedSupplier || poForm.items.length === 0}
                  className="px-10 py-4 rounded-2xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Purchase Order
                </button>
              </div>
            </div>
          )}

          <div className="bg-card rounded-[3rem] border border-border overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-background/50 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                    <th className="px-8 py-6">Date</th>
                    <th className="px-8 py-6">Supplier</th>
                    <th className="px-8 py-6">PO #</th>
                    <th className="px-8 py-6">Status</th>
                    <th className="px-8 py-6 text-right">Total</th>
                    <th className="px-8 py-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchaseOrders.filter(po => 
                    po.status !== 'received' && (
                    po.supplierName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    po.poNumber?.toLowerCase().includes(searchQuery.toLowerCase()))
                  ).map(po => (
                    <React.Fragment key={po.id}>
                      <tr 
                        onClick={() => setExpandedPOId(expandedPOId === po.id ? null : po.id)}
                        className={`transition-all cursor-pointer group ${expandedPOId === po.id ? 'bg-background/50' : 'hover:bg-background/30'}`}
                      >
                        <td className="px-8 py-6 text-sm text-muted-foreground font-medium">
                          {po.timestamp?.toDate ? po.timestamp.toDate().toLocaleDateString() : po.date}
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-sm font-black text-foreground">{po.supplierName}</p>
                        </td>
                        <td className="px-8 py-6">
                          <span className="px-3 py-1 bg-background/60 rounded-lg text-xs font-mono font-bold text-muted-foreground">
                            {po.poNumber}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                            po.status === 'received' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'
                          }`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-sm font-black text-foreground text-right">{formatCurrency(po.totalAmount || 0)}</td>
                        <td className="px-8 py-6 text-right">
                          {po.status !== 'received' && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                convertPOToBill(po);
                              }}
                              className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest bg-primary/10 px-3 py-2 rounded-xl transition-all"
                            >
                              Receive Items
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedPOId === po.id && (
                        <tr className="bg-background/50 border-b border-border">
                          <td colSpan={6} className="p-6">
                            <div className="bg-card rounded-2xl p-6 border border-border/60 shadow-sm animate-in zoom-in-95 duration-200">
                              <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest mb-4 flex items-center gap-2">
                                <Package size={14} /> Order Items Breakdown
                              </h4>
                              <div className="bg-background rounded-xl border border-border overflow-hidden">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-muted/50 border-b border-border">
                                    <tr>
                                      <th className="px-4 py-3 font-black uppercase tracking-widest text-muted-foreground">Item</th>
                                      <th className="px-4 py-3 font-black uppercase tracking-widest text-muted-foreground text-center">Qty</th>
                                      <th className="px-4 py-3 font-black uppercase tracking-widest text-muted-foreground text-right">Est. Cost</th>
                                      <th className="px-4 py-3 font-black uppercase tracking-widest text-muted-foreground text-right">Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {po.items?.map((item: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-card transition-colors">
                                        <td className="px-4 py-3 font-bold text-foreground">{item.name}</td>
                                        <td className="px-4 py-3 text-center font-medium">{item.quantity}</td>
                                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(item.price)}</td>
                                        <td className="px-4 py-3 text-right font-black text-foreground">{formatCurrency(item.quantity * item.price)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
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
        </>
      )}
    </div>
  );
}
