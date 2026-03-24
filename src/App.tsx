import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { db, auth, OperationType, handleFirestoreError } from './firebase';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, getDocs, deleteDoc, doc, where } from 'firebase/firestore';
import { useAuth } from './contexts/AuthContext';
import { MenuItem, Category, CartItem, Order } from './types';
import Menu from './components/Menu';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';
import AdminLogin from './components/AdminLogin';
import POS from './components/POS';
import { INITIAL_CATEGORIES, INITIAL_MENU_ITEMS } from './data/initialMenu';
import { AnimatePresence, motion } from 'motion/react';
import { UtensilsCrossed, CheckCircle2, Settings, ShieldCheck, Monitor, ShoppingBag, BarChart3, Plus, AlertCircle, RotateCcw } from 'lucide-react';
import { formatCurrency } from './utils/format';

const DEFAULT_TENANT_ID = 'rivas';

function UserApp({ items, categories, tenantId }: { items: MenuItem[], categories: Category[], tenantId: string }) {
  const { user, profile } = useAuth();
  const isSuperAdmin = user?.email === 'ashkan.yaghtin@gmail.com';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isOrderComplete, setIsOrderComplete] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const navigate = useNavigate();

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const onPaymentSuccess = () => {
    setIsCheckoutOpen(false);
    setCart([]);
    setIsOrderComplete(true);
    setTimeout(() => setIsOrderComplete(false), 5000);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-background font-sans text-zinc-900">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4 font-bold text-xl text-primary">
            <span className="hidden sm:inline">Rivas Restaurant</span>
          </div>
          <Auth />
        </div>
      </nav>

      <main>
        <Menu 
          items={items} 
          categories={categories} 
          onAddToCart={addToCart} 
          cartCount={cartCount}
          onOpenCart={() => setIsCartOpen(true)}
        />
      </main>

      <AnimatePresence>
        {isCartOpen && (
          <Cart 
            items={cart} 
            onUpdateQuantity={updateQuantity} 
            onRemove={removeFromCart}
            onClose={() => setIsCartOpen(false)}
            onCheckout={handleCheckout}
          />
        )}

        {isCheckoutOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCheckoutOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md"
            >
              <Checkout 
                amount={cartTotal} 
                cartItems={cart}
                onSuccess={onPaymentSuccess} 
                onClose={() => setIsCheckoutOpen(false)}
              />
            </motion.div>
          </div>
        )}

        {isOrderComplete && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3"
          >
            <CheckCircle2 />
            <span className="font-semibold">Order placed successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Development Tools - Hidden in production */}
      {isAdmin && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
          {items.length === 0 && (
            <button 
              onClick={async () => {
                try {
                  for (const catData of INITIAL_CATEGORIES) {
                    const catRef = await addDoc(collection(db, 'categories'), catData);
                    const itemsForCat = INITIAL_MENU_ITEMS[catData.name] || [];
                    for (const itemData of itemsForCat) {
                      const imageUrl = itemData.image 
                        ? `https://lh3.googleusercontent.com/d/${itemData.image}`
                        : '';
                        
                      await addDoc(collection(db, 'menu'), {
                        name: itemData.name,
                        price: itemData.price,
                        description: itemData.arabicName,
                        category: catRef.id,
                        available: true,
                        image: imageUrl
                      });
                      
                      await addDoc(collection(db, 'inventory'), {
                        name: itemData.name,
                        stock: 100,
                        unit: 'pcs',
                        lowStockThreshold: 10,
                        lastUpdated: serverTimestamp()
                      });
                    }
                  }
                } catch (err) {
                  console.error("Seeding failed:", err);
                }
              }}
              className="bg-black text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl hover:scale-105 transition-transform"
            >
              Seed Data ({tenantId})
            </button>
          )}
          
          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              {showClearConfirm ? (
                <div className="flex gap-2">
                  <button 
                    onClick={async () => {
                      setIsClearing(true);
                      try {
                        const menuSnap = await getDocs(collection(db, 'menu'));
                        for (const d of menuSnap.docs) await deleteDoc(doc(db, 'menu', d.id));
                        const catSnap = await getDocs(collection(db, 'categories'));
                        for (const d of catSnap.docs) await deleteDoc(doc(db, 'categories', d.id));
                        const invSnap = await getDocs(collection(db, 'inventory'));
                        for (const d of invSnap.docs) await deleteDoc(doc(db, 'inventory', d.id));
                        setShowClearConfirm(false);
                      } catch (err) {
                        console.error("Clearing failed:", err);
                      } finally {
                        setIsClearing(false);
                      }
                    }}
                    disabled={isClearing}
                    className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl hover:bg-red-700 disabled:opacity-50"
                  >
                    {isClearing ? "Clearing..." : "Confirm Clear"}
                  </button>
                  <button onClick={() => setShowClearConfirm(false)} className="bg-zinc-200 text-zinc-800 px-4 py-2 rounded-full text-sm font-bold shadow-xl">Cancel</button>
                </div>
              ) : (
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl opacity-50 hover:opacity-100"
                >
                  Clear Data ({tenantId})
                </button>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Admin Link - More visible for easier access */}
      <footer className="py-12 border-t border-zinc-100 text-center bg-zinc-50/50">
        <div className="max-w-5xl mx-auto px-4">
          <button 
            onClick={() => navigate('/admin')}
            className="inline-flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-6 py-3 rounded-2xl hover:bg-primary hover:text-white hover:border-primary transition-all text-sm font-bold shadow-sm hover:shadow-lg hover:-translate-y-1"
          >
            <ShieldCheck size={18} />
            Administrative Access
          </button>
          <p className="mt-4 text-zinc-400 text-xs font-medium">© 2026 Rivas Restaurant Management System</p>
        </div>
      </footer>

      {/* Floating Admin Button for Owner/Admin */}
      {isAdmin && (
        <div className="fixed bottom-20 right-4 z-[60] flex flex-col gap-3 items-end">
          <button 
            onClick={() => navigate('/admin/pos')}
            className="w-14 h-14 bg-zinc-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
            title="Launch POS"
          >
            <Monitor size={24} />
          </button>
          <button 
            onClick={() => navigate('/admin')}
            className="w-14 h-14 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
            title="Go to Admin Panel"
          >
            <Settings className="group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return sessionStorage.getItem('adminAuthenticated') === 'true';
  });
  const [currentTenantId, setCurrentTenantId] = useState(DEFAULT_TENANT_ID);

  const isSuperAdmin = user?.email === 'ashkan.yaghtin@gmail.com';

  useEffect(() => {
    if (isSuperAdmin) {
      setIsAdminAuthenticated(true);
      sessionStorage.setItem('adminAuthenticated', 'true');
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    // If user has a tenantId in their profile, use it (unless super admin overrides)
    if (profile?.tenantId && !isSuperAdmin) {
      setCurrentTenantId(profile.tenantId);
    }
  }, [profile, isSuperAdmin]);

  useEffect(() => {
    const unsubscribeMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'menu'));

    const unsubscribeCats = onSnapshot(query(collection(db, 'categories'), orderBy('order')), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'categories'));

    return () => {
      unsubscribeMenu();
      unsubscribeCats();
    };
  }, []);

  const [globalStats, setGlobalStats] = useState({ revenue: 0, orders: 0, users: 0 });

  useEffect(() => {
    if (!isSuperAdmin) return;
    
    // Global Revenue & Orders
    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const orders = snapshot.docs.map(d => d.data() as Order);
      const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
      setGlobalStats(prev => ({ ...prev, revenue, orders: orders.length }));
    });

    // Global Users
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setGlobalStats(prev => ({ ...prev, users: snapshot.docs.length }));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeUsers();
    };
  }, [isSuperAdmin]);

  return (
    <>
      {isSuperAdmin && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-zinc-900 text-white px-4 py-3 flex items-center justify-between shadow-2xl border-b border-primary/20">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-primary" size={20} />
              <span className="text-sm font-black uppercase tracking-[0.2em] text-primary">Super Admin Console</span>
            </div>
            <div className="h-4 w-px bg-zinc-700" />
            <div className="flex items-center gap-6 text-[10px] uppercase font-bold text-zinc-400">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                System Online
              </div>
              <div className="flex items-center gap-1.5">
                <Monitor size={12} />
                {items.length} Menu Items
              </div>
              <div className="flex items-center gap-1.5">
                <ShoppingBag size={12} />
                {globalStats.orders} Global Orders
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <BarChart3 size={12} />
                {formatCurrency(globalStats.revenue)} Revenue
              </div>
              <div className="flex items-center gap-1.5">
                <Plus size={12} />
                {globalStats.users} Users
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-medium text-zinc-500">Authenticated as: <span className="text-zinc-200">{user?.email}</span></span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => navigate('/')}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1 rounded-lg transition-all border border-zinc-700"
              >
                Storefront
              </button>
              <button 
                onClick={() => navigate('/admin')}
                className="bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1 rounded-lg transition-all border border-primary/30"
              >
                Admin Panel
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={isSuperAdmin ? 'pt-8' : ''}>
        {loading ? (
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<UserApp items={items} categories={categories} tenantId={currentTenantId} />} />
            
            <Route path="/admin/login" element={
              isAdminAuthenticated ? <Navigate to="/admin" replace /> : 
              <AdminLogin 
                onLogin={(success) => {
                  if (success) {
                    setIsAdminAuthenticated(true);
                    sessionStorage.setItem('adminAuthenticated', 'true');
                  }
                }}
                onClose={() => window.location.href = '/'}
              />
            } />

            <Route path="/admin" element={
              (!isAdminAuthenticated && !isSuperAdmin) ? <Navigate to="/admin/login" replace /> :
              <AdminPanel 
                items={items} 
                categories={categories} 
                onClose={() => navigate('/')} 
                onLogout={() => {
                  setIsAdminAuthenticated(false);
                  sessionStorage.removeItem('adminAuthenticated');
                  auth.signOut();
                }}
                onOpenPOS={() => navigate('/admin/pos')}
              />
            } />

            <Route path="/admin/pos" element={
              (!isAdminAuthenticated && !isSuperAdmin) ? <Navigate to="/admin/login" replace /> :
              <POS onClose={() => navigate('/admin')} />
            } />
          </Routes>
        )}
      </div>
    </>
  );
}
