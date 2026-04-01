import React, { useState, useMemo } from 'react';
import { Download, Filter, FileText, Scale, History, DollarSign, Activity, TrendingUp, Calendar, ChevronDown, ChevronUp, Search, FileSpreadsheet } from 'lucide-react';

interface Props {
  reportType: 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'equity' | 'trial_balance' | 'general_ledger' | 'inventory_report' | 'sales_report' | 'pos_summary' | 'sales_by_category' | 'sales_by_item' | 'tax_report' | 'waiter_performance';
  journalEntries: any[];
  journal: any[];
  orders: any[];
  inventory: any[];
  items: any[];
  categories?: any[];
  ledgerGroups: any[];
  formatCurrency: (amount: number) => string;
  exportToExcel: (data: any[], filename: string) => void;
}

export default function AccountingReportsIFRS({ reportType, journalEntries, journal, orders, inventory, items, categories = [], ledgerGroups, formatCurrency, exportToExcel }: Props) {
  const [viewType, setViewType] = useState<'summary' | 'spreadsheet'>('summary');
  const [filterText, setFilterText] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  // Filter raw data by date range
  const filteredRawData = useMemo(() => {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    end.setHours(23, 59, 59, 999);

    const filterByDate = (item: any) => {
      const date = item.date ? new Date(item.date) : 
                   item.createdAt?.toDate ? item.createdAt.toDate() :
                   item.timestamp?.toDate ? item.timestamp.toDate() :
                   item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000) :
                   new Date();
      return date >= start && date <= end;
    };

    return {
      journalEntries: journalEntries.filter(filterByDate),
      journal: journal.filter(filterByDate),
      orders: orders.filter(filterByDate),
    };
  }, [journalEntries, journal, orders, dateRange]);

  // Calculate balances from journal entries, orders, and simple journal
  const accountBalances = useMemo(() => {
    const balances: Record<string, { debit: number, credit: number, type: string, balance: number }> = {};
    
    const addBalance = (accountName: string, type: string, debit: number, credit: number) => {
      if (!balances[accountName]) {
        balances[accountName] = { debit: 0, credit: 0, type, balance: 0 };
      }
      balances[accountName].debit += debit;
      balances[accountName].credit += credit;
    };

    // Helper to get account type from ledgerGroups or name
    const getAccountType = (accountId: string, accountName: string) => {
      const group = ledgerGroups.find(g => g.id === accountId || g.name === accountName);
      if (group) {
        const t = group.type.charAt(0).toUpperCase() + group.type.slice(1).toLowerCase();
        return t;
      }

      const nameLower = accountName.toLowerCase();
      const idLower = accountId.toLowerCase();
      if (nameLower.includes('revenue') || nameLower.includes('sales') || idLower.includes('sales') || idLower.includes('revenue')) return 'Revenue';
      if (nameLower.includes('expense') || nameLower.includes('cost') || idLower.includes('expense') || idLower.includes('cogs')) return 'Expense';
      if (nameLower.includes('liability') || nameLower.includes('payable') || nameLower.includes('tax') || idLower.includes('payable') || idLower.includes('tax')) return 'Liability';
      if (nameLower.includes('equity') || nameLower.includes('capital') || nameLower.includes('retained') || idLower.includes('equity')) return 'Equity';
      return 'Asset';
    };

    // 1. Process formal journal entries (THE PRIMARY SOURCE OF TRUTH)
    filteredRawData.journalEntries.forEach(entry => {
      if (!entry.lines) return;
      entry.lines.forEach((line: any) => {
        const type = getAccountType(line.accountId || '', line.account || line.accountName || '');
        addBalance(line.account || line.accountName || 'Unknown Account', type, line.debit || 0, line.credit || 0);
      });
    });

    // 2. Process Orders (ONLY if they are NOT already in journalEntries to avoid double counting)
    filteredRawData.orders.forEach(order => {
      // Check if this order has a corresponding journal entry
      const hasJournal = journalEntries.some(j => 
        j.orderId === order.id || 
        j.reference === `Order ${order.id}` || 
        j.reference === order.id ||
        j.reference === `ORD-${order.id.slice(-6).toUpperCase()}` ||
        (j.reference && j.reference.includes(order.id.slice(-6).toUpperCase()))
      );
      
      if (!hasJournal && ['paid', 'finalized', 'completed'].includes(order.status)) {
        const amount = order.total || 0;
        const tax = order.taxAmount || Math.round(amount - (amount / 1.05));
        const net = amount - tax;
        
        addBalance('Sales Revenue', 'Revenue', 0, net);
        addBalance('VAT Payable', 'Liability', 0, tax);
        addBalance('Cash', 'Asset', amount, 0);
      }
    });

    // 3. Process simple journal (manual transactions) - ONLY if not already in journal_entries OR orders
    filteredRawData.journal.forEach(entry => {
      // Check if this entry is already in journal_entries (to avoid double counting)
      const existsInFormal = journalEntries.some(j => 
        (j.orderId && entry.orderId && j.orderId === entry.orderId) ||
        (j.description === entry.description && 
         j.lines.some(l => l.debit === entry.amount || l.credit === entry.amount))
      );
      
      // Check if this entry corresponds to an order we already processed
      const existsInOrders = filteredRawData.orders.some(o => 
        entry.orderId === o.id || 
        (entry.description && entry.description.includes(o.id.slice(-6).toUpperCase()))
      );
      
      if (!existsInFormal && !existsInOrders) {
        const type = entry.type === 'income' || entry.type === 'sale' ? 'Revenue' : 'Expense';
        const amount = entry.amount || 0;
        
        if (type === 'Revenue') {
          addBalance(entry.accountName || 'Sales Revenue', 'Revenue', 0, amount);
          addBalance('Cash', 'Asset', amount, 0);
        } else {
          addBalance(entry.accountName || 'Operating Expenses', 'Expense', amount, 0);
          addBalance('Cash', 'Asset', 0, amount);
        }
      }
    });

    // Calculate final balances based on normal balance rules
    Object.keys(balances).forEach(account => {
      const b = balances[account];
      if (b.type === 'Asset' || b.type === 'Expense') {
        b.balance = b.debit - b.credit;
      } else {
        b.balance = b.credit - b.debit;
      }
    });
    
    return balances;
  }, [filteredRawData, ledgerGroups, journalEntries]);

  const reportData = useMemo(() => {
    const data: any = {
      profit_loss: [],
      balance_sheet: [],
      cash_flow: [],
      equity: [],
      trial_balance: [],
      general_ledger: [],
      inventory_report: [],
      sales_report: [],
      pos_summary: [],
      sales_by_category: [],
      sales_by_item: [],
      tax_report: [],
      waiter_performance: []
    };

    let totalRevenue = 0;
    let totalExpense = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalSales = 0;
    let totalPOSSales = 0;
    let totalTax = 0;
    let totalCOGS = 0;

    Object.entries(accountBalances).forEach(([name, b]: [string, any]) => {
      let subcategory = 'Uncategorized';
      let accountClass = b.type;
      
      const group = ledgerGroups.find(g => g.name === name);
      if (group && group.parentGroupId) {
        const parent = ledgerGroups.find(g => g.code === group.parentGroupId);
        if (parent) {
          subcategory = parent.name;
          accountClass = parent.type;
        }
      }

      // Trial Balance
      data.trial_balance.push({
        Class: accountClass,
        Subcategory: subcategory,
        Account: name,
        Type: b.type,
        Debit: b.debit,
        Credit: b.credit,
        Balance: b.balance
      });

      // Profit & Loss
      if (b.type === 'Revenue') {
        data.profit_loss.push({ Class: 'Revenue', Subcategory: subcategory, Account: name, Amount: b.balance });
        totalRevenue += b.balance;
      } else if (b.type === 'Expense') {
        const isCOGS = name.toLowerCase().includes('cogs') || name.toLowerCase().includes('cost of sales');
        data.profit_loss.push({ Class: 'Expense', Subcategory: isCOGS ? 'Cost of Sales' : subcategory, Account: name, Amount: b.balance });
        if (isCOGS) totalCOGS += b.balance;
        else totalExpense += b.balance;
      }

      // Balance Sheet
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

    // If COGS is 0, we don't estimate it anymore to ensure accuracy based on actual purchases.
    
    const grossProfit = totalRevenue - totalCOGS;
    const netIncome = grossProfit - totalExpense;
    
    data.balance_sheet.push({ Class: 'Equity', Subcategory: 'Retained Earnings', Account: 'Retained Earnings (Net Income)', Amount: netIncome });
    totalEquity += netIncome;

    // Cash Flow (Simplified)
    const cashAccounts = Object.keys(accountBalances).filter(k => k.toLowerCase().includes('cash') || k.toLowerCase().includes('bank'));
    let netCashFlow = 0;
    cashAccounts.forEach(acc => {
      const b = accountBalances[acc];
      data.cash_flow.push({ Category: 'Operating Activities', Account: acc, Amount: b.balance });
      netCashFlow += b.balance;
    });

    // Changes in Equity
    data.equity.push({ Category: 'Beginning Balance', Account: 'Opening Equity', Amount: 0 });
    data.equity.push({ Category: 'Changes', Account: 'Net Income for the Period', Amount: netIncome });
    data.equity.push({ Category: 'Ending Balance', Account: 'Total Equity', Amount: netIncome });

    // General Ledger
    filteredRawData.journalEntries.forEach(entry => {
      entry.lines.forEach((line: any) => {
        data.general_ledger.push({
          Date: new Date(entry.date).toLocaleDateString(),
          Reference: entry.reference,
          Description: entry.description,
          Account: line.accountName,
          Debit: line.debit || 0,
          Credit: line.credit || 0
        });
      });
    });

    // Inventory Report
    inventory.forEach(item => {
      const stock = item.stock || item.quantity || 0;
      const cost = item.averageCost || item.costPerUnit || item.cost || 0;
      const value = stock * cost;
      data.inventory_report.push({
        Item: item.name,
        Category: item.category || 'Uncategorized',
        Quantity: stock,
        Unit: item.unit || 'pcs',
        Cost: cost,
        TotalValue: value
      });
    });

    // Helper to get category name from ID or name
    const getCategoryName = (categoryIdOrName: string) => {
      if (!categoryIdOrName) return 'Uncategorized';
      const cat = categories.find(c => c.id === categoryIdOrName || c.name === categoryIdOrName);
      return cat ? cat.name : categoryIdOrName;
    };

    // Sales Reports
    const categorySales: Record<string, number> = {};
    const itemSales: Record<string, { name: string, quantity: number, total: number, category: string }> = {};
    const waiterSales: Record<string, { name: string, orders: number, total: number }> = {};

    filteredRawData.orders.forEach(order => {
      if (['paid', 'finalized', 'completed'].includes(order.status)) {
        const amount = order.total || 0;
        totalSales += amount;
        
        const tax = order.taxAmount || Math.round(amount - (amount / 1.05));
        totalTax += tax;

        data.sales_report.push({
          Date: new Date(order.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString(),
          OrderID: order.id.slice(0, 8),
          Customer: order.customerName || 'Walk-in',
          Amount: amount,
          Tax: tax,
          Categories: Array.from(new Set(order.items?.map((i: any) => getCategoryName(i.category)))).join(', '),
          PaymentMethod: order.paymentMethod || 'cash',
          Source: order.source || 'manual'
        });

        const waiter = order.waiter || 'Unknown';
        if (!waiterSales[waiter]) waiterSales[waiter] = { name: waiter, orders: 0, total: 0 };
        waiterSales[waiter].orders += 1;
        waiterSales[waiter].total += amount;

        order.items?.forEach((item: any) => {
          const catName = getCategoryName(item.category);
          categorySales[catName] = (categorySales[catName] || 0) + (item.price * item.quantity);

          if (!itemSales[item.itemId]) {
            itemSales[item.itemId] = { name: item.name, quantity: 0, total: 0, category: catName };
          }
          itemSales[item.itemId].quantity += item.quantity;
          itemSales[item.itemId].total += (item.price * item.quantity);
        });

        if (order.source === 'pos' || order.status === 'finalized') {
          totalPOSSales += amount;
          data.pos_summary.push({
            Date: new Date(order.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString(),
            OrderID: order.id.slice(0, 8),
            Amount: amount,
            PaymentMethod: order.paymentMethod || 'cash'
          });
        }
      }
    });

    // Format new reports
    Object.entries(categorySales).forEach(([cat, total]) => {
      data.sales_by_category.push({ Category: cat, TotalSales: total, Percentage: totalSales > 0 ? (total / totalSales) * 100 : 0 });
    });

    Object.values(itemSales).forEach(item => {
      data.sales_by_item.push({ Item: item.name, Category: item.category, Quantity: item.quantity, TotalSales: item.total });
    });

    Object.values(waiterSales).forEach(waiter => {
      data.waiter_performance.push({ Waiter: waiter.name, Orders: waiter.orders, TotalSales: waiter.total, AvgOrder: waiter.total / waiter.orders });
    });

    data.tax_report.push({ Type: 'Output VAT (Sales)', Amount: totalTax });
    data.tax_report.push({ Type: 'Input VAT (Expenses)', Amount: totalExpense * 0.05 });
    data.tax_report.push({ Type: 'Net VAT Payable', Amount: totalTax - (totalExpense * 0.05) });

    return { data, totals: { netIncome, grossProfit, totalRevenue, totalCOGS, totalAssets, totalLiabilities, totalEquity, netCashFlow, totalSales, totalPOSSales, totalTax, totalExpense } };
  }, [accountBalances, filteredRawData, inventory]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSpreadsheet = (data: any[], columns: string[]) => {
    let processedData = [...data];

    // Column Filtering
    Object.entries(columnFilters).forEach(([col, filter]) => {
      if (filter) {
        processedData = processedData.filter(row => 
          String(row[col] || '').toLowerCase().includes(String(filter).toLowerCase())
        );
      }
    });

    // Global Search
    if (filterText) {
      processedData = processedData.filter(row => 
        Object.values(row).some(val => 
          String(val || '').toLowerCase().includes(String(filterText).toLowerCase())
        )
      );
    }

    // Sorting
    if (sortConfig) {
      processedData.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4 bg-card p-4 rounded-2xl border border-border">
          <div className="flex-1 flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-xl border border-border">
            <Filter size={14} className="text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search across all columns..." 
              className="flex-1 outline-none text-xs bg-transparent text-foreground"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Date Range:</span>
            <input 
              type="date" 
              className="bg-muted/50 border border-border rounded-lg px-2 py-1 text-xs outline-none"
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <span className="text-muted-foreground">-</span>
            <input 
              type="date" 
              className="bg-muted/50 border border-border rounded-lg px-2 py-1 text-xs outline-none"
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm shadow-sm">
                <tr className="border-b border-border">
                  {columns.map((col, i) => (
                    <th key={i} className="px-6 py-4 min-w-[120px]">
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => handleSort(col)}
                          className="flex items-center gap-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
                        >
                          {col}
                          {sortConfig?.key === col && (
                            <span className="text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                        <input 
                          type="text" 
                          placeholder="Filter..." 
                          className="w-full bg-background/50 border border-border rounded px-2 py-0.5 text-[10px] outline-none focus:border-primary"
                          value={columnFilters[col] || ''}
                          onChange={e => setColumnFilters(prev => ({ ...prev, [col]: e.target.value }))}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {processedData.length > 0 ? processedData.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors group">
                    {columns.map((col, j) => (
                      <td key={j} className={`px-6 py-3 text-sm ${typeof row[col] === 'number' ? 'text-right font-mono text-foreground' : 'text-muted-foreground'}`}>
                        {typeof row[col] === 'number' ? 
                          (col.toLowerCase().includes('percentage') ? `${row[col].toFixed(2)}%` : formatCurrency(row[col])) : 
                          row[col]}
                      </td>
                    ))}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground text-sm italic">
                      No data found for the selected period or filters.
                    </td>
                  </tr>
                )}
                {/* Total Row */}
                {processedData.length > 0 && ['profit_loss', 'balance_sheet', 'cash_flow', 'equity', 'inventory_report', 'sales_report', 'pos_summary', 'sales_by_category', 'sales_by_item', 'waiter_performance'].includes(reportType) && (
                  <tr className="bg-muted/50 font-black border-t-2 border-border sticky bottom-0">
                    {columns.map((col, j) => {
                      const isNumeric = typeof processedData[0]?.[col] === 'number' && !col.toLowerCase().includes('percentage') && !col.toLowerCase().includes('avg');
                      const total = isNumeric ? processedData.reduce((sum, row) => sum + (row[col] || 0), 0) : null;
                      return (
                        <td key={j} className={`px-6 py-4 text-sm ${isNumeric ? 'text-right font-mono text-foreground' : 'text-foreground uppercase tracking-widest text-[10px]'}`}>
                          {j === 0 ? 'TOTAL' : isNumeric ? formatCurrency(total!) : ''}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const getColumnsForReport = (type: string) => {
    switch (type) {
      case 'general_ledger': return ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit'];
      case 'trial_balance': return ['Class', 'Subcategory', 'Account', 'Type', 'Debit', 'Credit', 'Balance'];
      case 'inventory_report': return ['Item', 'Category', 'Quantity', 'Unit', 'Cost', 'TotalValue'];
      case 'sales_report': return ['Date', 'OrderID', 'Customer', 'Amount', 'Tax', 'Categories', 'PaymentMethod', 'Source'];
      case 'pos_summary': return ['Date', 'OrderID', 'Amount', 'PaymentMethod'];
      case 'sales_by_category': return ['Category', 'TotalSales', 'Percentage'];
      case 'sales_by_item': return ['Item', 'Category', 'Quantity', 'TotalSales'];
      case 'tax_report': return ['Type', 'Amount'];
      case 'waiter_performance': return ['Waiter', 'Orders', 'TotalSales', 'AvgOrder'];
      case 'profit_loss': return ['Class', 'Subcategory', 'Account', 'Amount'];
      case 'balance_sheet': return ['Class', 'Subcategory', 'Account', 'Amount'];
      case 'cash_flow': return ['Category', 'Account', 'Amount'];
      case 'equity': return ['Category', 'Account', 'Amount'];
      default: return ['Category', 'Account', 'Amount'];
    }
  };

  const renderSummary = () => {
    const { totals, data } = reportData;

    switch (reportType) {
      case 'profit_loss':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Revenue</p>
                <p className="text-2xl font-black text-emerald-700">{formatCurrency(totals.totalRevenue)}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Gross Profit</p>
                <p className="text-2xl font-black text-amber-700">{formatCurrency(totals.grossProfit)}</p>
                <p className="text-[10px] text-amber-600 font-bold mt-1">Margin: {totals.totalRevenue > 0 ? ((totals.grossProfit / totals.totalRevenue) * 100).toFixed(1) : 0}%</p>
              </div>
              <div className="bg-red-50 border border-red-100 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-2">Op. Expenses</p>
                <p className="text-2xl font-black text-red-700">{formatCurrency(totals.totalExpense)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Net Income</p>
                <p className="text-2xl font-black text-blue-700">{formatCurrency(totals.netIncome)}</p>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-black text-zinc-400 uppercase tracking-widest">Detailed Breakdown</h4>
              {renderSpreadsheet(data.profit_loss, getColumnsForReport('profit_loss'))}
            </div>
          </div>
        );
      case 'balance_sheet':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Total Assets</p>
                <p className="text-2xl font-black text-zinc-900">{formatCurrency(totals.totalAssets)}</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Total Liabilities</p>
                <p className="text-2xl font-black text-zinc-900">{formatCurrency(totals.totalLiabilities)}</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Total Equity</p>
                <p className="text-2xl font-black text-zinc-900">{formatCurrency(totals.totalEquity)}</p>
              </div>
            </div>
            {renderSpreadsheet(data.balance_sheet, getColumnsForReport('balance_sheet'))}
          </div>
        );
      case 'sales_by_category':
        return (
          <div className="space-y-8">
            <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl max-w-sm">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Total Sales</p>
              <p className="text-2xl font-black text-blue-700">{formatCurrency(totals.totalSales)}</p>
            </div>
            {renderSpreadsheet(data.sales_by_category, getColumnsForReport('sales_by_category'))}
          </div>
        );
      case 'tax_report':
        return (
          <div className="space-y-8">
            <div className="bg-purple-50 border border-purple-100 p-6 rounded-2xl max-w-sm">
              <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-2">Net VAT Payable</p>
              <p className="text-2xl font-black text-purple-700">{formatCurrency((data.tax_report.find((r: any) => r.Type === 'Net VAT Payable')?.Amount || 0))}</p>
            </div>
            {renderSpreadsheet(data.tax_report, getColumnsForReport('tax_report'))}
          </div>
        );
      case 'waiter_performance':
        return (
          <div className="space-y-8">
            <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl max-w-sm">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">Top Performer</p>
              <p className="text-2xl font-black text-zinc-900">{data.waiter_performance.sort((a: any, b: any) => b.TotalSales - a.TotalSales)[0]?.Waiter || 'N/A'}</p>
            </div>
            {renderSpreadsheet(data.waiter_performance, getColumnsForReport('waiter_performance'))}
          </div>
        );
      default:
        return renderSpreadsheet(data[reportType], getColumnsForReport(reportType));
    }
  };

  const { totals, data } = reportData;
  // Revenue should be net of tax, extracted from the profit_loss data which already has net amounts
  const totalRevenue = data.profit_loss.filter((r: any) => r.Class === 'Revenue').reduce((sum: number, r: any) => sum + r.Amount, 0);
  const totalExpense = data.profit_loss.filter((r: any) => r.Class === 'Expense').reduce((sum: number, r: any) => sum + r.Amount, 0);

  return (
    <div className="space-y-8">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[40px] border border-zinc-100 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-zinc-900 tracking-tight flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
              {reportType === 'profit_loss' ? <TrendingUp size={24} /> :
               reportType === 'balance_sheet' ? <Scale size={24} /> :
               reportType === 'cash_flow' ? <DollarSign size={24} /> :
               reportType === 'inventory_report' ? <Activity size={24} /> : <FileText size={24} />}
            </div>
            {reportType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </h2>
          <p className="text-sm text-zinc-400 font-medium ml-1">IFRS Compliant Financial Reporting</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Predefined Filters */}
          <div className="flex items-center gap-2 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-100">
            {[
              { label: 'Today', start: new Date(), end: new Date() },
              { label: 'This Month', start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), end: new Date() },
              { label: 'Last Month', start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), end: new Date(new Date().getFullYear(), new Date().getMonth(), 0) },
              { label: 'This Year', start: new Date(new Date().getFullYear(), 0, 1), end: new Date() }
            ].map(f => (
              <button
                key={f.label}
                onClick={() => setDateRange({
                  start: f.start.toISOString().split('T')[0],
                  end: f.end.toISOString().split('T')[0]
                })}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  dateRange.start === f.start.toISOString().split('T')[0] && dateRange.end === f.end.toISOString().split('T')[0]
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-100">
            <div className="flex items-center gap-2 px-3">
              <Calendar size={14} className="text-zinc-400" />
              <input 
                type="date" 
                className="bg-transparent text-xs font-bold text-zinc-600 outline-none"
                value={dateRange.start}
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
              />
              <span className="text-zinc-300">→</span>
              <input 
                type="date" 
                className="bg-transparent text-xs font-bold text-zinc-600 outline-none"
                value={dateRange.end}
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-zinc-50 p-1.5 rounded-2xl border border-zinc-100">
            <button 
              onClick={() => setViewType('summary')}
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${viewType === 'summary' ? 'bg-white text-primary shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              Summary
            </button>
            <button 
              onClick={() => setViewType('spreadsheet')}
              className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${viewType === 'spreadsheet' ? 'bg-white text-primary shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              Excel View
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {viewType === 'summary' ? renderSummary() : renderSpreadsheet(reportData.data[reportType], getColumnsForReport(reportType))}
      </div>
    </div>
  );
}
