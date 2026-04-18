import React, { useState, useMemo, useEffect } from 'react';
import { Download, Filter, FileText, Scale, History, DollarSign, Activity, TrendingUp, Calendar, ChevronDown, ChevronUp, Search, FileSpreadsheet, PieChart, Wallet, Package, ArrowLeft, Plus, User, LayoutGrid, Save, Settings, Maximize2, Minimize2, Columns, Eye, EyeOff, Share2, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

interface ReportTemplate {
  id?: string;
  name: string;
  reportType: string;
  filters: {
    dateRange: { start: string, end: string };
    columnFilters: Record<string, string>;
    filterRules?: {id: string, field: string, operator: string, value: string}[];
    filterText: string;
    subsidiary: string;
    class: string;
  };
  viewType: 'summary' | 'spreadsheet';
  createdAt?: any;
}

interface Props {
  reportType: 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'equity' | 'trial_balance' | 'general_ledger' | 'inventory_report' | 'sales_report' | 'pos_summary' | 'sales_by_category' | 'sales_by_item' | 'tax_report' | 'waiter_performance' | 'raw_material_consumption';
  journalEntries: any[];
  journal: any[];
  orders: any[];
  inventory: any[];
  items: any[];
  bills?: any[];
  categories?: any[];
  ledgerGroups?: any[];
  formatCurrency: (amount: number) => string;
  exportToExcel: (data: any[], filename: string) => void;
  systemSettings: any;
}

export default function AccountingReportsIFRS({ reportType, journalEntries, journal, orders, inventory, items, bills = [], categories = [], ledgerGroups = [], formatCurrency, exportToExcel, systemSettings }: Props) {
  const [viewType, setViewType] = useState<'summary' | 'spreadsheet'>('summary');
  const [filterText, setFilterText] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [filterRules, setFilterRules] = useState<{id: string, field: string, operator: string, value: string}[]>([]);
  const [selectedSubsidiary, setSelectedSubsidiary] = useState('All Subsidiaries');
  const [selectedClass, setSelectedClass] = useState('All Classes');
  const [subsidiaries, setSubsidiaries] = useState<{id: string, name: string}[]>([]);
  const [classes, setClasses] = useState<{id: string, name: string}[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<ReportTemplate[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  // Fetch Subsidiaries, Classes, and Templates
  useEffect(() => {
    const unsubSubs = onSnapshot(collection(db, 'subsidiaries'), (snap) => {
      setSubsidiaries(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });
    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));
    });
    const unsubTemplates = onSnapshot(
      query(collection(db, 'report_templates'), where('reportType', '==', reportType)),
      (snap) => {
        setSavedTemplates(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ReportTemplate)));
      }
    );
    return () => { unsubSubs(); unsubClasses(); unsubTemplates(); };
  }, [reportType]);

  // Initialize visible columns
  useEffect(() => {
    setVisibleColumns(getColumnsForReport(reportType));
  }, [reportType]);

  const saveCurrentDesign = async () => {
    if (!newTemplateName) return;
    try {
      await addDoc(collection(db, 'report_templates'), {
        name: newTemplateName,
        reportType,
        filters: {
          dateRange,
          columnFilters,
          filterRules,
          filterText,
          subsidiary: selectedSubsidiary,
          class: selectedClass
        },
        viewType,
        createdAt: serverTimestamp()
      });
      setNewTemplateName('');
      setIsSavingTemplate(false);
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const loadTemplate = (template: ReportTemplate) => {
    setDateRange(template.filters.dateRange);
    setColumnFilters(template.filters.columnFilters || {});
    setFilterRules(template.filters.filterRules || []);
    setFilterText(template.filters.filterText);
    setSelectedSubsidiary(template.filters.subsidiary);
    setSelectedClass(template.filters.class);
    setViewType(template.viewType);
  };

  const deleteTemplate = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'report_templates', id));
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  // 🔴 STRICT DATA PIPELINE: Deduplicate, Global Index, then Filter
  const processedData = useMemo(() => {
    const [sy, sm, sd] = dateRange.start.split('-').map(Number);
    const [ey, em, ed] = dateRange.end.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const end = new Date(ey, em - 1, ed, 23, 59, 59, 999);

    const filterByDate = (item: any) => {
      let date = new Date();
      if (item.date) date = new Date(item.date);
      else if (item.createdAt?.toDate) date = item.createdAt.toDate();
      else if (item.timestamp?.toDate) date = item.timestamp.toDate();
      else if (item.createdAt?.seconds) date = new Date(item.createdAt.seconds * 1000);
      else if (typeof item.createdAt === 'string') date = new Date(item.createdAt);
      else if (typeof item.timestamp === 'string') date = new Date(item.timestamp);
      
      const dateMatch = date >= start && date <= end;
      const subsidiaryMatch = selectedSubsidiary === 'All Subsidiaries' || 
                             item.subsidiary === selectedSubsidiary || 
                             item.subsidiaryId === selectedSubsidiary;
      const classMatch = selectedClass === 'All Classes' || 
                        item.class === selectedClass || 
                        item.classId === selectedClass;

      return dateMatch && subsidiaryMatch && classMatch;
    };

    // 1. AGGRESSIVE DEDUPLICATION: Prevent POS double-click bugs or React state duplicates
    const dedupedJournalEntries = Array.from(new Map(
      (journalEntries || []).map(e => {
        const key = (e.orderId || e.reference) ? (e.orderId || e.reference) : e.id;
        return [key, e];
      })
    ).values());

    const dedupedOrders = Array.from(new Map((orders || []).map(o => [o.id, o])).values());
    const dedupedJournal = Array.from(new Map((journal || []).map(j => [j.id, j])).values());

    // 2. GLOBAL INDEX: Built before date filtering to prevent boundary double-counting
    const formalLedgerOrderIds = new Set<string>();
    dedupedJournalEntries.forEach(entry => {
      if (entry.orderId) formalLedgerOrderIds.add(entry.orderId);
      const ref = String(entry.reference || entry.description || '').toUpperCase();
      dedupedOrders.forEach(o => {
        if (o.id && (ref.includes(o.id.toUpperCase()) || ref.includes(o.id.slice(-6).toUpperCase()))) {
          formalLedgerOrderIds.add(o.id);
        }
      });
    });

    return {
      formalLedgerOrderIds, // Export global index
      globalOrders: dedupedOrders, // Export raw orders for fallback matching
      journalEntries: dedupedJournalEntries.filter(filterByDate),
      journal: dedupedJournal.filter(filterByDate),
      orders: dedupedOrders.filter(filterByDate),
    };
  }, [journalEntries, journal, orders, dateRange]);

  const accountBalances = useMemo(() => {
    const balances: Record<string, { debit: number, credit: number, type: string, balance: number }> = {};
    
    const addBalance = (accountName: string, type: string, debit: number, credit: number) => {
      if (!balances[accountName]) balances[accountName] = { debit: 0, credit: 0, type, balance: 0 };
      // Ensure we are working with cents for absolute precision
      // Many legacy entries might be in dollars, so we detect if they need transformation
      // BUT formal journal entries created in the NEW system are already cents.
      // We assume entries > 100000000 or with decimals are NOT cents? No, that's complex.
      // Let's force everything to cents by rounding to 0 decimals after multiplying if it looks like dollars.
      // Actually, standardizing on cents is better.
      balances[accountName].debit += Math.round(debit);
      balances[accountName].credit += Math.round(credit);
    };

    const getAccountType = (accountId: string, accountName: string) => {
      const group = ledgerGroups.find(g => g.id === accountId || g.name === accountName);
      if (group) return group.type.charAt(0).toUpperCase() + group.type.slice(1).toLowerCase();
      const nameLower = accountName.toLowerCase();
      const idLower = accountId.toLowerCase();
      if (nameLower.includes('revenue') || nameLower.includes('sales') || idLower.includes('sales') || idLower.includes('revenue')) return 'Revenue';
      if (nameLower.includes('expense') || nameLower.includes('cost') || idLower.includes('expense') || idLower.includes('cogs')) return 'Expense';
      if (nameLower.includes('liability') || nameLower.includes('payable') || nameLower.includes('tax') || idLower.includes('payable') || idLower.includes('tax')) return 'Liability';
      if (nameLower.includes('equity') || nameLower.includes('capital') || nameLower.includes('retained') || idLower.includes('equity')) return 'Equity';
      return 'Asset';
    };

    // 1. Process Formal Journal Entries (Source of Truth)
    processedData.journalEntries.forEach(entry => {
      if (!entry.lines) return;
      entry.lines.forEach((line: any) => {
        const type = getAccountType(line.accountId || '', line.account || line.accountName || '');
        addBalance(line.account || line.accountName || 'Unknown Account', type, line.debit || 0, line.credit || 0);
      });
    });

    // 2. Process Legacy Orders (ONLY if absolutely missing from formal ledger)
    processedData.orders.forEach(order => {
      if (!processedData.formalLedgerOrderIds.has(order.id) && ['paid', 'finalized', 'completed'].includes(order.status)) {
        // order.total is stored in cents
        const amountCents = Math.round(order.total || 0);
        const taxRate = systemSettings?.taxRate || 0;
        const taxCents = order.taxAmount ? Math.round(order.taxAmount) : Math.round(amountCents - (amountCents / (1 + (taxRate / 100))));
        const netCents = amountCents - taxCents;
        
        const pMethod = (order.paymentMethod || 'cash').toLowerCase();
        const assetAccount = (pMethod === 'card' || pMethod === 'bank') ? 'Bank Accounts' : 'Cash on Hand';
        
        addBalance('Sales Revenue', 'Revenue', 0, netCents);
        addBalance('VAT Payable', 'Liability', 0, taxCents);
        addBalance(assetAccount, 'Asset', amountCents, 0);
      }
    });

    // 3. Process Manual Simple Journal (Ignore duplicates linked to Orders)
    processedData.journal.forEach(entry => {
      if (entry.orderId && processedData.formalLedgerOrderIds.has(entry.orderId)) return;
      
      const entryRef = String(entry.description || '').toUpperCase();
      const belongsToLegacyOrder = processedData.globalOrders.some(o => 
        o.id === entry.orderId || (o.id && entryRef.includes(o.id.slice(-6).toUpperCase()))
      );
      if (belongsToLegacyOrder) return;

      const eType = String(entry.type).toLowerCase();
      const isRevenue = eType === 'income' || eType === 'sale';
      const isRefund = eType === 'refund' || eType === 'revoke' || eType === 'void';
      // Manual journals store amount in cents
      const amountCents = Math.round(entry.amount || 0);
      
      const pMethod = (entry.paymentMethod || 'cash').toLowerCase();
      const assetAccount = (pMethod === 'card' || pMethod === 'bank') ? 'Bank Accounts' : 'Cash on Hand';

      if (isRevenue) {
        addBalance(entry.accountName || 'Sales Revenue', 'Revenue', 0, amountCents);
        addBalance(assetAccount, 'Asset', amountCents, 0);
      } else if (isRefund) {
        // Refund reduces revenue
        addBalance(entry.accountName || 'Sales Revenue', 'Revenue', amountCents, 0);
        addBalance(assetAccount, 'Asset', 0, amountCents);
      } else {
        addBalance(entry.accountName || 'Operating Expenses', 'Expense', amountCents, 0);
        addBalance(assetAccount, 'Asset', 0, amountCents);
      }
    });

    Object.keys(balances).forEach(account => {
      const b = balances[account];
      b.balance = (b.type === 'Asset' || b.type === 'Expense') ? b.debit - b.credit : b.credit - b.debit;
    });
    
    return balances;
  }, [processedData, ledgerGroups]);

  const reportData = useMemo(() => {
    const data: any = { profit_loss: [], balance_sheet: [], cash_flow: [], equity: [], trial_balance: [], general_ledger: [], inventory_report: [], sales_report: [], pos_summary: [], sales_by_category: [], sales_by_item: [], tax_report: [], waiter_performance: [], raw_material_consumption: [], revocations_voids: [] };
    let totalRevenue = 0, totalExpense = 0, totalAssets = 0, totalLiabilities = 0, totalEquity = 0, totalSales = 0, totalPOSSales = 0, totalTax = 0, totalCOGS = 0, totalRevoked = 0;

    const getCategoryName = (idOrName: string, itemId?: string, itemName?: string) => {
      let catIdOrName = idOrName;
      if (!catIdOrName || catIdOrName === 'Other' || catIdOrName === 'Uncategorized') {
        const menuItem = items.find(m => (itemId && m.id === itemId) || (itemName && m.name === itemName));
        if (menuItem && menuItem.category) catIdOrName = menuItem.category;
      }
      if (!catIdOrName || catIdOrName === 'Other') return 'Uncategorized';
      const cat = categories.find(c => c.id === catIdOrName || c.name === catIdOrName);
      return cat ? cat.name : catIdOrName;
    };

    Object.entries(accountBalances).forEach(([name, b]: [string, any]) => {
      let subcategory = 'Uncategorized';
      let accountClass = b.type;
      
      const group = ledgerGroups.find(g => g.name === name);
      if (group && group.parentGroupId) {
        const parent = ledgerGroups.find(g => g.code === group.parentGroupId || g.id === group.parentGroupId);
        if (parent) { subcategory = parent.name; accountClass = parent.type; }
      }

      data.trial_balance.push({ 
        Class: accountClass, 
        Subcategory: subcategory, 
        Account: name, 
        Type: b.type, 
        Debit: b.debit, 
        Credit: b.credit, 
        Balance: b.balance,
        '% of Type': b.balance && (b.type === 'Revenue' ? (b.balance / totalRevenue * 100) : (b.type === 'Expense' ? (b.balance / totalExpense * 100) : 0))
      });

      if (b.type === 'Revenue') {
        data.profit_loss.push({ Class: 'Revenue', Subcategory: subcategory, Account: name, Amount: b.balance });
        totalRevenue += b.balance;
      } else if (b.type === 'Expense') {
        const isCOGS = subcategory.toLowerCase().includes('cost of sales') || name.toLowerCase().includes('cogs') || name.toLowerCase().includes('cost of sales');
        data.profit_loss.push({ Class: 'Expense', Subcategory: isCOGS ? 'Cost of Sales' : subcategory, Account: name, Amount: b.balance });
        if (isCOGS) totalCOGS += b.balance;
        else totalExpense += b.balance;
      }

      if (b.type === 'Asset') {
        data.balance_sheet.push({ Class: 'Asset', Subcategory: subcategory, Account: name, Amount: b.balance });
        totalAssets += b.balance;
      } else if (b.type === 'Liability') {
        data.balance_sheet.push({ Class: 'Liability', Subcategory: subcategory, Account: name, Amount: b.balance });
        totalLiabilities += b.balance;
      } else if (b.type === 'Equity') {
        data.balance_sheet.push({ Class: 'Equity', Subcategory: subcategory, Account: name, Amount: b.balance });
        totalEquity += b.balance;
      }
    });
    
    const grossProfit = totalRevenue - totalCOGS;
    const netIncome = grossProfit - totalExpense;
    
    data.balance_sheet.push({ Class: 'Equity', Subcategory: 'Retained Earnings', Account: 'Retained Earnings (Net Income)', Amount: netIncome });
    totalEquity += netIncome;

    const cashAccounts = Object.keys(accountBalances).filter(k => k.toLowerCase().includes('cash') || k.toLowerCase().includes('bank'));
    let netCashFlow = 0;
    cashAccounts.forEach(acc => {
      const b = accountBalances[acc];
      data.cash_flow.push({ Category: 'Operating Activities', Account: acc, Amount: b.balance });
      netCashFlow += b.balance;
    });

    data.equity.push({ Category: 'Beginning Balance', Account: 'Opening Equity', Amount: 0 });
    data.equity.push({ Category: 'Changes', Account: 'Net Income for the Period', Amount: netIncome });
    data.equity.push({ Category: 'Ending Balance', Account: 'Total Equity', Amount: netIncome });

    processedData.journalEntries.forEach(entry => {
      const subsidiaryName = subsidiaries.find(s => s.id === entry.subsidiaryId)?.name || entry.subsidiary || 'N/A';
      const className = classes.find(c => c.id === entry.classId)?.name || entry.class || 'N/A';
      
      (entry.lines || []).forEach((line: any) => {
        data.general_ledger.push({ 
          Date: new Date(entry.date).toLocaleDateString(), 
          Reference: entry.reference, 
          Description: entry.description, 
          Account: line.accountName, 
          Debit: line.debit || 0, 
          Credit: line.credit || 0,
          Subsidiary: subsidiaryName,
          Class: className
        });
      });
    });

    inventory.forEach(item => {
      const stock = item.stock || item.quantity || 0;
      const cost = item.averageCost || item.costPerUnit || item.cost || 0;
      const type = item.category === 'finished_good' ? 'Finished Good' : 'Raw Material';
      data.inventory_report.push({ 
        Item: item.name, 
        Type: type,
        Category: getCategoryName(item.category, item.id, item.name), 
        Stock: stock, 
        Unit: item.unit || 'pcs', 
        'Avg Cost': cost, 
        'Total Value': stock * cost,
        Threshold: item.lowStockThreshold || 0,
        Status: stock <= (item.lowStockThreshold || 0) ? 'Low Stock' : 'Healthy',
        'Last Update': item.lastUpdated?.toDate ? item.lastUpdated.toDate().toLocaleString() : 'N/A'
      });
    });

    const categorySales: Record<string, { total: number, quantity: number, orders: Set<string> }> = {};
    const itemSales: Record<string, { name: string, quantity: number, total: number, category: string, cost: number }> = {};
    const waiterSales: Record<string, { name: string, orders: number, total: number, guests: number, maxOrder: number }> = {};
    const materialConsumption: Record<string, { name: string, consumedQty: number, totalCost: number, unit: string, currentStock: number }> = {};

    processedData.orders.forEach(order => {
      const isRevoked = order.status === 'cancelled' || order.status === 'refunded';
      if (['paid', 'finalized', 'completed', 'cancelled', 'refunded'].includes(order.status)) {
        // order.total is already in cents
        const amount = Math.round(order.total || 0);
        if (!isRevoked) totalSales += amount;
        else totalRevoked += amount;

        const taxRate = systemSettings?.taxRate || 0;
        const taxVal = order.taxAmount ? Math.round(order.taxAmount) : Math.round(amount - (amount / (1 + (taxRate / 100))));
        if (!isRevoked) totalTax += taxVal;

        const safeItems = order.items || [];
        const uniqueCategories = Array.from(new Set(safeItems.map((i: any) => getCategoryName(i.category, i.itemId, i.name)))).join(', ');

        const reportRow = { 
          Date: new Date(order.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString(), 
          OrderID: order.id.slice(0, 8), 
          'Order No': order.orderNo || 'N/A',
          'KOT No': order.kotNo || 'N/A',
          Customer: order.customerName || 'Walk-in',
          Type: order.orderType?.toUpperCase() || 'DINE-IN',
          Table: order.tableNumber || 'N/A',
          Guests: order.occupancy || 0,
          Total: isRevoked ? -amount : amount, 
          Tax: isRevoked ? -taxVal : taxVal, 
          Discount: Math.round(order.discount || 0),
          Net: (isRevoked ? -amount : amount) - (isRevoked ? -taxVal : taxVal) - Math.round(order.discount || 0),
          Categories: uniqueCategories || 'Uncategorized', 
          'Payment Method': order.paymentMethod?.toUpperCase() || 'CASH', 
          Waiter: order.waiter || 'N/A',
          Status: order.status.toUpperCase()
        };

        data.sales_report.push(reportRow);
        if (isRevoked) {
          data.revocations_voids.push({
            ...reportRow,
            Reason: order.cancelReason || 'Customer Request',
            'Revoked By': order.cancelledBy || 'System'
          });
        }

        if (isRevoked) return; // Don't include in performance metrics

        const waiter = order.waiter || 'Unknown';
        if (!waiterSales[waiter]) waiterSales[waiter] = { name: waiter, orders: 0, total: 0, guests: 0, maxOrder: 0 };
        waiterSales[waiter].orders += 1;
        waiterSales[waiter].total += amount;
        waiterSales[waiter].guests += (order.occupancy || 0);
        waiterSales[waiter].maxOrder = Math.max(waiterSales[waiter].maxOrder, amount);

        safeItems.forEach((item: any) => {
          const catName = getCategoryName(item.category, item.itemId, item.name);
          if (!categorySales[catName]) categorySales[catName] = { total: 0, quantity: 0, orders: new Set() };
          // All order item prices are in cents
          const price = Math.round(item.price || 0);
          const qty = item.quantity || 0;
          categorySales[catName].total += (price * qty);
          categorySales[catName].quantity += qty;
          categorySales[catName].orders.add(order.id);

          const itemKey = item.itemId || item.name || 'unknown';
          if (!itemSales[itemKey]) {
            itemSales[itemKey] = { name: item.name || 'Unknown', quantity: 0, total: 0, category: catName, cost: 0 };
          }
          itemSales[itemKey].quantity += qty;
          itemSales[itemKey].total += (price * qty);

          // Calculate Material Consumption based on Recipes
          const menuItem = items.find(m => m.id === item.itemId || m.name === item.name);
          let itemCostPerUnit = 0;
          if (menuItem && menuItem.recipe && Array.isArray(menuItem.recipe)) {
            menuItem.recipe.forEach((ing: any) => {
              const invItem = inventory.find(i => i.id === ing.inventoryItemId);
              if (invItem) {
                if (!materialConsumption[invItem.id]) {
                  materialConsumption[invItem.id] = { name: invItem.name, consumedQty: 0, totalCost: 0, unit: invItem.unit || 'units', currentStock: invItem.stock || 0 };
                }
                const consumed = (ing.quantity || 0) * qty;
                // Detect if cost was saved in dollars or cents
                const rawCost = invItem.averageCost || invItem.costPerUnit || 0;
                const costPerUnit = rawCost < 500 && rawCost % 1 !== 0 ? Math.round(rawCost * 100) : Math.round(rawCost);
                
                materialConsumption[invItem.id].consumedQty += consumed;
                materialConsumption[invItem.id].totalCost += Math.round(consumed * costPerUnit);
                itemCostPerUnit += (ing.quantity * costPerUnit);
              }
            });
          }
          itemSales[itemKey].cost += Math.round(itemCostPerUnit * qty);
        });

        if (order.source === 'pos' || order.status === 'finalized' || order.source === 'manual') {
          totalPOSSales += amount;
          data.pos_summary.push({ 
            Date: new Date(order.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString(), 
            OrderID: order.id.slice(0, 8), 
            'Order No': order.orderNo || 'N/A',
            Amount: amount, 
            'Pay Method': order.paymentMethod?.toUpperCase() || 'CASH',
            Waiter: order.waiter || 'N/A',
            Items: safeItems.length
          });
        }
      }
    });

    Object.entries(categorySales).forEach(([cat, stats]) => { 
      data.sales_by_category.push({ 
        Category: cat, 
        'Total Sales': stats.total, 
        'Items Sold': stats.quantity,
        Orders: stats.orders.size,
        'Avg per Order': stats.orders.size > 0 ? stats.total / stats.orders.size : 0,
        Percentage: totalSales > 0 ? (stats.total / totalSales) * 100 : 0 
      }); 
    });
    Object.values(itemSales).forEach(item => { 
      data.sales_by_item.push({ 
        Item: item.name, 
        Category: item.category, 
        Quantity: item.quantity, 
        'Total Sales': item.total,
        Cost: item.cost,
        Profit: item.total - item.cost,
        'Margin %': item.total > 0 ? ((item.total - item.cost) / item.total * 100) : 0
      }); 
    });
    Object.values(waiterSales).forEach(waiter => { 
      data.waiter_performance.push({ 
        Waiter: waiter.name, 
        Orders: waiter.orders, 
        'Total Sales': waiter.total, 
        'Avg Order': waiter.total / waiter.orders,
        'Total Guests': waiter.guests,
        'Avg Guests': waiter.orders > 0 ? waiter.guests / waiter.orders : 0,
        'Max Order': waiter.maxOrder
      }); 
    });
    Object.values(materialConsumption).forEach(mat => { 
      data.raw_material_consumption.push({ 
        Material: mat.name, 
        Consumed: mat.consumedQty, 
        Unit: mat.unit, 
        'Total Cost': mat.totalCost,
        'Avg Cost': mat.consumedQty > 0 ? mat.totalCost / mat.consumedQty : 0,
        'Current Stock': mat.currentStock,
        'Stock Value': mat.currentStock * (mat.consumedQty > 0 ? mat.totalCost / mat.consumedQty : 0)
      }); 
    });

    const taxRate = systemSettings?.taxRate || 0;
    const taxFactor = taxRate / 100;
    data.tax_report.push({ Type: 'Output VAT (Sales)', Amount: Math.round(totalTax) });
    data.tax_report.push({ Type: 'Input VAT (Expenses)', Amount: Math.round(totalExpense * taxFactor) });
    data.tax_report.push({ Type: 'Net VAT Payable', Amount: Math.round(totalTax - (totalExpense * taxFactor)) });

    return { data, totals: { netIncome, grossProfit, totalRevenue, totalCOGS, totalAssets, totalLiabilities, totalEquity, netCashFlow, totalSales, totalPOSSales, totalTax, totalExpense, totalRevoked } };
  }, [accountBalances, processedData, inventory, categories, items, ledgerGroups]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getColumnsForReport = (type: string) => {
    switch (type) {
      case 'general_ledger': return ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit', 'Subsidiary', 'Class'];
      case 'trial_balance': return ['Class', 'Subcategory', 'Account', 'Type', 'Debit', 'Credit', 'Balance', '% of Type'];
      case 'inventory_report': return ['Item', 'Type', 'Category', 'Stock', 'Unit', 'Avg Cost', 'Total Value', 'Threshold', 'Status', 'Last Update'];
      case 'sales_report': return ['Date', 'OrderID', 'Order No', 'KOT No', 'Customer', 'Type', 'Table', 'Guests', 'Total', 'Tax', 'Discount', 'Net', 'Categories', 'Payment Method', 'Waiter', 'Status'];
      case 'pos_summary': return ['Date', 'OrderID', 'Order No', 'Amount', 'Pay Method', 'Waiter', 'Items'];
      case 'revocations_voids': return ['Date', 'OrderID', 'Order No', 'Customer', 'Total', 'Reason', 'Revoked By', 'Waiter'];
      case 'sales_by_category': return ['Category', 'Total Sales', 'Items Sold', 'Orders', 'Avg per Order', 'Percentage'];
      case 'sales_by_item': return ['Item', 'Category', 'Quantity', 'Total Sales', 'Cost', 'Profit', 'Margin %'];
      case 'tax_report': return ['Type', 'Amount'];
      case 'waiter_performance': return ['Waiter', 'Orders', 'Total Sales', 'Avg Order', 'Total Guests', 'Avg Guests', 'Max Order'];
      case 'raw_material_consumption': return ['Material', 'Consumed', 'Unit', 'Total Cost', 'Avg Cost', 'Current Stock', 'Stock Value'];
      case 'profit_loss': return ['Class', 'Subcategory', 'Account', 'Amount'];
      case 'balance_sheet': return ['Class', 'Subcategory', 'Account', 'Amount'];
      case 'cash_flow': return ['Category', 'Account', 'Amount'];
      case 'equity': return ['Category', 'Account', 'Amount'];
      default: return ['Category', 'Account', 'Amount'];
    }
  };

  const renderSpreadsheet = (data: any[] = [], columns: string[]) => {
    if (!data || !Array.isArray(data)) data = [];
    
    const isCategoricalCol = (col: string) => {
      const uniqueValues = Array.from(new Set(data.map(row => row[col]))).filter(v => v !== null && v !== undefined && v !== '');
      return uniqueValues.length > 0 && uniqueValues.length <= 25 && 
             !col.toLowerCase().includes('date') && 
             !col.toLowerCase().includes('amount') && 
             !col.toLowerCase().includes('total') &&
             !col.toLowerCase().includes('quantity') &&
             !col.toLowerCase().includes('id');
    };

    let processedData = [...data];
    
    Object.entries(columnFilters).forEach(([col, filter]) => {
      if (filter) {
        if (isCategoricalCol(col)) {
           processedData = processedData.filter(row => String(row[col] || '') === filter);
        } else {
           processedData = processedData.filter(row => String(row[col] || '').toLowerCase().includes(String(filter).toLowerCase()));
        }
      }
    });

    if (filterText) {
      processedData = processedData.filter(row => Object.values(row).some(val => String(val || '').toLowerCase().includes(String(filterText).toLowerCase())));
    }

    if (filterRules && filterRules.length > 0) {
      processedData = processedData.filter(row => {
        return filterRules.every(rule => {
          if (!rule.field || !rule.operator) return true;
          const val = row[rule.field];
          const ruleVal = rule.value;
          
          if (val === undefined || val === null) return false;
          
          const strVal = String(val).toLowerCase();
          const strRuleVal = String(ruleVal).toLowerCase();
          const numVal = Number(val);
          const numRuleVal = Number(ruleVal);

          switch (rule.operator) {
            case 'equals': return strVal === strRuleVal;
            case 'contains': return strVal.includes(strRuleVal);
            case 'greater_than': return !isNaN(numVal) && !isNaN(numRuleVal) && numVal > numRuleVal;
            case 'less_than': return !isNaN(numVal) && !isNaN(numRuleVal) && numVal < numRuleVal;
            case 'starts_with': return strVal.startsWith(strRuleVal);
            case 'ends_with': return strVal.endsWith(strRuleVal);
            default: return true;
          }
        });
      });
    }
    
    if (sortConfig) {
      processedData.sort((a, b) => {
        const aVal = a[sortConfig.key], bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    const formatCellValue = (val: any, col: string) => {
      if (typeof val !== 'number') return val || '';
      const lowerCol = col.toLowerCase();
      if (lowerCol.includes('percentage') || lowerCol.includes('%') || lowerCol.includes('margin')) return `${val.toFixed(2)}%`;
      if (lowerCol.includes('quantity') || lowerCol.includes('orders') || lowerCol.includes('guests') || lowerCol.includes('threshold') || lowerCol.includes('items')) return val.toLocaleString(); 
      // Accounting data is in cents, use formatCurrency for clean AED display
      return formatCurrency(val);
    };

    // Calculate total balance for the top right indicator
    let totalBalance = 0;
    if (reportType === 'general_ledger' || reportType === 'trial_balance' || reportType === 'cash_flow') {
      const amountCol = columns.find(c => c.toLowerCase().includes('amount') || c.toLowerCase().includes('balance'));
      if (amountCol) {
        totalBalance = processedData.reduce((sum, row) => sum + (row[amountCol] || 0), 0);
      }
    } else if (reportType.includes('sales')) {
      const salesCol = columns.find(c => c.toLowerCase().includes('sales') || c.toLowerCase().includes('amount'));
      if (salesCol) {
        totalBalance = processedData.reduce((sum, row) => sum + (row[salesCol] || 0), 0);
      }
    }

    return (
      <div className="flex flex-col w-full bg-card border border-border shadow-sm rounded-xl overflow-hidden font-sans">
        {/* Filter Bar */}
        {showFilters && (
          <div className="bg-muted/50 border-b border-border p-4 flex flex-col gap-4 animate-in slide-in-from-top duration-300">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
                <Calendar size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">From:</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none text-sm text-foreground outline-none focus:ring-0 p-0 w-[120px]"
                  value={dateRange.start}
                  onChange={e => setDateRange({...dateRange, start: e.target.value})}
                />
                <span className="text-sm font-medium text-muted-foreground ml-2">To:</span>
                <input 
                  type="date" 
                  className="bg-transparent border-none text-sm text-foreground outline-none focus:ring-0 p-0 w-[120px]"
                  value={dateRange.end}
                  onChange={e => setDateRange({...dateRange, end: e.target.value})}
                />
              </div>
              <div className="flex-1 flex gap-4">
                <div className="relative flex-1">
                  <select 
                    className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground outline-none appearance-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm font-medium"
                    value={selectedSubsidiary}
                    onChange={e => setSelectedSubsidiary(e.target.value)}
                  >
                    <option value="All Subsidiaries">All Subsidiaries</option>
                    {subsidiaries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <div className="relative flex-1">
                  <select 
                    className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground outline-none appearance-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm font-medium"
                    value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                  >
                    <option value="All Classes">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Query Node Designer */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground/80 flex items-center gap-2">
                  <Filter size={16} className="text-primary" /> Query Node Designer
                </h4>
                <button 
                  onClick={() => setFilterRules([...filterRules, { id: Math.random().toString(36).substr(2, 9), field: columns[0] || '', operator: 'equals', value: '' }])}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Add Rule
                </button>
              </div>
              
              {filterRules.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 italic py-2">No custom query rules applied. Click "Add Rule" to filter anything.</div>
              ) : (
                <div className="space-y-2">
                  {filterRules.map((rule, index) => (
                    <div key={rule.id} className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg border border-border/50">
                      <span className="text-xs font-bold text-muted-foreground/60 w-6 text-center">{index + 1}.</span>
                      <select 
                        className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground/80 outline-none focus:border-primary transition-colors w-40"
                        value={rule.field}
                        onChange={e => {
                          const newRules = [...filterRules];
                          newRules[index].field = e.target.value;
                          setFilterRules(newRules);
                        }}
                      >
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                      <select 
                        className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground/80 outline-none focus:border-primary transition-colors w-36"
                        value={rule.operator}
                        onChange={e => {
                          const newRules = [...filterRules];
                          newRules[index].operator = e.target.value;
                          setFilterRules(newRules);
                        }}
                      >
                        <option value="equals">Equals</option>
                        <option value="contains">Contains</option>
                        <option value="starts_with">Starts With</option>
                        <option value="ends_with">Ends With</option>
                        <option value="greater_than">Greater Than</option>
                        <option value="less_than">Less Than</option>
                      </select>
                      <input 
                        type="text" 
                        placeholder="Value..."
                        className="flex-1 bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground/80 outline-none focus:border-primary transition-colors"
                        value={rule.value}
                        onChange={e => {
                          const newRules = [...filterRules];
                          newRules[index].value = e.target.value;
                          setFilterRules(newRules);
                        }}
                      />
                      <button 
                        onClick={() => {
                          const newRules = [...filterRules];
                          newRules.splice(index, 1);
                          setFilterRules(newRules);
                        }}
                        className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 bg-card border-b border-border">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
              <input 
                type="text" 
                placeholder="Search report data..." 
                className="pl-9 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary outline-none w-64 transition-all"
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(() => {
              let totalBalance = 0;
              if (reportType === 'general_ledger' || reportType === 'trial_balance' || reportType === 'cash_flow') {
                const amountCol = columns.find(c => c.toLowerCase().includes('amount') || c.toLowerCase().includes('balance'));
                if (amountCol) {
                  totalBalance = processedData.reduce((sum, row) => sum + (row[amountCol] || 0), 0);
                }
              } else if (reportType.includes('sales')) {
                const salesCol = columns.find(c => c.toLowerCase().includes('sales') || c.toLowerCase().includes('amount'));
                if (salesCol) {
                  totalBalance = processedData.reduce((sum, row) => sum + (row[salesCol] || 0), 0);
                }
              }
              return totalBalance !== 0 ? (
                <div className="px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-semibold border border-primary/20">
                  Total: {formatCurrency(totalBalance)}
                </div>
              ) : null;
            })()}
            <button 
              onClick={() => {
                const exportData = processedData.map(row => {
                  const newRow: any = {};
                  Object.keys(row).forEach(key => {
                    const val = row[key];
                    if (typeof val === 'number' && !key.toLowerCase().includes('quantity') && !key.toLowerCase().includes('orders') && !key.toLowerCase().includes('percentage')) {
                      newRow[key] = val / 100;
                    } else {
                      newRow[key] = val;
                    }
                  });
                  return newRow;
                });
                exportToExcel(exportData, `${reportType}_export`);
              }}
              className="flex items-center gap-2 bg-card border border-border hover:bg-muted/50 text-foreground/80 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Download size={16} /> Export to Excel
            </button>
          </div>
        </div>

        {/* Data Grid */}
        <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_rgba(0,0,0,0.1)]">
              <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {visibleColumns.map((col, i) => {
                  const uniqueValues = Array.from(new Set(data.map(row => row[col]))).filter(v => v !== null && v !== undefined && v !== '');
                  const isCategorical = isCategoricalCol(col);

                  return (
                    <th key={i} className="px-6 py-4 align-bottom group">
                      <div className="flex flex-col gap-3">
                        <button onClick={() => handleSort(col)} className="flex items-center justify-between gap-2 w-full hover:text-foreground transition-colors">
                          <span>{col}</span>
                          <div className={`transition-opacity ${sortConfig?.key === col ? 'opacity-100 text-foreground' : 'opacity-0 group-hover:opacity-50 text-muted-foreground'}`}>
                            {sortConfig?.key === col && sortConfig.direction === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </div>
                        </button>
                        
                        {isCategorical ? (
                          <select 
                            className="w-full bg-card border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-normal text-foreground shadow-sm"
                            value={columnFilters[col] || ''}
                            onChange={e => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                          >
                            <option value="">All</option>
                            {uniqueValues.map((v: any) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <input 
                            type="text" 
                            placeholder="Filter..." 
                            className="w-full bg-card border border-border rounded-md px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-normal text-foreground placeholder:text-muted-foreground shadow-sm"
                            value={columnFilters[col] || ''}
                            onChange={e => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                          />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {processedData.length > 0 ? processedData.map((row, i) => (
                <tr key={i} className="hover:bg-muted/50 transition-all group">
                  {visibleColumns.map((col, j) => {
                    const isNumeric = typeof row[col] === 'number';
                    return (
                      <td key={j} className={`px-6 py-4 text-sm ${isNumeric ? 'text-right font-mono text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {isNumeric ? formatCellValue(row[col], col) : row[col] || ''}
                      </td>
                    );
                  })}
                </tr>
              )) : (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Search size={32} className="text-muted-foreground/50" />
                      <p>No matching records found</p>
                    </div>
                  </td>
                </tr>
              )}
              {processedData.length > 0 && ['profit_loss', 'balance_sheet', 'cash_flow', 'equity', 'inventory_report', 'sales_report', 'pos_summary', 'sales_by_category', 'sales_by_item', 'waiter_performance', 'raw_material_consumption'].includes(reportType) && (
                <tr className="bg-card border-t-2 border-border sticky bottom-0 z-10">
                  {visibleColumns.map((col, j) => {
                    const isNumericCol = processedData.some(row => typeof row[col] === 'number');
                    const isSummable = isNumericCol && !col.toLowerCase().includes('percentage') && !col.toLowerCase().includes('avg');
                    const total = isSummable ? processedData.reduce((sum, row) => sum + (row[col] || 0), 0) : null;
                    
                    return (
                      <td key={j} className={`px-6 py-4 ${isNumericCol ? 'text-right font-mono font-bold text-foreground' : 'font-black text-foreground uppercase tracking-widest text-[10px]'}`}>
                        {j === 0 ? 'GRAND TOTAL' : (isSummable ? formatCellValue(total, col) : '')}
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderFinancialGroup = (title: string, items: any[], totalLabel: string, highlightTotal: boolean = false) => {
    if (!items || items.length === 0) return null;
    
    const grouped = items.reduce((acc, item) => {
      const sub = item.Subcategory || 'Uncategorized';
      if (!acc[sub]) acc[sub] = [];
      acc[sub].push(item);
      return acc;
    }, {});
    
    const totalAmount = items.reduce((sum, i) => sum + i.Amount, 0);

    return (
      <div className="mb-10 p-6 bg-card rounded-3xl border border-border shadow-sm group hover:border-primary/20 transition-colors">
        <h3 className="text-sm font-black text-foreground mb-6 uppercase tracking-[0.2em] flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <div className="w-2.5 h-2.5 rounded-full bg-primary/80"></div>
          </div>
          {title}
        </h3>
        
        <div className="space-y-8 pl-4 border-l-2 border-dashed border-border">
          {Object.entries(grouped).map(([subcat, subItems]: [string, any]) => {
            const subtotal = subItems.reduce((sum: number, i: any) => sum + i.Amount, 0);
            return (
              <div key={subcat} className="space-y-2 relative">
                <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-card border-2 border-primary/40 z-10"></div>
                {subcat !== 'Uncategorized' && <h4 className="text-[10px] font-black text-primary/80 uppercase tracking-widest pl-2 mb-3 bg-primary/5 inline-block px-3 py-1 rounded-full">{subcat}</h4>}
                <div className="space-y-1">
                  {subItems.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center py-2.5 px-5 bg-muted/20 hover:bg-muted/80 rounded-2xl transition-all hover:scale-[1.01] hover:shadow-sm">
                      <span className="text-sm font-bold text-foreground/80">{item.Account}</span>
                      <span className="font-mono text-sm font-bold text-foreground">{formatCurrency(item.Amount)}</span>
                    </div>
                  ))}
                </div>
                {subItems.length > 1 && (
                  <div className="flex justify-between items-center text-xs font-black text-muted-foreground pt-3 px-6 border-t border-border mt-2">
                    <span className="uppercase tracking-widest text-[10px]">Total {subcat}</span>
                    <span className="font-mono">{formatCurrency(subtotal)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={`flex justify-between items-center mt-8 pt-6 px-6 border-t-2 ${highlightTotal ? 'border-primary' : 'border-border'} bg-muted/10 rounded-2xl`}>
          <span className={`text-sm uppercase tracking-[0.2em] ${highlightTotal ? 'font-black text-primary' : 'font-black text-foreground'}`}>{totalLabel}</span>
          <span className={`font-mono ${highlightTotal ? 'text-2xl font-black text-primary bg-primary/5 px-4 py-1 rounded-xl' : 'text-xl font-black text-foreground'}`}>{formatCurrency(totalAmount)}</span>
        </div>
      </div>
    );
  };

  const [isQueryDesignerOpen, setIsQueryDesignerOpen] = useState(false);

  const renderQueryDesigner = (columns: string[]) => (
    <div className="bg-card/80 backdrop-blur-xl border-2 border-primary/20 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300 mb-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h4 className="text-xl font-black text-foreground uppercase tracking-tight flex items-center gap-3">
            <Filter className="text-primary" size={24} /> Query Node Designer
          </h4>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Build complex multi-level filters for deep data analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setFilterRules([...filterRules, { id: Math.random().toString(36).substr(2, 9), field: columns[0] || '', operator: 'equals', value: '' }])}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={16} /> Add Rule
          </button>
          <button 
            onClick={() => setFilterRules([])}
            className="px-6 py-2.5 bg-muted/50 text-muted-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-muted/80 transition-all"
          >
            Clear All
          </button>
        </div>
      </div>
      
      {filterRules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-border rounded-3xl bg-muted/20">
          <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-4 shadow-sm">
            <Filter size={32} className="text-muted-foreground/30" />
          </div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">No active query rules</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1 uppercase tracking-widest">Click "Add Rule" to start filtering your data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filterRules.map((rule, index) => (
            <div key={rule.id} className="flex items-center gap-4 bg-background/50 p-4 rounded-2xl border border-border/60 hover:border-primary/30 transition-all group animate-in slide-in-from-left-4 duration-300" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center text-xs font-black shadow-inner">
                {index + 1}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                <select 
                  className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                  value={rule.field}
                  onChange={e => {
                    const newRules = [...filterRules];
                    newRules[index].field = e.target.value;
                    setFilterRules(newRules);
                  }}
                >
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
                <select 
                  className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                  value={rule.operator}
                  onChange={e => {
                    const newRules = [...filterRules];
                    newRules[index].operator = e.target.value;
                    setFilterRules(newRules);
                  }}
                >
                  <option value="equals">Equals</option>
                  <option value="contains">Contains</option>
                  <option value="starts_with">Starts With</option>
                  <option value="ends_with">Ends With</option>
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                </select>
                <input 
                  type="text" 
                  placeholder="Value..."
                  className="bg-card border border-border rounded-xl px-4 py-2.5 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/30"
                  value={rule.value}
                  onChange={e => {
                    const newRules = [...filterRules];
                    newRules[index].value = e.target.value;
                    setFilterRules(newRules);
                  }}
                />
              </div>
              <button 
                onClick={() => {
                  const newRules = [...filterRules];
                  newRules.splice(index, 1);
                  setFilterRules(newRules);
                }}
                className="w-10 h-10 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSummary = () => {
    const { totals, data } = reportData;

    const renderKPICards = (kpis: any[]) => (
      <div className={`grid grid-cols-1 md:grid-cols-${Math.min(4, Math.max(2, kpis.length))} gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500`}>
        {kpis.map((kpi, i) => (
          <div key={i} className={`relative bg-card p-6 md:p-8 rounded-[2.5rem] border overflow-hidden group hover:-translate-y-1 hover:shadow-xl transition-all duration-500 ${kpi.twBorder || 'border-border'}`}>
            <div className={`absolute top-0 right-0 w-32 h-32 ${kpi.twBg || 'bg-primary/5'} rounded-bl-full -mr-8 -mt-8 transition-transform duration-700 ease-out group-hover:scale-[1.5]`}></div>
            <div className={`absolute top-5 right-5 ${kpi.twText || 'text-primary'} opacity-30 group-hover:opacity-100 transition-opacity duration-300`}>
              {kpi.icon && <kpi.icon size={28} strokeWidth={2.5} />}
            </div>
            <div className="relative z-10 mt-2 text-left">
              <p className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-3">{kpi.label}</p>
              <p className={`text-3xl lg:text-4xl font-black ${kpi.twText || 'text-foreground'} tracking-tight drop-shadow-sm`}>
                {kpi.isCurrency !== false && typeof kpi.value === 'number' ? formatCurrency(kpi.value) : kpi.value}
              </p>
              {kpi.sub && <p className={`text-[10px] font-black mt-3 ${kpi.twText || 'text-primary'} bg-primary/10 inline-block px-2.5 py-1 rounded-full uppercase tracking-widest`}>{kpi.sub}</p>}
            </div>
          </div>
        ))}
      </div>
    );

    switch (reportType) {
      case 'profit_loss':
        const revenues = data.profit_loss.filter((r: any) => r.Class === 'Revenue');
        const cogs = data.profit_loss.filter((r: any) => r.Class === 'Expense' && r.Subcategory === 'Cost of Sales');
        const expenses = data.profit_loss.filter((r: any) => r.Class === 'Expense' && r.Subcategory !== 'Cost of Sales');

        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {renderKPICards([
              { label: 'Total Revenue', value: totals.totalRevenue, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: TrendingUp },
              { label: 'Gross Profit', value: totals.grossProfit, twBg: 'bg-amber-500/10', twText: 'text-amber-500', twBorder: 'border-amber-500/20', icon: Wallet, sub: `Margin: ${totals.totalRevenue ? ((totals.grossProfit/totals.totalRevenue)*100).toFixed(1) : 0}%` },
              { label: 'Op. Expenses', value: totals.totalExpense, twBg: 'bg-red-500/10', twText: 'text-red-500', twBorder: 'border-red-500/20', icon: Activity },
              { label: 'Net Income', value: totals.netIncome, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: DollarSign }
            ])}

            <div className="bg-card rounded-[2rem] border border-border shadow-sm p-8 max-w-4xl mx-auto">
              <div className="text-center mb-10 border-b-2 border-border pb-8">
                <h2 className="text-2xl font-black text-foreground uppercase tracking-widest">Statement of Comprehensive Income</h2>
                <p className="text-sm font-medium text-muted-foreground mt-2">For the period {dateRange.start} to {dateRange.end}</p>
              </div>
              
              <div className="space-y-4">
                {renderFinancialGroup('Revenue', revenues, 'Total Revenue')}
                {renderFinancialGroup('Cost of Sales', cogs, 'Total Cost of Sales')}
                
                <div className="flex justify-between items-center py-4 px-6 bg-amber-500/10 rounded-2xl border border-amber-500/20 mb-8">
                  <span className="font-black text-amber-700 uppercase tracking-widest text-sm">Gross Profit</span>
                  <span className="font-mono font-black text-amber-700 text-xl">{formatCurrency(totals.grossProfit)}</span>
                </div>

                {renderFinancialGroup('Operating Expenses', expenses, 'Total Operating Expenses')}

                <div className="flex justify-between items-center mt-12 py-6 px-8 bg-primary/10 rounded-3xl border-2 border-primary/20 shadow-inner">
                  <span className="font-black text-primary uppercase tracking-[0.2em] text-lg">Net Income</span>
                  <span className="font-mono font-black text-primary text-3xl">{formatCurrency(totals.netIncome)}</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'balance_sheet':
        const assets = data.balance_sheet.filter((r: any) => r.Class === 'Asset');
        const liabilities = data.balance_sheet.filter((r: any) => r.Class === 'Liability');
        const equity = data.balance_sheet.filter((r: any) => r.Class === 'Equity');

        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {renderKPICards([
              { label: 'Total Assets', value: totals.totalAssets, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: Scale },
              { label: 'Total Liabilities', value: totals.totalLiabilities, twBg: 'bg-amber-500/10', twText: 'text-amber-500', twBorder: 'border-amber-500/20', icon: FileText },
              { label: 'Total Equity', value: totals.totalEquity, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: DollarSign }
            ])}

            <div className="bg-card rounded-[2rem] border border-border shadow-sm p-8 max-w-4xl mx-auto">
              <div className="text-center mb-10 border-b-2 border-border pb-8">
                <h2 className="text-2xl font-black text-foreground uppercase tracking-widest">Statement of Financial Position</h2>
                <p className="text-sm font-medium text-muted-foreground mt-2">As of {dateRange.end}</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div>
                  <div className="bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10 mb-6">
                    <h3 className="text-lg font-black text-emerald-700 uppercase tracking-widest text-center">Assets</h3>
                  </div>
                  {renderFinancialGroup('Current & Non-Current', assets, 'Total Assets', true)}
                </div>
                <div>
                  <div className="bg-amber-500/5 p-4 rounded-xl border border-amber-500/10 mb-6">
                    <h3 className="text-lg font-black text-amber-700 uppercase tracking-widest text-center">Liabilities & Equity</h3>
                  </div>
                  {renderFinancialGroup('Liabilities', liabilities, 'Total Liabilities')}
                  {renderFinancialGroup('Equity', equity, 'Total Equity')}
                  
                  <div className="flex justify-between items-center mt-8 py-4 px-6 bg-muted/50 rounded-2xl border-2 border-border">
                    <span className="font-black text-foreground uppercase tracking-widest text-sm">Total Liab. & Equity</span>
                    <span className="font-mono font-black text-foreground text-xl">{formatCurrency(totals.totalLiabilities + totals.totalEquity)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'cash_flow':
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Net Cash Flow', value: totals.netCashFlow, twBg: totals.netCashFlow >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10', twText: totals.netCashFlow >= 0 ? 'text-emerald-500' : 'text-red-500', twBorder: totals.netCashFlow >= 0 ? 'border-emerald-500/20' : 'border-red-500/20', icon: DollarSign },
              { label: 'Cash Generating Accounts', value: data.cash_flow.length, isCurrency: false, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: Wallet }
            ])}
            {renderSpreadsheet(data.cash_flow, getColumnsForReport('cash_flow'))}
          </div>
        );

      case 'sales_report':
      case 'pos_summary':
      case 'sales_by_category':
        const uniqueCategoriesExtracted = reportType === 'sales_by_category' ? data.sales_by_category.length : new Set(data[reportType].flatMap((d:any) => String(d.Categories || d.Category).split(', '))).size;
        
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Total Sales Revenue', value: totals.totalSales, twBg: 'bg-primary/10', twText: 'text-primary', twBorder: 'border-primary/20', icon: TrendingUp },
              { label: 'Revocations/Voids', value: totals.totalRevoked, twBg: 'bg-red-500/10', twText: 'text-red-500', twBorder: 'border-red-500/20', icon: X },
              { label: 'Total Volume', value: `${data[reportType].length} Transactions`, isCurrency: false, twBg: 'bg-purple-500/10', twText: 'text-purple-500', twBorder: 'border-purple-500/20', icon: FileText },
              { label: 'Avg Value', value: data[reportType].length ? totals.totalSales / data[reportType].length : 0, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: DollarSign },
              { label: 'Active Categories', value: uniqueCategoriesExtracted, isCurrency: false, twBg: 'bg-amber-500/10', twText: 'text-amber-500', twBorder: 'border-amber-500/20', icon: PieChart }
            ])}
            {renderSpreadsheet(data[reportType], getColumnsForReport(reportType))}
          </div>
        );

      case 'sales_by_item':
        const bestItem = [...data.sales_by_item].sort((a: any, b: any) => b.TotalSales - a.TotalSales)[0];
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Top Selling Item', value: bestItem ? bestItem.Item : 'N/A', isCurrency: false, twBg: 'bg-purple-500/10', twText: 'text-purple-500', twBorder: 'border-purple-500/20', icon: Activity, sub: bestItem ? formatCurrency(bestItem.TotalSales) : undefined },
              { label: 'Total Sales Revenue', value: totals.totalSales, twBg: 'bg-primary/10', twText: 'text-primary', twBorder: 'border-primary/20', icon: TrendingUp },
              { label: 'Top Sold Quantity', value: bestItem ? `${bestItem.Quantity} units` : '0', isCurrency: false, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: Package }
            ])}
            {renderSpreadsheet(data.sales_by_item, getColumnsForReport('sales_by_item'))}
          </div>
        );

      case 'tax_report':
        const netVatPayable = data.tax_report.find((r: any) => r.Type === 'Net VAT Payable')?.Amount || 0;
        const outputVat = data.tax_report.find((r: any) => r.Type === 'Output VAT (Sales)')?.Amount || 0;
        const inputVat = data.tax_report.find((r: any) => r.Type === 'Input VAT (Expenses)')?.Amount || 0;
        
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Net VAT Payable', value: netVatPayable, twBg: netVatPayable >= 0 ? 'bg-red-500/10' : 'bg-emerald-500/10', twText: netVatPayable >= 0 ? 'text-red-500' : 'text-emerald-500', twBorder: netVatPayable >= 0 ? 'border-red-500/20' : 'border-emerald-500/20', icon: Scale },
              { label: 'Output VAT (Collected)', value: outputVat, twBg: 'bg-amber-500/10', twText: 'text-amber-500', twBorder: 'border-amber-500/20', icon: ArrowLeft },
              { label: 'Input VAT (Deductible)', value: inputVat, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: Plus }
            ])}
            {renderSpreadsheet(data.tax_report, getColumnsForReport('tax_report'))}
          </div>
        );

      case 'waiter_performance':
        const bWaiter = [...data.waiter_performance].sort((a: any, b: any) => b.TotalSales - a.TotalSales)[0];
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Top Waiter', value: bWaiter?.Waiter || 'N/A', isCurrency: false, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: User, sub: bWaiter ? `Orders: ${bWaiter.Orders}` : undefined },
              { label: 'Waiter Revenue', value: bWaiter?.TotalSales || 0, twBg: 'bg-primary/10', twText: 'text-primary', twBorder: 'border-primary/20', icon: TrendingUp },
              { label: 'System Sales', value: totals.totalSales, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: Wallet }
            ])}
            {renderSpreadsheet(data.waiter_performance, getColumnsForReport('waiter_performance'))}
          </div>
        );

      case 'inventory_report':
        const totalStockVal = data.inventory_report.reduce((sum: number, r: any) => sum + r.TotalValue, 0);
        const lowStockTypes = new Set(data.inventory_report.map((r:any) => r.Category)).size;
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Total Inventory Value', value: totalStockVal, twBg: 'bg-primary/10', twText: 'text-primary', twBorder: 'border-primary/20', icon: Package },
              { label: 'Active Tracked Items', value: data.inventory_report.length, isCurrency: false, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: Activity },
              { label: 'Item Categories', value: lowStockTypes, isCurrency: false, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: LayoutGrid }
            ])}
            {renderSpreadsheet(data.inventory_report, getColumnsForReport('inventory_report'))}
          </div>
        );

      case 'raw_material_consumption':
        const totalConsumptionCost = data.raw_material_consumption.reduce((sum: number, r: any) => sum + r.TotalCost, 0);
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Total Used Value', value: totalConsumptionCost, twBg: 'bg-primary/10', twText: 'text-primary', twBorder: 'border-primary/20', icon: DollarSign },
              { label: 'Materials Consumed', value: data.raw_material_consumption.length, isCurrency: false, twBg: 'bg-emerald-500/10', twText: 'text-emerald-500', twBorder: 'border-emerald-500/20', icon: Package }
            ])}
            {renderSpreadsheet(data.raw_material_consumption, getColumnsForReport('raw_material_consumption'))}
          </div>
        );

      case 'trial_balance':
        const totalDebits = data.trial_balance.reduce((sum: number, r: any) => sum + r.Debit, 0);
        const totalCredits = data.trial_balance.reduce((sum: number, r: any) => sum + r.Credit, 0);
        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
        
        return (
          <div className="space-y-6">
            {renderKPICards([
              { label: 'Total Debits', value: totalDebits, twBg: 'bg-blue-500/10', twText: 'text-blue-500', twBorder: 'border-blue-500/20', icon: DollarSign },
              { label: 'Total Credits', value: totalCredits, twBg: 'bg-purple-500/10', twText: 'text-purple-500', twBorder: 'border-purple-500/20', icon: DollarSign },
              { label: 'Balance Status', value: isBalanced ? 'BALANCED' : 'IMBALANCED', isCurrency: false, twBg: isBalanced ? 'bg-emerald-500/10' : 'bg-red-500/10', twText: isBalanced ? 'text-emerald-500' : 'text-red-500', twBorder: isBalanced ? 'border-emerald-500/20' : 'border-red-500/20', icon: Scale, sub: isBalanced ? 'Audit Passed' : 'Check Entries' }
            ])}
            {renderSpreadsheet(data.trial_balance, getColumnsForReport('trial_balance'))}
          </div>
        );

      default:
        return renderSpreadsheet(data[reportType], getColumnsForReport(reportType));
    }
  };

  if (viewType === 'spreadsheet') {
    return (
      <div className="w-full h-full flex flex-col bg-background font-sans -mx-4 -mt-4 sm:-mx-8 sm:-mt-8 w-[calc(100%+2rem)] sm:w-[calc(100%+4rem)] min-h-screen relative">
        {/* Top App-like Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-foreground">
              <FileText size={20} className="text-primary" />
              <span className="font-bold text-lg">
                {reportType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </span>
            </div>
            
            <div className="relative group ml-4">
              <select 
                className="bg-muted/50 border border-border rounded-lg px-4 py-2 text-sm text-foreground/80 outline-none hover:border-border/80 focus:ring-2 focus:ring-primary transition-all cursor-pointer min-w-[200px] appearance-none font-medium"
                onChange={(e) => {
                  const template = savedTemplates.find(t => t.id === e.target.value);
                  if (template) loadTemplate(template);
                }}
              >
                <option value="">Load saved designs</option>
                {savedTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
            </div>

            <button 
              className="w-9 h-9 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-muted-foreground/80 hover:text-foreground/80 hover:bg-muted/80 transition-all"
              title="Audit History"
            >
              <History size={16} />
            </button>

            <button 
              onClick={() => setIsSavingTemplate(true)}
              className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
              title="Save Design"
            >
              <Save size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${showFilters ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-card border border-border text-muted-foreground/80 hover:bg-muted/50'}`}
              title="Toggle Filters"
            >
              <Filter size={16} />
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${showColumnPicker ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-card border border-border text-muted-foreground/80 hover:bg-muted/50'}`}
                title="Column Visibility"
              >
                <Columns size={16} />
              </button>
              {showColumnPicker && (
                <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-xl z-[100] p-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider p-2 border-b border-border/50 mb-2">Visible Columns</div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
                    {getColumnsForReport(reportType).map(col => (
                      <label key={col} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors group">
                        <input 
                          type="checkbox" 
                          checked={visibleColumns.includes(col)}
                          onChange={() => {
                            setVisibleColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
                          }}
                          className="w-4 h-4 rounded border-border/50 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">{col}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button 
              className="w-9 h-9 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground/80 hover:text-foreground/80 hover:bg-muted/50 transition-all"
              title="Report Settings"
            >
              <Settings size={16} />
            </button>
            <div className="w-px h-6 bg-border mx-2"></div>
            <button 
              onClick={() => setViewType('summary')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-foreground/80 text-sm font-medium hover:bg-muted/50 transition-all shadow-sm"
            >
              <LayoutGrid size={16} /> Back to Summary
            </button>
          </div>
        </div>

        {/* Save Template Modal */}
        {isSavingTemplate && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-border/50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Save size={20} className="text-primary" /> Save Design Template
                </h3>
                <button onClick={() => setIsSavingTemplate(false)} className="text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider ml-1">Template Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Monthly Sales Summary" 
                    className="w-full bg-muted/50 border border-border rounded-xl p-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                  <p className="text-sm text-primary font-medium leading-relaxed">
                    This will save your current filters, date range, and view settings as a reusable template.
                  </p>
                </div>
                <label className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl cursor-pointer hover:bg-muted/80 transition-colors border border-border">
                  <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-border/50 text-primary focus:ring-primary" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-foreground">Share with Team</span>
                    <span className="text-xs text-muted-foreground/80">Allow other admin users to see and use this template</span>
                  </div>
                </label>
              </div>
              <div className="p-6 bg-muted/50 flex gap-3 border-t border-border/50">
                <button 
                  onClick={() => setIsSavingTemplate(false)}
                  className="flex-1 px-6 py-3 rounded-xl bg-card border border-border text-foreground/80 font-bold text-sm hover:bg-muted/50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveCurrentDesign}
                  disabled={!newTemplateName}
                  className="flex-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  Save Design
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* The Spreadsheet Content */}
        <div className="flex-1 p-0 overflow-hidden">
          {renderSpreadsheet(reportData.data[reportType], visibleColumns)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 w-full mx-auto max-w-7xl animate-in fade-in zoom-in-95 duration-500">
      <div className="relative bg-card/60 backdrop-blur-3xl p-6 md:p-8 rounded-[2.5rem] border border-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden group hover:border-primary/20 transition-all duration-500 z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10 group-hover:bg-primary/10 transition-colors duration-700"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl -z-10"></div>
        
        <div className="flex items-center gap-5 pl-2 z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary to-emerald-400 rounded-3xl blur opacity-30 group-hover:opacity-50 transition-opacity duration-500"></div>
            <div className="relative w-16 h-16 bg-card rounded-3xl flex items-center justify-center text-primary shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] border border-primary/10 transform group-hover:scale-105 transition-transform duration-500">
              {reportType === 'profit_loss' ? <TrendingUp size={30} strokeWidth={2.5} /> :
               reportType === 'balance_sheet' ? <Scale size={30} strokeWidth={2.5} /> :
               reportType === 'cash_flow' ? <DollarSign size={30} strokeWidth={2.5} /> :
               reportType === 'sales_by_category' ? <PieChart size={30} strokeWidth={2.5} /> :
               reportType === 'inventory_report' ? <Activity size={30} strokeWidth={2.5} /> : <FileText size={30} strokeWidth={2.5} />}
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black text-foreground tracking-tight drop-shadow-sm">
              {reportType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <p className="text-[11px] text-muted-foreground font-black uppercase tracking-[0.2em]">IFRS Report Engine</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10">
          <div className="flex bg-muted/80 backdrop-blur-sm p-1.5 rounded-2xl border border-border shadow-inner">
            {[
              { label: 'Today', start: new Date(), end: new Date() },
              { label: 'Yesterday', start: new Date(Date.now() - 86400000), end: new Date(Date.now() - 86400000) },
              { label: 'Weekly', start: new Date(new Date().setDate(new Date().getDate() - new Date().getDay())), end: new Date() },
              { label: 'Monthly', start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: new Date() },
              { label: 'Yearly', start: new Date(new Date().getFullYear(), 0, 1), end: new Date() }
            ].map(f => {
              const toLocalString = (d: Date) => new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
              const startStr = toLocalString(f.start);
              const endStr = toLocalString(f.end);
              return (
              <button
                key={f.label}
                onClick={() => setDateRange({ start: startStr, end: endStr })}
                className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${
                  dateRange.start === startStr && dateRange.end === endStr
                  ? 'bg-card block overflow-hidden text-primary shadow-[0_2px_10px_rgba(0,0,0,0.05)] scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {f.label}
              </button>
            )})}
          </div>

          <div className="flex items-center gap-3 bg-muted/80 backdrop-blur-sm p-2 rounded-2xl border border-border shadow-inner">
            <div className="flex items-center gap-2 px-3">
              <Calendar size={16} className="text-primary" />
              <input 
                type="date" 
                className="bg-transparent text-xs font-bold text-foreground outline-none cursor-pointer w-[110px]"
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
              />
              <span className="text-muted-foreground font-bold">→</span>
              <input 
                type="date" 
                className="bg-transparent text-xs font-bold text-foreground outline-none cursor-pointer w-[110px]"
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
              />
            </div>
          </div>

          <div className="flex bg-muted/80 backdrop-blur-sm p-1.5 rounded-2xl border border-border shadow-inner ml-2">
            <button 
              onClick={() => setViewType('summary')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${viewType === 'summary' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
               <FileText size={16} /> Summary
            </button>
            <button 
              onClick={() => setViewType('spreadsheet')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${viewType === 'spreadsheet' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}
            >
               <FileSpreadsheet size={16} /> Sheet
            </button>
          </div>
          <button 
            onClick={() => setIsQueryDesignerOpen(!isQueryDesignerOpen)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 border ${isQueryDesignerOpen ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-105' : 'bg-card text-muted-foreground border-border hover:bg-muted/50'}`}
          >
            <Filter size={16} /> Query Designer
          </button>
          <button 
            onClick={() => {
              const formattedData = processedData.map((row: any) => {
                const newRow = { ...row };
                Object.keys(newRow).forEach(key => {
                  if (typeof newRow[key] === 'number' && !key.toLowerCase().includes('quantity') && !key.toLowerCase().includes('orders') && !key.toLowerCase().includes('percentage')) {
                    newRow[key] = newRow[key] / 100;
                  }
                });
                return newRow;
              });
              exportToExcel(formattedData, reportType);
            }}
            className="flex items-center gap-2 bg-emerald-500 text-white px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {isQueryDesignerOpen && renderQueryDesigner(getColumnsForReport(reportType))}

      <div className="mt-4">
        {renderSummary()}
      </div>
    </div>
  );
}