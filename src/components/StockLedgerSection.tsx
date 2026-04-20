import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ArrowLeftRight, Package, Calendar, Search, ArrowDownRight, ArrowUpRight, CheckCircle2, RotateCcw } from 'lucide-react';
import { formatCurrency } from '../utils/format';

interface StockMovement {
  id: string;
  inventoryItemId: string;
  itemName: string;
  type: 'purchase' | 'sale' | 'wastage' | 'production_in' | 'production_out' | 'adjustment';
  quantityChange: number;
  stockAfter: number;
  reference: string;
  timestamp: Timestamp;
}

export default function StockLedgerSection() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    const q = query(collection(db, 'stock_movements'), orderBy('timestamp', 'desc'), limit(500));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockMovement)));
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'stock_movements');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredMovements = movements.filter(m => {
    const matchesSearch = m.itemName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || m.type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'purchase': return { label: 'Received (PO)', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <ArrowDownRight size={14} /> };
      case 'sale': return { label: 'Sale (Deduction)', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: <ArrowUpRight size={14} /> };
      case 'wastage': return { label: 'Wastage', color: 'text-rose-500', bg: 'bg-rose-500/10', icon: <ArrowUpRight size={14} /> };
      case 'production_in': return { label: 'Production (Yield)', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <ArrowDownRight size={14} /> };
      case 'production_out': return { label: 'Production (Used)', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: <ArrowUpRight size={14} /> };
      case 'adjustment': return { label: 'Manual Adj', color: 'text-purple-500', bg: 'bg-purple-500/10', icon: <RotateCcw size={14} /> };
      default: return { label: type, color: 'text-zinc-500', bg: 'bg-zinc-500/10', icon: <CheckCircle2 size={14} /> };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-[2.5rem] border border-border shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <ArrowLeftRight size={24} className="text-primary" /> Stock Ledger
          </h2>
          <p className="text-sm text-muted-foreground font-medium">Complete trail of every inventory movement</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text"
              placeholder="Search item or reference..."
              className="pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none w-64"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="p-2 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">All Movements</option>
            <option value="purchase">Purchases (In)</option>
            <option value="sale">Sales (Out)</option>
            <option value="production_in">Production (Yield)</option>
            <option value="production_out">Production (Used)</option>
            <option value="wastage">Wastage (Out)</option>
            <option value="adjustment">Adjustments</option>
          </select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Date & Time</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Item / Material</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Type</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Reference</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border text-right">Qty Change</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground font-medium">Loading ledger...</td></tr>
              ) : filteredMovements.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground font-medium">No stock movements found.</td></tr>
              ) : (
                filteredMovements.map(m => {
                  const style = getTypeStyle(m.type);
                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-4 text-sm font-medium text-foreground whitespace-nowrap whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-muted-foreground" />
                          {m.timestamp?.toDate().toLocaleString()}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-primary" />
                          {m.itemName}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${style.bg} ${style.color}`}>
                          {style.icon} {style.label}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-medium text-muted-foreground max-w-xs truncate" title={m.reference}>
                        {m.reference}
                      </td>
                      <td className="p-4 text-sm font-black text-right whitespace-nowrap">
                        <span className={m.quantityChange > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                          {m.quantityChange > 0 ? '+' : ''}{Number(m.quantityChange.toFixed(4))}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-bold text-foreground text-right whitespace-nowrap">
                        {Number(m.stockAfter.toFixed(4))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
