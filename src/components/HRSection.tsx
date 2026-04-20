import React, { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { db, OperationType, handleFirestoreError } from '../firebase';
import {
  Users, Clock, Calendar, DollarSign, Download, Plus, X, Edit2, Trash2,
  CheckCircle2, ChevronLeft, ChevronRight, FileText, AlertCircle, TrendingUp,
  UserCheck, Briefcase, Award
} from 'lucide-react';
import { exportToExcel } from '../utils/excel';
import { formatCurrency } from '../utils/format';
import StaffShifts from './StaffShifts';

type ShiftStatus = 'scheduled' | 'present' | 'late' | 'absent' | 'off';

interface StaffMember {
  id: string;
  name: string;
  role: string;
  hourlyRate?: number;
  monthlyRate?: number;
  payType?: 'hourly' | 'monthly';
}

interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status: string;
  hoursWorked?: number;
  clockIn?: any;
  clockOut?: any;
  notes?: string;
}

interface PayrollRun {
  id: string;
  staffId: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  regularHours: number;
  overtimeHours: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  status: 'draft' | 'approved' | 'paid';
  createdAt?: any;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHIFT_STATUS_CONFIG: Record<ShiftStatus, { label: string; bg: string; color: string; dot: string }> = {
  scheduled: { label: 'Scheduled', bg: 'bg-blue-500/10',    color: 'text-blue-400', dot: 'bg-blue-400' },
  present:   { label: 'Present',   bg: 'bg-emerald-500/10', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  late:      { label: 'Late',      bg: 'bg-amber-500/10',   color: 'text-amber-400', dot: 'bg-amber-400' },
  absent:    { label: 'Absent',    bg: 'bg-rose-500/10',    color: 'text-rose-400', dot: 'bg-rose-400' },
  off:       { label: 'Off',        bg: 'bg-zinc-800',       color: 'text-zinc-500', dot: 'bg-zinc-500' },
};

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getWeekStart(dateStr: string): Date {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return parseFloat((mins / 60).toFixed(2));
}

export default function HRSection({ staff, systemSettings }: { staff: any[], systemSettings?: any }) {
  const currencySymbol = systemSettings?.currency || 'AED';
  const formatCurrencyLocal = (amount: number) => {
    return `${currencySymbol} ${(amount / 100).toFixed(2)}`;
  };
  const [activeTab, setActiveTab] = useState<'schedule' | 'attendance' | 'payroll' | 'time-clock'>('schedule');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(formatDate(getWeekStart(formatDate(new Date()))));
  const [isAddingShift, setIsAddingShift] = useState(false);
  const [shiftForm, setShiftForm] = useState<Partial<Shift>>({ startTime: '09:00', endTime: '17:00', status: 'scheduled' });
  const [payPeriod, setPayPeriod] = useState({ 
    start: formatDate(new Date(new Date().setDate(1))), 
    end: formatDate(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)) 
  });

  useEffect(() => {
    const q = query(collection(db, 'shifts'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, snap => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'shifts'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'payroll_runs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, snap => {
      setPayrollRuns(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRun)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'payroll_runs'));
    return () => unsubscribe();
  }, []);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedWeek + 'T12:00:00');
    d.setDate(d.getDate() + i);
    return formatDate(d);
  });

  const handleSaveShift = async () => {
    if (!shiftForm.staffId || !shiftForm.date) return;
    const member = staff.find(s => s.id === shiftForm.staffId);
    const hours = shiftForm.startTime && shiftForm.endTime ? calcHours(shiftForm.startTime, shiftForm.endTime) : 0;
    try {
      await addDoc(collection(db, 'shifts'), {
        ...shiftForm,
        staffName: member?.name || '',
        hoursWorked: hours,
        createdAt: serverTimestamp(),
      });
      alert('Shift successfully deployed.');
      setShiftForm({ startTime: '09:00', endTime: '17:00', status: 'scheduled' });
      setIsAddingShift(false);
    } catch (err: any) {
      console.error("Shift save failed:", err);
      const errorMessage = err?.message || 'Unknown error';
      alert(`Failed to save shift.\n\nTECHNICAL ERROR: ${errorMessage}\n\nPROBABLE CAUSES:\n1. Firestore rules not deployed.\n2. Collection "shifts" permissions denied.`);
      handleFirestoreError(err, OperationType.CREATE, 'shifts');
    }
  };

  const handleUpdateStatus = async (shiftId: string, status: ShiftStatus, extra?: Partial<Shift>) => {
    try {
      await updateDoc(doc(db, 'shifts', shiftId), { status, ...extra, updatedAt: serverTimestamp() });
      alert(`Status updated to ${status}.`);
    } catch (err: any) {
      console.error("Status update failed:", err);
      const errorMessage = err?.message || 'Unknown error';
      alert(`Failed to update status.\n\nTECHNICAL ERROR: ${errorMessage}\n\nPROBABLE CAUSES:\n1. Firestore rules not deployed.\n2. Collection "shifts" access denied.`);
      handleFirestoreError(err, OperationType.UPDATE, `shifts/${shiftId}`);
    }
  };

  const handleGeneratePayroll = async () => {
    if (!payPeriod.start || !payPeriod.end) return;
    const periodShifts = shifts.filter(s => {
      // Handle both string dates and Firestore timestamps
      let shiftDate = s.date;
      if (!shiftDate && s.clockIn?.toDate) {
        shiftDate = s.clockIn.toDate().toISOString().split('T')[0];
      }
      return shiftDate >= payPeriod.start && shiftDate <= payPeriod.end && s.status !== 'absent' && s.status !== 'off';
    });
    const byStaff = periodShifts.reduce((acc, s) => {
      if (!acc[s.staffId]) acc[s.staffId] = { name: s.staffName, hours: 0 };
      // Use hoursWorked if present, otherwise calculate from clockIn/Out if available
      let hours = s.hoursWorked || 0;
      if (hours === 0 && s.clockIn?.toDate && s.clockOut?.toDate) {
        const diff = s.clockOut.toDate().getTime() - s.clockIn.toDate().getTime();
        hours = diff / (1000 * 60 * 60);
      }
      acc[s.staffId].hours += hours;
      return acc;
    }, {} as Record<string, { name: string; hours: number }>);

    try {
      for (const [staffId, data] of Object.entries((byStaff as Record<string, any>))) {
        const member = staff.find(s => s.id === staffId);
        const hourlyRate = member?.hourlyRate || 30;
        const regular = Math.min(data.hours, 40);
        const overtime = Math.max(0, data.hours - 40);
        const gross = regular * hourlyRate + overtime * hourlyRate * 1.5;
        await addDoc(collection(db, 'payroll_runs'), {
          staffId,
          staffName: data.name,
          periodStart: payPeriod.start,
          periodEnd: payPeriod.end,
          regularHours: regular,
          overtimeHours: overtime,
          grossPay: gross,
          deductions: 0,
          netPay: gross,
          status: 'draft',
          createdAt: serverTimestamp(),
        });
      }
      alert(`Payroll successfully generated for ${Object.keys(byStaff).length} staff members.`);
    } catch (err) {
      console.error("Payroll generation failed:", err);
      alert('Failed to generate payroll. Ensure you have admin permissions and that the payroll_runs collection is enabled in your Firebase Console.');
      handleFirestoreError(err, OperationType.CREATE, 'payroll_runs');
    }
  };

  const shiftsByDay: Record<string, Shift[]> = {};
  weekDays.forEach(d => { shiftsByDay[d] = shifts.filter(s => s.date === d); });

  const todayShifts = shifts.filter(s => s.date === formatDate(new Date()));
  const presentToday = todayShifts.filter(s => ['present', 'late'].includes(s.status)).length;
  const scheduledToday = todayShifts.filter(s => s.status !== 'off').length;

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-500/10 rounded-[1.25rem] flex items-center justify-center text-blue-400 shadow-inner">
            <Users size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Human Capital & Payroll</h2>
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{presentToday} Present · {staff.length} Active Staff · Avg. {((presentToday/scheduledToday || 0)*100).toFixed(0)}% Attendance</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-muted/20 border border-border p-1.5 rounded-[1.5rem] shadow-inner">
          {(['schedule', 'attendance', 'payroll', 'time-clock'] as const).map(t => (
            <button 
              key={t} 
              onClick={() => setActiveTab(t)} 
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
                activeTab === t 
                  ? 'bg-card text-foreground shadow-xl border border-border' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        
        {activeTab === 'schedule' && (
          <button 
            onClick={() => setIsAddingShift(true)} 
            className="group relative bg-primary text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:scale-[1.05] active:scale-95 transition-all shadow-xl shadow-primary/20 flex items-center gap-3 shrink-0 overflow-hidden"
          >
            <Plus size={20} className="relative z-10" /> 
            <span className="relative z-10">Deploy New Shift</span>
          </button>
        )}
      </div>

      {/* Modern Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Personnel', value: staff.length, icon: <Users size={18} />, color: 'text-blue-400', bg: 'bg-blue-400/5' },
          { label: 'Present Shift', value: presentToday, icon: <CheckCircle2 size={18} />, color: 'text-emerald-400', bg: 'bg-emerald-400/5' },
          { label: 'Weekly Shifts', value: shifts.filter(s => weekDays.includes(s.date) && s.status !== 'off').length, icon: <Calendar size={18} />, color: 'text-violet-400', bg: 'bg-violet-400/5' },
          { label: 'Active Payroll', value: payrollRuns.filter(p => p.status === 'draft').length, icon: <DollarSign size={18} />, color: 'text-amber-400', bg: 'bg-amber-400/5' },
        ].map(s => (
          <div key={s.label} className={`p-8 ${s.bg} border border-border rounded-[2.5rem] flex items-center justify-between group`}>
            <div>
              <p className="text-3xl font-black text-foreground tracking-tighter">{s.value}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{s.label}</p>
            </div>
            <div className={`p-4 bg-card border border-border rounded-2xl ${s.color}`}>
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Content Area */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-4 bg-card border border-border rounded-[2rem] p-4">
            <button onClick={() => { const d = new Date(selectedWeek + 'T12:00:00'); d.setDate(d.getDate()-7); setSelectedWeek(formatDate(d)); }} className="p-3 hover:bg-muted rounded-xl transition-all"><ChevronLeft size={20} /></button>
            <div className="flex-1 text-center">
              <span className="text-sm font-black text-foreground uppercase tracking-widest">
                Week commencing: <span className="text-blue-500">{new Date(selectedWeek + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelectedWeek(formatDate(getWeekStart(formatDate(new Date()))))} className="px-4 py-2 text-[10px] font-black uppercase bg-muted/50 rounded-xl hover:bg-muted transition-all">Current Week</button>
              <button onClick={() => { const d = new Date(selectedWeek + 'T12:00:00'); d.setDate(d.getDate()+7); setSelectedWeek(formatDate(d)); }} className="p-3 hover:bg-muted rounded-xl transition-all"><ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm">
            <div className="grid grid-cols-8 bg-muted/10">
              <div className="p-6 text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border">Member</div>
              {weekDays.map((day, i) => (
                <div key={day} className={`p-4 text-center border-l border-b border-border ${day === formatDate(new Date()) ? 'bg-blue-500/[0.03]' : ''}`}>
                  <p className="text-[9px] font-black text-muted-foreground uppercase mb-1">{DAYS[i]}</p>
                  <p className={`text-xl font-black ${day === formatDate(new Date()) ? 'text-blue-500' : 'text-foreground'}`}>{new Date(day + 'T12:00:00').getDate()}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-border">
              {staff.map(member => (
                <div key={member.id} className="grid grid-cols-8 hover:bg-muted/5 transition-colors">
                  <div className="p-6 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white font-black text-xs shrink-0">
                      {member.name?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground truncate">{member.name}</p>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter truncate opacity-60">{member.role}</p>
                    </div>
                  </div>
                  {weekDays.map(day => {
                    const shift = shiftsByDay[day]?.find(s => s.staffId === member.id);
                    return (
                      <div key={day} className={`p-3 border-l border-border flex items-center justify-center ${day === formatDate(new Date()) ? 'bg-blue-500/[0.02]' : ''}`}>
                        {shift ? (
                          <div className={`w-full p-2.5 rounded-2xl text-center shadow-inner ${SHIFT_STATUS_CONFIG[shift.status].bg}`}>
                            <p className={`text-[9px] font-black ${SHIFT_STATUS_CONFIG[shift.status].color} tracking-tighter`}>{shift.startTime}–{shift.endTime}</p>
                            <p className={`text-[8px] font-bold ${SHIFT_STATUS_CONFIG[shift.status].color} opacity-60`}>{shift.hoursWorked}h</p>
                          </div>
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-border" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
              <UserCheck size={20} className="text-emerald-400" /> Live attendance
            </h3>
            <button onClick={() => exportToExcel(todayShifts, 'Attendance_Report')} className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-xl transition-all">
              <Download size={14} /> Export Daily Record
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {staff.map(member => {
              const shift = todayShifts.find(s => s.staffId === member.id);
              const statusCfg = shift ? SHIFT_STATUS_CONFIG[shift.status] : null;

              return (
                <div key={member.id} className="bg-card border border-border rounded-[2rem] p-6 space-y-6 hover:shadow-xl hover:-translate-y-1 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-[1rem] bg-zinc-900 border border-border/10 flex items-center justify-center text-white font-black text-sm">
                        {member.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-foreground text-sm uppercase tracking-tight">{member.name}</p>
                        <p className="text-[10px] font-black text-muted-foreground uppercase opacity-50">{member.role}</p>
                      </div>
                    </div>
                    {shift && (
                      <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider ${statusCfg?.bg} ${statusCfg?.color}`}>
                        {statusCfg?.label}
                      </div>
                    )}
                  </div>

                  {shift ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 bg-muted/20 p-4 rounded-2xl border border-border/50">
                        <div className="text-center">
                          <p className="text-[8px] font-black text-muted-foreground uppercase mb-0.5">Start</p>
                          <p className="text-xs font-black text-foreground">{shift.startTime}</p>
                        </div>
                        <div className="text-center border-x border-border/50">
                          <p className="text-[8px] font-black text-muted-foreground uppercase mb-0.5">Current</p>
                          <p className="text-xs font-black text-foreground">{shift.clockIn || '—'}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[8px] font-black text-muted-foreground uppercase mb-0.5">Duration</p>
                          <p className="text-xs font-black text-foreground">{shift.hoursWorked || 0}h</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(['present','late','absent'] as ShiftStatus[]).map(s => (
                          <button 
                            key={s} 
                            onClick={() => handleUpdateStatus(shift.id, s)} 
                            className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                              shift.status === s ? `bg-foreground text-card shadow-lg` : 'bg-muted/30 border border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 bg-muted/5 rounded-[1.5rem] border border-dashed border-border opacity-50">
                      <Clock size={24} className="text-zinc-300 mb-2" />
                      <p className="text-[10px] font-black text-zinc-400 uppercase">Unscheduled</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="space-y-8">
          <div className="p-8 bg-zinc-900 rounded-[3rem] text-white space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] -mr-32 -mt-32" />
            <div className="relative z-10 flex flex-col md:flex-row gap-8 items-end">
              <div className="flex-1 space-y-4">
                <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                  <Award size={24} className="text-indigo-400" /> Reconciliation engine
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-400 uppercase ml-1">Process Start</label>
                    <input type="date" value={payPeriod.start} onChange={e => setPayPeriod({...payPeriod, start: e.target.value})} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-400 uppercase ml-1">Process End</label>
                    <input type="date" value={payPeriod.end} onChange={e => setPayPeriod({...payPeriod, end: e.target.value})} className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>
              <button 
                onClick={handleGeneratePayroll} 
                className="bg-indigo-500 text-white px-10 py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-indigo-500/20 flex items-center gap-3"
              >
                <TrendingUp size={18} /> Run Payroll
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-[3rem] overflow-hidden shadow-sm">
            <div className="p-8 border-b border-border flex items-center justify-between bg-muted/5">
              <h3 className="text-lg font-black text-foreground uppercase tracking-tight">Disbursement records</h3>
              <button onClick={() => exportToExcel(payrollRuns, 'Payroll_Data')} className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground flex items-center gap-2">
                <FileText size={14} /> Comprehensive Sheet
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-muted/10">
                    {['Member', 'Cycle', 'Duration', 'Gross Earnings', 'Net (Disbursement)', 'Outcome'].map(h => (
                      <th key={h} className="px-8 py-5 text-[9px] font-black text-muted-foreground uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payrollRuns.length === 0 ? (
                    <tr><td colSpan={6} className="px-8 py-20 text-center text-muted-foreground font-bold uppercase text-xs tracking-widest">No active disbursements</td></tr>
                  ) : payrollRuns.map(p => (
                    <tr key={p.id} className="hover:bg-muted/5 transition-all group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center font-black text-[10px] uppercase">{p.staffName.charAt(0)}</div>
                          <span className="text-sm font-black text-foreground">{p.staffName}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tabular-nums">{p.periodStart}–{p.periodEnd}</span>
                      </td>
                      <td className="px-8 py-6 text-sm tabular-nums font-bold">
                        {p.regularHours}h <span className="text-[10px] text-amber-500 ml-1">+{p.overtimeHours}h OT</span>
                        <div className="text-[9px] text-muted-foreground font-black uppercase mt-0.5">Eff. Rate: {formatCurrencyLocal(p.grossPay / (p.regularHours + p.overtimeHours * 1.5) || 0)}</div>
                      </td>
                      <td className="px-8 py-6 text-sm font-black text-foreground tabular-nums">{formatCurrencyLocal(p.grossPay)}</td>
                      <td className="px-8 py-6 text-sm font-black text-emerald-500 tabular-nums">{formatCurrencyLocal(p.netPay)}</td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest ${
                          p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : p.status === 'approved' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'time-clock' && (
        <StaffShifts users={staff} />
      )}

      {/* Modern Dialog */}
      {isAddingShift && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-8 border-b border-border flex justify-between items-center">
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Shift deployment</h3>
              <button onClick={() => setIsAddingShift(false)} className="p-3 bg-muted/50 text-muted-foreground rounded-full hover:bg-border transition-all"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Assigned personnel</label>
                  <select value={shiftForm.staffId || ''} onChange={e => setShiftForm({...shiftForm, staffId: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Choose member...</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Operation date</label>
                  <input type="date" value={shiftForm.date || ''} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Arrival</label>
                    <input type="time" value={shiftForm.startTime || '09:00'} onChange={e => setShiftForm({...shiftForm, startTime: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Departure</label>
                    <input type="time" value={shiftForm.endTime || '17:00'} onChange={e => setShiftForm({...shiftForm, endTime: e.target.value})} className="w-full p-4 bg-background border border-border rounded-2xl text-sm font-bold" />
                  </div>
                </div>
              </div>
              
              <button 
                onClick={handleSaveShift} 
                className="w-full bg-foreground text-card py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:scale-[1.02] shadow-xl transition-all"
              >
                Confirm assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
