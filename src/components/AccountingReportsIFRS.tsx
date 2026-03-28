import React, { useState, useMemo } from 'react';
import { Download, Filter, FileText, Scale, History, DollarSign, Activity, TrendingUp } from 'lucide-react';

interface Props {
  journalEntries: any[];
  journal: any[];
  orders: any[];
  inventory: any[];
  items: any[];
  formatCurrency: (amount: number) => string;
  exportToExcel: (data: any[], filename: string) => void;
}

export default function AccountingReportsIFRS({ journalEntries, journal, orders, inventory, items, formatCurrency, exportToExcel }: Props) {
  const [reportType, setReportType] = useState<'profit_loss' | 'balance_sheet' | 'cash_flow' | 'equity' | 'trial_balance' | 'general_ledger'>('profit_loss');
  const [viewType, setViewType] = useState<'summary' | 'spreadsheet'>('summary');
  const [filterText, setFilterText] = useState('');
  
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

    // 1. Process formal journal entries
    journalEntries.forEach(entry => {
      entry.lines.forEach((line: any) => {
        let type = 'Asset';
        const nameLower = line.accountName.toLowerCase();
        if (nameLower.includes('revenue') || nameLower.includes('sales')) type = 'Revenue';
        else if (nameLower.includes('expense') || nameLower.includes('cost')) type = 'Expense';
        else if (nameLower.includes('liability') || nameLower.includes('payable') || nameLower.includes('tax')) type = 'Liability';
        else if (nameLower.includes('equity') || nameLower.includes('capital') || nameLower.includes('retained')) type = 'Equity';
        
        addBalance(line.accountName, type, line.debit || 0, line.credit || 0);
      });
    });

    // 2. Process Orders (Revenue and Cash/Bank)
    orders.forEach(order => {
      if (order.status === 'paid' || order.status === 'finalized') {
        const amount = order.total || 0;
        const paymentMethod = order.paymentMethod || 'cash';
        const assetAccount = paymentMethod === 'cash' ? 'Cash on Hand' : 'Bank Account';
        
        // Debit Asset (Cash/Bank), Credit Revenue (Sales)
        addBalance(assetAccount, 'Asset', amount, 0);
        addBalance('Sales Revenue', 'Revenue', 0, amount);
      }
    });

    // 3. Process Simple Journal (Income/Expense)
    journal.forEach(entry => {
      const amount = entry.amount || 0;
      if (entry.type === 'income') {
        // Debit Asset (Cash), Credit Revenue (Other Income)
        addBalance('Cash on Hand', 'Asset', amount, 0);
        addBalance(entry.category || 'Other Income', 'Revenue', 0, amount);
      } else if (entry.type === 'expense') {
        // Debit Expense, Credit Asset (Cash)
        addBalance(entry.category || 'General Expense', 'Expense', amount, 0);
        addBalance('Cash on Hand', 'Asset', 0, amount);
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
  }, [journalEntries, orders, journal]);

  const reportData = useMemo(() => {
    const data: any = {
      profit_loss: [],
      balance_sheet: [],
      cash_flow: [],
      equity: [],
      trial_balance: [],
      general_ledger: []
    };

    let totalRevenue = 0;
    let totalExpense = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    Object.entries(accountBalances).forEach(([name, b]: [string, any]) => {
      // Trial Balance
      data.trial_balance.push({
        Account: name,
        Type: b.type,
        Debit: b.debit,
        Credit: b.credit,
        Balance: b.debit - b.credit
      });

      // Profit & Loss
      if (b.type === 'Revenue') {
        data.profit_loss.push({ Category: 'Revenue', Account: name, Amount: b.balance });
        totalRevenue += b.balance;
      } else if (b.type === 'Expense') {
        data.profit_loss.push({ Category: 'Expense', Account: name, Amount: b.balance });
        totalExpense += b.balance;
      }

      // Balance Sheet
      if (b.type === 'Asset') {
        data.balance_sheet.push({ Category: 'Asset', Account: name, Amount: b.balance });
        totalAssets += b.balance;
      } else if (b.type === 'Liability') {
        data.balance_sheet.push({ Category: 'Liability', Account: name, Amount: b.balance });
        totalLiabilities += b.balance;
      } else if (b.type === 'Equity') {
        data.balance_sheet.push({ Category: 'Equity', Account: name, Amount: b.balance });
        totalEquity += b.balance;
      }
    });

    const netIncome = totalRevenue - totalExpense;

    // Add Net Income to Equity for Balance Sheet
    data.balance_sheet.push({ Category: 'Equity', Account: 'Retained Earnings (Net Income)', Amount: netIncome });
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
    journalEntries.forEach(entry => {
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

    return { data, totals: { netIncome, totalAssets, totalLiabilities, totalEquity, netCashFlow } };
  }, [accountBalances, journalEntries]);

  const renderSpreadsheet = (data: any[], columns: string[]) => {
    const filteredData = data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(filterText.toLowerCase())
      )
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 bg-card p-4 rounded-2xl border border-border">
          <Filter size={16} className="text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Filter rows and columns..." 
            className="flex-1 outline-none text-sm bg-transparent text-foreground"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
          />
        </div>
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {columns.map((col, i) => (
                    <th key={i} className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/50 transition-colors">
                    {columns.map((col, j) => (
                      <td key={j} className={`px-6 py-4 text-sm ${typeof row[col] === 'number' ? 'text-right font-mono text-foreground' : 'text-muted-foreground'}`}>
                        {typeof row[col] === 'number' ? formatCurrency(row[col]) : row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const { totals, data } = reportData;

    switch (reportType) {
      case 'profit_loss':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Total Revenue</p>
                <p className="text-3xl font-black text-emerald-700">{formatCurrency(data.profit_loss.filter((r: any) => r.Category === 'Revenue').reduce((sum: number, r: any) => sum + r.Amount, 0))}</p>
              </div>
              <div className="bg-red-50 border border-red-100 p-6 rounded-2xl">
                <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-2">Total Expenses</p>
                <p className="text-3xl font-black text-red-700">{formatCurrency(data.profit_loss.filter((r: any) => r.Category === 'Expense').reduce((sum: number, r: any) => sum + r.Amount, 0))}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Net Income</p>
                <p className="text-3xl font-black text-blue-700">{formatCurrency(totals.netIncome)}</p>
              </div>
            </div>
            {renderSpreadsheet(data.profit_loss, ['Category', 'Account', 'Amount'])}
          </div>
        );
      case 'balance_sheet':
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Total Assets</p>
                <p className="text-3xl font-black text-zinc-900">{formatCurrency(totals.totalAssets)}</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Total Liabilities</p>
                <p className="text-3xl font-black text-zinc-900">{formatCurrency(totals.totalLiabilities)}</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 p-6 rounded-2xl">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Total Equity</p>
                <p className="text-3xl font-black text-zinc-900">{formatCurrency(totals.totalEquity)}</p>
              </div>
            </div>
            {renderSpreadsheet(data.balance_sheet, ['Category', 'Account', 'Amount'])}
          </div>
        );
      case 'cash_flow':
        return (
          <div className="space-y-8">
             <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl max-w-sm">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Net Cash Flow</p>
                <p className="text-3xl font-black text-emerald-700">{formatCurrency(totals.netCashFlow)}</p>
              </div>
            {renderSpreadsheet(data.cash_flow, ['Category', 'Account', 'Amount'])}
          </div>
        );
      case 'equity':
        return (
          <div className="space-y-8">
            {renderSpreadsheet(data.equity, ['Category', 'Account', 'Amount'])}
          </div>
        );
      case 'trial_balance':
        return renderSpreadsheet(data.trial_balance, ['Account', 'Type', 'Debit', 'Credit', 'Balance']);
      case 'general_ledger':
        return renderSpreadsheet(data.general_ledger, ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit']);
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-card p-1 rounded-xl border border-border shadow-sm overflow-x-auto">
          {[
            { id: 'profit_loss', label: 'Profit & Loss (Income)', icon: FileText },
            { id: 'balance_sheet', label: 'Balance Sheet', icon: Scale },
            { id: 'cash_flow', label: 'Cash Flow', icon: Activity },
            { id: 'equity', label: 'Changes in Equity', icon: TrendingUp },
            { id: 'trial_balance', label: 'Trial Balance', icon: History },
            { id: 'general_ledger', label: 'General Ledger', icon: DollarSign }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setReportType(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                reportType === tab.id ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-muted p-1 rounded-xl">
            <button 
              onClick={() => setViewType('summary')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewType === 'summary' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Summary
            </button>
            <button 
              onClick={() => setViewType('spreadsheet')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewType === 'spreadsheet' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Spreadsheet
            </button>
          </div>
          <button 
            onClick={() => {
              exportToExcel(reportData.data[reportType], `${reportType}_export`);
            }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-card rounded-3xl p-6 border border-border">
        {viewType === 'summary' ? renderSummary() : renderSpreadsheet(
          reportData.data[reportType], 
          reportType === 'general_ledger' ? ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit'] :
          reportType === 'trial_balance' ? ['Account', 'Type', 'Debit', 'Credit', 'Balance'] :
          ['Category', 'Account', 'Amount']
        )}
      </div>
    </div>
  );
}
