import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, where, runTransaction, increment } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { 
  Calendar, Plus, Phone, Users, Clock, CheckCircle2, X, ChevronLeft, ChevronRight,
  Edit2, Trash2, User, Hash, MessageSquare, Coffee, TableIcon, Search, AlertTriangle, Layout, Utensils
} from 'lucide-react';
import { Table as TableIconType, Customer, Reservation as TypedReservation, Order } from '../types';
import { useAuth } from '../contexts/AuthContext';

type ReservationStatus = TypedReservation['status'] | 'no-show';
type Reservation = TypedReservation;

const STATUS_CONFIG: Record<ReservationStatus, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pending',    color: 'text-amber-700',   bg: 'bg-amber-100' },
  confirmed: { label: 'Confirmed',  color: 'text-blue-700',    bg: 'bg-blue-100' },
  seated:    { label: 'Seated',     color: 'text-purple-700',  bg: 'bg-purple-100' },
  completed: { label: 'Completed',  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  cancelled: { label: 'Cancelled',  color: 'text-red-700',     bg: 'bg-red-100' },
  'no-show': { label: 'No Show',    color: 'text-zinc-600',    bg: 'bg-zinc-100' },
};

const NEXT_STATUS: Partial<Record<ReservationStatus, ReservationStatus>> = {
  pending: 'confirmed',
  confirmed: 'seated',
};

const OCCASIONS = ['Birthday', 'Anniversary', 'Business Dinner', 'Date Night', 'Family Gathering', 'Other'];
const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const totalMins = 11 * 60 + i * 30; // 11:00 to 00:30
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function WaitlistCard({ w, onEdit, onDelete, onStatusChange }: { key?: any, w: any, onEdit: () => void, onDelete: () => void, onStatusChange: (status: string) => void }) {
  const waitTime = w.createdAt?.toDate ? Math.floor((new Date().getTime() - w.createdAt.toDate().getTime()) / 60000) : 0;
  const isOverdue = waitTime > w.quotedTime;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 ${w.status === 'waiting' ? (isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700') : 'bg-zinc-100 text-zinc-500'}`}>
          <span className="text-xs font-black">{waitTime}m</span>
          <span className="text-[8px] font-bold uppercase">Wait</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-black text-foreground">{safeText(w.customerName) || 'Guest'}</h4>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${w.status === 'waiting' ? 'bg-amber-100 text-amber-700' : w.status === 'seated' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'}`}>{w.status}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Users size={14} /> {Number(w.guests) || 0}</span>
            <span className="flex items-center gap-1"><Phone size={14} /> {safeText(w.customerPhone) || 'Unknown'}</span>
            <span className="flex items-center gap-1"><Clock size={14} /> Quoted: {w.quotedTime}m</span>
          </div>
          {w.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{safeText(w.notes)}"</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {w.status === 'waiting' && (
          <>
            <button onClick={() => onStatusChange('seated')} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors" title="Mark as Seated">
              <CheckCircle2 size={18} />
            </button>
            <button onClick={() => onStatusChange('no-show')} className="p-2 bg-zinc-50 text-zinc-600 rounded-xl hover:bg-zinc-100 transition-colors" title="Mark as No Show">
              <AlertTriangle size={18} />
            </button>
          </>
        )}
        <button onClick={onEdit} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
          <Edit2 size={18} />
        </button>
        <button onClick={onDelete} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors">
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

export default function ReservationsSection() {
  const { user, profile } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'reservations' | 'waitlist'>('reservations');
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'list'>('day');
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingWaitlist, setIsAddingWaitlist] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWaitlistId, setEditingWaitlistId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Reservation>>({
    date: formatDate(new Date()),
    time: '19:00',
    guests: 2,
    status: 'confirmed',
    source: 'phone',
  });
  const [waitlistForm, setWaitlistForm] = useState<Partial<any>>({
    guests: 2,
    quotedTime: 15,
    status: 'waiting'
  });

  const [tables, setTables] = useState<TableIconType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [selectedTables, setSelectedTables] = useState<TableIconType[]>([]);

  useEffect(() => {
    let q = query(collection(db, 'reservations'), orderBy('date', 'asc'));
    if (profile?.storeId) {
      q = query(collection(db, 'reservations'), where('storeId', '==', profile.storeId), orderBy('date', 'asc'));
    }
    const unsub = onSnapshot(q, snap => {
      setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'reservations'));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tables'), snap => {
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() } as TableIconType)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'tables'));
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), snap => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'customers'));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'waitlist'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setWaitlist(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'waitlist'));
    return () => unsub();
  }, []);

  useEffect(() => {
    let q = query(collection(db, 'orders'), where('status', 'in', ['pending', 'confirmed', 'preparing', 'serving', 'done-serving', 'awaiting-bill']));
    if (profile?.storeId) {
      q = query(collection(db, 'orders'), 
        where('storeId', '==', profile.storeId),
        where('status', 'in', ['pending', 'confirmed', 'preparing', 'serving', 'done-serving', 'awaiting-bill'])
      );
    }
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsub();
  }, [profile?.storeId]);

  const todayReservations = reservations.filter(r => r.date === selectedDate && r.status !== 'completed' && r.status !== 'cancelled');
  
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - d.getDay() + i);
    return formatDate(d);
  });

  const handleSave = async () => {
    if (!form.customerName || !form.date || !form.time || !form.customerPhone) {
      alert('Please fill in all required fields (Name, Phone, Date, Time).');
      return;
    }
    try {
      const payload = {
        ...form,
        storeId: profile?.storeId || null,
        updatedAt: serverTimestamp()
      };
      if (editingId) {
        await updateDoc(doc(db, 'reservations', editingId), payload);
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'reservations'), { ...payload, createdAt: serverTimestamp() });
      }
      setForm({ date: selectedDate, time: '19:00', guests: 2, status: 'confirmed', source: 'phone' });
      setSelectedTables([]);
      setIsAdding(false);
    } catch (err: any) {
      handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, editingId ? `reservations/${editingId}` : 'reservations');
    }
  };

  const handleSaveWaitlist = async () => {
    if (!waitlistForm.customerName || !waitlistForm.customerPhone) {
      alert('Please fill in all required fields (Name, Phone).');
      return;
    }
    try {
      const payload = {
        ...waitlistForm,
        updatedAt: serverTimestamp()
      };
      if (editingWaitlistId) {
        await updateDoc(doc(db, 'waitlist', editingWaitlistId), payload);
        setEditingWaitlistId(null);
      } else {
        await addDoc(collection(db, 'waitlist'), { ...payload, createdAt: serverTimestamp() });
      }
      setWaitlistForm({ guests: 2, quotedTime: 15, status: 'waiting' });
      setIsAddingWaitlist(false);
    } catch (err: any) {
      handleFirestoreError(err, editingWaitlistId ? OperationType.UPDATE : OperationType.CREATE, editingWaitlistId ? `waitlist/${editingWaitlistId}` : 'waitlist');
    }
  };

  const handleAdvanceStatus = async (r: Reservation) => {
    const next = NEXT_STATUS[r.status];
    if (!next) return;

    // Validation: Cannot seat without a table
    if (next === 'seated' && !r.tableId) {
      alert('Please assign a table before seating the guest.');
      setEditingId(r.id);
      setForm(r);
      setIsAdding(true);
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Update reservation status
        const resUpdate: any = { 
          status: next, 
          updatedAt: serverTimestamp() 
        };
        if (next === 'seated') {
          resUpdate.seatedAt = serverTimestamp();
        }
        transaction.update(doc(db, 'reservations', r.id), resUpdate);
        
        // 2. If seated, mark tables as occupied (Order created later in POS)
        if (next === 'seated' && r.tableId) {
          const tableIds = r.tableId.split(',');
          for (const tId of tableIds) {
            const trimmedId = tId.trim();
            if (trimmedId) {
              transaction.update(doc(db, 'tables', trimmedId), { 
                status: 'occupied', 
                updatedAt: serverTimestamp() 
              });
            }
          }
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reservations/${r.id}`);
    }
  };

  const handleCancel = async (r: Reservation) => {
    try {
      await updateDoc(doc(db, 'reservations', r.id), { status: 'cancelled', updatedAt: serverTimestamp() });
      
      // Free up tables
      if (r.tableId) {
        const tableIds = r.tableId.split(',');
        for (const tId of tableIds) {
          const trimmedId = tId.trim();
          if (trimmedId) {
            await updateDoc(doc(db, 'tables', trimmedId), { status: 'available', updatedAt: serverTimestamp() });
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `reservations/${r.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    const r = reservations.find(res => res.id === id);
    try {
      await deleteDoc(doc(db, 'reservations', id));
      
      // Free up tables if deleting a reservation that was holding them
      if (r && r.tableId && r.status !== 'completed' && r.status !== 'cancelled') {
        const tableIds = r.tableId.split(',');
        for (const tId of tableIds) {
          const trimmedId = tId.trim();
          if (trimmedId) {
            await updateDoc(doc(db, 'tables', trimmedId), { status: 'available', updatedAt: serverTimestamp() });
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `reservations/${id}`);
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(formatDate(d));
  };

  const stats = {
    total: todayReservations.length,
    confirmed: todayReservations.filter(r => r.status === 'confirmed').length,
    seated: todayReservations.filter(r => r.status === 'seated').length,
    covers: todayReservations.filter(r => !['cancelled','no-show'].includes(r.status)).reduce((s,r) => s + (r.guests || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Reservations</h2>
            <p className="text-sm text-muted-foreground">{stats.total} bookings · {stats.covers} covers for {formatDisplayDate(selectedDate)}</p>
          </div>
          <div className="flex items-center gap-1 bg-background border border-border rounded-2xl p-1 ml-4">
            <button onClick={() => setActiveTab('reservations')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${activeTab === 'reservations' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Bookings
            </button>
            <button onClick={() => setActiveTab('waitlist')} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${activeTab === 'waitlist' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Waitlist ({waitlist.filter(w => w.status === 'waiting').length})
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'reservations' && (
            <div className="flex items-center gap-1 bg-background border border-border rounded-2xl p-1">
              {(['day','week','list'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-2 rounded-xl text-xs font-bold uppercase transition-all ${viewMode===m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {m}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { 
              if (activeTab === 'reservations') {
                setIsAdding(true); setForm({ date: selectedDate, time: '19:00', guests: 2, status: 'confirmed', source: 'phone' }); setSelectedTables([]); 
              } else {
                setIsAddingWaitlist(true); setWaitlistForm({ guests: 2, quotedTime: 15, status: 'waiting' });
              }
            }}
            className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-2xl text-xs font-bold hover:scale-105 transition-all shadow-lg shadow-primary/20">
            <Plus size={16} /> {activeTab === 'reservations' ? 'New Booking' : 'Add to Waitlist'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Bookings', value: stats.total, color: 'bg-blue-50 text-blue-700' },
          { label: 'Confirmed', value: stats.confirmed, color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Currently Seated', value: stats.seated, color: 'bg-purple-50 text-purple-700' },
          { label: 'Total Covers', value: stats.covers, color: 'bg-amber-50 text-amber-700' },
        ].map(s => (
          <div key={s.label} className={`p-5 rounded-3xl border border-border ${s.color.split(' ')[0]} flex flex-col`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${s.color.split(' ')[1]}`}>{s.label}</p>
            <p className={`text-3xl font-black ${s.color.split(' ')[1]}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3">
        <button onClick={() => shiftDate(-1)} className="p-2 hover:bg-background rounded-xl transition-colors"><ChevronLeft size={18} /></button>
        <div className="flex-1 flex gap-1 overflow-x-auto">
          {viewMode === 'week' ? weekDays.map(day => (
            <button key={day} onClick={() => setSelectedDate(day)} className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all min-w-[50px] ${selectedDate === day ? 'bg-primary text-white' : 'hover:bg-background'}`}>
              <span className={`text-[10px] font-bold uppercase ${selectedDate === day ? 'text-white/80' : 'text-muted-foreground'}`}>
                {new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={`text-lg font-black ${selectedDate === day ? 'text-white' : 'text-foreground'}`}>
                {new Date(day + 'T12:00:00').getDate()}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${reservations.filter(r=>r.date===day && !['cancelled','no-show','completed'].includes(r.status)).length > 0 ? (selectedDate===day ? 'bg-white' : 'bg-primary') : 'bg-transparent'}`} />
            </button>
          )) : (
            <div className="flex-1 text-center">
              <span className="font-black text-foreground">{formatDisplayDate(selectedDate)}</span>
            </div>
          )}
        </div>
        <button onClick={() => setSelectedDate(formatDate(new Date()))} className="px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors">Today</button>
        <button onClick={() => shiftDate(1)} className="p-2 hover:bg-background rounded-xl transition-colors"><ChevronRight size={18} /></button>
      </div>

      {activeTab === 'reservations' ? (
        viewMode === 'list' ? (
          <div className="space-y-2">
            {reservations.filter(r => !['cancelled', 'completed'].includes(r.status)).length === 0 ? (
              <EmptyState />
            ) : reservations.filter(r => !['cancelled', 'completed'].includes(r.status)).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(r => (
              <ReservationCard key={r.id} r={r} onAdvance={() => handleAdvanceStatus(r)} onCancel={() => handleCancel(r)} onEdit={() => { setEditingId(r.id); setForm(r); setIsAdding(true); }} onDelete={() => handleDelete(r.id)} showDate />
            ))}
          </div>
        ) : (
          <div>
            {todayReservations.length === 0 ? (
              <EmptyState onAdd={() => setIsAdding(true)} />
            ) : (
              <div className="space-y-2">
                {todayReservations.sort((a,b) => a.time.localeCompare(b.time)).map(r => (
                  <ReservationCard key={r.id} r={r} onAdvance={() => handleAdvanceStatus(r)} onCancel={() => handleCancel(r)} onEdit={() => { setEditingId(r.id); setForm(r); setIsAdding(true); }} onDelete={() => handleDelete(r.id)} />
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {waitlist.length === 0 ? (
            <EmptyState onAdd={() => { setIsAddingWaitlist(true); setWaitlistForm({ guests: 2, quotedTime: 15, status: 'waiting' }); }} />
          ) : (
            waitlist.sort((a, b) => {
              const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return timeA - timeB;
            }).map(w => (
              <WaitlistCard 
                key={w.id} 
                w={w} 
                onEdit={() => { setEditingWaitlistId(w.id); setWaitlistForm(w); setIsAddingWaitlist(true); }} 
                onDelete={async () => {
                  if (confirm('Delete this waitlist entry?')) {
                    try {
                      await deleteDoc(doc(db, 'waitlist', w.id));
                    } catch (err) {
                      handleFirestoreError(err, OperationType.DELETE, `waitlist/${w.id}`);
                    }
                  }
                }} 
                onStatusChange={async (status) => {
                  try {
                    await updateDoc(doc(db, 'waitlist', w.id), { status, updatedAt: serverTimestamp() });
                  } catch (err) {
                    handleFirestoreError(err, OperationType.UPDATE, `waitlist/${w.id}`);
                  }
                }}
              />
            ))
          )}
        </div>
      )}

      {isAdding && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight">
                {editingId ? 'Edit Reservation' : 'New Reservation'}
              </h3>
              <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1 relative">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Guest Name *</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Search or enter full name" 
                      value={form.customerName || ''} 
                      onChange={e => {
                        setForm({...form, customerName: e.target.value});
                        setCustomerSearch(e.target.value);
                      }} 
                      onFocus={() => setCustomerSearch(form.customerName || '')}
                      className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" 
                    />
                    {customerSearch && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-2xl shadow-2xl z-[60] max-h-48 overflow-y-auto custom-scrollbar p-2">
                        {customers
                          .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch))
                          .map(c => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setForm({
                                  ...form,
                                  customerId: c.id,
                                  customerName: c.name,
                                  customerPhone: c.phone
                                });
                                setCustomerSearch('');
                              }}
                              className="w-full text-left p-3 hover:bg-background rounded-xl transition-colors border border-transparent hover:border-border"
                            >
                              <p className="font-bold text-sm text-foreground">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{c.phone}</p>
                            </button>
                          ))}
                        <button onClick={() => setCustomerSearch('')} className="w-full text-center p-2 text-[10px] font-black uppercase text-primary">Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Phone *</label>
                  <input type="tel" placeholder="+971..." value={form.customerPhone || ''} onChange={e => setForm({...form, customerPhone: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Email</label>
                  <input type="email" placeholder="guest@email.com" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Date *</label>
                  <input type="date" value={form.date || ''} onChange={e => setForm({...form, date: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Time *</label>
                  <select value={form.time || '19:00'} onChange={e => setForm({...form, time: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none">
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Party Size *</label>
                  <input type="number" min={1} max={50} value={form.guests || 2} onChange={e => setForm({...form, guests: parseInt(e.target.value)})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Table Assignment</label>
                  <button onClick={() => setIsTableModalOpen(true)} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold text-left hover:border-primary transition-all flex justify-between items-center group">
                    <span className={form.tableNumber ? 'text-foreground' : 'text-muted-foreground'}>{form.tableNumber || 'Select Table...'}</span>
                    <TableIcon size={16} className="text-muted-foreground group-hover:text-primary" />
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Source</label>
                  <select value={form.source || 'phone'} onChange={e => setForm({...form, source: e.target.value as any})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none">
                    <option value="phone">Phone</option>
                    <option value="walk-in">Walk-in</option>
                    <option value="online">Online</option>
                    <option value="app">App</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Occasion</label>
                  <div className="flex flex-wrap gap-2">
                    {OCCASIONS.map(o => (
                      <button key={o} type="button" onClick={() => setForm({...form, occasion: form.occasion === o ? '' : o})}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${form.occasion === o ? 'bg-primary text-white' : 'bg-background border border-border text-muted-foreground hover:text-foreground'}`}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Special Notes</label>
                  <textarea placeholder="Allergies, seating preferences, special requests..." value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary outline-none h-20 resize-none" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Status</label>
                  <div className="flex gap-2 flex-wrap">
                    {(Object.keys(STATUS_CONFIG) as ReservationStatus[])
                      .filter(s => s !== 'completed')
                      .map(s => (
                      <button key={s} type="button" onClick={() => setForm({...form, status: s})}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${form.status === s ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color}` : 'bg-background border border-border text-muted-foreground'}`}>
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleSave} className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
                {editingId ? 'Update Reservation' : 'Book Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isTableModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-5xl h-[90vh] rounded-[3rem] shadow-2xl flex flex-col border border-border">
            <div className="p-8 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-2xl font-black text-foreground uppercase tracking-tight">Select Table(s)</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Select one or more tables to assign</p>
              </div>
              <button onClick={() => setIsTableModalOpen(false)} className="p-2 hover:bg-background rounded-full transition-colors"><X size={24} className="text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-auto p-12 bg-background/30 m-6 rounded-[2rem] border-2 border-border shadow-inner relative">
              <div className="relative" style={{ minWidth: 800, minHeight: 600 }}>
                {tables.map(table => {
                  const isSelected = selectedTables.some(t => t.id === table.id);
                  
                  // Check for active dine-in orders on this table (Mirror logic from POS)
                  const activeOrderForTable = orders.find(o => 
                    o.tableId?.split(',').includes(table.id) && 
                    o.orderType === 'dine-in' &&
                    !['paid', 'cancelled', 'finalized'].includes(o.status.toLowerCase())
                  );

                  // Check for reservations on this date
                  const tableReservation = reservations.find(r => 
                    r.tableId?.split(',').includes(table.id) && 
                    r.date === form.date && 
                    !['cancelled', 'completed'].includes(r.status) && 
                    r.id !== editingId
                  );

                  // A table is occupied if it has a static 'occupied' status, an active order, or a seated reservation
                  const isOccupied = table.status === 'occupied' || !!activeOrderForTable || tableReservation?.status === 'seated';

                  return (
                    <button 
                      key={table.id} 
                      disabled={!isSelected && (isOccupied || tableReservation)}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTables(selectedTables.filter(t => t.id !== table.id));
                        } else if (!isOccupied && !tableReservation) {
                          setSelectedTables([...selectedTables, table]);
                        }
                      }}
                      className={`absolute flex flex-col items-center justify-center transition-all p-2 border-2 ${table.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'} ${isSelected ? 'bg-primary border-primary text-white scale-105 z-10' : isOccupied ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 cursor-not-allowed opacity-60' : tableReservation ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 cursor-not-allowed opacity-60' : 'bg-card border-border hover:border-primary/50 text-foreground'}`}
                      style={{ left: `${table.x}px`, top: `${table.y}px`, width: `${table.width}px`, height: `${table.height}px` }}>
                      <span className="font-black text-xs text-center line-clamp-1">{table.name}</span>
                      <div className="flex items-center gap-1 mt-0.5 opacity-60"><Users size={10} /><span className="text-[9px] font-bold">{table.capacity}</span></div>
                      {!isSelected && (isOccupied || tableReservation) && (
                        <div className={`mt-1 px-1.5 py-0.5 ${isOccupied ? 'bg-amber-500' : 'bg-blue-500'} text-white rounded-md text-[8px] font-black uppercase`}>
                          {isOccupied ? 'OCCUPIED' : 'RESERVED'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-8 border-t border-border flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsTableModalOpen(false)} className="px-8 py-3 rounded-2xl text-sm font-bold text-muted-foreground">Cancel</button>
              <button onClick={() => { setForm({...form, tableId: selectedTables.map(t=>t.id).join(','), tableNumber: selectedTables.map(t=>t.name).join(' + ') }); setIsTableModalOpen(false); }}
                className="px-10 py-3 bg-primary text-white rounded-2xl text-sm font-black uppercase tracking-widest">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {isAddingWaitlist && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight">
                {editingWaitlistId ? 'Edit Waitlist Entry' : 'Add to Waitlist'}
              </h3>
              <button onClick={() => { setIsAddingWaitlist(false); setEditingWaitlistId(null); }} className="p-2 bg-background text-muted-foreground rounded-full hover:bg-accent">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Customer Name</label>
                  <input type="text" value={waitlistForm.customerName || ''} onChange={e => setWaitlistForm({...waitlistForm, customerName: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Phone Number</label>
                  <input type="tel" value={waitlistForm.customerPhone || ''} onChange={e => setWaitlistForm({...waitlistForm, customerPhone: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" placeholder="+1 234 567 890" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Guests</label>
                  <input type="number" min="1" value={waitlistForm.guests || 2} onChange={e => setWaitlistForm({...waitlistForm, guests: parseInt(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Quoted Time (mins)</label>
                  <input type="number" min="5" step="5" value={waitlistForm.quotedTime || 15} onChange={e => setWaitlistForm({...waitlistForm, quotedTime: parseInt(e.target.value)})} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Notes (Optional)</label>
                <textarea value={waitlistForm.notes || ''} onChange={e => setWaitlistForm({...waitlistForm, notes: e.target.value})} className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none h-24" placeholder="High chair, allergies, etc." />
              </div>

              <button onClick={handleSaveWaitlist} className="w-full bg-primary text-white rounded-xl py-3 text-sm font-black uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-lg shadow-primary/20">
                {editingWaitlistId ? 'Update Entry' : 'Add to Waitlist'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservationCard({ r, onAdvance, onCancel, onEdit, onDelete, showDate }: any) {
  const cfg = STATUS_CONFIG[r.status as ReservationStatus];
  const next = NEXT_STATUS[r.status as ReservationStatus];
  return (
    <div className="bg-card border border-border rounded-3xl p-5 flex flex-col md:flex-row md:items-center gap-4 hover:shadow-md transition-all">
      <div className="flex flex-col items-center justify-center w-16 shrink-0">
        <span className="text-xl font-black text-foreground">{r.time}</span>
        {showDate && <span className="text-[10px] text-muted-foreground font-bold">{formatDisplayDate(r.date)}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-black text-foreground">{r.customerName}</span>
          {r.occasion && <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{r.occasion}</span>}
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg uppercase ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium flex-wrap">
          <span className="flex items-center gap-1"><Phone size={11} />{r.customerPhone}</span>
          <span className="flex items-center gap-1"><Users size={11} />{r.guests} guests</span>
          {r.tableNumber && <span className="flex items-center gap-1"><TableIcon size={11} />{r.tableNumber}</span>}
        </div>
        {r.notes && <p className="text-[11px] text-amber-600 font-medium mt-1 italic">"{r.notes}"</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {next && <button onClick={onAdvance} className="px-4 py-2 bg-primary text-white rounded-2xl text-xs font-black uppercase">{next.replace('-', ' ')} →</button>}
        {r.status !== 'cancelled' && r.status !== 'completed' && <button onClick={onCancel} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors text-xs font-bold">Cancel</button>}
        <button onClick={onEdit} className="p-2 text-muted-foreground hover:bg-background rounded-xl transition-colors"><Edit2 size={15} /></button>
        <button onClick={onDelete} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: any) {
  return (
    <div className="text-center py-24 bg-card rounded-3xl border border-border">
      <Calendar size={52} className="text-zinc-200 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-foreground">No reservations</h3>
      {onAdd && <button onClick={onAdd} className="px-6 py-3 bg-primary text-white rounded-2xl text-sm font-bold mt-4">New Booking</button>}
    </div>
  );
}
