import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, Users, ShoppingBag, DollarSign, 
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle2,
  AlertCircle, Package, Calendar, Tag, Sparkles
} from 'lucide-react';
import { collection, onSnapshot, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/format';
import { Order, MenuItem, Customer, InventoryItem } from '../types';
import { motion } from 'motion/react';

const Dashboard: React.FC<{ onNavigate?: (tab: string) => void, systemSettings?: any }> = ({ onNavigate, systemSettings }) => {
  const currencySymbol = systemSettings?.currency || 'AED';
  
  const formatCurrencyLocal = (amount: number) => {
    return `${currencySymbol} ${(amount / 100).toFixed(2)}`;
  };
  const [timeRange, setTimeRange] = useState<'today' | 'weekly' | 'monthly'>('today');
  const [stats, setStats] = useState({
    periodRevenue: 0,
    totalRevenue: 0,
    periodOrders: 0,
    totalOrders: 0,
    activeCustomers: 0,
    lowStockItems: 0,
    pendingOrders: 0,
    todayReservations: 0,
    activePromotions: 0
  });

  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const periodStart = new Date();
    
    if (timeRange === 'today') {
      periodStart.setHours(0, 0, 0, 0);
    } else if (timeRange === 'weekly') {
      periodStart.setDate(now.getDate() - 7);
      periodStart.setHours(0, 0, 0, 0);
    } else if (timeRange === 'monthly') {
      periodStart.setDate(now.getDate() - 30);
      periodStart.setHours(0, 0, 0, 0);
    }

    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      const finalizedOrders = allOrders.filter(o => ['paid', 'finalized', 'confirmed', 'delivered', 'completed'].includes(o.status));
      
      const periodFinalized = finalizedOrders.filter(o => {
        const orderDate = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
        return orderDate >= periodStart;
      });

      const totalRev = finalizedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const periodRev = periodFinalized.reduce((sum, o) => sum + (o.total || 0), 0);
      
      setStats(prev => ({
        ...prev,
        totalRevenue: totalRev,
        periodRevenue: periodRev,
        totalOrders: finalizedOrders.length,
        periodOrders: periodFinalized.length,
        pendingOrders: allOrders.filter(o => o.status === 'pending' || o.status === 'preparing').length
      }));

      const daysToShow = timeRange === 'monthly' ? 30 : 7;
      const lastDays = Array.from({ length: daysToShow }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        return d;
      }).reverse();

      const chartData = lastDays.map(date => {
        const dayOrders = finalizedOrders.filter(o => {
          const orderDate = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
          return orderDate.toDateString() === date.toDateString();
        });
        return {
          name: daysToShow === 30 ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : date.toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: dayOrders.reduce((sum, o) => sum + (o.total || 0), 0) / 100,
          orders: dayOrders.length
        };
      });
      setSalesData(chartData);

      const itemCounts: Record<string, { name: string, count: number, revenue: number }> = {};
      periodFinalized.forEach(order => {
        order.items.forEach(item => {
          if (!itemCounts[item.name]) {
            itemCounts[item.name] = { name: item.name, count: 0, revenue: 0 };
          }
          itemCounts[item.name].count += item.quantity;
          itemCounts[item.name].revenue += (item.price * item.quantity);
        });
      });

      const topItemsData = Object.values(itemCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(item => ({
          name: item.name,
          value: item.count,
          revenue: item.revenue
        }));
      setTopItems(topItemsData);
    });

    const qRecent = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribeRecent = onSnapshot(qRecent, (snapshot) => {
      setRecentOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    });

    const unsubscribeCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setStats(prev => ({ ...prev, activeCustomers: snapshot.docs.length }));
    });

    const unsubscribeInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data() as InventoryItem);
      const lowStock = items.filter(item => item.stock <= (item.lowStockThreshold || 0)).length;
      setStats(prev => ({ ...prev, lowStockItems: lowStock }));
      setLoading(false);
    });

    const unsubscribeReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      const today = new Date().toISOString().split('T')[0];
      const count = snapshot.docs.filter(doc => doc.data().date === today && doc.data().status !== 'cancelled').length;
      setStats(prev => ({ ...prev, todayReservations: count }));
    });

    const unsubscribePromos = onSnapshot(collection(db, 'promotions'), (snapshot) => {
      const now = new Date().toISOString().split('T')[0];
      const count = snapshot.docs.filter(doc => {
        const d = doc.data();
        return d.status === 'active' && d.validFrom <= now && d.validUntil >= now;
      }).length;
      setStats(prev => ({ ...prev, activePromotions: count }));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeRecent();
      unsubscribeCustomers();
      unsubscribeInventory();
      unsubscribeReservations();
      unsubscribePromos();
    };
  }, [timeRange]);

  const COLORS = ['#F27D26', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-xl shadow-indigo-500/20" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-500/10 rounded-[1.25rem] flex items-center justify-center text-indigo-500 shadow-inner">
            <Sparkles size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-foreground uppercase tracking-tight leading-none">Rivas Executive</h1>
            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.4em] mt-2">Operational Intelligence Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-muted/20 p-2 rounded-2xl border border-border shadow-inner">
          {(['today', 'weekly', 'monthly'] as const).map(range => (
            <button 
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${
                timeRange === range 
                  ? 'bg-foreground text-card shadow-lg scale-105' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title={`${timeRange === 'today' ? "Today's" : timeRange === 'weekly' ? "Weekly" : "Monthly"} Inflow`}
          value={formatCurrencyLocal(stats.periodRevenue)} 
          icon={<DollarSign size={20} />}
          trend="+14.2%"
          trendUp={true}
          theme="indigo"
        />
        <StatCard 
          title="Conversion Volume"
          value={stats.periodOrders.toString()} 
          icon={<ShoppingBag size={20} />}
          trend="+8.5%"
          trendUp={true}
          theme="emerald"
        />
        <StatCard 
          title="Constituent Base" 
          value={stats.activeCustomers.toString()} 
          icon={<Users size={20} />}
          trend="+3.1%"
          trendUp={true}
          theme="violet"
        />
        <StatCard 
          title="Pending Engagement" 
          value={stats.pendingOrders.toString()} 
          icon={<Clock size={20} />}
          trend="-2.4%"
          trendUp={false}
          theme="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Intelligence Chart */}
        <div className="lg:col-span-2 bg-card p-8 rounded-[3rem] border border-border shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[100px] -mr-32 -mt-32" />
          <div className="flex items-center justify-between mb-10 relative z-10">
            <div>
              <h3 className="font-black text-foreground uppercase tracking-tight flex items-center gap-3">
                <TrendingUp size={22} className="text-indigo-500" />
                Revenue Trajectory
              </h3>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1 opacity-60">Financial performance over selected period</p>
            </div>
            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                Net Value
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }}
                  dy={15}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }}
                  tickFormatter={(value) => `${currencySymbol}${value}`}
                />
                <Tooltip 
                  cursor={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '5 5' }}
                  contentStyle={{ 
                    backgroundColor: '#18181b',
                    borderRadius: '20px', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
                    padding: '16px'
                  }} 
                  itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                  labelStyle={{ color: '#6366f1', fontSize: '9px', fontWeight: '900', marginBottom: '8px', textTransform: 'uppercase' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#6366f1" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorRev)" 
                  animationDuration={2000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Distribution */}
        <div className="bg-card p-8 rounded-[3rem] border border-border shadow-xl flex flex-col group">
          <h3 className="font-black text-foreground uppercase tracking-tight mb-8 flex items-center gap-3">
            <Package size={22} className="text-emerald-500" />
            Asset Yield
          </h3>
          <div className="flex-1 flex flex-col justify-center">
            <div className="h-[250px] w-full relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center z-0 pointer-events-none">
                <span className="text-xs font-black text-muted-foreground uppercase opacity-40">Total</span>
                <span className="text-2xl font-black text-foreground">{topItems.reduce((s, i) => s + i.value, 0)}</span>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={topItems}
                    cx="50%"
                    cy="50%"
                    innerRadius={75}
                    outerRadius={95}
                    paddingAngle={8}
                    dataKey="value"
                    animationDuration={1500}
                  >
                    {topItems.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 20px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 'bold' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-8 space-y-3">
              {topItems.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/20 border border-border/50 rounded-2xl group/item hover:border-border hover:bg-muted/40 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[10px] font-black text-foreground uppercase tracking-wider">{item.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-muted-foreground group-hover/item:text-foreground transition-colors">{item.value} REDEMPTIONS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Logistics Ledger */}
        <div className="lg:col-span-2 bg-card p-8 rounded-[3rem] border border-border shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="font-black text-foreground uppercase tracking-tight flex items-center gap-3">
                <Calendar size={22} className="text-violet-500" />
                Live Disbursement Log
              </h3>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1 opacity-60">Chronological history of recent transactions</p>
            </div>
            <button 
              onClick={() => onNavigate?.('orders')} 
              className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-600 bg-indigo-500/10 px-6 py-2.5 rounded-xl transition-all"
            >
              Examine full ledger
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="pb-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Transaction ID</th>
                  <th className="pb-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Participant</th>
                  <th className="pb-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em]">Protocol</th>
                  <th className="pb-5 text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] text-right">Net Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="group hover:bg-muted/10 transition-all">
                    <td className="py-6">
                      <span className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-[10px] font-black tracking-widest uppercase">#{order.id.slice(-6)}</span>
                    </td>
                    <td className="py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-foreground uppercase tracking-tight">{order.customerName || 'Standard Entity'}</span>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter opacity-50">{order.orderType}</span>
                      </div>
                    </td>
                    <td className="py-6">
                      <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider ${
                        ['paid', 'finalized', 'confirmed'].includes(order.status) ? 'bg-emerald-500/10 text-emerald-500' :
                        order.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-indigo-500/10 text-indigo-500'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-6 text-right">
                      <span className="text-sm font-black text-foreground tabular-nums tracking-tighter">{formatCurrencyLocal(order.total)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health */}
        <div className="space-y-8">
          <div className="bg-card p-8 rounded-[3rem] border border-border shadow-xl group overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-[50px] -mr-16 -mt-16" />
            <h3 className="font-black text-foreground uppercase tracking-tight mb-8 flex items-center gap-3 relative z-10">
              <AlertCircle size={22} className="text-rose-500" />
              Critical Alerts
            </h3>
            <div className="space-y-4 relative z-10">
              {stats.lowStockItems > 0 ? (
                <div className="p-6 bg-rose-500/5 border border-rose-500/20 rounded-[2rem] space-y-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-foreground uppercase tracking-tight">{stats.lowStockItems} Depleted Assets</p>
                      <p className="text-[10px] font-black text-rose-500/70 uppercase tracking-widest leading-none mt-1">Operational constraint imminent</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => onNavigate?.('inventory')} 
                    className="w-full py-4 bg-rose-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] hover:scale-[1.02] shadow-xl shadow-rose-500/10 transition-all"
                  >
                    Authorize Resupply
                  </button>
                </div>
              ) : (
                <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground uppercase tracking-tight">Supply Integrity Secure</p>
                    <p className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest mt-1">All thresholds within nominal bounds</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-950 p-8 rounded-[3rem] shadow-2xl space-y-6 text-white overflow-hidden relative">
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 blur-[100px] -ml-32 -mb-32" />
            <h4 className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.3em] relative z-10">Historical Context</h4>
            <div className="space-y-6 relative z-10">
              <div className="flex items-end justify-between border-b border-white/5 pb-6">
                <div>
                  <p className="text-3xl font-black tabular-nums tracking-tighter">{stats.totalOrders}</p>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Total Conversions</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black tabular-nums tracking-tighter text-indigo-400">{formatCurrencyLocal(stats.totalRevenue / stats.totalOrders || 0)}</p>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Unit Yield</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                  <p className="text-xl font-black text-indigo-400">{stats.todayReservations}</p>
                  <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mt-1">Bookings Hub</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                  <p className="text-xl font-black text-indigo-400">{stats.activePromotions}</p>
                  <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mt-1">Live Campaigns</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  theme: 'indigo' | 'emerald' | 'violet' | 'amber';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, trendUp, theme }) => {
  const themes = {
    indigo:  { bg: 'bg-indigo-500/10',  text: 'text-indigo-500',  glow: 'shadow-indigo-500/10' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', glow: 'shadow-emerald-500/10' },
    violet:  { bg: 'bg-violet-500/10',  text: 'text-violet-500',  glow: 'shadow-violet-500/10' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-500',   glow: 'shadow-amber-500/10' },
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      className="bg-card p-8 rounded-[2.5rem] border border-border shadow-lg hover:shadow-2xl transition-all relative overflow-hidden group"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 ${themes[theme].bg} blur-[60px] -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
      
      <div className="flex items-center justify-between mb-8 relative z-10">
        <div className={`p-4 rounded-2xl ${themes[theme].bg} ${themes[theme].text} shadow-inner`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-2">{title}</p>
        <h2 className="text-3xl font-black text-foreground tracking-tighter tabular-nums leading-none">{value}</h2>
      </div>
    </motion.div>
  );
};

export default Dashboard;
