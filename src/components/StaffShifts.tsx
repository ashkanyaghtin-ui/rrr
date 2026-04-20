import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, query, where, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { UserCheck, Clock, CheckCircle2, Play, Square } from 'lucide-react';
import { Shift } from '../types';

export default function StaffShifts({ users }: { users: any[] }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We fetch all active and recently completed shifts
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(collection(db, 'shifts'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allShifts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Shift));
      // Sort by clockIn
      allShifts.sort((a, b) => {
        const timeA = a.clockIn?.toDate ? a.clockIn.toDate().getTime() : 0;
        const timeB = b.clockIn?.toDate ? b.clockIn.toDate().getTime() : 0;
        return timeB - timeA; // Newest first
      });
      setShifts(allShifts);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'shifts'));

    return () => unsubscribe();
  }, []);

  const handleClockIn = async (staffId: string, staffName: string) => {
    try {
      await addDoc(collection(db, 'shifts'), {
        staffId,
        staffName,
        clockIn: serverTimestamp(),
        status: 'active'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'shifts');
    }
  };

  const handleClockOut = async (shift: Shift) => {
    try {
      const clockOutTime = new Date();
      const clockInTime = shift.clockIn.toDate();
      const diffMs = clockOutTime.getTime() - clockInTime.getTime();
      const totalHours = diffMs / (1000 * 60 * 60);

      await updateDoc(doc(db, 'shifts', shift.id), {
        clockOut: serverTimestamp(),
        totalHours: Number(totalHours.toFixed(2)),
        status: 'completed'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `shifts/${shift.id}`);
    }
  };

  const activeShiftsMap = shifts.filter(s => s.status === 'active').reduce((acc, current) => {
    acc[current.staffId] = current;
    return acc;
  }, {} as Record<string, Shift>);

  if (loading) {
    return <div className="text-center p-8 text-muted-foreground font-bold">Loading Shift Data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-primary/10 text-primary rounded-xl">
          <UserCheck size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground uppercase tracking-tight">Time & Attendance</h2>
          <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-1">Staff Shift Management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(user => {
          const activeShift = activeShiftsMap[user.id];
          
          return (
            <div key={user.id} className="p-5 bg-card border border-border rounded-3xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              {activeShift && (
                <div className="absolute top-0 right-0 left-0 h-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              )}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-black text-foreground text-lg uppercase tracking-tight">{user.name}</p>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md inline-block mt-1">{user.role}</p>
                </div>
                {activeShift ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    On Clock
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-lg text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                    <Square size={10} />
                    Off Duty
                  </div>
                )}
              </div>

              {activeShift ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-foreground/80 font-medium">
                    <Clock size={16} className="text-emerald-500" />
                    Started: {activeShift.clockIn?.toDate ? activeShift.clockIn.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Loading...'}
                  </div>
                  <button 
                    onClick={() => handleClockOut(activeShift)}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                  >
                    <Square size={14} className="fill-current" /> CLOCK OUT
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => handleClockIn(user.id, user.name)}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20 mt-4"
                >
                  <Play size={14} className="fill-current" /> CLOCK IN
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-12 bg-card p-6 border border-border rounded-3xl shadow-sm">
        <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-6">Recent Shift History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="pb-4 text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Staff Member</th>
                <th className="pb-4 text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Clock In</th>
                <th className="pb-4 text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Clock Out</th>
                <th className="pb-4 text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] text-right">Total Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {shifts.filter(s => s.status === 'completed').slice(0, 10).map(shift => (
                <tr key={shift.id} className="group hover:bg-muted/10">
                  <td className="py-4">
                    <span className="text-xs font-black text-foreground uppercase tracking-tight">{shift.staffName}</span>
                  </td>
                  <td className="py-4">
                    <span className="text-xs font-medium text-muted-foreground">
                      {shift.clockIn?.toDate?.()?.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className="text-xs font-medium text-muted-foreground">
                      {shift.clockOut?.toDate?.()?.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <span className="text-sm font-black text-emerald-500">{shift.totalHours}h</span>
                  </td>
                </tr>
              ))}
              {shifts.filter(s => s.status === 'completed').length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    No completed shifts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
