import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Calendar, Package, RefreshCw, RotateCcw, Search, Split, TriangleAlert, X } from 'lucide-react';
import { auth, db, defaultDb, handleFirestoreError, OperationType } from '../firebase';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';

type LedgerSource = 'stock_movements' | 'stock_flow' | 'stock_flow_item' | 'inventory_flow' | 'purchases' | 'sales';
type StockCollectionSource = 'stock_movements' | 'stock_flow' | 'stock_flow_item' | 'inventory_flow';
type SourceStatus = 'loading' | 'ready' | 'error';

interface StockMovement {
  id: string;
  source: LedgerSource;
  itemName: string;
  itemId: string;
  type: string;
  quantityChange: number;
  amount: number;
  unitPrice: number;
  lineTotal: number;
  stockAfter: number;
  hasStockAfter: boolean;
  reference: string;
  timestamp: Date | null;
  documentId: string;
  counterparty: string;
  paymentMethod: string;
  orderType: string;
  status: string;
  notes: string;
}

interface SourceState {
  status: SourceStatus;
  message: string;
  count: number;
  database?: 'configured' | 'default';
}

const SOURCE_LIMIT = 250;
const AUTO_REFRESH_MS = 30000;

const toSafeNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toSafeText = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return fallback;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const typeFromInitiation = (initiationType: number): string => {
  if (initiationType === 1) return 'sale';
  if (initiationType === 2) return 'purchase';
  if (initiationType === 3) return 'transfer';
  if (initiationType === 4) return 'adjustment';
  if (initiationType === 5) return 'wastage';
  return 'stock_flow';
};

const normalizeType = (source: StockCollectionSource, data: Record<string, unknown>): string => {
  const rawType = toSafeText(data.type || data.flowType, '').toLowerCase();
  const note = toSafeText(data.reference || data.info, '').toLowerCase();

  if (note.includes('supplier return')) return 'supplier_return';
  if (note.includes('customer return')) return 'customer_return';

  if (rawType === 'sale' || rawType === 'purchase' || rawType === 'transfer' || rawType === 'adjustment' || rawType === 'wastage') {
    return rawType;
  }

  if (source === 'stock_flow') {
    return typeFromInitiation(toSafeNumber(data.initiation_type));
  }

  return rawType || 'adjustment';
};

const normalizeMovement = (source: StockCollectionSource, data: Record<string, unknown>, docId: string): StockMovement => {
  const movementType = normalizeType(source, data);
  const qtyRaw = toSafeNumber(data.quantityChange ?? data.qty ?? 0);
  const unitPrice = toSafeNumber(data.item_unit_cost ?? data.cost ?? data.costPerUnit ?? 0);
  const amount = toSafeNumber(data.amount ?? data.quotation_amount ?? data.sales_amount_subtotal ?? 0);

  return {
    id: toSafeText(data.id || data.stock_flow_record_id || data.reference, docId),
    source,
    itemName: toSafeText(
      data.itemName || data.primary_name || data.destination_name || data.source_name || data.info,
      'Unnamed Item'
    ),
    itemId: toSafeText(data.inventoryItemId || data.item_id || data.stock_item_id, 'n/a'),
    type: movementType,
    quantityChange: qtyRaw,
    amount,
    unitPrice,
    lineTotal: amount > 0 ? amount : Math.round(Math.abs(qtyRaw) * unitPrice),
    stockAfter: toSafeNumber(data.stockAfter ?? data.running_balance ?? data.balance ?? 0),
    hasStockAfter: data.stockAfter !== undefined && data.stockAfter !== null,
    reference: toSafeText(
      data.reference || data.info || data.purchase_supplier_invoice_no || data.stock_flow_record_id,
      'No reference'
    ),
    timestamp: toDate(data.timestamp ?? data.createdAt ?? data.date_created ?? data.initiation_date ?? data.date ?? null),
    documentId: toSafeText(data.documentId || data.document_id || data.order_id || data.bill_id, docId),
    counterparty: toSafeText(data.customer_name || data.customerName || data.vendor_name || data.vendorName || data.supplier_name || data.sales_person_name_full_name, ''),
    paymentMethod: toSafeText(data.paymentMethod || data.payment_method, ''),
    orderType: toSafeText(data.orderType || data.order_type, ''),
    status: toSafeText(data.status || data.status_id, ''),
    notes: toSafeText(data.notes || data.info || data.description, ''),
  };
};

const getTypeStyle = (type: string) => {
  switch (type) {
    case 'purchase':
      return { label: 'Received (PO)', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <ArrowDownRight size={14} /> };
    case 'sale':
      return { label: 'Sale (Deduction)', color: 'text-blue-500', bg: 'bg-blue-500/10', icon: <ArrowUpRight size={14} /> };
    case 'wastage':
      return { label: 'Wastage', color: 'text-rose-500', bg: 'bg-rose-500/10', icon: <ArrowUpRight size={14} /> };
    case 'adjustment':
      return { label: 'Adjustment', color: 'text-purple-500', bg: 'bg-purple-500/10', icon: <RotateCcw size={14} /> };
    case 'transfer':
      return { label: 'Transfer', color: 'text-cyan-500', bg: 'bg-cyan-500/10', icon: <ArrowLeftRight size={14} /> };
    case 'supplier_return':
      return { label: 'Supplier Return', color: 'text-orange-500', bg: 'bg-orange-500/10', icon: <ArrowUpRight size={14} /> };
    case 'customer_return':
      return { label: 'Customer Return', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <ArrowDownRight size={14} /> };
    default:
      return { label: 'Stock Flow', color: 'text-zinc-500', bg: 'bg-zinc-500/10', icon: <Split size={14} /> };
  }
};

export default function StockLedgerSection() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | LedgerSource>('all');
  const [dayFilter, setDayFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  const [sourceState, setSourceState] = useState<Record<LedgerSource, SourceState>>({
    stock_movements: { status: 'loading', message: '', count: 0, database: 'configured' },
    stock_flow: { status: 'loading', message: '', count: 0, database: 'configured' },
    stock_flow_item: { status: 'loading', message: '', count: 0, database: 'configured' },
    inventory_flow: { status: 'loading', message: '', count: 0, database: 'configured' },
    purchases: { status: 'loading', message: '', count: 0, database: 'configured' },
    sales: { status: 'loading', message: '', count: 0, database: 'configured' },
  });
  const [authBootstrapError, setAuthBootstrapError] = useState('');

  const ensureLedgerAuth = useCallback(async (): Promise<boolean> => {
    if (auth.currentUser) {
      setAuthBootstrapError('');
      return true;
    }

    try {
      await signInAnonymously(auth);
      setAuthBootstrapError('');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to establish Firebase session';
      setAuthBootstrapError(message);
      handleFirestoreError(error, OperationType.GET, 'auth/signInAnonymously');
      return false;
    }
  }, []);

  const readSource = useCallback(async (source: StockCollectionSource): Promise<StockMovement[]> => {
    const candidates: Array<{ key: 'configured' | 'default'; instance: typeof db }> = [
      { key: 'configured', instance: db },
    ];
    if (defaultDb !== db) {
      candidates.push({ key: 'default', instance: defaultDb });
    }

    let lastErrorMessage = '';

    for (const candidate of candidates) {
      try {
        const snap = await getDocs(query(collection(candidate.instance, source), limit(SOURCE_LIMIT)));
        const rows = snap.docs
          .map((d) => normalizeMovement(source, (d.data() || {}) as Record<string, unknown>, d.id))
          .filter((row) => Boolean(row.id));

        setSourceState((prev) => ({
          ...prev,
          [source]: { status: 'ready', message: '', count: rows.length, database: candidate.key },
        }));

        return rows;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `${source} (${candidate.key})`);
        lastErrorMessage = error instanceof Error ? error.message : 'Unknown source error';
      }
    }

    setSourceState((prev) => ({
      ...prev,
      [source]: { status: 'error', message: lastErrorMessage, count: 0, database: 'configured' },
    }));
    return [];
  }, []);

  const readBusinessSource = useCallback(async (source: 'purchases' | 'sales'): Promise<StockMovement[]> => {
    const candidates: Array<{ key: 'configured' | 'default'; instance: typeof db }> = [
      { key: 'configured', instance: db },
    ];
    if (defaultDb !== db) {
      candidates.push({ key: 'default', instance: defaultDb });
    }

    let lastErrorMessage = '';

    for (const candidate of candidates) {
      try {
        const collectionName = source === 'purchases' ? 'bills' : 'orders';
        const snap = await getDocs(query(collection(candidate.instance, collectionName), limit(SOURCE_LIMIT)));

        const rows = snap.docs.flatMap((d): StockMovement[] => {
          const data = (d.data() || {}) as Record<string, unknown>;

          if (source === 'purchases' && toSafeText(data.type, '').toLowerCase() !== 'purchase') {
            return [];
          }

          const itemsRaw = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
          const baseReference = source === 'purchases'
            ? toSafeText(data.invoiceNumber || data.reference || d.id, d.id)
            : toSafeText(data.id || data.orderNumber || data.reference || d.id, d.id);
          const movementDate = toDate(data.timestamp ?? data.createdAt ?? data.date ?? data.date_created ?? null);

          if (itemsRaw.length === 0) {
            const amount = toSafeNumber(data.totalAmount ?? data.amount ?? data.total ?? 0);
            return [{
              id: `${source}-${d.id}`,
              source,
              itemName: source === 'purchases' ? 'Purchase' : 'Sale',
              itemId: 'n/a',
              type: source === 'purchases' ? 'purchase' : 'sale',
              quantityChange: 0,
              amount,
              unitPrice: 0,
              lineTotal: amount,
              stockAfter: 0,
              hasStockAfter: false,
              reference: baseReference,
              timestamp: movementDate,
              documentId: d.id,
              counterparty: toSafeText(data.supplierName || data.vendorName || data.customerName, ''),
              paymentMethod: toSafeText(data.paymentMethod, ''),
              orderType: toSafeText(data.orderType, ''),
              status: toSafeText(data.status, ''),
              notes: toSafeText(data.notes || data.description, ''),
            }];
          }

          return itemsRaw.map((item, index): StockMovement => {
            const qty = toSafeNumber(item.quantity ?? 0);
            const price = toSafeNumber(item.price ?? 0);
            const lineTotal = Math.round(Math.abs(qty) * price);
            return {
              id: `${source}-${d.id}-${index}`,
              source,
              itemName: toSafeText(item.name || item.itemName, source === 'purchases' ? 'Purchased Item' : 'Sold Item'),
              itemId: toSafeText(item.inventoryItemId || item.itemId || item.id, 'n/a'),
              type: source === 'purchases' ? 'purchase' : 'sale',
              quantityChange: source === 'purchases' ? Math.abs(qty) : -Math.abs(qty),
              amount: lineTotal,
              unitPrice: price,
              lineTotal,
              stockAfter: 0,
              hasStockAfter: false,
              reference: baseReference,
              timestamp: movementDate,
              documentId: d.id,
              counterparty: toSafeText(data.supplierName || data.vendorName || data.customerName, ''),
              paymentMethod: toSafeText(data.paymentMethod, ''),
              orderType: toSafeText(data.orderType, ''),
              status: toSafeText(data.status, ''),
              notes: toSafeText(data.notes || data.description, ''),
            };
          });
        });

        setSourceState((prev) => ({
          ...prev,
          [source]: { status: 'ready', message: '', count: rows.length, database: candidate.key },
        }));

        return rows;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `${source} (${candidate.key})`);
        lastErrorMessage = error instanceof Error ? error.message : 'Unknown source error';
      }
    }

    setSourceState((prev) => ({
      ...prev,
      [source]: { status: 'error', message: lastErrorMessage, count: 0, database: 'configured' },
    }));
    return [];
  }, []);

  const loadLedger = useCallback(async () => {
    const hasSession = Boolean(user || auth.currentUser) || await ensureLedgerAuth();
    if (!hasSession) {
      setSourceState({
        stock_movements: { status: 'ready', message: '', count: 0, database: 'configured' },
        stock_flow: { status: 'ready', message: '', count: 0, database: 'configured' },
        stock_flow_item: { status: 'ready', message: '', count: 0, database: 'configured' },
        inventory_flow: { status: 'ready', message: '', count: 0, database: 'configured' },
        purchases: { status: 'ready', message: '', count: 0, database: 'configured' },
        sales: { status: 'ready', message: '', count: 0, database: 'configured' },
      });
      setMovements([]);
      setSelectedMovement(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    const [legacyRows, flowRows, flowItemRows, inventoryFlowRows, purchaseRows, saleRows] = await Promise.all([
      readSource('stock_movements'),
      readSource('stock_flow'),
      readSource('stock_flow_item'),
      readSource('inventory_flow'),
      readBusinessSource('purchases'),
      readBusinessSource('sales'),
    ]);

    const merged = [...legacyRows, ...flowRows, ...flowItemRows, ...inventoryFlowRows, ...purchaseRows, ...saleRows];
    const uniq = new Map<string, StockMovement>();
    for (const row of merged) {
      uniq.set(`${row.source}:${row.id}`, row);
    }

    const sorted = Array.from(uniq.values()).sort((a, b) => {
      const ta = a.timestamp ? a.timestamp.getTime() : 0;
      const tb = b.timestamp ? b.timestamp.getTime() : 0;
      return tb - ta;
    });

    setMovements(sorted);
    setSelectedMovement((current) => {
      if (!current) return null;
      return sorted.find((row) => row.source === current.source && row.id === current.id) || null;
    });
    setLoading(false);
    setRefreshing(false);
  }, [ensureLedgerAuth, readBusinessSource, readSource, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadLedger();
  }, [authLoading, loadLedger]);

  useEffect(() => {
    if (!autoRefresh || authLoading) return;
    const timer = window.setInterval(() => {
      void loadLedger();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, authLoading, loadLedger]);

  const selectedStyle = selectedMovement ? getTypeStyle(selectedMovement.type) : null;

  const detailValue = (value: string) => value && value.trim() ? value : 'n/a';

  const filteredMovements = useMemo(() => {
    const search = searchTerm.toLowerCase();
    const now = Date.now();

    const withinWindow = (ts: Date | null) => {
      if (dayFilter === 'all') return true;
      if (!ts) return false;
      const diff = now - ts.getTime();
      const day = 24 * 60 * 60 * 1000;
      if (dayFilter === 'today') return diff <= day;
      if (dayFilter === 'week') return diff <= 7 * day;
      if (dayFilter === 'month') return diff <= 30 * day;
      return true;
    };

    return movements.filter((m) => {
      const matchesSearch =
        m.itemName.toLowerCase().includes(search) ||
        m.reference.toLowerCase().includes(search) ||
        m.itemId.toLowerCase().includes(search) ||
        m.documentId.toLowerCase().includes(search) ||
        m.counterparty.toLowerCase().includes(search) ||
        m.paymentMethod.toLowerCase().includes(search) ||
        m.status.toLowerCase().includes(search);
      const matchesType = filterType === 'all' || m.type === filterType;
      const matchesSource = sourceFilter === 'all' || m.source === sourceFilter;
      return matchesSearch && matchesType && matchesSource && withinWindow(m.timestamp);
    });
  }, [movements, searchTerm, filterType, sourceFilter, dayFilter]);

  const summary = useMemo(() => {
    return filteredMovements.reduce(
      (acc, m) => {
        acc.total += 1;
        if (m.source === 'stock_flow') acc.sql += 1;
        if (m.source === 'stock_flow_item') acc.sql += 1;
        if (m.source === 'inventory_flow') acc.sql += 1;
        if (m.source === 'stock_movements') acc.legacy += 1;
        if (m.source === 'purchases') acc.purchases += 1;
        if (m.source === 'sales') acc.sales += 1;
        if (m.quantityChange > 0) acc.inflow += m.quantityChange;
        if (m.quantityChange < 0) acc.outflow += Math.abs(m.quantityChange);
        acc.value += m.amount;
        return acc;
      },
      { total: 0, sql: 0, legacy: 0, purchases: 0, sales: 0, inflow: 0, outflow: 0, value: 0 }
    );
  }, [filteredMovements]);

  const bothSourcesFailed =
    sourceState.stock_movements.status === 'error' &&
    sourceState.stock_flow.status === 'error' &&
    sourceState.stock_flow_item.status === 'error' &&
    sourceState.inventory_flow.status === 'error' &&
    sourceState.purchases.status === 'error' &&
    sourceState.sales.status === 'error';
  const needsFirebaseAuth = !authLoading && !user && !authBootstrapError;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 bg-card p-6 rounded-[2.5rem] border border-border shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight flex items-center gap-2">
              <ArrowLeftRight size={24} className="text-primary" /> Stock Ledger
            </h2>
            <p className="text-sm text-muted-foreground font-medium">Redesigned resilient ledger reader for legacy and SQL stock flow data</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-muted-foreground">
              legacy: {sourceState.stock_movements.status} ({sourceState.stock_movements.count}, {sourceState.stock_movements.database || 'configured'}) | stock_flow: {sourceState.stock_flow.status} ({sourceState.stock_flow.count}, {sourceState.stock_flow.database || 'configured'})
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-muted-foreground">
              stock_flow_item: {sourceState.stock_flow_item.status} ({sourceState.stock_flow_item.count}) | inventory_flow: {sourceState.inventory_flow.status} ({sourceState.inventory_flow.count})
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-muted-foreground">
              purchases: {sourceState.purchases.status} ({sourceState.purchases.count}) | sales: {sourceState.sales.status} ({sourceState.sales.count})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-muted-foreground flex items-center gap-2">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto refresh
            </label>
            <button
              type="button"
              onClick={() => void loadLedger()}
              disabled={refreshing}
              className="px-3 py-2 rounded-xl border border-border bg-background text-xs font-black uppercase tracking-wider text-foreground disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Search item, id, or reference..."
              className="pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none w-72"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select className="p-2 bg-background border border-border rounded-xl text-sm font-medium" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="purchase">Purchases</option>
            <option value="sale">Sales</option>
            <option value="transfer">Transfers</option>
            <option value="adjustment">Adjustments</option>
            <option value="wastage">Wastage</option>
            <option value="supplier_return">Supplier Returns</option>
            <option value="customer_return">Customer Returns</option>
          </select>

          <select className="p-2 bg-background border border-border rounded-xl text-sm font-medium" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as 'all' | LedgerSource | 'purchases' | 'sales')}>
            <option value="all">All Sources</option>
            <option value="stock_movements">Legacy stock_movements</option>
            <option value="stock_flow">SQL stock_flow</option>
            <option value="stock_flow_item">SQL stock_flow_item</option>
            <option value="inventory_flow">SQL inventory_flow</option>
            <option value="purchases">Direct purchases (bills)</option>
            <option value="sales">Direct sales (orders)</option>
          </select>

          <select className="p-2 bg-background border border-border rounded-xl text-sm font-medium" value={dayFilter} onChange={(e) => setDayFilter(e.target.value as 'all' | 'today' | 'week' | 'month')}>
            <option value="all">All Time</option>
            <option value="today">Last 24h</option>
            <option value="week">Last 7d</option>
            <option value="month">Last 30d</option>
          </select>
        </div>
      </div>

      {needsFirebaseAuth && (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm font-semibold flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5" />
          <div>
            <p>Bootstrapping Firebase session for ledger reads...</p>
            <p className="text-xs font-medium mt-1">If this message persists, click Refresh once.</p>
          </div>
        </div>
      )}

      {authBootstrapError && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm font-semibold flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5" />
          <div>
            <p>Could not establish Firebase auth session for stock ledger.</p>
            <p className="text-xs font-medium mt-1 break-all">{authBootstrapError}</p>
          </div>
        </div>
      )}

      {bothSourcesFailed && !needsFirebaseAuth && (
        <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-800 text-sm font-semibold flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5" />
          <div>
            <p>Both ledger sources failed to load.</p>
            <p className="text-xs font-medium mt-1 break-all">legacy: {sourceState.stock_movements.message || 'n/a'} | stock_flow: {sourceState.stock_flow.message || 'n/a'}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-card border border-border rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Records</p>
          <p className="text-2xl font-black text-foreground mt-2">{summary.total}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{summary.sql} SQL / {summary.legacy} legacy / {summary.purchases} purchases / {summary.sales} sales</p>
        </div>
        <div className="p-5 bg-card border border-border rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Inflow Qty</p>
          <p className="text-2xl font-black text-emerald-600 mt-2">+{summary.inflow.toFixed(4)}</p>
        </div>
        <div className="p-5 bg-card border border-border rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Outflow Qty</p>
          <p className="text-2xl font-black text-rose-600 mt-2">-{summary.outflow.toFixed(4)}</p>
        </div>
        <div className="p-5 bg-card border border-border rounded-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Value</p>
          <p className="text-2xl font-black text-foreground mt-2">{formatCurrency(summary.value)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Date & Time</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Item</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Source</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Type</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border">Reference / Breakdown</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border text-right">Qty / Value</th>
                <th className="p-4 text-xs font-black text-muted-foreground uppercase tracking-wider border-b border-border text-right">Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground font-medium">Loading stock ledger...</td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground font-medium">No stock movements found for current filters.</td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const style = getTypeStyle(m.type);
                  return (
                    <tr
                      key={`${m.source}:${m.id}`}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      tabIndex={0}
                      role="button"
                      onClick={() => setSelectedMovement(m)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedMovement(m);
                        }
                      }}
                    >
                      <td className="p-4 text-sm font-medium text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-muted-foreground" />
                          {m.timestamp ? m.timestamp.toLocaleString() : 'Unknown date'}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-primary" />
                          <div>
                            <p className="truncate max-w-[240px]">{m.itemName}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">item_id: {m.itemId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-black uppercase tracking-wider">
                        <span className={`px-2 py-1 rounded-lg ${m.source === 'stock_flow' ? 'bg-zinc-100 text-zinc-700' : m.source === 'stock_movements' ? 'bg-blue-100 text-blue-700' : m.source === 'purchases' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {m.source}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${style.bg} ${style.color}`}>
                          {style.icon} {style.label}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground max-w-sm">
                        <div className="font-semibold text-foreground truncate" title={m.reference}>{m.reference}</div>
                        <div className="text-xs mt-1 space-y-1">
                          <div className="truncate" title={m.documentId}>Doc: {m.documentId}</div>
                          {m.counterparty && <div className="truncate" title={m.counterparty}>Party: {m.counterparty}</div>}
                          <div className="truncate" title={`Unit ${formatCurrency(m.unitPrice)} x ${Math.abs(m.quantityChange)} = ${formatCurrency(m.lineTotal)}`}>
                            Unit: {formatCurrency(m.unitPrice)} x {Math.abs(m.quantityChange)} = {formatCurrency(m.lineTotal)}
                          </div>
                          {(m.status || m.paymentMethod || m.orderType) && (
                            <div className="truncate" title={`${m.status || 'n/a'} | ${m.paymentMethod || 'n/a'} | ${m.orderType || 'n/a'}`}>
                              Status/Pay/Type: {m.status || 'n/a'} | {m.paymentMethod || 'n/a'} | {m.orderType || 'n/a'}
                            </div>
                          )}
                          {m.notes && <div className="truncate" title={m.notes}>Note: {m.notes}</div>}
                        </div>
                      </td>
                      <td className="p-4 text-sm font-black text-right whitespace-nowrap">
                        <span className={m.quantityChange > 0 ? 'text-emerald-500' : m.quantityChange < 0 ? 'text-rose-500' : 'text-muted-foreground'}>
                          {m.quantityChange !== 0 ? `${m.quantityChange > 0 ? '+' : ''}${m.quantityChange.toFixed(4)}` : formatCurrency(m.amount)}
                        </span>
                      </td>
                      <td className="p-4 text-sm font-bold text-foreground text-right whitespace-nowrap">
                        {m.hasStockAfter ? m.stockAfter.toFixed(4) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMovement && selectedStyle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8" onClick={() => setSelectedMovement(null)}>
          <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[2rem] bg-card border border-border shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card/95 backdrop-blur px-6 py-5">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">Ledger Record</h3>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${selectedStyle.bg} ${selectedStyle.color}`}>
                    {selectedStyle.icon} {selectedStyle.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground font-medium mt-1">Click details are intentionally comprehensive so you can inspect the full purchase/sale trace.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close ledger details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <section className="rounded-3xl border border-border bg-muted/20 p-5">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Core Breakdown</h4>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <DetailCard label="Reference" value={selectedMovement.reference} />
                    <DetailCard label="Document ID" value={selectedMovement.documentId} />
                    <DetailCard label="Item" value={selectedMovement.itemName} />
                    <DetailCard label="Item ID" value={selectedMovement.itemId} />
                    <DetailCard label="Counterparty" value={detailValue(selectedMovement.counterparty)} />
                    <DetailCard label="Status" value={detailValue(selectedMovement.status)} />
                    <DetailCard label="Payment Method" value={detailValue(selectedMovement.paymentMethod)} />
                    <DetailCard label="Order Type" value={detailValue(selectedMovement.orderType)} />
                  </div>
                </section>

                <section className="rounded-3xl border border-border bg-muted/20 p-5">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Value / Movement</h4>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <DetailCard label="Quantity Change" value={`${selectedMovement.quantityChange > 0 ? '+' : ''}${selectedMovement.quantityChange.toFixed(4)}`} />
                    <DetailCard label="Unit Price" value={formatCurrency(selectedMovement.unitPrice)} />
                    <DetailCard label="Line Total" value={formatCurrency(selectedMovement.lineTotal)} />
                    <DetailCard label="Ledger Amount" value={formatCurrency(selectedMovement.amount)} />
                    <DetailCard label="Stock After" value={selectedMovement.hasStockAfter ? selectedMovement.stockAfter.toFixed(4) : 'n/a'} />
                    <DetailCard label="Source" value={selectedMovement.source} />
                  </div>
                </section>

                <section className="rounded-3xl border border-border bg-muted/20 p-5">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Notes</h4>
                  <p className="mt-3 text-sm text-foreground leading-6 whitespace-pre-wrap break-words">
                    {selectedMovement.notes || 'No notes recorded for this movement.'}
                  </p>
                </section>
              </div>

              <div className="space-y-6">
                <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Record Metadata</h4>
                  <div className="mt-4 space-y-3 text-sm">
                    <MetaRow label="Row ID" value={selectedMovement.id} />
                    <MetaRow label="Timestamp" value={selectedMovement.timestamp ? selectedMovement.timestamp.toLocaleString() : 'Unknown date'} />
                    <MetaRow label="Source Type" value={selectedMovement.type} />
                    <MetaRow label="Source Collection" value={selectedMovement.source} />
                    <MetaRow label="Has Stock Snapshot" value={selectedMovement.hasStockAfter ? 'Yes' : 'No'} />
                  </div>
                </section>

                <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Interpretation</h4>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground leading-6">
                    <p>This record is rendered from {selectedMovement.source === 'purchases' || selectedMovement.source === 'sales' ? 'direct business documents plus mirrored stock movements' : 'stock movement mirrors'}.</p>
                    <p>The quantity delta is {selectedMovement.quantityChange > 0 ? 'an inflow' : selectedMovement.quantityChange < 0 ? 'an outflow' : 'neutral'}, and the line total is calculated from the stored amount or unit cost fallback.</p>
                    <p>If the source row has incomplete data, the ledger still preserves the available document, party, and status fields for audit inspection.</p>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground break-words">{value && value.trim() ? value : 'n/a'}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold text-foreground break-all">{value}</span>
    </div>
  );
}
