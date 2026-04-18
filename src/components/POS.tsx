import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, serverTimestamp, getDocs, where, getDoc, limit, deleteField, runTransaction, increment, setDoc } from 'firebase/firestore';
import { ShoppingBag, Clock, CheckCircle2, Ban, Phone, MapPin, User, Package, ArrowLeft, ChefHat, Truck, FileText, Printer, Plus, Utensils, LayoutGrid, CreditCard, Banknote, Receipt, Users, Split, Calculator, X, Bell, Maximize2, MoreVertical, ChevronDown, Calendar, Hash, Tag, Pencil, Move, Layout, Search, AlertTriangle, ShieldCheck } from 'lucide-react';
import DigitalClock from './DigitalClock';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/format';
import { Order, MenuItem, Table, Category, Customer, CustomerGroup } from '../types';

interface POSProps {
  onClose: () => void;
  isDeveloper?: boolean;
}

export default function POS({ onClose, isDeveloper }: POSProps) {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [filter, setFilter] = useState<Order['status'] | 'all'>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<Order['orderType'] | 'all'>('all');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [posStep, setPosStep] = useState<'tables' | 'menu'>('tables');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isMergingTables, setIsMergingTables] = useState(false);
  const [selectedTablesToMerge, setSelectedTablesToMerge] = useState<Table[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentOrderItems, setCurrentOrderItems] = useState<{ item: MenuItem, quantity: number }[]>([]);

  const [isSettlingBill, setIsSettlingBill] = useState(false);
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'multi' | 'open bill' | 'online' | 'talabat' | 'deliveroo' | 'careem' | 'noon' | 'zomato' | ''>('');
  const [multiPayment, setMultiPayment] = useState({ cash: '', card: '' });
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [isSplitBill, setIsSplitBill] = useState(false);
  const [isSplitByItem, setIsSplitByItem] = useState(false);
  const [isSplitByAmount, setIsSplitByAmount] = useState(false);
  const [splitAmount, setSplitAmount] = useState('');
  const [selectedSplitItems, setSelectedSplitItems] = useState<{ itemId: string, quantity: number, price: number, name: string }[]>([]);
  const [numberOfSplits, setNumberOfSplits] = useState(2);
  const [activeOrderMenu, setActiveOrderMenu] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getElapsed = (o: Order) => {
    if (!o.createdAt) return { w: '0%', c: 'hsl(120, 85%, 45%)', t: '00:00:00' };
    const start = o.createdAt.toDate ? o.createdAt.toDate().getTime() : (o.createdAt.seconds || 0) * 1000;
    const end = (o.status === 'finalized' || o.status === 'cancelled')
      ? (o.completedAt ? (o.completedAt.toDate ? o.completedAt.toDate().getTime() : (o.completedAt.seconds || 0) * 1000) : currentTime)
      : currentTime;

    const diff = Math.max(0, end - start);
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const formatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const totalMinutes = diff / 60000;

    let uiColor = 'text-emerald-500';
    if (o.status === 'finalized') uiColor = 'text-muted-foreground';
    else if (o.status === 'cancelled') uiColor = 'text-red-900';
    else if (totalMinutes >= 30) uiColor = 'text-red-500';
    else if (totalMinutes >= 15) uiColor = 'text-amber-500';

    const percentage = Math.min(100, (totalMinutes / 45) * 100);

    return { w: `${Math.min(100, Math.max(0, percentage))}%`, cClass: uiColor, t: formatted };
  };

  // Notification sound for new orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2835/2835-preview.mp3');
          audio.playbackRate = 1.0;
          audio.play().catch(e => console.log('Audio play failed:', e));
        }
      });
    });
    return () => unsubscribe();
  }, []);

  // Modal states
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isChangeTableModalOpen, setIsChangeTableModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isMaximizeModalOpen, setIsMaximizeModalOpen] = useState(false);
  const [isUpdateOrderModalOpen, setIsUpdateOrderModalOpen] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [sessionTotals, setSessionTotals] = useState({ total: 0, cash: 0, card: 0, online: 0, openBill: 0, count: 0 });
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [searchOrderId, setSearchOrderId] = useState('');
  const [searchKotNo, setSearchKotNo] = useState('');
  const [searchCustomerName, setSearchCustomerName] = useState('');
  const [searchCustomerPhone, setSearchCustomerPhone] = useState('');
  const [searchTableNumber, setSearchTableNumber] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [isClearanceModalOpen, setIsClearanceModalOpen] = useState(false);
  const [clearanceCallback, setClearanceCallback] = useState<(() => void) | null>(null);
  const [newOrderPaymentMethod, setNewOrderPaymentMethod] = useState<Order['paymentMethod'] | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Input states
  const [occupancyInput, setOccupancyInput] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [discountTypeInput, setDiscountTypeInput] = useState<'amount' | 'percentage'>('amount');
  const [clearanceCodeInput, setClearanceCodeInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [newTableId, setNewTableId] = useState('');
  const [orderTypeInput, setOrderTypeInput] = useState<Order['orderType']>('dine-in');
  const [driverIdInput, setDriverIdInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));

    // Filter by store if not admin
    if (profile?.role !== 'admin' && profile?.storeId) {
      q = query(collection(db, 'orders'), where('storeId', '==', profile.storeId), orderBy('createdAt', 'desc'), limit(100));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Show active orders and recently finalized/cancelled ones
      setOrders(allOrders);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));

    const unsubscribeMenu = onSnapshot(collection(db, 'menu'), (snapshot) => {
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'menu'));

    const unsubscribeCats = onSnapshot(query(collection(db, 'categories'), orderBy('order')), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'categories'));

    const unsubscribeTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
      setTables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tables'));

    const unsubscribeGroups = onSnapshot(collection(db, 'customerGroups'), (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerGroup)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customerGroups'));

    const unsubscribeDrivers = onSnapshot(query(collection(db, 'staff'), where('role', '==', 'driver')), (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'staff'));

    const unsubscribeInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'));

    const unsubscribeReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      setReservations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'reservations'));

    return () => {
      unsubscribe();
      unsubscribeMenu();
      unsubscribeCats();
      unsubscribeTables();
      unsubscribeReservations();
      unsubscribeGroups();
      unsubscribeDrivers();
      unsubscribeInventory();
    };
  }, [user]);

  // Server-side customer search
  useEffect(() => {
    if (!user) return;

    if (!customerSearch.trim()) {
      const q = query(collection(db, 'customers'), orderBy('name'), limit(20));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));
      return () => unsubscribe();
    }

    const timer = setTimeout(async () => {
      try {
        const nameQ = query(
          collection(db, 'customers'),
          where('name', '>=', customerSearch),
          where('name', '<=', customerSearch + '\uf8ff'),
          limit(20)
        );
        const phoneQ = query(
          collection(db, 'customers'),
          where('phone', '>=', customerSearch),
          where('phone', '<=', customerSearch + '\uf8ff'),
          limit(20)
        );

        const [nameSnap, phoneSnap] = await Promise.all([
          getDocs(nameQ),
          getDocs(phoneQ)
        ]);

        const results = new Map<string, Customer>();
        nameSnap.docs.forEach(doc => results.set(doc.id, { id: doc.id, ...doc.data() } as Customer));
        phoneSnap.docs.forEach(doc => results.set(doc.id, { id: doc.id, ...doc.data() } as Customer));

        setCustomers(Array.from(results.values()));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'customers');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [user, customerSearch]);

  const [printServerUrls, setPrintServerUrls] = useState<string[]>([]);
  const [systemSettings, setSystemSettings] = useState<any>(null);
  const [lastOrderTimestamp, setLastOrderTimestamp] = useState<number>(Date.now());

  useEffect(() => {
    if (!user) return;

    // Notification sound for new orders
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(1));
    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const newOrder = snapshot.docs[0].data();
        if (newOrder.createdAt && newOrder.createdAt.toMillis() > lastOrderTimestamp) {
          // Play notification sound
          const audio = new Audio('https://audio-previews.elements.envatousercontent.com/files/259410951/preview.mp3');
          audio.playbackRate = 0.75;
          audio.play().catch(e => console.error("Sound play failed:", e));
          setLastOrderTimestamp(newOrder.createdAt.toMillis());
        }
      }
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'system'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setSystemSettings(data);
        if (data.printServerUrls) {
          setPrintServerUrls(data.printServerUrls.split(',').map((url: string) => url.trim()).filter(Boolean));
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/system'));

    return () => {
      unsubscribeOrders();
      unsubscribeSettings();
    };
  }, [user, lastOrderTimestamp]);

  // Dynamic currency and tax helpers
  const currencySymbol = systemSettings?.currency || 'AED';
  const taxRatePercent = systemSettings?.taxRate || 0;
  const taxFactor = taxRatePercent / 100;

  const formatCurrency = (amountInCents: number) => {
    return `${currencySymbol} ${(amountInCents / 100).toFixed(2)}`;
  };

  const printKOT = async (order: Order, isReprint: boolean = false) => {
    // If print servers are configured, send to all servers
    if (printServerUrls.length > 0) {
      try {
        await Promise.all(printServerUrls.map(url =>
          fetch(`${url}/print-kot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...order, isReprint })
          })
        ));
        return;
      } catch (err) {
        console.error("Print server failed:", err);
        // Fallback to browser print
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups for printing KOT.");
      return;
    }

    const itemsHtml = order.items.map(item => `
      <div style="margin-bottom: 8px; font-family: monospace;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 16px;">
          <span>${item.quantity}x ${item.name}</span>
        </div>
        ${item.notes ? `<div style="font-size: 12px; margin-left: 20px; color: #555;">- ${item.notes}` : ''}
      </div>
    `).join('');

    const subtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const discountAmount = order.discountType === 'percentage' ? Math.round(subtotal * (order.discount / 100)) : Math.round((order.discount || 0) * 100);
    const total = order.total;

    const html = `
      <html>
        <head>
          <title>KOT - #${order.id.slice(-6).toUpperCase()}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .footer { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; text-align: center; font-size: 12px; }
            .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .totals { border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; }
            .reprint { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 10px; border: 3px solid #ff0000; color: #ff0000; padding: 10px; }
            .notes { border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px; font-style: italic; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${isReprint ? '<div class="reprint">*** REPRINT ***</div>' : ''}
          <div class="header">
            <h2 style="margin: 0;">KITCHEN ORDER</h2>
            <h3 style="margin: 5px 0;">KOT #${order.kotNo || 'N/A'}</h3>
            <p style="margin: 5px 0;">Order: #${order.id.slice(-6).toUpperCase()}</p>
            <p style="margin: 5px 0;">Type: ${order.orderType.toUpperCase()}</p>
            ${order.tableNumber ? `<p style="margin: 5px 0; font-size: 20px; font-weight: bold;">TABLE: ${order.tableNumber}</p>` : ''}
            <p style="margin: 5px 0;">Date: ${new Date().toLocaleString()}</p>
          </div>
          <div class="items">
            ${itemsHtml}
          </div>
          ${order.notes ? `
          <div class="notes">
            <strong>Notes:</strong><br/>
            ${order.notes}
          </div>
          ` : ''}
          <div class="footer">
            <p>*** END OF KOT ***</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const printBill = async (order: Order) => {
    if (printServerUrls.length > 0) {
      try {
        await Promise.all(printServerUrls.map(url =>
          fetch(`${url}/print-bill`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order)
          })
        ));
        return;
      } catch (err) {
        console.error("Print server failed:", err);
        // Fallback to browser print
      }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-family: monospace;">
        <span>${item.quantity}x ${item.name}</span>
        <span>${formatCurrency(item.price * item.quantity)}</span>
      </div>
    `).join('');

    const subtotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const discountAmount = order.discountType === 'percentage' ? (subtotal * ((order.discount || 0) / 100)) : ((order.discount || 0) * 100);
    const taxAmount = (subtotal - discountAmount) * taxFactor;
    const html = `
      <html>
        <head>
          <title>Bill - #${order.id.slice(-6).toUpperCase()}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 80mm; padding: 10px; }
            .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .footer { border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; text-align: center; font-size: 12px; }
            .item-row { display: flex; justify-content: space-between; margin: 5px 0; }
            .totals { border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 5px; }
            .info-row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h2 style="margin: 0; text-transform: uppercase;">${systemSettings?.restaurantName || 'RIVAS RESTAURANT'}</h2>
            ${systemSettings?.businessReg ? `<p style="margin: 5px 0; font-size: 12px;">TRN: ${systemSettings.businessReg}</p>` : ''}
            ${systemSettings?.phone ? `<p style="margin: 5px 0; font-size: 12px;">Tel: ${systemSettings.phone}</p>` : ''}
            <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>
            <div class="info-row"><span>Order:</span><span>#${order.id.slice(-6).toUpperCase()}</span></div>
            <div class="info-row"><span>Type:</span><span>${order.orderType.toUpperCase()}</span></div>
            ${order.tableNumber ? `<div class="info-row"><span>Table:</span><span>${order.tableNumber}</span></div>` : ''}
            ${order.waiter ? `<div class="info-row"><span>Waiter:</span><span>${order.waiter}</span></div>` : ''}
            ${order.occupancy ? `<div class="info-row"><span>Guests:</span><span>${order.occupancy}</span></div>` : ''}
            <div class="info-row"><span>Date:</span><span>${new Date().toLocaleString()}</span></div>
          </div>
          <div class="items">
            ${itemsHtml}
          </div>
          <div class="totals">
            <div class="item-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            ${order.discount ? `<div class="item-row"><span>Discount ${order.discountType === 'percentage' ? `(${order.discount}%)` : ''}:</span><span>-${formatCurrency(discountAmount)}</span></div>` : ''}
            <div class="item-row">
              <span>VAT (${taxRatePercent}%):</span>
              <span>${formatCurrency(taxAmount)}</span>
            </div>
            <div class="total-row">
              <span>TOTAL:</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
            ${(order.status === 'finalized' || order.status === 'paid') && order.paymentMethod ? `
            <div style="border-top: 1px dashed #000; margin-top: 10px; padding-top: 10px;">
              <div class="info-row"><span>Payment Method:</span><span style="text-transform: uppercase;">${order.paymentMethod === 'multi' ? 'Multi-Payment' : order.paymentMethod}</span></div>
              ${order.payments && order.payments.length > 0 ? order.payments.map((p: any) => `
                <div class="info-row" style="padding-left: 10px; font-size: 11px;">
                  <span>- ${p.method.toUpperCase()}:</span>
                  <span>${formatCurrency(p.amount)}</span>
                </div>
                ${(p.method === 'multi' || (p.cashAmount && p.cardAmount)) ? `
                  <div style="padding-left: 20px; font-size: 10px; opacity: 0.8;">
                    ${(p.cashAmount && p.cashAmount > 0) ? `<div class="info-row"><span>Cash:</span><span>${formatCurrency(p.cashAmount)}</span></div>` : ''}
                    ${(p.cardAmount && p.cardAmount > 0) ? `<div class="info-row"><span>Card:</span><span>${formatCurrency(p.cardAmount)}</span></div>` : ''}
                    ${(p.onlineAmount && p.onlineAmount > 0) ? `<div class="info-row"><span>Online:</span><span>${formatCurrency(p.onlineAmount)}</span></div>` : ''}
                  </div>
                ` : ''}
              `).join('') : ''}
              ${order.amountReceived ? `<div class="info-row"><span>Received:</span><span>${formatCurrency(order.amountReceived)}</span></div>` : ''}
              ${order.changeGiven ? `<div class="info-row"><span>Change:</span><span>${formatCurrency(order.changeGiven)}</span></div>` : ''}
            </div>` : ''}
          </div>
          <div class="footer">
            <p>${systemSettings?.receiptFooter || 'Thank you for your visit!'}</p>
            <p style="font-size: 10px; margin-top: 5px;">Powered by Admin Console</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const saveOrder = async () => {
    if (currentOrderItems.length === 0 || isSubmitting) return;
    if (orderTypeInput === 'dine-in' && !selectedTable) return;

    setIsSubmitting(true);
    try {
      // items.price is already stored in cents
      const subtotal = currentOrderItems.reduce((sum, { item, quantity }) => sum + Math.round((item.price || 0) * (quantity || 0)), 0);
      let total = subtotal;

      if (editingOrder && editingOrder.discount) {
        if (editingOrder.discountType === 'percentage') {
          total = Math.round(subtotal * (1 - editingOrder.discount / 100));
        } else {
          total = Math.max(0, subtotal - Math.round(editingOrder.discount * 100));
        }
      }

      const orderData: any = {
        userId: user?.uid || 'walk-in',
        waiter: user?.displayName || user?.email || 'Staff',
        items: currentOrderItems.map(({ item, quantity }) => ({
          itemId: item.id,
          name: item.name,
          price: item.price,
          quantity,
          category: item.category || 'Other',
          image: item.image || null
        })),
        total,
        paymentMethod: newOrderPaymentMethod || null,
        status: editingOrder ? editingOrder.status : 'confirmed',
        discount: editingOrder?.discount || 0,
        discountType: editingOrder?.discountType || 'percentage',
        orderType: orderTypeInput,
        driverId: orderTypeInput === 'delivery' ? driverIdInput : null,
        driverName: orderTypeInput === 'delivery' ? drivers.find(d => d.id === driverIdInput)?.name || null : null,
        tableNumber: selectedTable?.name || null,
        tableId: selectedTable?.id || null,
        notes: noteInput,
        storeId: profile?.storeId || null,
        updatedAt: serverTimestamp()
      };

      Object.keys(orderData).forEach(key => {
        if (orderData[key] === undefined) {
          delete orderData[key];
        }
      });

      if (editingOrder) {
        await updateDoc(doc(db, 'orders', editingOrder.id), orderData);
        const updatedOrder = { ...editingOrder, ...orderData };
        printKOT(updatedOrder as Order);
      } else {
        await runTransaction(db, async (transaction) => {
          // --- 1. ALL READS FIRST ---
          const counterRef = doc(db, 'counters', 'orders');
          const counterDoc = await transaction.get(counterRef);
          
          const todayStr = new Date().toISOString().split('T')[0];
          const kotCounterRef = doc(db, 'counters', `kots_${todayStr}`);
          const kotCounterDoc = await transaction.get(kotCounterRef);

          // --- 2. ALL WRITES ---
          // Order Number
          let orderNo = 1001;
          if (!counterDoc.exists()) {
            transaction.set(counterRef, { current: 1001 });
          } else {
            orderNo = (counterDoc.data().current || 1000) + 1;
            transaction.update(counterRef, { current: orderNo });
          }
          orderData.orderNo = orderNo.toString();

          // KOT Number
          let kotNoInt = 1;
          if (!kotCounterDoc.exists()) {
            transaction.set(kotCounterRef, { current: 1 });
          } else {
            kotNoInt = (kotCounterDoc.data().current || 0) + 1;
            transaction.update(kotCounterRef, { current: kotNoInt });
          }
          orderData.kotNo = kotNoInt.toString().padStart(3, '0');
          orderData.createdAt = serverTimestamp();

          // Create Order reference early to use its ID
          const newOrderRef = doc(collection(db, 'orders'));
          orderData.id = newOrderRef.id;

          // Handle Reservation Mapping
          if (selectedTable) {
            const tableIds = selectedTable.id.split(',');
            const todayDate = new Date().toISOString().split('T')[0];
            const tableReservation = reservations.find(r =>
              r.tableId && tableIds.includes(r.tableId) &&
              r.date === todayDate &&
              (r.status === 'confirmed' || r.status === 'pending' || r.status === 'seated')
            );

            if (tableReservation) {
              orderData.reservationId = tableReservation.id;
              orderData.customerId = tableReservation.customerId || null;
              orderData.customerName = tableReservation.customerName || null;
              orderData.customerPhone = tableReservation.customerPhone || null;
              transaction.update(doc(db, 'reservations', tableReservation.id), { status: 'seated' });
            }

            // Update Tables status and link Order ID
            for (const tId of tableIds) {
              transaction.update(doc(db, 'tables', tId), { 
                status: 'occupied',
                currentOrderId: newOrderRef.id 
              });
            }
          }

          Object.keys(orderData).forEach(key => {
            if (orderData[key] === undefined) {
              delete orderData[key];
            }
          });

          // Save Order
          transaction.set(newOrderRef, orderData);
        });
        printKOT(orderData as Order);
      }

      setIsNewOrderModalOpen(false);
      setSelectedTable(null);
      setCurrentOrderItems([]);
      setEditingOrder(null);
      setNoteInput('');
      setPosStep('tables');
    } catch (err) {
      handleFirestoreError(err, editingOrder ? OperationType.UPDATE : OperationType.CREATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deductInventory = async (order: Order) => {
    const soldByPiece = systemSettings?.soldByPiece !== false; // Default to true

    const recordMovement = async (itemId: string, itemName: string, qtyDeducted: number, originalStock: number, newStock: number) => {
      await addDoc(collection(db, 'stock_movements'), {
        inventoryItemId: itemId,
        itemName: itemName,
        type: 'sale',
        quantityChange: -qtyDeducted,
        stockAfter: newStock,
        reference: `Order #${order.id.slice(-6).toUpperCase()}`,
        timestamp: serverTimestamp()
      });
    };

    const deductRecursive = async (itemId: string, itemName: string, qty: number) => {
      if (soldByPiece) {
        const menuItem = menuItems.find(item => item.id === itemId || item.name === itemName);
        if (menuItem && menuItem.recipe && menuItem.recipe.length > 0) {
          for (const ingredient of menuItem.recipe) {
            const invRef = doc(db, 'inventory', ingredient.inventoryItemId);
            const invDoc = await getDoc(invRef);
            if (invDoc.exists()) {
              const currentStock = invDoc.data().stock || 0;
              const deductQty = ingredient.quantity * qty;
              const newStock = Math.max(0, currentStock - deductQty);
              
              await updateDoc(invRef, {
                stock: newStock,
                lastUpdated: serverTimestamp()
              });
              await recordMovement(invDoc.id, invDoc.data().name, deductQty, currentStock, newStock);
            } else {
              await deductRecursive(ingredient.inventoryItemId, '', ingredient.quantity * qty);
            }
          }
        } else {
          const q = query(collection(db, 'inventory'), where('name', '==', itemName));
          const invSnap = await getDocs(q);
          if (!invSnap.empty) {
            for (const document of invSnap.docs) {
              const currentStock = document.data().stock || 0;
              const newStock = Math.max(0, currentStock - qty);
              await updateDoc(document.ref, {
                stock: newStock,
                lastUpdated: serverTimestamp()
              });
              await recordMovement(document.id, document.data().name, qty, currentStock, newStock);
            }
          }
        }
      } else {
        const q = query(collection(db, 'inventory'), where('name', '==', itemName));
        const invSnap = await getDocs(q);
        if (!invSnap.empty) {
          for (const document of invSnap.docs) {
            const currentStock = document.data().stock || 0;
            const newStock = Math.max(0, currentStock - qty);
            await updateDoc(document.ref, {
              stock: newStock,
              lastUpdated: serverTimestamp()
            });
            await recordMovement(document.id, document.data().name, qty, currentStock, newStock);
          }
        }
      }
    };

    try {
      for (const orderItem of order.items) {
        await deductRecursive(orderItem.itemId, orderItem.name, orderItem.quantity);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getAmountToPay = () => {
    if (!settlingOrder) return 0;
    if (isSplitByItem) {
      const subtotal = selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const orderSubtotal = settlingOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      let discountAmount = 0;

      if (settlingOrder.discount && settlingOrder.discount > 0) {
        if (settlingOrder.discountType === 'percentage') {
          discountAmount = Math.round(subtotal * (settlingOrder.discount / 100));
        } else {
          const proportion = subtotal / orderSubtotal;
          discountAmount = Math.round((settlingOrder.discount * 100) * proportion);
        }
      }

      return Math.max(0, subtotal - discountAmount);
    } else if (isSplitByAmount) {
      return parseFloat(splitAmount) * 100 || 0;
    } else if (isSplitBill) {
      return Math.round(settlingOrder.total / numberOfSplits);
    }
    return settlingOrder.total;
  };

  const settleBill = async () => {
    setIsSubmitting(true);
    try {
      let amountToPay = settlingOrder.total;
      let itemsToPay = settlingOrder.items;

      if (isSplitByItem) {
        // i.price is already in cents
        const subtotal = selectedSplitItems.reduce((sum, i) => sum + Math.round((i.price || 0) * (i.quantity || 0)), 0);
        const orderSubtotal = settlingOrder.items.reduce((sum, i) => sum + Math.round((i.price || 0) * (i.quantity || 0)), 0);
        let discountAmount = 0;

        if (settlingOrder.discount && settlingOrder.discount > 0) {
          if (settlingOrder.discountType === 'percentage') {
            discountAmount = Math.round(subtotal * (settlingOrder.discount / 100));
          } else {
            // Pro-rate the fixed discount based on the proportion of the subtotal being paid
            const proportion = subtotal / (orderSubtotal || 1);
            // settlingOrder.discount is stored as percentage or absolute value?
            // Usually if discountType is 'fixed', discount might be in dollars?
            // Let's check saveOrder: item.discount * 100. So it's cents already.
            discountAmount = Math.round((settlingOrder.discount || 0) * proportion);
          }
        }

        amountToPay = Math.max(0, subtotal - discountAmount);

        itemsToPay = selectedSplitItems.map(si => ({
          itemId: si.itemId,
          name: si.name,
          price: si.price,
          quantity: si.quantity
        }));
      } else if (isSplitByAmount) {
        amountToPay = Math.round(parseFloat(splitAmount) * 100);
        itemsToPay = [];
      } else if (isSplitBill) {
        // Assume settlingOrder.total is already in cents after my fix
        amountToPay = Math.round((settlingOrder.total || 0) / (numberOfSplits || 1));
        itemsToPay = [];
      } else {
        // Standard full payment
        amountToPay = Math.round(settlingOrder.total || 0);
        itemsToPay = settlingOrder.items;
      }

      const amount = paymentMethod === 'multi' ? (parseFloat(multiPayment.cash) * 100 || 0) + (parseFloat(multiPayment.card) * 100 || 0) : parseFloat(amountReceived) * 100 || 0;
      let change = 0;
      let cashAmount = 0;
      let cardAmount = 0;
      let onlineAmount = 0;

      if (paymentMethod === 'multi') {
        const cashGiven = parseFloat(multiPayment.cash) * 100 || 0;
        cardAmount = parseFloat(multiPayment.card) * 100 || 0;
        change = Math.max(0, (cashGiven + cardAmount) - amountToPay);
        cashAmount = cashGiven - change; // Deduct change from cash
      } else if (paymentMethod === 'cash') {
        change = Math.max(0, amount - amountToPay);
        cashAmount = amountToPay;
      } else if (paymentMethod === 'card') {
        cardAmount = amountToPay;
      } else if (paymentMethod === 'online') {
        onlineAmount = amountToPay;
      }

      const currentPayments = settlingOrder.payments || [];
      const newPayment = {
        method: paymentMethod,
        amount: amountToPay,
        timestamp: new Date().toISOString(),
        cashAmount: cashAmount,
        cardAmount: cardAmount,
        onlineAmount: onlineAmount
      };
      const updatedPayments = [...currentPayments, newPayment];

      // Calculate COGS for the current payment
      let totalCOGS = 0;
      const itemsToProcess = isSplitByItem ? selectedSplitItems : settlingOrder.items;
      const paymentRatio = isSplitByItem ? 1 : (amountToPay / settlingOrder.total);

      for (const item of itemsToProcess) {
        const menuItem = menuItems.find(mi => mi.id === item.itemId);
        if (menuItem?.recipe) {
          for (const ingredient of menuItem.recipe) {
            const invItem = inventory.find(inv => inv.id === ingredient.inventoryItemId);
            if (invItem) {
              // Inventory cost is often dollars, convert to cents
              const costCents = (invItem.averageCost || invItem.costPerUnit || 0) * 100;
              totalCOGS += costCents * (ingredient.quantity || 0) * (item.quantity || 0) * paymentRatio;
            }
          }
        } else {
          const invItem = inventory.find(inv => inv.name === item.name);
          if (invItem) {
            const costCents = (invItem.averageCost || invItem.costPerUnit || 0) * 100;
            totalCOGS += costCents * (item.quantity || 0) * paymentRatio;
          }
        }
      }

      const taxAmount = Math.round(amountToPay - (amountToPay / (1 + (taxRatePercent / 100))));
      const netAmount = amountToPay - taxAmount;

      const journalLines = [
        ...(cashAmount > 0 ? [{ accountId: '1101', accountName: 'Cash on Hand', debit: cashAmount, credit: 0 }] : []),
        ...(cardAmount > 0 ? [{ accountId: '1102', accountName: 'Bank Accounts', debit: cardAmount, credit: 0 }] : []),
        ...(onlineAmount > 0 ? [{ accountId: '1102', accountName: 'Bank Accounts (Online Delivery)', debit: onlineAmount, credit: 0 }] : []),
        ...(paymentMethod === 'open bill' ? [{ accountId: '1103', accountName: 'Accounts Receivable', debit: amountToPay, credit: 0 }] : []),
        { accountId: '4101', accountName: 'Sales Revenue', debit: 0, credit: netAmount },
        { accountId: '2104', accountName: 'VAT Payable', debit: 0, credit: taxAmount },
        ...(totalCOGS > 0 ? [
          { accountId: '5101', accountName: 'Cost of Goods Sold', debit: Math.round(totalCOGS), credit: 0 },
          { accountId: '1105', accountName: 'Inventory', debit: 0, credit: Math.round(totalCOGS) }
        ] : [])
      ];

      if (isSplitByItem) {
        // Partial payment by item
        const remainingItems = [...settlingOrder.items];
        selectedSplitItems.forEach(splitItem => {
          const idx = remainingItems.findIndex(i => i.itemId === splitItem.itemId);
          if (idx !== -1) {
            remainingItems[idx].quantity -= splitItem.quantity;
            if (remainingItems[idx].quantity <= 0) {
              remainingItems.splice(idx, 1);
            }
          }
        });

        const newTotal = remainingItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);

        if (remainingItems.length === 0) {
          // Fully paid
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            status: 'finalized',
            paymentMethod,
            payments: updatedPayments,
            amountReceived: amount,
            changeGiven: change,
            completedAt: serverTimestamp()
          });

          // Complete linked reservation
          if (settlingOrder.reservationId) {
            await updateDoc(doc(db, 'reservations', settlingOrder.reservationId), {
              status: 'completed'
            });
          }

          if (settlingOrder.tableId) {
            const tableIds = settlingOrder.tableId.split(',');
            for (const tId of tableIds) {
              const trimmedId = tId.trim();
              if (trimmedId) {
                await updateDoc(doc(db, 'tables', trimmedId), { 
                  status: 'available',
                  currentOrderId: deleteField()
                });
              }
            }
          }
        } else {
          // Partially paid
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            items: remainingItems,
            total: newTotal,
            payments: updatedPayments,
            notes: (settlingOrder.notes || '') + `\n[Partial Payment: ${formatCurrency(amountToPay)}]`,
            updatedAt: serverTimestamp()
          });
        }

        // Record partial sale in journal
        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: amountToPay,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: itemsToPay
        });

        // Formal Journal Entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${settlingOrder.id.slice(-6).toUpperCase()}`,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          lines: journalLines
        });

        // Deduct Inventory for paid items
        await deductInventory({ ...settlingOrder, items: itemsToPay });

        if (remainingItems.length === 0) {
          setIsSettlingBill(false);
          setSettlingOrder(null);
        } else {
          // Refresh settling order with remaining items
          setSettlingOrder({ ...settlingOrder, items: remainingItems, total: newTotal });
          setSelectedSplitItems([]);
        }
      } else if (isSplitByAmount || isSplitBill) {
        const remainingTotal = settlingOrder.total - amountToPay;
        if (remainingTotal <= 0) {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            status: 'finalized',
            paymentMethod,
            payments: updatedPayments,
            amountReceived: amount,
            changeGiven: change,
            total: 0,
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          if (settlingOrder.tableId) {
            const tableIds = settlingOrder.tableId.split(',');
            for (const tId of tableIds) {
              const trimmedId = tId.trim();
              if (trimmedId) {
                await updateDoc(doc(db, 'tables', trimmedId), { 
                  status: 'available',
                  currentOrderId: deleteField()
                });
              }
            }
          }
          await deductInventory(settlingOrder);

          // Complete linked reservation
          if (settlingOrder.reservationId) {
            await updateDoc(doc(db, 'reservations', settlingOrder.reservationId), {
              status: 'completed'
            });
          }
        } else {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            total: remainingTotal,
            payments: updatedPayments,
            notes: (settlingOrder.notes || '') + `\n[Partial Payment: ${formatCurrency(amountToPay)}]`
          });
        }

        // Record partial sale in journal
        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: amountToPay,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp()
        });

        // Formal Journal Entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${settlingOrder.id.slice(-6).toUpperCase()}`,
          description: `Partial Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          lines: journalLines
        });

        if (remainingTotal <= 0) {
          setIsSettlingBill(false);
          setSettlingOrder(null);
        } else {
          setSettlingOrder({ ...settlingOrder, total: remainingTotal });
        }
      } else {
        await deductInventory(settlingOrder);

        // Update order status to finalized
        await updateDoc(doc(db, 'orders', settlingOrder.id), {
          status: 'finalized',
          paymentMethod,
          payments: updatedPayments,
          amountReceived: amount,
          changeGiven: change,
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Complete linked reservation
        if (settlingOrder.reservationId) {
          await updateDoc(doc(db, 'reservations', settlingOrder.reservationId), {
            status: 'completed'
          });
        }

        if (settlingOrder.tableId) {
          const tableIds = settlingOrder.tableId.split(',');
          for (const tId of tableIds) {
            const trimmedId = tId.trim();
            if (trimmedId) {
              await updateDoc(doc(db, 'tables', trimmedId), { 
                status: 'available',
                currentOrderId: deleteField()
              });
            }
          }
        }

        // Record sale in journal
        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: settlingOrder.total,
          description: `Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: settlingOrder.items
        });

        // Formal Journal Entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `ORD-${settlingOrder.id.slice(-6).toUpperCase()}`,
          description: `Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          orderId: settlingOrder.id,
          timestamp: serverTimestamp(),
          lines: journalLines
        });

        setIsSettlingBill(false);
        setSettlingOrder(null);
      }

      // Print separate bill for this payment
      printBill({
        ...settlingOrder,
        items: itemsToPay.length > 0 ? itemsToPay : [{ name: 'Partial Payment', quantity: 1, price: amountToPay, itemId: 'partial' }],
        total: amountToPay,
        status: (isSplitByItem ? (settlingOrder.items.length === 0) : (settlingOrder.total - amountToPay <= 0)) ? 'finalized' : 'paid',
        paymentMethod: paymentMethod,
        payments: updatedPayments,
        amountReceived: amount,
        changeGiven: change,
        isPartial: true
      } as any);

      // Only reset split states if the order is fully paid
      const isFullyPaid = isSplitByItem ? (settlingOrder.items.length === 0) : (settlingOrder.total - amountToPay <= 0);

      if (isFullyPaid) {
        setIsSplitBill(false);
        setIsSplitByItem(false);
        setIsSplitByAmount(false);
        setSelectedSplitItems([]);
        setSplitAmount('');
      } else {
        // If not fully paid, we stay in split mode but reset the current selection
        setSelectedSplitItems([]);
        setSplitAmount('');
      }

      setAmountReceived('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${settlingOrder?.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const updates: any = { status };

      if (status === 'finalized') {
        updates.invoicedAt = serverTimestamp();
      }

      await updateDoc(orderRef, updates);

      // Auto-print KOT on "Start Order" (confirmed -> preparing)
      if (status === 'preparing') {
        const order = orders.find(o => o.id === orderId);
        if (order) printKOT(order);
      }

      if (status === 'finalized' || status === 'cancelled') {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        const orderData = orderDoc.exists() ? orderDoc.data() : null;
        const tableId = orderData?.tableId;

        if (tableId) {
          const tableIds = String(tableId).split(',');
          for (const tId of tableIds) {
            const trimmedId = tId.trim();
            if (trimmedId) {
              await updateDoc(doc(db, 'tables', trimmedId), { status: 'available' });
            }
          }
        }

        // Automated Reversal logic for Accounting
        if (status === 'cancelled') {
          try {
            const orderDoc = await getDoc(doc(db, 'orders', orderId));
            const order = orderDoc.exists() ? orderDoc.data() : null;
            if (order && order.total > 0) {
              const today = new Date().toISOString().split('T')[0];
              await addDoc(collection(db, 'journal_entries'), {
                date: today,
                reference: `VOID-ORD-${orderId.slice(-6).toUpperCase()}`,
                description: `SYSTEM VOID: Order #${orderId.slice(-6).toUpperCase()} cancelled`,
                lines: [
                  { accountId: 'sales', accountName: 'Sales Revenue', debit: Math.round(order.total * 100), credit: 0 },
                  { accountId: 'cash', accountName: 'Cash/Bank', debit: 0, credit: Math.round(order.total * 100) }
                ],
                timestamp: serverTimestamp(),
                reversal: true,
                originalOrderId: orderId
              });
            }
          } catch (accError) {
            console.error('Accounting reversal failed:', accError);
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const updateOrderField = async (orderId: string, field: string, value: any) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { [field]: value });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleUpdateGuest = async () => {
    if (!activeOrder) return;
    await updateOrderField(activeOrder.id, 'occupancy', parseInt(occupancyInput) || 0);
    setIsGuestModalOpen(false);
    setActiveOrder(null);
  };

  const handleUpdateDiscount = async () => {
    if (!activeOrder) return;
    setDiscountError('');
    if (clearanceCodeInput !== '1234') {
      setDiscountError('Invalid clearance code');
      return;
    }
    try {
      const discountVal = parseFloat(discountInput) || 0;
      const subtotal = activeOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      let finalTotal = subtotal;

      if (discountTypeInput === 'percentage') {
        finalTotal = Math.round(subtotal * (1 - discountVal / 100));
      } else {
        finalTotal = Math.max(0, subtotal - Math.round(discountVal * 100)); // discountVal is in dollars, subtotal in cents
      }

      await updateDoc(doc(db, 'orders', activeOrder.id), {
        discount: discountVal,
        discountType: discountTypeInput,
        total: finalTotal
      });
      setIsDiscountModalOpen(false);
      setActiveOrder(null);
      setDiscountInput('');
      setClearanceCodeInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${activeOrder.id}`);
    }
  };

  const handleAssignCustomer = async (customer: Customer) => {
    if (!activeOrder) return;
    try {
      const updates: any = {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone
      };

      if (customer.groupId) {
        const group = groups.find(g => g.id === customer.groupId);
        if (group && group.discountPercentage > 0) {
          updates.discount = group.discountPercentage;
          updates.discountType = 'percentage';
          updates.discountReason = `Group Discount: ${group.name}`;

          // Recalculate total based on items and new discount
          const subtotal = activeOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          updates.total = subtotal * (1 - group.discountPercentage / 100);
        }
      }

      await updateDoc(doc(db, 'orders', activeOrder.id), updates);
      setIsCustomerModalOpen(false);
      setCustomerSearch('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'orders');
    }
  };
  const handleUpdateNote = async () => {
    if (!activeOrder) return;
    await updateOrderField(activeOrder.id, 'notes', noteInput);
    setIsNoteModalOpen(false);
  };

  const handleUpdateOrderDetails = async () => {
    if (!activeOrder) return;
    try {
      const updates: any = { orderType: orderTypeInput };
      if (orderTypeInput === 'delivery' && driverIdInput) {
        const driver = drivers.find(d => d.id === driverIdInput);
        updates.driverId = driverIdInput;
        updates.driverName = driver?.name || '';
      } else {
        updates.driverId = deleteField();
        updates.driverName = deleteField();
      }
      await updateDoc(doc(db, 'orders', activeOrder.id), updates);
      setIsUpdateOrderModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${activeOrder.id}`);
    }
  };

  const handleChangeTable = async () => {
    if (!activeOrder || !newTableId) return;
    const newTable = tables.find(t => t.id === newTableId);
    if (!newTable) return;

    try {
      // Update order with new table
      await updateDoc(doc(db, 'orders', activeOrder.id), {
        tableId: newTable.id,
        tableNumber: newTable.name
      });

      // Update new table status
      await updateDoc(doc(db, 'tables', newTable.id), { status: 'occupied' });

      // Free up old table if it was dine-in
      if (activeOrder.tableId) {
        const tableIds = activeOrder.tableId.split(',');
        for (const tId of tableIds) {
          await updateDoc(doc(db, 'tables', tId), { status: 'available' });
        }
      }

      setIsChangeTableModalOpen(false);
      setNewTableId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${activeOrder.id}`);
    }
  };

  // Active statuses shown in POS
  const ACTIVE_STATUSES = ['awaiting-confirmation', 'pending', 'confirmed', 'preparing', 'serving', 'done-serving', 'awaiting-bill'];
  
  const filteredOrders = orders.filter(o => {
    // Determine if today
    const today = new Date().toISOString().split('T')[0];
    const orderDate = o.createdAt?.toDate ? o.createdAt.toDate().toISOString().split('T')[0] : '';
    const isToday = orderDate === today;

    // Handle Completed (finalized) filter
    if (filter === 'finalized') {
      return (o.status === 'finalized' || o.status === 'Finalized') && isToday;
    }

    // Permanently hide finalized and cancelled orders from other POS filters
    if (o.status === 'finalized' || o.status === 'cancelled' || o.status === 'Finalized' || o.status === 'Cancelled') return false;
    const statusMatch = filter === 'all' || o.status === filter;
    const typeMatch = orderTypeFilter === 'all' || o.orderType === orderTypeFilter;

    const matchesOrderId = !searchOrderId ||
      (o.orderNo?.toString() || '').includes(searchOrderId) ||
      (o.id || '').toLowerCase().includes(searchOrderId.toLowerCase());
    const matchesKotNo = !searchKotNo || (o.kotNo?.toString() || '').includes(searchKotNo);
    const matchesCustomerName = !searchCustomerName || (o.customerName || '').toLowerCase().includes(searchCustomerName.toLowerCase());
    const matchesCustomerPhone = !searchCustomerPhone || (o.customerPhone || '').includes(searchCustomerPhone);
    const matchesTableNumber = !searchTableNumber || (o.tableNumber || '').toLowerCase().includes(searchTableNumber.toLowerCase());

    return statusMatch && typeMatch && matchesOrderId && matchesKotNo && matchesCustomerName && matchesCustomerPhone && matchesTableNumber;
  });

  const getStatusColor = (status: Order['status'] | 'all') => {
    if (status === 'all') return 'bg-primary text-white';
    switch (status) {
      case 'awaiting-confirmation': return 'bg-yellow-500 text-white';
      case 'paid': return 'bg-blue-500 text-white';
      case 'confirmed': return 'bg-amber-500 text-white';
      case 'preparing': return 'bg-orange-500 text-white';
      case 'serving': return 'bg-purple-500 text-white';
      case 'done-serving': return 'bg-indigo-500 text-white';
      case 'awaiting-bill': return 'bg-pink-500 text-white';
      case 'finalized': return 'bg-emerald-500 text-white';
      case 'cancelled': return 'bg-red-500 text-white';
      default: return 'bg-muted0 text-white';
    }
  };

  const getStatusText = (status: Order['status']) => {
    switch (status) {
      case 'awaiting-confirmation': return 'Confirm Order';
      case 'confirmed': return 'Start Preparing';
      case 'preparing': return 'Start Serving';
      case 'serving': return 'Done Serving';
      case 'done-serving': return 'Awaiting Bill';
      case 'awaiting-bill': return 'Finalize';
      default: return status;
    }
  };

  const getNextStatus = (status: Order['status']): Order['status'] | null => {
    switch (status) {
      case 'awaiting-confirmation': return 'confirmed';
      case 'confirmed': return 'preparing';
      case 'preparing': return 'serving';
      case 'serving': return 'done-serving';
      case 'done-serving': return 'awaiting-bill';
      case 'awaiting-bill': return 'finalized';
      default: return null;
    }
  };

  return (
    <div className={`${isDeveloper ? 'h-[calc(100dvh-2rem)]' : 'h-[100dvh]'} bg-background flex flex-col overflow-hidden text-foreground`}>
      {/* POS Header */}
      <div className="bg-card border-b border-border shadow-sm z-10 relative">
        {/* Top Row: Logo & Main Actions */}
        <div className="px-4 py-3 lg:px-6 lg:py-4 flex flex-col lg:flex-row items-center justify-between gap-4 border-b border-border/50">
          <div className="flex items-center justify-between w-full lg:w-auto gap-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-background rounded-xl text-muted-foreground transition-all"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <img
                src="https://res.cloudinary.com/htyeg8qey/image/upload/v1742727215/p03r5f8p99g6yit80h6k.png"
                alt="Robotic ERP Logo"
                className="h-8 lg:h-10 w-auto object-contain dark:bg-white/90 dark:p-1.5 dark:rounded-lg transition-all"
                referrerPolicy="no-referrer"
              />
              <div>
                <h1 className="text-lg lg:text-xl font-black text-foreground tracking-tight leading-none">POS SYSTEM</h1>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Live Order Management</p>
              </div>
            </div>
            <div className="hidden sm:block">
              <DigitalClock />
            </div>
          </div>

          {/* New Order Creation Buttons & Shift Controls */}
          <div className="flex items-center flex-wrap justify-center lg:justify-end gap-2 w-full lg:w-auto">
            <div className="text-right hidden xl:block shrink-0 mr-2">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Active Orders</p>
              <p className="text-lg font-black text-foreground leading-none">{orders.length}</p>
            </div>

            <button
              onClick={async () => {
                const today = new Date().toISOString().split('T')[0];
                const todayOrders = orders.filter(o => {
                  const orderDate = o.createdAt?.toDate ? o.createdAt.toDate().toISOString().split('T')[0] : '';
                  return orderDate === today && (o.status?.toLowerCase() === 'paid' || o.status?.toLowerCase() === 'finalized');
                });

                const totals = todayOrders.reduce((acc, o) => {
                  acc.total += o.total;

                  if (o.payments && o.payments.length > 0) {
                    o.payments.forEach((p: any) => {
                      if (p.method === 'cash') acc.cash += p.amount;
                      else if (p.method === 'card') acc.card += p.amount;
                      else if (p.method === 'online') acc.online += p.amount;
                      else if (p.method === 'open bill') acc.openBill += p.amount;
                      else if (p.method === 'multi') {
                        acc.cash += p.cashAmount || 0;
                        acc.card += p.cardAmount || 0;
                      }
                    });
                  } else {
                    if (o.paymentMethod === 'cash') acc.cash += o.total;
                    else if (o.paymentMethod === 'card') acc.card += o.total;
                    else if (o.paymentMethod === 'online') acc.online += o.total;
                    else if (o.paymentMethod === 'open bill') acc.openBill += o.total;
                  }
                  return acc;
                }, { total: 0, cash: 0, card: 0, online: 0, openBill: 0, count: todayOrders.length });

                setSessionTotals(totals);
                setIsEndingSession(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-500 text-white border border-rose-600 rounded-xl hover:bg-rose-600 transition-all text-[9px] font-black uppercase tracking-tight shadow-md shadow-rose-500/20"
            >
              <Clock size={14} /> End Shift
            </button>

            {systemSettings?.enableTakeaway !== false && (
              <button
                onClick={() => {
                  setOrderTypeInput('take-out');
                  setSelectedTable(null);
                  setPosStep('menu');
                  setIsNewOrderModalOpen(true);
                }}
                className="bg-blue-500 text-white px-3 py-2 lg:px-4 lg:py-2.5 rounded-xl flex items-center gap-1.5 font-black text-[9px] lg:text-[10px] uppercase tracking-wider shadow-md shadow-blue-500/20 hover:bg-blue-600 transition-all hover:scale-105 active:scale-95 shrink-0"
              >
                <ShoppingBag size={14} className="lg:w-[16px] lg:h-[16px]" /> Takeaway
              </button>
            )}
            {systemSettings?.enableDelivery !== false && (
              <button
                onClick={() => {
                  setOrderTypeInput('delivery');
                  setSelectedTable(null);
                  setPosStep('menu');
                  setIsNewOrderModalOpen(true);
                }}
                className="bg-blue-600 text-white px-3 py-2 lg:px-4 lg:py-2.5 rounded-xl flex items-center gap-1.5 font-black text-[9px] lg:text-[10px] uppercase tracking-wider shadow-md shadow-blue-600/20 hover:bg-blue-700 transition-all hover:scale-105 active:scale-95 shrink-0"
              >
                <Truck size={14} className="lg:w-[16px] lg:h-[16px]" /> Delivery
              </button>
            )}
            <button
              onClick={() => {
                setOrderTypeInput('pickup');
                setSelectedTable(null);
                setPosStep('menu');
                setIsNewOrderModalOpen(true);
              }}
              className="bg-purple-600 text-white px-3 py-2 lg:px-4 lg:py-2.5 rounded-xl flex items-center gap-1.5 font-black text-[9px] lg:text-[10px] uppercase tracking-wider shadow-md shadow-purple-600/20 hover:bg-purple-700 transition-all hover:scale-105 active:scale-95 shrink-0"
            >
              <ShoppingBag size={14} className="lg:w-[16px] lg:h-[16px]" /> Pickup
            </button>
            <button
              onClick={() => {
                setOrderTypeInput('dine-in');
                setPosStep('tables');
                setIsNewOrderModalOpen(true);
              }}
              className="bg-emerald-500 text-white px-3 py-2 lg:px-4 lg:py-2.5 rounded-xl flex items-center gap-1.5 font-black text-[9px] lg:text-[10px] uppercase tracking-wider shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition-all hover:scale-105 active:scale-95 shrink-0"
            >
              <Utensils size={14} className="lg:w-[16px] lg:h-[16px]" /> Dine-In
            </button>
          </div>
        </div>

        {/* Bottom Row: Search & Filters */}
        <div className="px-4 py-3 lg:px-6 lg:py-3 flex flex-col 2xl:flex-row items-center gap-4 bg-muted/30">
          {/* Search Grid */}
          <div className="flex-1 w-full max-w-none">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
              <div className="relative group">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-all" size={14} />
                <input
                  type="text"
                  placeholder="Order No"
                  value={searchOrderId}
                  onChange={(e) => setSearchOrderId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-[10px] focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold transition-all placeholder:text-muted-foreground/40 uppercase tracking-tighter"
                />
              </div>
              <div className="relative group">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-all" size={14} />
                <input
                  type="text"
                  placeholder="KOT No"
                  value={searchKotNo}
                  onChange={(e) => setSearchKotNo(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-[10px] focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold transition-all placeholder:text-muted-foreground/40 uppercase tracking-tighter"
                />
              </div>
              <div className="relative group">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-all" size={14} />
                <input
                  type="text"
                  placeholder="Customer Name"
                  value={searchCustomerName}
                  onChange={(e) => setSearchCustomerName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-[10px] focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold transition-all placeholder:text-muted-foreground/40 uppercase tracking-tighter"
                />
              </div>
              <div className="relative group">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-all" size={14} />
                <input
                  type="text"
                  placeholder="Phone No"
                  value={searchCustomerPhone}
                  onChange={(e) => setSearchCustomerPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-[10px] focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold transition-all placeholder:text-muted-foreground/40 uppercase tracking-tighter"
                />
              </div>
              <div className="relative group">
                <LayoutGrid className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-all" size={14} />
                <input
                  type="text"
                  placeholder="Table No"
                  value={searchTableNumber}
                  onChange={(e) => setSearchTableNumber(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-[10px] focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold transition-all placeholder:text-muted-foreground/40 uppercase tracking-tighter"
                />
              </div>
            </div>
          </div>

          {/* Status Filters */}
          <div className="flex flex-wrap gap-1 w-full xl:w-auto xl:justify-end shrink-0">
            {(['all', 'awaiting-confirmation', 'pending', 'confirmed', 'preparing', 'serving', 'done-serving', 'awaiting-bill', 'finalized'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all shadow-sm border border-border/50 whitespace-nowrap ${filter === s
                    ? `${getStatusColor(s)} shadow-md scale-105 z-10`
                    : 'bg-card text-muted-foreground hover:text-foreground hover:bg-background transition-all'
                  }`}
              >
                {s === 'finalized' ? 'Completed' : s.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* New Order Modal */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsNewOrderModalOpen(false)} />
          <div className="relative bg-card w-full max-w-6xl h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)] rounded-[1.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-border mx-auto">
            <div className="p-4 sm:p-6 border-b border-border flex items-center justify-between shrink-0 bg-card sticky top-0 z-10">
              <div className="flex items-center gap-4">
                {posStep === 'menu' && orderTypeInput === 'dine-in' && (
                  <button
                    onClick={() => setPosStep('tables')}
                    className="p-2 hover:bg-background rounded-xl text-muted-foreground transition-all"
                  >
                    <ArrowLeft size={24} />
                  </button>
                )}
                <div>
                  <h2 className="text-2xl font-black text-foreground">
                    {posStep === 'tables' ? 'Select Table' : selectedTable ? `Order for ${selectedTable.name}` : orderTypeInput === 'delivery' ? 'Delivery Order' : 'Takeaway Order'}
                  </h2>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {posStep === 'tables' ? 'Step 1: Choose a location' : 'Step 2: Select menu items'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewOrderModalOpen(false)} className="p-2 hover:bg-background rounded-full transition-colors text-muted-foreground">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {posStep === 'tables' ? (
                <div className="flex-1 flex flex-col p-4 sm:p-6 bg-background/30 m-2 sm:m-4 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-border shadow-inner overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6 shrink-0">
                    <h3 className="text-lg sm:text-xl font-black text-foreground">Select Table</h3>
                    <div className="flex items-center gap-2 sm:gap-4">
                      {isMergingTables && selectedTablesToMerge.length > 0 && (
                        <button
                          onClick={() => {
                            const mergedTable: Table = {
                              id: selectedTablesToMerge.map(t => t.id).join(','),
                              name: selectedTablesToMerge.map(t => t.name).join(' + '),
                              capacity: selectedTablesToMerge.reduce((sum, t) => sum + t.capacity, 0),
                              status: 'available',
                              x: 0, y: 0, width: 0, height: 0, shape: 'rectangle'
                            };
                            setSelectedTable(mergedTable);
                            setPosStep('menu');
                            setIsMergingTables(false);
                            setSelectedTablesToMerge([]);
                          }}
                          className="px-4 py-2 sm:px-6 sm:py-2 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm whitespace-nowrap"
                        >
                          Confirm Merge ({selectedTablesToMerge.length})
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setIsMergingTables(!isMergingTables);
                          setSelectedTablesToMerge([]);
                        }}
                        className={`px-3 py-2 sm:px-4 sm:py-2 rounded-xl font-bold transition-colors text-sm whitespace-nowrap ${isMergingTables ? 'bg-amber-500/10 text-amber-500' : 'bg-card border-2 border-border text-muted-foreground hover:bg-background'
                          }`}
                      >
                        {isMergingTables ? 'Cancel Merge' : 'Merge Tables'}
                      </button>
                    </div>
                  </div>
                  <div
                    className="flex-1 overflow-auto custom-scrollbar bg-card/30 rounded-[1.5rem] border border-border/50 relative p-8 min-h-[500px]"
                    style={{
                      backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
                      backgroundSize: '30px 30px'
                    }}
                  >
                    {tables.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-center h-full">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-background rounded-full flex items-center justify-center mb-4">
                          <Layout className="text-muted-foreground/30" size={32} />
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-foreground">No Tables Configured</h3>
                        <p className="text-sm text-muted-foreground max-w-xs mt-2">Please configure your restaurant layout in the Admin Panel's Tables section first.</p>
                      </div>
                    ) : (
                      <div className="relative" style={{ minWidth: Math.max(...tables.map(t => t.x + t.width || 0)) + 100, minHeight: Math.max(...tables.map(t => t.y + t.height || 0)) + 100 }}>
                        {tables.map(table => {
                          const isSelectedForMerge = selectedTablesToMerge.some(t => t.id === table.id);

                          // Check for active dine-in orders on this table
                          const activeOrderForTable = orders.find(o => 
                            o.tableId?.split(',').includes(table.id) && 
                            o.orderType === 'dine-in' &&
                            !['paid', 'cancelled', 'finalized'].includes(o.status.toLowerCase())
                          );

                          // Check for active reservation
                          const today = new Date().toISOString().split('T')[0];
                          const tableReservation = reservations.find(r =>
                            r.tableId?.split(',').includes(table.id) &&
                            r.date === today &&
                            (r.status === 'confirmed' || r.status === 'pending' || r.status === 'seated')
                          );

                          const isOccupied = table.status === 'occupied' || !!activeOrderForTable || tableReservation?.status === 'seated';

                          return (
                            <button
                              key={table.id}
                              onClick={() => {
                                if (isMergingTables) {
                                  if (isSelectedForMerge) {
                                    setSelectedTablesToMerge(selectedTablesToMerge.filter(t => t.id !== table.id));
                                  } else {
                                    setSelectedTablesToMerge([...selectedTablesToMerge, table]);
                                  }
                                } else {
                                  if (activeOrderForTable) {
                                    setEditingOrder(activeOrderForTable);
                                    setCurrentOrderItems(activeOrderForTable.items.map(item => {
                                      const menuItem = menuItems.find(m => m.id === item.itemId);
                                      return {
                                        item: menuItem || { id: item.itemId, name: item.name, price: item.price, category: '', available: true, image: '', description: '' },
                                        quantity: item.quantity
                                      };
                                    }));
                                  } else {
                                    setEditingOrder(null);
                                    setCurrentOrderItems([]);
                                  }
                                  setSelectedTable(table);
                                  setPosStep('menu');
                                }
                              }}
                              className={`absolute flex flex-col items-center justify-center transition-all shadow-sm select-none border-2 p-2 ${table.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
                                } ${isOccupied
                                  ? 'bg-amber-500/10 border-amber-500/20 shadow-amber-500/5'
                                  : tableReservation
                                    ? 'bg-blue-500/10 border-blue-500/20 shadow-blue-500/5'
                                    : isSelectedForMerge
                                      ? 'bg-primary/10 border-primary shadow-lg scale-105 z-10'
                                      : 'bg-card border-border hover:border-primary/30 hover:shadow-md z-0'
                                }`}
                              style={{
                                left: `${table.x}px`,
                                top: `${table.y}px`,
                                width: `${table.width}px`,
                                height: `${table.height}px`,
                              }}
                            >
                              <span className={`font-black text-xs sm:text-sm text-center line-clamp-2 ${isOccupied ? 'text-amber-500' : tableReservation ? 'text-blue-500' : isSelectedForMerge ? 'text-primary' : 'text-foreground'}`}>
                                {table.name}
                              </span>
                              {tableReservation && (
                                <span className={`text-[8px] font-black uppercase leading-none mt-0.5 ${tableReservation.status === 'seated' ? 'text-amber-500/70' : 'text-blue-500/70'}`}>
                                  {tableReservation.customerName}
                                </span>
                              )}
                              {activeOrderForTable && !tableReservation && (
                                <span className="text-[8px] font-black text-amber-500/70 uppercase leading-none mt-0.5">
                                  {activeOrderForTable.customerName || `Order #${activeOrderForTable.id.slice(-4).toUpperCase()}`}
                                </span>
                              )}
                              <div className="flex items-center gap-1 mt-0.5">
                                <Users size={10} className={isOccupied ? 'text-amber-500/60' : isSelectedForMerge ? 'text-primary/60' : 'text-muted-foreground/60'} />
                                <span className={`text-[9px] font-bold ${isOccupied ? 'text-amber-500/80' : isSelectedForMerge ? 'text-primary/80' : 'text-muted-foreground'}`}>
                                  {table.capacity}
                                </span>
                              </div>
                              {isOccupied && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-background shadow-sm animate-pulse" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  {/* Left: Menu with Categories */}
                  <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    <div className="p-2 sm:p-3 border-b border-border flex gap-2 overflow-x-auto custom-scrollbar bg-background/30 shrink-0">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${selectedCategory === 'all' ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'bg-card text-muted-foreground hover:bg-background border border-border'
                          }`}
                      >
                        All Items
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${selectedCategory === cat.id ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'bg-card text-muted-foreground hover:bg-background border border-border'
                            }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 p-3 sm:p-4 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 sm:gap-4 pb-4">
                        {menuItems
                          .filter(item => selectedCategory === 'all' || item.category === selectedCategory)
                          .map(item => (
                            <div
                              key={item.id}
                              className={`relative group h-full transition-all ${!item.available ? 'opacity-70 grayscale-[0.5]' : ''}`}
                            >
                              <button
                                onClick={() => {
                                  if (!item.available) return;
                                  setCurrentOrderItems(prev => {
                                    const existing = prev.find(i => i.item.id === item.id);
                                    if (existing) {
                                      return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
                                    }
                                    return [...prev, { item, quantity: 1 }];
                                  });
                                }}
                                className={`w-full h-full bg-card rounded-xl sm:rounded-2xl border border-border hover:border-primary/50 hover:shadow-lg transition-all text-left flex flex-col overflow-hidden ${!item.available ? 'cursor-not-allowed border-rose-500/30' : ''}`}
                              >
                                <div className="h-20 sm:h-28 w-full bg-background relative shrink-0">
                                  {!item.available && (
                                    <div className="absolute inset-0 bg-rose-600/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                      <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest bg-zinc-950 px-2 py-1 rounded-md shadow-2xl">86 / Out of Stock</span>
                                    </div>
                                  )}
                                  {item.image ? (
                                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                      <Utensils size={20} className="sm:w-6 sm:h-6" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2 sm:p-3 flex flex-col justify-between flex-1 min-h-0">
                                  <div className="min-h-0 overflow-hidden">
                                    <p className={`font-bold text-xs sm:text-sm transition-colors line-clamp-2 leading-tight ${item.available ? 'text-foreground group-hover:text-primary' : 'text-rose-500/70'}`}>{item.name}</p>
                                    {item.available && item.recipeDetails?.allergens && item.recipeDetails.allergens.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {item.recipeDetails.allergens.slice(0, 2).map((allergen, idx) => (
                                          <span key={idx} className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded text-[8px] sm:text-[9px] font-bold whitespace-nowrap">
                                            <AlertTriangle size={8} className="w-2 h-2" /> {allergen}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <p className={`text-sm sm:text-base font-black mt-1 sm:mt-2 shrink-0 ${item.available ? 'text-primary' : 'text-rose-500/70'}`}>{formatCurrency(item.price)}</p>
                                </div>
                              </button>

                              {/* Quick 86 Toggle for Staff */}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await updateDoc(doc(db, 'menu', item.id), { available: !item.available });
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.UPDATE, `menu/${item.id}`);
                                  }
                                }}
                                className={`absolute top-1 right-1 z-20 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all border-2 shadow-sm ${item.available
                                    ? 'bg-zinc-950/80 border-white/10 text-white hover:bg-rose-600 hover:border-rose-400'
                                    : 'bg-emerald-600 border-white/20 text-white'
                                  }`}
                                title={item.available ? "Mark as 86 (Out of Stock)" : "Mark as Back in Stock"}
                              >
                                <span className="text-[10px] font-black uppercase">86</span>
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Current Selection */}
                  <div className="w-full md:w-72 lg:w-80 bg-background/30 p-3 sm:p-4 flex flex-col border-t md:border-t-0 md:border-l border-border shrink-0 h-[40vh] md:h-full">
                    <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Current Order</p>
                      <button
                        onClick={() => setCurrentOrderItems([])}
                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex-1 space-y-2 sm:space-y-3 overflow-y-auto custom-scrollbar pr-2">
                      {currentOrderItems.map(({ item, quantity }, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-card p-3 rounded-xl shadow-sm border border-border">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                            <p className="text-[10px] font-bold text-muted-foreground">{formatCurrency(item.price)} each</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setCurrentOrderItems(prev => prev.map(i => i.item.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0));
                              }}
                              className="w-7 h-7 bg-background rounded-lg flex items-center justify-center text-muted-foreground hover:bg-background/80 transition-all font-bold"
                            >
                              -
                            </button>
                            <span className="text-sm font-black text-foreground w-4 text-center">{quantity}</span>
                            <button
                              onClick={() => {
                                setCurrentOrderItems(prev => prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
                              }}
                              className="w-7 h-7 bg-background rounded-lg flex items-center justify-center text-muted-foreground hover:bg-background/80 transition-all font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                      {currentOrderItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 gap-3">
                          <div className="w-12 h-12 bg-card rounded-2xl flex items-center justify-center shadow-sm border border-border">
                            <ShoppingBag size={24} />
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-widest">Empty Cart</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-border space-y-2 sm:space-y-3 shrink-0">
                      {orderTypeInput === 'delivery' && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Assign Driver</label>
                          <select
                            value={driverIdInput}
                            onChange={(e) => setDriverIdInput(e.target.value)}
                            className="w-full bg-card border border-border rounded-xl p-2 text-sm focus:border-primary outline-none font-bold text-foreground"
                          >
                            <option value="">Select Driver</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.id}>{d.name} ({d.vehicle})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {(orderTypeInput === 'pickup' || orderTypeInput === 'delivery') && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Payment Method</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setNewOrderPaymentMethod('cash')}
                              className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 ${newOrderPaymentMethod === 'cash' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                                }`}
                            >
                              Cash
                            </button>
                            <button
                              onClick={() => setNewOrderPaymentMethod('online')}
                              className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border-2 ${newOrderPaymentMethod === 'online' ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                                }`}
                            >
                              Online
                            </button>
                          </div>
                        </div>
                      )}
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add order notes..."
                        className="w-full bg-card border border-border rounded-xl p-2 text-sm focus:border-primary outline-none resize-none h-12 sm:h-16 text-foreground"
                      />
                      <div className="flex justify-between items-center mb-2 sm:mb-3">
                        <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase">Total Amount</span>
                        <span className="text-xl sm:text-2xl font-black text-primary">
                          {formatCurrency(currentOrderItems.reduce((sum, { item, quantity }) => sum + (item.price * quantity), 0))}
                        </span>
                      </div>
                      <button
                        disabled={(orderTypeInput === 'dine-in' && !selectedTable) || currentOrderItems.length === 0 || isSubmitting}
                        onClick={saveOrder}
                        className="w-full bg-primary text-primary-foreground py-3 sm:py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 text-sm"
                      >
                        {isSubmitting ? (
                          <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 size={20} />
                            {editingOrder ? 'Update Order' : 'Confirm Order'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settle Bill Modal */}
      {isSettlingBill && settlingOrder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsSettlingBill(false)} />
          <div className="relative bg-card w-full max-w-2xl max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col border border-border overflow-hidden mx-auto">
            <div className="p-10 border-b border-border flex items-center justify-between bg-background/30 flex-shrink-0">
              <div>
                <h2 className="text-3xl font-black text-foreground tracking-tight">Settle Bill</h2>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Order #{settlingOrder.id.slice(-6).toUpperCase()}</p>
              </div>
              <button onClick={() => setIsSettlingBill(false)} className="p-3 hover:bg-background rounded-2xl transition-all">
                <X size={24} className="text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-10 space-y-6 sm:space-y-8">
              {/* Payment Method Selection */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Payment Method</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 sm:gap-4">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${paymentMethod === 'cash' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <Banknote size={24} className="sm:w-8 sm:h-8" />
                    <span className="font-black uppercase text-[8px] sm:text-[10px]">Cash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${paymentMethod === 'card' ? 'bg-blue-500/10 border-blue-500 text-blue-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <CreditCard size={24} className="sm:w-8 sm:h-8" />
                    <span className="font-black uppercase text-[8px] sm:text-[10px]">Card</span>
                  </button>
                  <button
                    onClick={() => {
                      setPaymentMethod('online');
                      setAmountReceived((getAmountToPay() / 100).toString());
                    }}
                    className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${paymentMethod === 'online' ? 'bg-sky-500/10 border-sky-500 text-sky-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <LayoutGrid size={24} className="sm:w-8 sm:h-8" />
                    <span className="font-black uppercase text-[8px] sm:text-[10px]">Online</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('multi')}
                    className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${paymentMethod === 'multi' ? 'bg-purple-500/10 border-purple-500 text-purple-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <Split size={24} className="sm:w-8 sm:h-8" />
                    <span className="font-black uppercase text-[8px] sm:text-[10px]">Multi</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('open bill')}
                    className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 flex flex-col items-center gap-2 sm:gap-3 transition-all ${paymentMethod === 'open bill' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <Receipt size={24} className="sm:w-8 sm:h-8" />
                    <span className="font-black uppercase text-[8px] sm:text-[10px]">Account</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('talabat')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'talabat' ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-orange-500/20 rounded-full flex items-center justify-center font-black text-[10px] text-orange-500">T</div>
                    <span className="font-black uppercase text-[8px]">Talabat</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('deliveroo')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'deliveroo' ? 'bg-cyan-500/10 border-cyan-500 text-cyan-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-cyan-500/20 rounded-full flex items-center justify-center font-black text-[10px] text-cyan-500">D</div>
                    <span className="font-black uppercase text-[8px]">Deliveroo</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('careem')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'careem' ? 'bg-emerald-600/10 border-emerald-600 text-emerald-600' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-emerald-600/20 rounded-full flex items-center justify-center font-black text-[10px] text-emerald-600">C</div>
                    <span className="font-black uppercase text-[8px]">Careem</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('noon')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'noon' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-600' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-yellow-500/20 rounded-full flex items-center justify-center font-black text-[10px] text-yellow-600">N</div>
                    <span className="font-black uppercase text-[8px]">Noon</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('zomato')}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'zomato' ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-card border-border text-muted-foreground hover:border-muted'
                      }`}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-500/20 rounded-full flex items-center justify-center font-black text-[10px] text-red-500">Z</div>
                    <span className="font-black uppercase text-[8px]">Zomato</span>
                  </button>
                </div>
              </div>

              {/* Split Bill Option */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-background/30 rounded-3xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-card rounded-2xl flex items-center justify-center shadow-sm border border-border">
                      <Split className="text-primary" size={24} />
                    </div>
                    <div>
                      <p className="font-black text-foreground uppercase text-xs">Split Bill</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">Divide total among guests</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {isSplitBill && !isSplitByItem && (
                      <div className="flex items-center gap-3 bg-card px-4 py-2 rounded-xl border border-border">
                        <button onClick={() => setNumberOfSplits(Math.max(2, numberOfSplits - 1))} className="text-muted-foreground hover:text-primary">-</button>
                        <span className="font-black text-sm text-foreground">{numberOfSplits}</span>
                        <button onClick={() => setNumberOfSplits(numberOfSplits + 1)} className="text-muted-foreground hover:text-primary">+</button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setIsSplitBill(!isSplitBill);
                        if (isSplitBill) {
                          setIsSplitByItem(false);
                          setSelectedSplitItems([]);
                        }
                      }}
                      className={`w-14 h-8 rounded-full transition-all relative ${isSplitBill ? 'bg-primary' : 'bg-background'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-card rounded-full transition-all ${isSplitBill ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                {isSplitBill && (
                  <div className="flex gap-2 p-1 bg-background rounded-2xl">
                    <button
                      onClick={() => { setIsSplitByItem(false); setIsSplitByAmount(false); setSelectedSplitItems([]); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(!isSplitByItem && !isSplitByAmount) ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                    >
                      Equal Split
                    </button>
                    <button
                      onClick={() => { setIsSplitByItem(false); setIsSplitByAmount(true); setSelectedSplitItems([]); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSplitByAmount ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                    >
                      By Amount
                    </button>
                    <button
                      onClick={() => { setIsSplitByItem(true); setIsSplitByAmount(false); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSplitByItem ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}
                    >
                      By Item
                    </button>
                  </div>
                )}

                {isSplitBill && isSplitByAmount && (
                  <div className="space-y-3 p-6 bg-background/30 rounded-3xl">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Amount to Pay Now</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">{currencySymbol}</div>
                      <input
                        type="number"
                        value={splitAmount}
                        onChange={(e) => setSplitAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-card border-2 border-border rounded-2xl pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all text-foreground"
                      />
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Remaining: {formatCurrency(settlingOrder.total - (parseFloat(splitAmount) * 100 || 0))}</p>
                  </div>
                )}

                {isSplitBill && isSplitByItem && (
                  <div className="space-y-3 p-6 bg-background/30 rounded-3xl">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Select Items to Pay</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {settlingOrder.items.map((item, idx) => {
                        const selected = selectedSplitItems.find(si => si.itemId === item.itemId);
                        const selectedQty = selected?.quantity || 0;

                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-card rounded-2xl border border-border">
                            <div className="flex-1">
                              <p className="text-sm font-bold text-foreground">{item.name}</p>
                              <p className="text-[10px] font-bold text-muted-foreground">{formatCurrency(item.price)} each</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => {
                                  const newSelected = [...selectedSplitItems];
                                  const sIdx = newSelected.findIndex(si => si.itemId === item.itemId);
                                  if (sIdx !== -1) {
                                    if (newSelected[sIdx].quantity > 1) {
                                      newSelected[sIdx].quantity--;
                                    } else {
                                      newSelected.splice(sIdx, 1);
                                    }
                                  }
                                  setSelectedSplitItems(newSelected);
                                }}
                                className="w-8 h-8 flex items-center justify-center bg-background text-muted-foreground rounded-lg hover:bg-background/80"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-black text-sm text-foreground">{selectedQty} / {item.quantity}</span>
                              <button
                                onClick={() => {
                                  const newSelected = [...selectedSplitItems];
                                  const sIdx = newSelected.findIndex(si => si.itemId === item.itemId);
                                  if (sIdx !== -1) {
                                    if (newSelected[sIdx].quantity < item.quantity) {
                                      newSelected[sIdx].quantity++;
                                    }
                                  } else {
                                    newSelected.push({ itemId: item.itemId, name: item.name, price: item.price, quantity: 1 });
                                  }
                                  setSelectedSplitItems(newSelected);
                                }}
                                className="w-8 h-8 flex items-center justify-center bg-primary/10 text-primary rounded-lg hover:bg-primary/20"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Cash Calculation */}
              {paymentMethod === 'cash' && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Amount Received</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">{currencySymbol}</div>
                      <input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-card border-2 border-border rounded-[1.5rem] pl-14 pr-6 py-4 text-xl font-black text-foreground focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Change to Return</label>
                    <div className="bg-emerald-500/10 border-2 border-emerald-500/20 rounded-[1.5rem] px-6 py-4">
                      <p className="text-2xl font-black text-emerald-500">
                        {amountReceived ? formatCurrency(Math.max(0, parseFloat(amountReceived) * 100 - getAmountToPay())) : formatCurrency(0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Multi Payment Inputs */}
              {paymentMethod === 'multi' && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Cash Received</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">{currencySymbol}</div>
                      <input
                        type="number"
                        value={multiPayment.cash}
                        onChange={(e) => setMultiPayment({ ...multiPayment, cash: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-card border-2 border-border rounded-[1.5rem] pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all text-foreground"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Card Amount</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">{currencySymbol}</div>
                      <input
                        type="number"
                        value={multiPayment.card}
                        onChange={(e) => setMultiPayment({ ...multiPayment, card: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-card border-2 border-border rounded-[1.5rem] pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all text-foreground"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Change to Return</label>
                    <div className="bg-emerald-500/10 border-2 border-emerald-500/20 rounded-[1.5rem] px-6 py-4">
                      <p className="text-2xl font-black text-emerald-500">
                        {formatCurrency(Math.max(0, ((parseFloat(multiPayment.cash) || 0) + (parseFloat(multiPayment.card) || 0)) * 100 - getAmountToPay()))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="pt-8 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total to Pay</p>
                  <p className="text-4xl font-black text-primary">
                    {formatCurrency(getAmountToPay())}
                    {isSplitBill && !isSplitByItem && !isSplitByAmount && <span className="text-sm text-muted-foreground ml-2 font-bold">per person</span>}
                    {isSplitByItem && <span className="text-sm text-muted-foreground ml-2 font-bold">selected items</span>}
                    {isSplitByAmount && <span className="text-sm text-muted-foreground ml-2 font-bold">custom amount</span>}
                  </p>
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      if (isSplitByItem && selectedSplitItems.length > 0) {
                        printBill({ ...settlingOrder, items: selectedSplitItems, total: selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0) });
                      } else {
                        printBill(settlingOrder);
                      }
                    }}
                    className="bg-background text-foreground px-8 py-5 rounded-[2rem] font-black uppercase tracking-widest hover:bg-background/80 transition-all flex items-center justify-center gap-3"
                  >
                    <Printer size={20} />
                    Print Bill
                  </button>
                  <button
                    onClick={settleBill}
                    disabled={
                      !paymentMethod ||
                      (isSplitByItem && selectedSplitItems.length === 0) ||
                      (isSplitByAmount && (!splitAmount || parseFloat(splitAmount) <= 0)) ||
                      (paymentMethod === 'cash' && (!amountReceived || parseFloat(amountReceived) * 100 < getAmountToPay())) ||
                      isSubmitting
                    }
                    className="bg-primary text-primary-foreground px-12 py-5 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      <div className="w-6 h-6 border-4 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Finalize Payment'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-24 h-24 bg-background rounded-full flex items-center justify-center">
              <ShoppingBag size={48} className="text-muted-foreground/30" />
            </div>
            <div>
              <h3 className="text-xl font-black text-foreground">No Active Orders</h3>
              <p className="text-muted-foreground font-medium">Click "New Dine-In" or "Takeaway" to start a new order.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredOrders.map(order => {
              const t = getElapsed(order);
              return (
                <div key={order.id} className={`bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all relative ${openDropdownId === order.id ? 'min-h-[520px]' : 'h-[340px] sm:h-[380px]'}`}>
                  {/* Header */}
                  <div className="p-3 bg-background/30 border-b flex items-center justify-between shrink-0 border-border">
                    <div className="flex items-center gap-2">
                      <div className={`text-white p-1.5 rounded-lg ${order.orderType === 'dine-in' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                        {order.orderType === 'dine-in' ? <Utensils size={14} /> : <ShoppingBag size={14} />}
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${order.orderType === 'dine-in' ? 'text-emerald-600' : 'text-blue-600'}`}>{order.orderType}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-background rounded-md border border-border bg-opacity-50 shadow-sm">
                        <Clock size={12} className={t.cClass} />
                        <span className={`text-[10px] font-black tracking-widest ${t.cClass}`}>{t.t}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[11px] font-black text-foreground">
                          {order.orderNo ? `Order #${order.orderNo} ` : `Order #${order.id.slice(-4).toUpperCase()} `}
                          {order.orderType === 'dine-in' ? `(T${order.tableNumber})` : ''}
                        </span>
                        {order.kotNo && <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none">KOT #{order.kotNo}</span>}
                      </div>
                      <button
                        onClick={() => setOpenDropdownId(openDropdownId === order.id ? null : order.id)}
                        className="p-1 hover:bg-background rounded-md transition-colors border border-transparent hover:border-border"
                      >
                        <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-300 ${openDropdownId === order.id ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Time Bar Slider */}
                  <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-600 relative shrink-0 shadow-[inset_0_1px_rgba(0,0,0,0.2)] border-b border-border/50">
                    <div className="absolute top-0 bottom-0 w-1.5 bg-card shadow-[0_0_8px_rgba(0,0,0,0.8)] transition-all duration-1000 ease-linear rounded-full transform -translate-x-1/2 z-10" style={{ left: t.w }}></div>
                  </div>

                  {/* Expanded Menu */}
                  {openDropdownId === order.id && (
                    <div className="bg-background/30 border-b border-border grid grid-cols-2 gap-1 p-2 shrink-0">
                      {[
                        { icon: User, label: 'Covers', onClick: () => { setActiveOrder(order); setOccupancyInput(order.occupancy?.toString() || ''); setIsGuestModalOpen(true); setOpenDropdownId(null); } },
                        {
                          icon: Users, label: 'Guest', onClick: async () => {
                            try {
                              await updateDoc(doc(db, 'orders', order.id), {
                                customerId: 'guest',
                                customerName: 'Guest Customer',
                                customerPhone: 'N/A',
                                occupancy: 1 // Default to 1 guest if unassigned
                              });
                              setOpenDropdownId(null);
                            } catch (err) {
                              handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
                            }
                          }
                        },
                        { icon: Calendar, label: 'Type', onClick: () => { setActiveOrder(order); setOrderTypeInput(order.orderType); setIsUpdateOrderModalOpen(true); setOpenDropdownId(null); } },
                        { icon: Tag, label: 'Discount', onClick: () => { setActiveOrder(order); setDiscountInput(order.discount?.toString() || ''); setIsDiscountModalOpen(true); setOpenDropdownId(null); } },
                        { icon: Users, label: 'Customer', onClick: () => { setActiveOrder(order); setIsCustomerModalOpen(true); setOpenDropdownId(null); } },
                        { icon: Move, label: 'Table', onClick: () => { setActiveOrder(order); setNewTableId(order.tableId || ''); setIsChangeTableModalOpen(true); setOpenDropdownId(null); } },
                        { icon: Pencil, label: 'Note', onClick: () => { setActiveOrder(order); setNoteInput(order.notes || ''); setIsNoteModalOpen(true); setOpenDropdownId(null); } },
                        {
                          icon: ShoppingBag,
                          label: 'Modify',
                          onClick: () => {
                            setEditingOrder(order);
                            setSelectedTable(tables.find(t => t.id === order.tableId) || null);
                            setCurrentOrderItems(order.items.map(item => {
                              const menuItem = menuItems.find(m => m.id === item.itemId);
                              return {
                                item: menuItem || { id: item.itemId, name: item.name, price: item.price, category: '', available: true, image: '', description: '' },
                                quantity: item.quantity
                              };
                            }));
                            setPosStep('menu');
                            setIsNewOrderModalOpen(true);
                            setOpenDropdownId(null);
                          }
                        },
                        { icon: Maximize2, label: 'Maximize', onClick: () => { setActiveOrder(order); setIsMaximizeModalOpen(true); setOpenDropdownId(null); } },
                        { icon: Printer, label: 'Print Bill', onClick: () => { printBill(order); setOpenDropdownId(null); } },
                        { icon: ChefHat, label: 'Reprint KOT', onClick: () => { printKOT(order, true); setOpenDropdownId(null); } },
                      ].map((action, idx) => (
                        <button
                          key={idx}
                          onClick={action.onClick}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-background rounded-lg transition-colors text-left group"
                        >
                          <action.icon size={14} className="text-muted-foreground group-hover:text-primary" />
                          <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground uppercase">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Status Bar */}
                  <div className={`px-4 py-2 flex items-center justify-center gap-2 ${getStatusColor(order.status)}`}>
                    <CheckCircle2 size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{order.status}</span>
                  </div>

                  {/* Items List */}
                  <div className="flex-1 p-4 overflow-y-auto bg-background/10">
                    <div className="space-y-3">
                      {order.notes && (
                        <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                          <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Order Notes</p>
                          <p className="text-xs font-bold text-amber-200">{order.notes}</p>
                        </div>
                      )}
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start">
                          <div className="flex gap-3">
                            <span className="font-black text-muted-foreground">{item.quantity}x</span>
                            <div>
                              <p className="font-bold text-sm text-foreground">{item.name}</p>
                              {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                            </div>
                          </div>
                          <span className="font-bold text-sm text-foreground">{formatCurrency(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="p-4 bg-card border-t border-border">
                    {order.discount && order.discount > 0 ? (
                      <>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">Subtotal</span>
                          <span className="text-sm font-bold text-muted-foreground">
                            {formatCurrency(order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0))}
                          </span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">
                            Discount {order.discountType === 'percentage' ? `(${order.discount}%)` : ''}
                          </span>
                          <span className="text-sm font-black text-red-500">
                            -{formatCurrency(order.discountType === 'percentage'
                              ? Math.round(order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0) * (order.discount / 100))
                              : Math.round(order.discount * 100)
                            )}
                          </span>
                        </div>
                      </>
                    ) : null}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Total</span>
                      <span className="text-lg font-black text-emerald-500">{formatCurrency(order.total)}</span>
                    </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="p-2 grid grid-cols-2 gap-2 bg-background/30 border-t border-border">
                    {order.status !== 'finalized' ? (
                      <button
                        onClick={() => {
                          setClearanceCallback(() => () => {
                            updateOrderStatus(order.id, 'cancelled');
                          });
                          setIsClearanceModalOpen(true);
                        }}
                        className="flex flex-col items-center gap-1 bg-red-600 text-white py-2 rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                      >
                        <Ban size={16} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Revoke</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => printBill(order)}
                        className="flex flex-col items-center gap-1 bg-zinc-600 text-white py-2 rounded-xl hover:bg-zinc-700 transition-all shadow-lg shadow-zinc-600/20"
                      >
                        <Printer size={16} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Re-print</span>
                      </button>
                    )}
                    {getNextStatus(order.status) ? (
                      <button
                        onClick={() => {
                          if (order.status === 'awaiting-bill') {
                            setSettlingOrder(order);
                            setPaymentMethod(''); // Reset to ensure fresh choice
                            setIsSettlingBill(true);
                          } else {
                            updateOrderStatus(order.id, getNextStatus(order.status)!);
                          }
                        }}
                        className="flex flex-col items-center gap-1 bg-emerald-600 text-white py-2 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                      >
                        <CheckCircle2 size={16} />
                        <span className="text-[8px] font-black uppercase tracking-widest">{getStatusText(order.status)}</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="flex flex-col items-center gap-1 bg-background text-muted-foreground py-2 rounded-xl cursor-not-allowed"
                      >
                        <CheckCircle2 size={16} />
                        <span className="text-[8px] font-black uppercase tracking-widest">Completed</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Guest Modal (Covers) */}
      {isGuestModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-foreground">Number of Covers</h3>
            <input
              type="number"
              value={occupancyInput}
              onChange={(e) => setOccupancyInput(e.target.value)}
              className="w-full bg-background/50 border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground focus:border-primary outline-none transition-all"
              placeholder="Enter number of guests"
            />
            <div className="flex gap-2">
              <button onClick={() => setIsGuestModalOpen(false)} className="flex-1 py-3 bg-background text-muted-foreground hover:bg-background/80 rounded-xl font-bold transition-all">Cancel</button>
              <button onClick={handleUpdateGuest} className="flex-1 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold transition-all">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Update Order Details Modal */}
      {isUpdateOrderModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-foreground">Update Order Details</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Order Type</label>
              <select
                value={orderTypeInput}
                onChange={(e) => setOrderTypeInput(e.target.value as Order['orderType'])}
                className="w-full bg-background/50 border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground focus:border-primary outline-none transition-all"
              >
                <option value="dine-in">Dine-In</option>
                <option value="take-out">Take-Out</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>
            {orderTypeInput === 'delivery' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Assign Driver</label>
                <select
                  value={driverIdInput}
                  onChange={(e) => setDriverIdInput(e.target.value)}
                  className="w-full bg-background/50 border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground focus:border-primary outline-none transition-all"
                >
                  <option value="">Select Driver</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.vehicle})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setIsUpdateOrderModalOpen(false)} className="flex-1 py-3 bg-background text-muted-foreground hover:bg-background/80 rounded-xl font-bold transition-all">Cancel</button>
              <button onClick={handleUpdateOrderDetails} className="flex-1 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold transition-all">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {isDiscountModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-foreground">Apply Discount</h3>
            {discountError && <p className="text-red-500 text-sm font-bold">{discountError}</p>}
            <div className="flex gap-2 p-1 bg-background rounded-xl">
              <button
                onClick={() => setDiscountTypeInput('amount')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${discountTypeInput === 'amount' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
              >
                Amount
              </button>
              <button
                onClick={() => setDiscountTypeInput('percentage')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${discountTypeInput === 'percentage' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'
                  }`}
              >
                Percentage
              </button>
            </div>
            <input
              type="number"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-full bg-background/50 border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground focus:border-primary outline-none transition-all"
              placeholder={discountTypeInput === 'amount' ? "Enter discount amount" : "Enter discount percentage (%)"}
            />
            <input
              type="password"
              value={clearanceCodeInput}
              onChange={(e) => setClearanceCodeInput(e.target.value)}
              className="w-full bg-background/50 border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground focus:border-primary outline-none transition-all"
              placeholder="Manager Clearance Code (1234)"
            />
            <div className="flex gap-2">
              <button onClick={() => setIsDiscountModalOpen(false)} className="flex-1 py-3 bg-background text-muted-foreground hover:bg-background/80 rounded-xl font-bold transition-all">Cancel</button>
              <button onClick={handleUpdateDiscount} className="flex-1 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold transition-all">Save</button>
            </div>
          </div>
        </div>
      )}      {/* Note Modal */}
      {isNoteModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-foreground">Modify Note</h3>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-background/50 border-2 border-border rounded-xl px-4 py-3 font-bold text-foreground focus:border-primary outline-none min-h-[100px] transition-all"
              placeholder="Enter order note..."
            />
            <div className="flex gap-2">
              <button onClick={() => setIsNoteModalOpen(false)} className="flex-1 py-3 bg-background text-muted-foreground hover:bg-background/80 rounded-xl font-bold transition-all">Cancel</button>
              <button onClick={handleUpdateNote} className="flex-1 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold transition-all">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Table Modal */}
      {isChangeTableModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-sm p-6 space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-foreground">Change Table</h3>
            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
              {tables.filter(t => t.status === 'available' || t.id === activeOrder.tableId).map(table => (
                <button
                  key={table.id}
                  onClick={() => setNewTableId(table.id)}
                  className={`p-3 rounded-xl border-2 font-bold transition-all ${newTableId === table.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background/50 text-muted-foreground hover:border-muted-foreground/30'
                    }`}
                >
                  {table.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsChangeTableModalOpen(false)} className="flex-1 py-3 bg-background text-muted-foreground hover:bg-background/80 rounded-xl font-bold transition-all">Cancel</button>
              <button
                onClick={handleChangeTable}
                disabled={!newTableId || newTableId === activeOrder.tableId}
                className="flex-1 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-bold disabled:opacity-50 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {isCustomerModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md p-8 space-y-6 shadow-2xl">
            <h3 className="text-2xl font-black text-foreground tracking-tight">Assign Customer</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-background/50 border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium transition-all"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => handleAssignCustomer(customer)}
                  className="w-full text-left p-4 bg-background/30 hover:bg-background/50 rounded-xl transition-colors border border-border"
                >
                  <p className="font-bold text-foreground">{customer.name}</p>
                  <p className="text-sm text-muted-foreground">{customer.phone}</p>
                </button>
              ))}
              {customers.length === 0 && (
                <p className="text-center text-muted-foreground py-4">No customers found.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsCustomerModalOpen(false); setCustomerSearch(''); }} className="flex-1 py-3 bg-background text-muted-foreground hover:bg-background/80 rounded-xl font-bold transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Maximize Modal */}
      {isMaximizeModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-3xl w-full max-w-5xl p-8 space-y-8 h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center border-b border-border pb-6">
              <div>
                <h3 className="text-4xl font-black text-foreground tracking-tight">Order #{activeOrder.id.slice(-6).toUpperCase()}</h3>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mt-2">Placed at {activeOrder.createdAt?.toDate().toLocaleTimeString()}</p>
              </div>
              <button onClick={() => setIsMaximizeModalOpen(false)} className="p-3 hover:bg-background rounded-full transition-colors">
                <X size={28} className="text-muted-foreground" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-8 custom-scrollbar pr-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-background/30 p-6 rounded-2xl border border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Order Type</p>
                  <p className="font-black text-2xl text-foreground uppercase">{activeOrder.orderType}</p>
                </div>
                <div className="bg-background/30 p-6 rounded-2xl border border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Status</p>
                  <p className="font-black text-2xl text-foreground uppercase">{activeOrder.status}</p>
                </div>
                <div className="bg-background/30 p-6 rounded-2xl border border-border">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Table</p>
                  <p className="font-black text-2xl text-foreground">{activeOrder.tableNumber || 'N/A'}</p>
                </div>
                <div className="bg-emerald-500/10 p-6 rounded-2xl border border-emerald-500/20">
                  <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2">Total Amount</p>
                  <p className="font-black text-3xl text-emerald-500">{formatCurrency(activeOrder.total)}</p>
                </div>
              </div>

              {activeOrder.notes && (
                <div className="bg-amber-500/10 p-6 rounded-2xl border border-amber-500/20">
                  <h4 className="text-xs font-black text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Pencil size={14} /> Order Notes
                  </h4>
                  <p className="text-lg font-bold text-amber-200">{activeOrder.notes}</p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4">Order Items</h4>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-background/50 border-b border-border">
                      <tr>
                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Item</th>
                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">Qty</th>
                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Price</th>
                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activeOrder.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-background/30 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-foreground text-lg">{item.name}</p>
                            {item.notes && <p className="text-sm font-medium text-muted-foreground mt-1">{item.notes}</p>}
                          </td>
                          <td className="p-4 text-center">
                            <span className="inline-flex items-center justify-center w-10 h-10 bg-background rounded-xl font-black text-foreground">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="p-4 text-right font-bold text-muted-foreground">{formatCurrency(item.price)}</td>
                          <td className="p-4 text-right font-black text-foreground text-lg">{formatCurrency(item.price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {activeOrder.discount ? (
                <div className="flex justify-end">
                  <div className="w-72 bg-background/30 p-6 rounded-2xl border border-border space-y-3">
                    <div className="flex justify-between items-center text-sm font-bold text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatCurrency(activeOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0))}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm font-bold text-red-500">
                      <span>Discount {activeOrder.discountType === 'percentage' ? `(${activeOrder.discount}%)` : ''}</span>
                      <span>-{formatCurrency(activeOrder.discountType === 'percentage'
                        ? Math.round(activeOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0) * (activeOrder.discount / 100))
                        : Math.round(activeOrder.discount * 100)
                      )}</span>
                    </div>
                    <div className="pt-3 border-t border-border flex justify-between items-center">
                      <span className="font-black text-foreground uppercase tracking-widest">Total</span>
                      <span className="text-2xl font-black text-emerald-500">{formatCurrency(activeOrder.total)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Clearance Modal */}
      {isClearanceModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-[2.5rem] border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck size={32} />
                </div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Manager Clearance</h3>
                <p className="text-sm text-muted-foreground font-medium">Enter clearance code to proceed</p>
              </div>

              <div className="space-y-4">
                <input
                  type="password"
                  autoFocus
                  value={clearanceCodeInput}
                  onChange={(e) => setClearanceCodeInput(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-background/50 border-2 border-border rounded-2xl px-6 py-4 text-center text-3xl font-black tracking-[1em] focus:border-primary outline-none transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (clearanceCodeInput === '1234') {
                        clearanceCallback?.();
                        setIsClearanceModalOpen(false);
                        setClearanceCodeInput('');
                        setClearanceCallback(null);
                      } else {
                        alert("Invalid Clearance Code");
                      }
                    }
                  }}
                />

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setIsClearanceModalOpen(false);
                      setClearanceCodeInput('');
                      setClearanceCallback(null);
                    }}
                    className="py-4 rounded-2xl font-black uppercase tracking-widest text-xs text-muted-foreground hover:bg-background transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (clearanceCodeInput === '1234') {
                        clearanceCallback?.();
                        setIsClearanceModalOpen(false);
                        setClearanceCodeInput('');
                        setClearanceCallback(null);
                      } else {
                        alert("Invalid Clearance Code");
                      }
                    }}
                    className="py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* End Session / Z-Report Modal */}
      {isEndingSession && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-card w-full max-w-lg rounded-[2.5rem] p-8 border border-border shadow-2xl animate-in zoom-in-95">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock size={40} />
              </div>
              <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">End Session</h2>
              <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest mt-1">Daily Reconciliation Summary</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="p-4 bg-background rounded-2xl border border-border">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Sales</p>
                <p className="text-2xl font-black text-foreground">{formatCurrency(sessionTotals.total)}</p>
              </div>
              <div className="p-4 bg-background rounded-2xl border border-border">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Order Count</p>
                <p className="text-2xl font-black text-foreground">{sessionTotals.count}</p>
              </div>
              <div className="p-4 bg-background rounded-2xl border border-border">
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Cash</p>
                <p className="text-xl font-black text-foreground">{formatCurrency(sessionTotals.cash)}</p>
              </div>
              <div className="p-4 bg-background rounded-2xl border border-border">
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Card</p>
                <p className="text-xl font-black text-foreground">{formatCurrency(sessionTotals.card)}</p>
              </div>
              <div className="p-4 bg-background rounded-2xl border border-border">
                <p className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Online</p>
                <p className="text-xl font-black text-foreground">{formatCurrency(sessionTotals.online)}</p>
              </div>
              <div className="p-4 bg-background rounded-2xl border border-border">
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Account / Open</p>
                <p className="text-xl font-black text-foreground">{formatCurrency(sessionTotals.openBill)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    // 1. Generate Z-Report
                    const today = new Date().toISOString().split('T')[0];
                    await addDoc(collection(db, 'zreports'), {
                      date: today,
                      totalSales: sessionTotals.total,
                      cashSales: sessionTotals.cash,
                      cardSales: sessionTotals.card,
                      onlineSales: sessionTotals.online,
                      openBillSales: sessionTotals.openBill,
                      totalOrders: sessionTotals.count,
                      generatedBy: user?.email || 'Unknown',
                      createdAt: serverTimestamp()
                    });

                    // 2. Handle Clock-out if applicable
                    const shiftsRef = collection(db, 'shifts');
                    const activeShiftQuery = query(
                      shiftsRef,
                      where('staffId', '==', user?.uid),
                      where('status', '==', 'present'),
                      limit(1)
                    );
                    const shiftSnap = await getDocs(activeShiftQuery);
                    if (!shiftSnap.empty) {
                      const shiftDoc = shiftSnap.docs[0];
                      await updateDoc(doc(db, 'shifts', shiftDoc.id), {
                        clockOut: serverTimestamp(),
                        status: 'off'
                      });
                    }

                    // Generate Z-Report document for accountability
                    await addDoc(collection(db, 'z_reports'), {
                      date: new Date().toISOString().split('T')[0],
                      terminationTime: new Date().toISOString(),
                      totals: sessionTotals,
                      terminalId: 'POS-TERMINAL',
                      storeId: 'MAIN-STORE',
                      userId: user?.uid,
                      status: 'finalized'
                    });

                    setIsEndingSession(false);
                    onClose();
                  } catch (err) {
                    handleFirestoreError(err, OperationType.CREATE, 'zreport_termination');
                  }
                }}
                className="w-full py-5 bg-primary text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all"
              >
                Zero Out & End Shift
              </button>
              <button
                onClick={() => setIsEndingSession(false)}
                className="w-full py-4 text-muted-foreground font-bold uppercase tracking-widest hover:bg-background rounded-2xl transition-all"
              >
                Back to POS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
