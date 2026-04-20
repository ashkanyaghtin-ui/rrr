import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, query, where, orderBy, updateDoc, doc } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { ChefHat, CheckCircle2, Clock, Volume2, VolumeX, AlertCircle, Maximize2, Minimize2, Utensils, Package, Truck } from 'lucide-react';
import { Order } from '../types';

export default function Kitchen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [maximizedOrderId, setMaximizedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Only fetch active orders and sort them by creation time
    const q = query(
      collection(db, 'orders'),
      where('status', 'in', ['awaiting-confirmation', 'pending', 'confirmed', 'preparing'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
      // We do the sorting client side since we'd need a composite index for where-in + orderby
      fetchedOrders.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeA - timeB; // Oldest first
      });

      // Check if there's a new order added that wasn't there before
      if (soundEnabled && fetchedOrders.length > orders.length && fetchedOrders.length > 0) {
        playSound();
      }

      setOrders(fetchedOrders);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'kitchenOrders'));

    return () => unsubscribe();
  }, [soundEnabled, orders.length]);

  const playSound = () => {
    const audio = new Audio('https://audio-previews.elements.envatousercontent.com/files/259410951/preview.mp3');
    audio.play().catch(e => console.error("Audio playback failed:", e));
  };

  const updateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const getElapsedTime = (order: Order) => {
    if (!order.createdAt?.toDate) return { text: '0m', isHigh: false };
    const diff = Math.floor((currentTime.getTime() - order.createdAt.toDate().getTime()) / 60000);
    return {
      text: `${diff}m`,
      isHigh: diff >= 15 // highlight orders older than 15 minutes
    };
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <ChefHat size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">Kitchen Display System</h1>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-[0.2em]">{orders.length} Active Tickets</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xl font-black tabular-nums">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{currentTime.toLocaleDateString()}</p>
          </div>
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-3 rounded-xl transition-all ${soundEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'}`}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 overflow-x-auto p-4 custom-scrollbar">
        {orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50">
            <ChefHat size={64} className="mb-4" />
            <h2 className="text-2xl font-black uppercase tracking-widest">No Active Tickets</h2>
            <p className="text-sm font-bold uppercase tracking-widest mt-2">Kitchen is clear</p>
          </div>
        ) : (
          <div className="flex gap-4 h-full">
            {orders.map(order => {
              const { text: elapsedText, isHigh: isHighTime } = getElapsedTime(order);
              
              return (
                <div 
                  key={order.id} 
                  className={`min-w-[300px] w-[300px] flex flex-col rounded-2xl border-2 overflow-hidden shadow-2xl transition-all ${
                    isHighTime 
                      ? 'border-rose-500 bg-rose-950/20 shadow-rose-500/10' 
                      : order.status === 'preparing'
                        ? 'border-indigo-500 bg-indigo-950/20'
                        : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className={`p-3 border-b-2 flex justify-between items-center ${
                    isHighTime ? 'border-rose-500/30 bg-rose-500/10' : 
                    order.status === 'preparing' ? 'border-indigo-500/30 bg-indigo-500/10' : 
                    'border-zinc-800 bg-zinc-800/50'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-black uppercase tracking-tighter">
                          {order.orderType === 'dine-in' ? `T${order.tableNumber}` : order.orderNo ? `#${order.orderNo}` : `#${order.id.slice(-4)}`}
                        </p>
                        {order.kotNo && <span className="px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-black uppercase tracking-widest text-white/80">KOT #{order.kotNo}</span>}
                      </div>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${order.orderType === 'dine-in' ? 'text-emerald-400' : 'text-blue-400'}`}>
                        {order.orderType}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 font-black tabular-nums ${
                        isHighTime ? 'border-rose-500 text-rose-500 animate-pulse' : 'border-zinc-700 text-zinc-300'
                      }`}>
                        {isHighTime && <AlertCircle size={14} />}
                        <Clock size={14} className={!isHighTime ? 'opacity-50' : ''} />
                        {elapsedText}
                      </div>
                      <button 
                        onClick={() => setMaximizedOrderId(maximizedOrderId === order.id ? null : order.id)}
                        className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 transition-colors"
                      >
                        <Maximize2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Ticket Notes */}
                  {order.notes && (
                    <div className="p-3 bg-amber-500/10 border-b-2 border-amber-500/20">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Notes</p>
                      <p className="text-xs font-bold text-amber-200">{order.notes}</p>
                    </div>
                  )}

                  {/* Ticket Items */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex gap-4 items-start">
                        <div className="relative shrink-0">
                          <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center overflow-hidden border border-zinc-700">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Utensils size={20} className="text-zinc-600" />
                            )}
                          </div>
                          <div className="absolute -top-2 -left-2 w-6 h-6 bg-indigo-500 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-lg">
                            {item.quantity}
                          </div>
                        </div>
                        <div className="pt-1">
                          <p className="font-black text-xl leading-tight tracking-tight">{item.name}</p>
                          {item.notes && (
                            <p className="text-sm font-bold text-amber-500 mt-1 uppercase tracking-wider before:content-['*'] before:mr-1">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ticket Footer actions */}
                  <div className="p-3 bg-zinc-900 border-t-2 border-zinc-800 shrink-0">
                    {order.status === 'pending' || order.status === 'confirmed' ? (
                      <button 
                        onClick={() => updateOrderStatus(order.id, 'preparing')}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black uppercase tracking-[0.2em] transition-colors"
                      >
                        Start Prep
                      </button>
                    ) : (
                      <button 
                        onClick={() => updateOrderStatus(order.id, 'done-serving')}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black uppercase tracking-[0.2em] transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={20} />
                        Mark Done
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Maximized Overlay */}
      {maximizedOrderId && orders.find(o => o.id === maximizedOrderId) && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-8">
          {(() => {
            const order = orders.find(o => o.id === maximizedOrderId)!;
            const { text: elapsedText, isHigh: isHighTime } = getElapsedTime(order);
            return (
              <div className="w-full max-w-5xl h-full bg-zinc-900 rounded-[3rem] border-4 border-indigo-500 shadow-[0_0_100px_rgba(99,102,241,0.2)] flex flex-col overflow-hidden">
                <div className="p-8 bg-indigo-500 flex items-center justify-between text-white">
                  <div>
                    <h2 className="text-6xl font-black uppercase tracking-tighter">
                      {order.orderType === 'dine-in' ? `TABLE ${order.tableNumber}` : order.orderNo ? `#${order.orderNo}` : `#${order.id.slice(-4)}`}
                    </h2>
                    <p className="text-xl font-bold uppercase tracking-[0.3em] mt-2 opacity-80">{order.orderType}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-6xl font-black font-mono tracking-widest">{elapsedText}</div>
                    <button onClick={() => setMaximizedOrderId(null)} className="p-4 bg-white/20 hover:bg-white/30 rounded-full transition-all">
                      <Minimize2 size={48} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar">
                  {order.notes && (
                    <div className="p-8 bg-amber-500/10 border-4 border-dashed border-amber-500/20 rounded-[2rem]">
                      <h4 className="text-2xl font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                        <AlertCircle size={32} /> INSTRUCTIONS
                      </h4>
                      <p className="text-4xl font-bold text-amber-200 leading-tight">{order.notes}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 gap-6">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex gap-8 items-center p-6 bg-zinc-800/50 rounded-3xl border border-zinc-700">
                        <div className="w-32 h-32 bg-indigo-500 text-white rounded-[2rem] flex items-center justify-center text-7xl font-black shadow-2xl">
                          {item.quantity}
                        </div>
                        <div className="w-40 h-40 bg-zinc-800 rounded-[2rem] flex items-center justify-center overflow-hidden border border-zinc-700 shadow-xl">
                          {item.image ? (
                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <Utensils size={48} className="text-zinc-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-5xl font-black tracking-tight">{item.name}</h3>
                          {item.notes && <p className="text-3xl font-bold text-amber-500 mt-4 uppercase tracking-wider">{item.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-8 bg-zinc-800 border-t-2 border-zinc-700">
                  <button 
                    onClick={() => {
                      updateOrderStatus(order.id, order.status === 'preparing' ? 'done-serving' : 'preparing');
                      if (order.status === 'preparing') setMaximizedOrderId(null);
                    }}
                    className={`w-full py-8 text-4xl font-black uppercase tracking-[0.2em] rounded-[2rem] transition-all shadow-2xl ${
                      order.status === 'preparing' 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                    }`}
                  >
                    {order.status === 'preparing' ? 'Mark as DONE' : 'Start Prep'}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
