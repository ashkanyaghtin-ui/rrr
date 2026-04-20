import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { db, OperationType, handleFirestoreError } from '../firebase';
import {
  Tag, Plus, X, Edit2, Trash2, Percent, DollarSign, Gift, Clock, CheckCircle2,
  ToggleLeft, ToggleRight, Copy, AlertCircle, Calendar, Sparkles, TrendingUp
} from 'lucide-react';
import { formatCurrency } from '../utils/format';

type DiscountType = 'percentage' | 'flat' | 'bogo' | 'free-item';
type PromoStatus = 'active' | 'inactive' | 'expired' | 'scheduled';

interface Promotion {
  id: string;
  name: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrderValue?: number;
  maxDiscount?: number;
  freeItemId?: string;
  usageLimit?: number;
  usageCount: number;
  validFrom: string;
  validUntil: string;
  status: PromoStatus;
  applicableItems?: string[];
  happyHour?: { days: number[]; startTime: string; endTime: string };
  description?: string;
  createdAt?: any;
}

const TYPE_CONFIG: Record<DiscountType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  percentage:  { label: 'Percentage Yield', icon: <Percent size={14} />,   color: 'text-blue-400',   bg: 'bg-blue-400/10' },
  flat:        { label: 'Fixed Deduction',  icon: <DollarSign size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  bogo:        { label: 'BOGO Multiplier',  icon: <Copy size={14} />,       color: 'text-amber-400',    bg: 'bg-amber-400/10' },
  'free-item': { label: 'Gift In-Kind',     icon: <Gift size={14} />,       color: 'text-rose-400',     bg: 'bg-rose-400/10' },
};

const STATUS_CONFIG: Record<PromoStatus, { label: string; color: string; bg: string }> = {
  active:    { label: 'Live Now',     color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  inactive:  { label: 'Deactivated',  color: 'text-zinc-500',    bg: 'bg-zinc-800' },
  expired:   { label: 'Concluded',    color: 'text-rose-400',    bg: 'bg-rose-400/10' },
  scheduled: { label: 'In Pipeline',  color: 'text-blue-400',    bg: 'bg-blue-400/10' },
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function generateCode(name: string): string {
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'PROMO';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
}

function getPromoStatus(promo: Promotion): PromoStatus {
  const now = new Date().toISOString().split('T')[0];
  if (promo.validFrom > now) return 'scheduled';
  if (promo.validUntil < now) return 'expired';
  return promo.status === 'inactive' ? 'inactive' : 'active';
}

export default function PromotionsSection({ systemSettings }: { systemSettings?: any }) {
  const currencySymbol = systemSettings?.currency || 'AED';
  
  const formatCurrency = (amount: number) => {
    return `${currencySymbol} ${(amount / 100).toFixed(2)}`;
  };
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | PromoStatus>('all');
  const [form, setForm] = useState<Partial<Promotion>>({
    type: 'percentage',
    value: 10,
    usageCount: 0,
    status: 'active',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    happyHour: { days: [], startTime: '17:00', endTime: '20:00' },
  });
  const [showHappyHour, setShowHappyHour] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'promotions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setPromos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Promotion)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'promotions'));
    return () => unsub();
  }, []);

  const handleSave = async () => {
    if (!form.name) return;
    const code = form.code || generateCode(form.name);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'promotions', editingId), { ...form, code, updatedAt: serverTimestamp() });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'promotions'), {
          ...form,
          code,
          usageCount: 0,
          happyHour: showHappyHour ? form.happyHour : null,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'promotions');
    }
  };

  const handleToggle = async (promo: Promotion) => {
    const newStatus = promo.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'promotions', promo.id), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `promotions/${promo.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this promotion?')) return;
    try {
      await deleteDoc(doc(db, 'promotions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `promotions/${id}`);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => { setCopiedCode(code); setTimeout(() => setCopiedCode(null), 2000); });
  };

  const resetForm = () => {
    setForm({ type: 'percentage', value: 10, usageCount: 0, status: 'active', validFrom: new Date().toISOString().split('T')[0], validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], happyHour: { days: [], startTime: '17:00', endTime: '20:00' } });
    setShowHappyHour(false);
    setIsAdding(false);
    setEditingId(null);
  };

  const filteredPromos = promos.filter(p => {
    if (activeFilter === 'all') return true;
    return getPromoStatus(p) === activeFilter;
  });

  const stats = {
    active: promos.filter(p => getPromoStatus(p) === 'active').length,
    totalUses: promos.reduce((s, p) => s + (p.usageCount || 0), 0),
    scheduled: promos.filter(p => getPromoStatus(p) === 'scheduled').length,
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-500/10 rounded-[1.25rem] flex items-center justify-center text-indigo-400 shadow-inner">
            <Sparkles size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Campaign Intelligence</h2>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{stats.active} Active · {stats.scheduled} Scheduled · {stats.totalUses} Redemptions</p>
          </div>
        </div>
        <button 
          onClick={() => { resetForm(); setIsAdding(true); }} 
          className="flex items-center gap-2 bg-foreground text-card px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-zinc-900/10"
        >
          <Plus size={18} /> New Campaign
        </button>
      </div>

      {/* Modern Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Active Promotions', value: stats.active, icon: <ToggleRight size={20} />, color: 'text-emerald-400', bg: 'bg-emerald-400/5' },
          { label: 'Total Conversions', value: stats.totalUses, icon: <TrendingUp size={20} />, color: 'text-indigo-400', bg: 'bg-indigo-400/5' },
          { label: 'Scheduled Runs', value: stats.scheduled, icon: <Calendar size={20} />, color: 'text-violet-400', bg: 'bg-violet-400/5' },
        ].map(s => (
          <div key={s.label} className={`p-8 ${s.bg} border border-border rounded-[2.5rem] flex items-center justify-between group hover:border-border transition-all`}>
            <div>
              <p className="text-4xl font-black text-foreground tracking-tighter mb-1">{s.value}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{s.label}</p>
            </div>
            <div className={`p-4 bg-card border border-border rounded-2xl shadow-sm ${s.color}`}>
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Luxury Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {(['all', 'active', 'scheduled', 'inactive', 'expired'] as const).map(f => (
          <button 
            key={f} 
            onClick={() => setActiveFilter(f)} 
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeFilter === f 
                ? 'bg-foreground text-card shadow-lg' 
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Campaign Cards */}
      {filteredPromos.length === 0 ? (
        <div className="text-center py-24 bg-card rounded-[3rem] border border-border border-dashed">
          <Tag size={48} className="text-zinc-200 mx-auto mb-6" />
          <h3 className="text-xl font-black text-foreground uppercase tracking-tight">No Campaigns Found</h3>
          <p className="text-sm text-muted-foreground mt-2 uppercase tracking-widest font-bold">Initiate your next marketing blitz</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
          {filteredPromos.map(promo => {
            const status = getPromoStatus(promo);
            const statusCfg = STATUS_CONFIG[status];
            const typeCfg = TYPE_CONFIG[promo.type];
            const usagePercent = promo.usageLimit ? (promo.usageCount / promo.usageLimit) * 100 : 0;

            return (
              <div key={promo.id} className="bg-card rounded-[2.5rem] border border-border overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 group">
                <div className="p-8 space-y-6">
                  {/* Status & Type */}
                  <div className="flex justify-between items-start">
                    <div className="flex flex-wrap gap-2">
                      <span className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${typeCfg.bg} ${typeCfg.color}`}>
                        {typeCfg.icon} {typeCfg.label}
                      </span>
                      <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <button 
                      onClick={() => handleToggle(promo)} 
                      className={`transition-all duration-300 ${promo.status === 'active' ? 'text-emerald-400' : 'text-zinc-600'}`}
                    >
                      {promo.status === 'active' ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                  </div>

                  {/* Campaign Name */}
                  <div className="space-y-1">
                    <h4 className="text-xl font-black text-foreground leading-tight">{promo.name}</h4>
                    {promo.description && <p className="text-xs font-medium text-muted-foreground line-clamp-1">{promo.description}</p>}
                  </div>

                  {/* Value & Code Display */}
                  <div className="flex items-center gap-4 bg-muted/20 p-6 rounded-[2rem] border border-border">
                    <div className="text-4xl font-black text-foreground tracking-tighter">
                      {promo.type === 'percentage' ? `${promo.value}%` : promo.type === 'flat' ? formatCurrency(promo.value) : promo.type === 'bogo' ? '2×1' : 'FREE'}
                    </div>
                    <div className="flex-1 flex flex-col items-end">
                      <div className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-xl">
                        <span className="text-xs font-black tracking-[0.2em] text-foreground">{promo.code}</span>
                        <button onClick={() => copyCode(promo.code)} className="text-muted-foreground hover:text-primary">
                          {copiedCode === promo.code ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Usage Progress */}
                  {promo.usageLimit && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        <span>Campaign Usage</span>
                        <span>{promo.usageCount} / {promo.usageLimit}</span>
                      </div>
                      <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-1000 ${usagePercent > 80 ? 'bg-rose-400' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.min(100, usagePercent)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Meta Details */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <Calendar size={12} className="text-indigo-400" />
                      {promo.validFrom} – {promo.validUntil}
                    </div>
                    {promo.happyHour?.days && promo.happyHour.days.length > 0 && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-amber-500 uppercase tracking-wider justify-end">
                        <Clock size={12} />
                        Active HH
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="px-8 py-4 bg-muted/10 border-t border-border flex justify-end gap-2">
                  <button onClick={() => { setEditingId(promo.id); setForm(promo); setShowHappyHour(!!promo.happyHour?.days?.length); setIsAdding(true); }} className="p-3 text-muted-foreground hover:bg-card hover:text-foreground rounded-xl transition-all"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(promo.id)} className="p-3 text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all"><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Redesigned Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-border flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight">{editingId ? 'Refine' : 'Configure'} Campaign</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase mt-1 tracking-widest">Global promotion settings</p>
              </div>
              <button onClick={resetForm} className="p-3 bg-muted/50 text-muted-foreground rounded-full hover:bg-border transition-all"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">Campaign Label</label>
                    <input type="text" placeholder="e.g. Summer Soiree" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value, code: generateCode(e.target.value)})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">Unique Promo Code</label>
                    <input type="text" placeholder="AUTO-GEN" value={form.code || ''} onChange={e => setForm({...form, code: e.target.value.toUpperCase()})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-black tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">Campaign Strategy</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(TYPE_CONFIG) as DiscountType[]).map(t => (
                      <button key={t} type="button" onClick={() => setForm({...form, type: t})}
                        className={`p-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${form.type===t ? 'border-indigo-500 bg-indigo-500/5 text-indigo-400' : 'border-border bg-card text-muted-foreground hover:border-border'}`}>
                        {TYPE_CONFIG[t].icon}{TYPE_CONFIG[t].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">{form.type === 'percentage' ? 'Benefit %' : `Value (${currencySymbol})`}</label>
                    <input type="number" min={0} value={form.value || ''} onChange={e => setForm({...form, value: parseFloat(e.target.value)})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">Min. Expenditure</label>
                    <input type="number" min={0} value={form.minOrderValue || ''} onChange={e => setForm({...form, minOrderValue: parseFloat(e.target.value)})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="None" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">Activation Date</label>
                    <input type="date" value={form.validFrom || ''} onChange={e => setForm({...form, validFrom: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 block">Expiry Date</label>
                    <input type="date" value={form.validUntil || ''} onChange={e => setForm({...form, validUntil: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                <div className="space-y-1">
                  <button type="button" onClick={() => setShowHappyHour(!showHappyHour)} className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-400 tracking-widest hover:text-indigo-300 transition-all">
                    <Clock size={14} /> {showHappyHour ? 'Remove Happy Hour Scheduling' : 'Enable Happy Hour Scheduling'}
                  </button>
                  {showHappyHour && (
                    <div className="p-6 bg-muted/20 border border-border rounded-3xl space-y-4 animate-in fade-in slide-in-from-top-2">
                       <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day, i) => (
                          <button key={i} type="button" onClick={() => {
                            const days = form.happyHour?.days || [];
                            setForm({...form, happyHour: { ...form.happyHour!, days: days.includes(i) ? days.filter(d => d !== i) : [...days, i] }});
                          }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.happyHour?.days?.includes(i) ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
                            {day}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="time" value={form.happyHour?.startTime || '17:00'} onChange={e => setForm({...form, happyHour: {...form.happyHour!, startTime: e.target.value}})} className="p-3 bg-background border border-border rounded-xl text-sm font-bold" />
                        <input type="time" value={form.happyHour?.endTime || '20:00'} onChange={e => setForm({...form, happyHour: {...form.happyHour!, endTime: e.target.value}})} className="p-3 bg-background border border-border rounded-xl text-sm font-bold" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-border bg-card/50 flex gap-4">
              <button 
                onClick={resetForm} 
                className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave} 
                className="flex-[2] py-4 bg-foreground text-card rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] shadow-xl transition-all"
              >
                {editingId ? 'Update Strategy' : 'Deploy Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
