import React, { useState, useMemo } from 'react';
import { Download, Filter, FileText, Scale, History, DollarSign } from 'lucide-react';

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
  const [reportType, setReportType] = useState<'balance_sheet' | 'profit_loss' | 'trial_balance' | 'general_ledger'>('profit_loss');
  const [viewType, setViewType] = useState<'summary' | 'spreadsheet'>('summary');
  const [filterText, setFilterText] = useState('');
  
  // Calculate balances from journal entries
  const accountBalances = useMemo(() => {
    const balances: Record<string, { debit: number, credit: number, type: string }> = {};
    
    journalEntries.forEach(entry => {
      entry.lines.forEach((line: any) => {
        if (!balances[line.accountName]) {
          // Infer account type based on name or ID
          let type = 'Asset';
          const nameLower = line.accountName.toLowerCase();
          if (nameLower.includes('revenue') || nameLower.includes('sales')) type = 'Revenue';
          else if (nameLower.includes('expense') || nameLower.includes('cost')) type = 'Expense';
          else if (nameLower.includes('liability') || nameLower.includes('payable')) type = 'Liability';
          else if (nameLower.includes('equity') || nameLower.includes('capital')) type = 'Equity';
          
          balances[line.accountName] = { debit: 0, credit: 0, type };
        }
        balances[line.accountName].debit += line.debit || 0;
        balances[line.accountName].credit += line.credit || 0;
      });
    });
    
    return balances;
  }, [journalEntries]);

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
            placeholder="Filter rows..." 
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-card p-1 rounded-xl border border-border shadow-sm overflow-x-auto">
          {[
            { id: 'profit_loss', label: 'Statement of Comprehensive Income', icon: FileText },
            { id: 'balance_sheet', label: 'Statement of Financial Position', icon: Scale },
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
              // Export logic based on current report
              exportToExcel([], `${reportType}_export`);
            }}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-card rounded-3xl p-6 border border-border">
        {reportType === 'trial_balance' && viewType === 'spreadsheet' && renderSpreadsheet(
          Object.entries(accountBalances).map(([name, b]: [string, any]) => ({
            Account: name,
            Type: b.type,
            Debit: b.debit,
            Credit: b.credit,
            Balance: b.debit - b.credit
          })),
          ['Account', 'Type', 'Debit', 'Credit', 'Balance']
        )}
        
        {/* Implement other views... */}
        {viewType === 'summary' && (
          <div className="text-center py-12 text-muted-foreground">
            Comprehensive summary view for {reportType.replace('_', ' ')} will be displayed here.
          </div>
        )}
        {viewType === 'spreadsheet' && reportType !== 'trial_balance' && (
          <div className="text-center py-12 text-muted-foreground">
            Spreadsheet view for {reportType.replace('_', ' ')} will be displayed here.
          </div>
        )}
      </div>
    </div>
  );
}
