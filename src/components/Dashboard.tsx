import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, Users, ShoppingBag, DollarSign, 
  ArrowUpRight, ArrowDownRight, Clock, CheckCircle2,
  AlertCircle, Package, Calendar
} from 'lucide-react';
import { collection, onSnapshot, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/format';
import { Order, MenuItem, Customer, InventoryItem } from '../types';
import { motion } from 'motion/react';

const Dashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'today' | 'weekly' | 'monthly'>('today');
  const [stats, setStats] = useState({
    periodRevenue: 0,
    totalRevenue: 0,
    periodOrders: 0,
    totalOrders: 0,
    activeCustomers: 0,
    lowStockItems: 0,
    pendingOrders: 0
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

    // Fetch Orders for Stats and Charts
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

      // Process Sales Data for Chart (Last 7 days or 30 days based on timeRange)
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
          revenue: dayOrders.reduce((sum, o) => sum + (o.total || 0), 0) / 100, // In dollars for display
          orders: dayOrders.length
        };
      });
      setSalesData(chartData);

      // Top Items
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

    // Fetch Recent Orders
    const qRecent = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5));
    const unsubscribeRecent = onSnapshot(qRecent, (snapshot) => {
      setRecentOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    });

    // Fetch Customers
    const unsubscribeCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setStats(prev => ({ ...prev, activeCustomers: snapshot.docs.length }));
    });

    // Fetch Inventory for Low Stock
    const unsubscribeInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data() as InventoryItem);
      const lowStock = items.filter(item => item.stock <= (item.lowStockThreshold || 0)).length;
      setStats(prev => ({ ...prev, lowStockItems: lowStock }));
      setLoading(false);
    });

    return () => {
      unsubscribeOrders();
      unsubscribeRecent();
      unsubscribeCustomers();
      unsubscribeInventory();
    };
  }, [timeRange]);

  const COLORS = ['#F27D26', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Dashboard Overview</h1>
          <p className="text-zinc-500 text-sm font-medium">Real-time performance metrics and insights</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-zinc-200 shadow-sm">
          <button 
            onClick={() => setTimeRange('today')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${timeRange === 'today' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            Today
          </button>
          <button 
            onClick={() => setTimeRange('weekly')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${timeRange === 'weekly' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            Weekly
          </button>
          <button 
            onClick={() => setTimeRange('monthly')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${timeRange === 'monthly' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title={`${timeRange === 'today' ? "Today's" : timeRange === 'weekly' ? "This Week's" : "This Month's"} Revenue`}
          value={formatCurrency(stats.periodRevenue)} 
          icon={<DollarSign className="text-emerald-500" />}
          trend="+12.5%"
          trendUp={true}
          color="emerald"
        />
        <StatCard 
          title={`${timeRange === 'today' ? "Today's" : timeRange === 'weekly' ? "This Week's" : "This Month's"} Orders`}
          value={stats.periodOrders.toString()} 
          icon={<ShoppingBag className="text-blue-500" />}
          trend="+5.2%"
          trendUp={true}
          color="blue"
        />
        <StatCard 
          title="Active Customers" 
          value={stats.activeCustomers.toString()} 
          icon={<Users className="text-purple-500" />}
          trend="+2.1%"
          trendUp={true}
          color="purple"
        />
        <StatCard 
          title="Pending Orders" 
          value={stats.pendingOrders.toString()} 
          icon={<Clock className="text-amber-500" />}
          trend="-1.4%"
          trendUp={false}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
              <TrendingUp size={18} className="text-primary" />
              Revenue Trends
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase text-zinc-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
                Revenue
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F27D26" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#F27D26" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#F27D26" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRev)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Items Pie Chart */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <h3 className="font-black text-zinc-900 uppercase tracking-tight mb-6 flex items-center gap-2">
            <Package size={18} className="text-blue-500" />
            Top Selling Items
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topItems}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {topItems.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {topItems.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="font-bold text-zinc-600">{item.name}</span>
                </div>
                <span className="font-black text-zinc-900">{item.value} sold</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
              <Calendar size={18} className="text-emerald-500" />
              Recent Orders
            </h3>
            <button className="text-[10px] font-black uppercase text-primary hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-zinc-100">
                  <th className="pb-4 text-[10px] font-black uppercase text-zinc-400">Order ID</th>
                  <th className="pb-4 text-[10px] font-black uppercase text-zinc-400">Customer</th>
                  <th className="pb-4 text-[10px] font-black uppercase text-zinc-400">Status</th>
                  <th className="pb-4 text-[10px] font-black uppercase text-zinc-400">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="group hover:bg-zinc-50/50 transition-all">
                    <td className="py-4">
                      <span className="text-xs font-black text-zinc-900 uppercase">#{order.id.slice(-6)}</span>
                    </td>
                    <td className="py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-900">{order.customerName || 'Guest'}</span>
                        <span className="text-[10px] text-zinc-400">{order.orderType}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                        order.status === 'finalized' ? 'bg-emerald-100 text-emerald-600' :
                        order.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className="text-xs font-black text-zinc-900">{formatCurrency(order.total)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventory Alerts */}
        <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <h3 className="font-black text-zinc-900 uppercase tracking-tight mb-6 flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500" />
            Inventory Alerts
          </h3>
          <div className="space-y-4">
            {stats.lowStockItems > 0 ? (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                <div className="p-2 bg-red-500 text-white rounded-lg">
                  <Package size={16} />
                </div>
                <div>
                  <p className="text-sm font-black text-red-900">{stats.lowStockItems} Items Low in Stock</p>
                  <p className="text-xs text-red-600 mt-1 font-medium">Action required to avoid stockouts</p>
                  <button className="mt-3 text-[10px] font-black uppercase text-red-700 hover:underline">Manage Inventory</button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-3">
                <div className="p-2 bg-emerald-500 text-white rounded-lg">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <p className="text-sm font-black text-emerald-900">Inventory Healthy</p>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">All items are above threshold</p>
                </div>
              </div>
            )}
            
            <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl">
              <p className="text-[10px] font-black uppercase text-zinc-400 mb-2">Quick Stats</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-lg font-black text-zinc-900">{stats.totalOrders}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">Total Orders</p>
                </div>
                <div>
                  <p className="text-lg font-black text-zinc-900">{formatCurrency(stats.totalRevenue / stats.totalOrders || 0)}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">Avg. Ticket</p>
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
  trend: string;
  trendUp: boolean;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, trendUp, color }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-2xl bg-${color}-50`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-black uppercase ${trendUp ? 'text-emerald-500' : 'text-red-500'}`}>
          {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {trend}
        </div>
      </div>
      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{title}</p>
      <h2 className="text-2xl font-black text-zinc-900 tracking-tight">{value}</h2>
    </motion.div>
  );
};

export default Dashboard;
