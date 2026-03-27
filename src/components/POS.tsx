import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, addDoc, serverTimestamp, getDocs, where, getDoc, limit } from 'firebase/firestore';
import { ShoppingBag, Clock, CheckCircle2, Ban, Phone, MapPin, User, Package, ArrowLeft, ChefHat, Truck, FileText, Printer, Plus, Utensils, LayoutGrid, CreditCard, Banknote, Receipt, Users, Split, Calculator, X, Bell, Maximize2, MoreVertical, ChevronDown, Calendar, Hash, Tag, Pencil, Move, Layout, Search, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../utils/format';
import { Order, MenuItem, Table, Category, Customer, CustomerGroup } from '../types';

interface POSProps {
  onClose: () => void;
}

export default function POS({ onClose }: POSProps) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [filter, setFilter] = useState<Order['status'] | 'all'>('all');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [posStep, setPosStep] = useState<'tables' | 'menu'>('tables');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isMergingTables, setIsMergingTables] = useState(false);
  const [selectedTablesToMerge, setSelectedTablesToMerge] = useState<Table[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentOrderItems, setCurrentOrderItems] = useState<{ item: MenuItem, quantity: number }[]>([]);
  
  const [isSettlingBill, setIsSettlingBill] = useState(false);
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'multi' | 'open bill'>('cash');
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

  // Notification sound for new orders
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3');
          audio.playbackRate = 0.8;
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
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
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
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);

  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Show only active orders in POS (not finalized or cancelled)
      setOrders(allOrders.filter(o => o.status !== 'cancelled' && o.status !== 'finalized'));
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

    return () => {
      unsubscribe();
      unsubscribeMenu();
      unsubscribeCats();
      unsubscribeTables();
      unsubscribeGroups();
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
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3');
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

  const printKOT = async (order: Order) => {
    // If print servers are configured, send to all servers
    if (printServerUrls.length > 0) {
      try {
        await Promise.all(printServerUrls.map(url => 
          fetch(`${url}/print-kot`, {
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
    if (!printWindow) {
      alert("Please allow popups for printing KOT.");
      return;
    }

    const itemsHtml = order.items.map(item => `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-family: monospace;">
        <span>${item.quantity}x ${item.name}</span>
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
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h2 style="margin: 0;">KITCHEN ORDER</h2>
            <p style="margin: 5px 0;">Order: #${order.id.slice(-6).toUpperCase()}</p>
            <p style="margin: 5px 0;">Type: ${order.orderType.toUpperCase()}</p>
            ${order.tableNumber ? `<p style="margin: 5px 0; font-size: 20px; font-weight: bold;">TABLE: ${order.tableNumber}</p>` : ''}
            <p style="margin: 5px 0;">Date: ${new Date().toLocaleString()}</p>
          </div>
          <div class="items">
            ${itemsHtml}
          </div>
          <div class="totals">
            <div class="item-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(subtotal)}</span>
            </div>
            ${order.discount ? `<div class="item-row"><span>Discount:</span><span>-${formatCurrency(discountAmount)}</span></div>` : ''}
            <div class="total-row">
              <span>TOTAL:</span>
              <span>${formatCurrency(total)}</span>
            </div>
          </div>
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
    const discountAmount = order.discountType === 'percentage' ? (subtotal * (order.discount / 100)) : (order.discount * 100);
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
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="header">
            <h2 style="margin: 0;">RIVAS RESTAURANT</h2>
            <p style="margin: 5px 0;">Order: #${order.id.slice(-6).toUpperCase()}</p>
            <p style="margin: 5px 0;">Type: ${order.orderType.toUpperCase()}</p>
            ${order.tableNumber ? `<p style="margin: 5px 0; font-size: 16px; font-weight: bold;">TABLE: ${order.tableNumber}</p>` : ''}
            <p style="margin: 5px 0;">Date: ${new Date().toLocaleString()}</p>
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
            <div class="total-row">
              <span>TOTAL:</span>
              <span>${formatCurrency(order.total)}</span>
            </div>
          </div>
          <div class="footer">
            <p>Thank you for your visit!</p>
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
      const total = currentOrderItems.reduce((sum, { item, quantity }) => sum + (item.price * quantity), 0);
      const orderData: any = {
        userId: user?.uid || 'walk-in',
        items: currentOrderItems.map(({ item, quantity }) => ({
          itemId: item.id,
          name: item.name,
          price: item.price,
          quantity
        })),
        total,
        status: editingOrder ? editingOrder.status : 'confirmed',
        orderType: orderTypeInput,
        tableNumber: selectedTable?.name || null,
        tableId: selectedTable?.id || null,
        notes: noteInput,
        updatedAt: serverTimestamp()
      };

      if (editingOrder) {
        await updateDoc(doc(db, 'orders', editingOrder.id), orderData);
        // Auto-print KOT on modification
        const updatedOrder = { ...editingOrder, ...orderData };
        printKOT(updatedOrder as Order);
      } else {
        orderData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'orders'), orderData);
        if (selectedTable) {
          const tableIds = selectedTable.id.split(',');
          for (const tId of tableIds) {
            await updateDoc(doc(db, 'tables', tId), { status: 'occupied' });
          }
        }
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
    try {
      for (const orderItem of order.items) {
        if (soldByPiece) {
          const menuItem = menuItems.find(item => item.id === orderItem.itemId);
          if (menuItem && menuItem.recipe && menuItem.recipe.length > 0) {
            for (const ingredient of menuItem.recipe) {
              const invRef = doc(db, 'inventory', ingredient.inventoryItemId);
              const invDoc = await getDoc(invRef);
              if (invDoc.exists()) {
                const currentStock = invDoc.data().stock || 0;
                const deduction = ingredient.quantity * orderItem.quantity;
                await updateDoc(invRef, {
                  stock: Math.max(0, currentStock - deduction),
                  lastUpdated: serverTimestamp()
                });
              }
            }
          } else {
            // Fallback to simple name matching if no recipe exists
            const q = query(collection(db, 'inventory'), where('name', '==', orderItem.name));
            const invSnap = await getDocs(q);
            if (!invSnap.empty) {
              const invDoc = invSnap.docs[0];
              const currentStock = invDoc.data().stock || 0;
              await updateDoc(invDoc.ref, {
                stock: Math.max(0, currentStock - orderItem.quantity),
                lastUpdated: serverTimestamp()
              });
            }
          }
        } else {
          // Deduct only the item itself (finished good)
          const q = query(collection(db, 'inventory'), where('name', '==', orderItem.name));
          const invSnap = await getDocs(q);
          if (!invSnap.empty) {
            const invDoc = invSnap.docs[0];
            const currentStock = invDoc.data().stock || 0;
            await updateDoc(invDoc.ref, {
              stock: Math.max(0, currentStock - orderItem.quantity),
              lastUpdated: serverTimestamp()
            });
          }
        }
      }
    } catch (err) {
      console.error("Inventory deduction failed:", err);
    }
  };

  const settleBill = async () => {
    if (!settlingOrder || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let amountToPay = settlingOrder.total;
      let itemsToPay = settlingOrder.items;

      if (isSplitByItem) {
        amountToPay = selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        itemsToPay = selectedSplitItems.map(si => ({
          itemId: si.itemId,
          name: si.name,
          price: si.price,
          quantity: si.quantity
        }));
      } else if (isSplitByAmount) {
        amountToPay = parseFloat(splitAmount) * 100;
        itemsToPay = [];
      } else if (isSplitBill) {
        amountToPay = Math.round(settlingOrder.total / numberOfSplits);
        itemsToPay = [];
      }

      const amount = paymentMethod === 'multi' ? (parseFloat(multiPayment.cash) * 100 || 0) + (parseFloat(multiPayment.card) * 100 || 0) : parseFloat(amountReceived) * 100 || 0;
      let change = 0;
      let cashAmount = 0;
      let cardAmount = 0;

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
      }

      const journalLines = [
        ...(cashAmount > 0 ? [{ accountId: 'cash', accountName: 'Cash', debit: cashAmount, credit: 0 }] : []),
        ...(cardAmount > 0 ? [{ accountId: 'bank', accountName: 'Bank', debit: cardAmount, credit: 0 }] : []),
        { accountId: 'sales', accountName: 'Sales Revenue', debit: 0, credit: amountToPay }
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
            amountReceived: amount,
            changeGiven: change,
            items: [],
            total: 0,
            completedAt: serverTimestamp()
          });
          if (settlingOrder.tableId) {
            const tableIds = settlingOrder.tableId.split(',');
            for (const tId of tableIds) {
              await updateDoc(doc(db, 'tables', tId), { status: 'available' });
            }
          }
        } else {
          // Partially paid
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            items: remainingItems,
            total: newTotal,
            notes: (settlingOrder.notes || '') + `\n[Partial Payment: ${formatCurrency(amountToPay)}]`
          });
        }

        // Record partial sale in journal
        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: amountToPay,
          description: `POS Partial Sale (By Item) - Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: itemsToPay
        });

        // Formal Journal Entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `POS-${settlingOrder.id.slice(-4).toUpperCase()}-P`,
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
            amountReceived: amount,
            changeGiven: change,
            total: 0,
            completedAt: serverTimestamp()
          });
          if (settlingOrder.tableId) {
            const tableIds = settlingOrder.tableId.split(',');
            for (const tId of tableIds) {
              await updateDoc(doc(db, 'tables', tId), { status: 'available' });
            }
          }
        } else {
          await updateDoc(doc(db, 'orders', settlingOrder.id), {
            total: remainingTotal,
            notes: (settlingOrder.notes || '') + `\n[Partial Payment: ${formatCurrency(amountToPay)}]`
          });
        }

        // Record partial sale in journal
        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: amountToPay,
          description: `POS Partial Sale - Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp()
        });

        // Formal Journal Entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `POS-${settlingOrder.id.slice(-4).toUpperCase()}-P`,
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
        // Full payment
        await updateDoc(doc(db, 'orders', settlingOrder.id), {
          status: 'finalized',
          paymentMethod,
          amountReceived: amount,
          changeGiven: change,
          completedAt: serverTimestamp()
        });
        if (settlingOrder.tableId) {
          const tableIds = settlingOrder.tableId.split(',');
          for (const tId of tableIds) {
            await updateDoc(doc(db, 'tables', tId), { status: 'available' });
          }
        }
        await deductInventory(settlingOrder);

        // Record sale in journal
        await addDoc(collection(db, 'journal'), {
          orderId: settlingOrder.id,
          type: 'sale',
          amount: settlingOrder.total,
          description: `POS Sale - Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
          timestamp: serverTimestamp(),
          items: settlingOrder.items
        });

        // Formal Journal Entry
        await addDoc(collection(db, 'journal_entries'), {
          date: new Date().toISOString().split('T')[0],
          reference: `POS-${settlingOrder.id.slice(-4).toUpperCase()}`,
          description: `Sale: Order #${settlingOrder.id.slice(-6).toUpperCase()}`,
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
        isPartial: true
      } as any);

      setIsSplitBill(false);
      setIsSplitByItem(false);
      setIsSplitByAmount(false);
      setSelectedSplitItems([]);
      setAmountReceived('');
      setSplitAmount('');
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
        const order = orderDoc.exists() ? { id: orderDoc.id, ...orderDoc.data() } as Order : null;
        if (order && order.tableId) {
          const tableIds = order.tableId.split(',');
          for (const tId of tableIds) {
            await updateDoc(doc(db, 'tables', tId), { status: 'available' });
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
    await updateOrderField(activeOrder.id, 'orderType', orderTypeInput);
    setIsUpdateOrderModalOpen(false);
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

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter);

  const getStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'paid': return 'bg-blue-500 text-white';
      case 'confirmed': return 'bg-amber-500 text-white';
      case 'preparing': return 'bg-orange-500 text-white';
      case 'serving': return 'bg-purple-500 text-white';
      case 'done-serving': return 'bg-indigo-500 text-white';
      case 'awaiting-bill': return 'bg-pink-500 text-white';
      case 'finalized': return 'bg-emerald-500 text-white';
      case 'cancelled': return 'bg-red-500 text-white';
      default: return 'bg-zinc-500 text-white';
    }
  };

  const getStatusText = (status: Order['status']) => {
    switch (status) {
      case 'pending': return 'Confirm Order';
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
      case 'pending': return 'confirmed';
      case 'confirmed': return 'preparing';
      case 'preparing': return 'serving';
      case 'serving': return 'done-serving';
      case 'done-serving': return 'awaiting-bill';
      case 'awaiting-bill': return 'finalized';
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col overflow-hidden">
      {/* POS Header */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 relative">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <img 
              src="https://res.cloudinary.com/htyeg8qey/image/upload/v1742727215/p03r5f8p99g6yit80h6k.png" 
              alt="Robotic ERP Logo" 
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="text-xl font-black text-zinc-900 tracking-tight leading-none">POS SYSTEM</h1>
              <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Live Order Management</p>
            </div>
          </div>
        </div>

        <div className="flex bg-zinc-100 p-1.5 rounded-xl overflow-x-auto max-w-2xl shadow-inner border border-zinc-200/50">
          {(['all', 'pending', 'confirmed', 'preparing', 'serving', 'done-serving', 'awaiting-bill', 'finalized'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                filter === s ? 'bg-white text-primary shadow-sm border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              {s.replace('-', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Active Orders</p>
            <p className="text-xl font-black text-zinc-900">{orders.length}</p>
          </div>
          <div className="w-px h-8 bg-zinc-200 hidden md:block"></div>
          <button 
            onClick={() => {
              setOrderTypeInput('take-out');
              setSelectedTable(null);
              setPosStep('menu');
              setIsNewOrderModalOpen(true);
            }}
            className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-black/10 hover:bg-zinc-800 transition-all hover:scale-105 active:scale-95"
          >
            <ShoppingBag size={18} /> Takeaway
          </button>
          <button 
            onClick={() => {
              setOrderTypeInput('dine-in');
              setPosStep('tables');
              setIsNewOrderModalOpen(true);
            }}
            className="bg-primary text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
          >
            <Utensils size={18} /> Dine-In
          </button>
        </div>
      </div>

      {/* New Order Modal */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsNewOrderModalOpen(false)} />
          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-8 border-b flex items-center justify-between">
              <div className="flex items-center gap-4">
                {posStep === 'menu' && orderTypeInput === 'dine-in' && (
                  <button 
                    onClick={() => setPosStep('tables')}
                    className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-500 transition-all"
                  >
                    <ArrowLeft size={24} />
                  </button>
                )}
                <div>
                  <h2 className="text-2xl font-black text-zinc-900">
                    {posStep === 'tables' ? 'Select Table' : selectedTable ? `Order for ${selectedTable.name}` : 'Takeaway Order'}
                  </h2>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    {posStep === 'tables' ? 'Step 1: Choose a location' : 'Step 2: Select menu items'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsNewOrderModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <Ban size={24} className="text-zinc-400" />
              </button>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              {posStep === 'tables' ? (
                <div className="flex-1 flex flex-col p-8 bg-zinc-50 m-4 rounded-[2.5rem] border-2 border-zinc-100 shadow-inner">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-black text-zinc-900">Select Table</h3>
                    <div className="flex items-center gap-4">
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
                          className="px-6 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors"
                        >
                          Confirm Merge ({selectedTablesToMerge.length})
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setIsMergingTables(!isMergingTables);
                          setSelectedTablesToMerge([]);
                        }}
                        className={`px-4 py-2 rounded-xl font-bold transition-colors ${
                          isMergingTables ? 'bg-amber-100 text-amber-700' : 'bg-white border-2 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                        }`}
                      >
                        {isMergingTables ? 'Cancel Merge' : 'Merge Tables'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto custom-scrollbar">
                    {tables.length === 0 ? (
                      <div className="flex flex-col items-center justify-center text-center h-full">
                        <div className="w-20 h-20 bg-zinc-100 rounded-full flex items-center justify-center mb-4">
                          <Layout className="text-zinc-300" size={40} />
                        </div>
                        <h3 className="text-xl font-bold text-zinc-900">No Tables Configured</h3>
                        <p className="text-zinc-500 max-w-xs mt-2">Please configure your restaurant layout in the Admin Panel's Tables section first.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {tables.map(table => {
                          const isSelectedForMerge = selectedTablesToMerge.some(t => t.id === table.id);
                          return (
                            <button
                              key={table.id}
                              disabled={table.status === 'occupied'}
                              onClick={() => {
                                if (isMergingTables) {
                                  if (isSelectedForMerge) {
                                    setSelectedTablesToMerge(selectedTablesToMerge.filter(t => t.id !== table.id));
                                  } else {
                                    setSelectedTablesToMerge([...selectedTablesToMerge, table]);
                                  }
                                } else {
                                  setSelectedTable(table);
                                  setPosStep('menu');
                                }
                              }}
                              className={`aspect-square flex flex-col items-center justify-center transition-all shadow-sm select-none rounded-2xl border-2 ${
                                table.status === 'occupied' 
                                  ? 'bg-amber-50 border-amber-200 opacity-60 cursor-not-allowed' 
                                  : isSelectedForMerge
                                    ? 'bg-primary/10 border-primary shadow-md scale-105'
                                    : 'bg-white border-zinc-100 hover:border-primary/30 hover:shadow-md'
                              }`}
                            >
                              <span className={`font-black text-lg ${table.status === 'occupied' ? 'text-amber-700' : isSelectedForMerge ? 'text-primary' : 'text-zinc-900'}`}>
                                {table.name}
                              </span>
                              <span className={`text-xs font-bold mt-1 ${table.status === 'occupied' ? 'text-amber-600/80' : isSelectedForMerge ? 'text-primary/80' : 'text-zinc-400'}`}>
                                Cap: {table.capacity}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Left: Menu with Categories */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex gap-2 overflow-x-auto custom-scrollbar bg-zinc-50/50">
                      <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                          selectedCategory === 'all' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-zinc-500 hover:bg-zinc-100'
                        }`}
                      >
                        All Items
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                            selectedCategory === cat.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white text-zinc-500 hover:bg-zinc-100'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 h-full">
                        {menuItems
                          .filter(item => selectedCategory === 'all' || item.category === selectedCategory)
                          .map(item => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setCurrentOrderItems(prev => {
                                  const existing = prev.find(i => i.item.id === item.id);
                                  if (existing) {
                                    return prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
                                  }
                                  return [...prev, { item, quantity: 1 }];
                                });
                              }}
                              className="bg-white rounded-2xl border border-zinc-100 hover:border-primary/30 hover:shadow-xl transition-all text-left flex flex-col overflow-hidden group"
                            >
                              <div className="h-32 w-full bg-zinc-100 relative">
                                {item.image ? (
                                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-300">
                                    <Utensils size={32} />
                                  </div>
                                )}
                              </div>
                              <div className="p-4 flex flex-col justify-between flex-1">
                                <div>
                                  <p className="font-bold text-zinc-900 group-hover:text-primary transition-colors line-clamp-2">{item.name}</p>
                                  {item.recipeDetails?.allergens && item.recipeDetails.allergens.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {item.recipeDetails.allergens.map((allergen, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
                                          <AlertTriangle size={10} /> {allergen}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm font-black text-primary mt-2">{formatCurrency(item.price)}</p>
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Current Selection */}
                  <div className="w-96 bg-zinc-50 p-8 flex flex-col border-l">
                    <div className="flex items-center justify-between mb-6">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Current Order</p>
                      <button 
                        onClick={() => setCurrentOrderItems([])}
                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
                      {currentOrderItems.map(({ item, quantity }, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-zinc-100">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">{item.name}</p>
                            <p className="text-[10px] font-bold text-zinc-400">{formatCurrency(item.price)} each</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => {
                                setCurrentOrderItems(prev => prev.map(i => i.item.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0));
                              }}
                              className="w-8 h-8 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-all"
                            >
                              -
                            </button>
                            <span className="text-sm font-black text-zinc-900 w-4 text-center">{quantity}</span>
                            <button 
                              onClick={() => {
                                setCurrentOrderItems(prev => prev.map(i => i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
                              }}
                              className="w-8 h-8 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-200 transition-all"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                      {currentOrderItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-300 gap-4">
                          <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-sm">
                            <ShoppingBag size={32} />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-widest">Empty Cart</p>
                        </div>
                      )}
                    </div>

                    <div className="pt-6 mt-6 border-t border-zinc-200 space-y-4">
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add order notes (e.g. allergies, special requests)..."
                        className="w-full bg-white border border-zinc-200 rounded-xl p-3 text-sm focus:border-primary outline-none resize-none h-20"
                      />
                      <div className="flex justify-between items-center mb-6">
                        <span className="text-xs font-bold text-zinc-400 uppercase">Total Amount</span>
                        <span className="text-3xl font-black text-primary">
                          {formatCurrency(currentOrderItems.reduce((sum, { item, quantity }) => sum + (item.price * quantity), 0))}
                        </span>
                      </div>
                      <button
                        disabled={(orderTypeInput === 'dine-in' && !selectedTable) || currentOrderItems.length === 0 || isSubmitting}
                        onClick={saveOrder}
                        className="w-full bg-primary text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settle Bill Modal */}
      {isSettlingBill && settlingOrder && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsSettlingBill(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden">
            <div className="p-10 border-b flex items-center justify-between bg-zinc-50/50">
              <div>
                <h2 className="text-3xl font-black text-zinc-900 tracking-tight">Settle Bill</h2>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Order #{settlingOrder.id.slice(-6).toUpperCase()}</p>
              </div>
              <button onClick={() => setIsSettlingBill(false)} className="p-3 hover:bg-zinc-200 rounded-2xl transition-all">
                <X size={24} className="text-zinc-400" />
              </button>
            </div>

            <div className="p-10 space-y-8">
              {/* Payment Method Selection */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Payment Method</p>
                <div className="grid grid-cols-4 gap-4">
                  <button
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-3 transition-all ${
                      paymentMethod === 'cash' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200'
                    }`}
                  >
                    <Banknote size={32} />
                    <span className="font-black uppercase text-xs">Cash</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('card')}
                    className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-3 transition-all ${
                      paymentMethod === 'card' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200'
                    }`}
                  >
                    <CreditCard size={32} />
                    <span className="font-black uppercase text-xs">Card</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('multi')}
                    className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-3 transition-all ${
                      paymentMethod === 'multi' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200'
                    }`}
                  >
                    <Split size={32} />
                    <span className="font-black uppercase text-xs">Multi</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('open bill')}
                    className={`p-6 rounded-3xl border-2 flex flex-col items-center gap-3 transition-all ${
                      paymentMethod === 'open bill' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200'
                    }`}
                  >
                    <Receipt size={32} />
                    <span className="font-black uppercase text-xs">Open Bill</span>
                  </button>
                </div>
              </div>

              {/* Split Bill Option */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-6 bg-zinc-50 rounded-3xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                      <Split className="text-primary" size={24} />
                    </div>
                    <div>
                      <p className="font-black text-zinc-900 uppercase text-xs">Split Bill</p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase">Divide total among guests</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {isSplitBill && !isSplitByItem && (
                      <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-zinc-200">
                        <button onClick={() => setNumberOfSplits(Math.max(2, numberOfSplits - 1))} className="text-zinc-400 hover:text-primary">-</button>
                        <span className="font-black text-sm">{numberOfSplits}</span>
                        <button onClick={() => setNumberOfSplits(numberOfSplits + 1)} className="text-zinc-400 hover:text-primary">+</button>
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
                      className={`w-14 h-8 rounded-full transition-all relative ${isSplitBill ? 'bg-primary' : 'bg-zinc-300'}`}
                    >
                      <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${isSplitBill ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                {isSplitBill && (
                  <div className="flex gap-2 p-1 bg-zinc-100 rounded-2xl">
                    <button 
                      onClick={() => { setIsSplitByItem(false); setIsSplitByAmount(false); setSelectedSplitItems([]); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(!isSplitByItem && !isSplitByAmount) ? 'bg-white text-primary shadow-sm' : 'text-zinc-500'}`}
                    >
                      Equal Split
                    </button>
                    <button 
                      onClick={() => { setIsSplitByItem(false); setIsSplitByAmount(true); setSelectedSplitItems([]); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSplitByAmount ? 'bg-white text-primary shadow-sm' : 'text-zinc-500'}`}
                    >
                      By Amount
                    </button>
                    <button 
                      onClick={() => { setIsSplitByItem(true); setIsSplitByAmount(false); }}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSplitByItem ? 'bg-white text-primary shadow-sm' : 'text-zinc-500'}`}
                    >
                      By Item
                    </button>
                  </div>
                )}

                {isSplitBill && isSplitByAmount && (
                  <div className="space-y-3 p-6 bg-zinc-50 rounded-3xl">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Amount to Pay Now</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">AED</div>
                      <input
                        type="number"
                        value={splitAmount}
                        onChange={(e) => setSplitAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white border-2 border-zinc-100 rounded-2xl pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all"
                      />
                    </div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Remaining: {formatCurrency(settlingOrder.total - (parseFloat(splitAmount) * 100 || 0))}</p>
                  </div>
                )}

                {isSplitBill && isSplitByItem && (
                  <div className="space-y-3 p-6 bg-zinc-50 rounded-3xl">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Select Items to Pay</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {settlingOrder.items.map((item, idx) => {
                        const selected = selectedSplitItems.find(si => si.itemId === item.itemId);
                        const selectedQty = selected?.quantity || 0;
                        
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-zinc-100">
                            <div className="flex-1">
                              <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                              <p className="text-[10px] font-bold text-zinc-400">{formatCurrency(item.price)} each</p>
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
                                className="w-8 h-8 flex items-center justify-center bg-zinc-100 text-zinc-400 rounded-lg hover:bg-zinc-200"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-black text-sm">{selectedQty} / {item.quantity}</span>
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
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Amount Received</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">AED</div>
                      <input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => setAmountReceived(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-[1.5rem] pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Change to Return</label>
                    <div className="bg-emerald-50 border-2 border-emerald-100 rounded-[1.5rem] px-6 py-4">
                      <p className="text-2xl font-black text-emerald-600">
                        {amountReceived ? formatCurrency(Math.max(0, parseFloat(amountReceived) * 100 - (isSplitByItem ? selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0) : isSplitByAmount ? parseFloat(splitAmount) * 100 || 0 : isSplitBill ? settlingOrder.total / numberOfSplits : settlingOrder.total))) : formatCurrency(0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Multi Payment Inputs */}
              {paymentMethod === 'multi' && (
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Cash Received</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">AED</div>
                      <input
                        type="number"
                        value={multiPayment.cash}
                        onChange={(e) => setMultiPayment({ ...multiPayment, cash: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-[1.5rem] pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Card Amount</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">AED</div>
                      <input
                        type="number"
                        value={multiPayment.card}
                        onChange={(e) => setMultiPayment({ ...multiPayment, card: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-[1.5rem] pl-14 pr-6 py-4 text-xl font-black focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 space-y-3">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Change to Return</label>
                    <div className="bg-emerald-50 border-2 border-emerald-100 rounded-[1.5rem] px-6 py-4">
                      <p className="text-2xl font-black text-emerald-600">
                        {formatCurrency(Math.max(0, ((parseFloat(multiPayment.cash) || 0) + (parseFloat(multiPayment.card) || 0)) * 100 - (isSplitByItem ? selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0) : isSplitByAmount ? parseFloat(splitAmount) * 100 || 0 : isSplitBill ? settlingOrder.total / numberOfSplits : settlingOrder.total)))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="pt-8 border-t border-zinc-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Total to Pay</p>
                  <p className="text-4xl font-black text-primary">
                    {isSplitByItem 
                      ? formatCurrency(selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0))
                      : isSplitByAmount
                        ? formatCurrency(parseFloat(splitAmount) * 100 || 0)
                        : isSplitBill 
                          ? formatCurrency(settlingOrder.total / numberOfSplits) 
                          : formatCurrency(settlingOrder.total)}
                    {isSplitBill && !isSplitByItem && !isSplitByAmount && <span className="text-sm text-zinc-400 ml-2 font-bold">per person</span>}
                    {isSplitByItem && <span className="text-sm text-zinc-400 ml-2 font-bold">selected items</span>}
                    {isSplitByAmount && <span className="text-sm text-zinc-400 ml-2 font-bold">custom amount</span>}
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
                    className="bg-zinc-100 text-zinc-900 px-8 py-5 rounded-[2rem] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-3"
                  >
                    <Printer size={20} />
                    Print Bill
                  </button>
                  <button
                    onClick={settleBill}
                    disabled={
                      (isSplitByItem && selectedSplitItems.length === 0) ||
                      (isSplitByAmount && (!splitAmount || parseFloat(splitAmount) <= 0)) ||
                      (paymentMethod === 'cash' && (!amountReceived || parseFloat(amountReceived) * 100 < (isSplitByItem ? selectedSplitItems.reduce((sum, i) => sum + (i.price * i.quantity), 0) : isSplitByAmount ? parseFloat(splitAmount) * 100 : isSplitBill ? settlingOrder.total / numberOfSplits : settlingOrder.total))) || 
                      isSubmitting
                    }
                    className="bg-zinc-900 text-white px-12 py-5 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl shadow-black/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" />
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
            <div className="w-24 h-24 bg-zinc-100 rounded-full flex items-center justify-center">
              <ShoppingBag size={48} className="text-zinc-300" />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-900">No Active Orders</h3>
              <p className="text-zinc-500 font-medium">Click "New Dine-In" or "Takeaway" to start a new order.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredOrders.map(order => (
              <div key={order.id} className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all relative">
                {/* Header */}
                <div className="p-4 bg-zinc-50 border-b border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`text-white p-1.5 rounded-lg ${order.orderType === 'dine-in' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                      {order.orderType === 'dine-in' ? <Utensils size={14} /> : <ShoppingBag size={14} />}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${order.orderType === 'dine-in' ? 'text-emerald-600' : 'text-blue-600'}`}>{order.orderType}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-zinc-900">{order.orderType === 'dine-in' ? `Table ${order.tableNumber}` : `#${order.id.slice(-4).toUpperCase()}`}</span>
                    <button 
                      onClick={() => setOpenDropdownId(openDropdownId === order.id ? null : order.id)}
                      className="p-1 hover:bg-zinc-200 rounded-lg transition-colors"
                    >
                      <ChevronDown size={16} className={`text-zinc-500 transition-transform ${openDropdownId === order.id ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                </div>
                  
                {/* Expanded Menu */}
                {openDropdownId === order.id && (
                  <div className="bg-zinc-50 border-b border-zinc-100 grid grid-cols-2 gap-1 p-2">
                    {[
                      { icon: User, label: 'Covers', onClick: () => { setActiveOrder(order); setOccupancyInput(order.occupancy?.toString() || ''); setIsGuestModalOpen(true); setOpenDropdownId(null); } },
                      { icon: Users, label: 'Guest', onClick: async () => { 
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
                      } },
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
                      { icon: Printer, label: 'Print', onClick: () => { printBill(order); setOpenDropdownId(null); } },
                    ].map((action, idx) => (
                      <button 
                        key={idx}
                        onClick={action.onClick}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-200 rounded-lg transition-colors text-left"
                      >
                        <action.icon size={14} className="text-zinc-500" />
                        <span className="text-[10px] font-bold text-zinc-700 uppercase">{action.label}</span>
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
                <div className="flex-1 p-4 overflow-y-auto bg-zinc-50/50">
                  <div className="space-y-3">
                    {order.notes && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/50">
                        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Order Notes</p>
                        <p className="text-xs font-bold text-amber-900">{order.notes}</p>
                      </div>
                    )}
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <span className="font-black text-zinc-400">{item.quantity}x</span>
                          <div>
                            <p className="font-bold text-sm text-zinc-900">{item.name}</p>
                            {item.notes && <p className="text-xs text-zinc-500 mt-0.5">{item.notes}</p>}
                          </div>
                        </div>
                        <span className="font-bold text-sm">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="p-4 bg-white border-t border-zinc-100">
                  {order.discount && order.discount > 0 ? (
                    <>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Subtotal</span>
                        <span className="text-sm font-bold text-zinc-600">
                          {formatCurrency(order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">
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
                    <span className="text-xs font-bold text-zinc-500 uppercase">Total</span>
                    <span className="text-lg font-black text-emerald-600">{formatCurrency(order.total)}</span>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-2 grid grid-cols-2 gap-2 bg-zinc-50 border-t border-zinc-100">
                  {order.status !== 'finalized' ? (
                    <button 
                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
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
                      className="flex flex-col items-center gap-1 bg-zinc-300 text-white py-2 rounded-xl cursor-not-allowed"
                    >
                      <CheckCircle2 size={16} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Completed</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Guest Modal (Covers) */}
      {isGuestModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-xl font-black">Number of Covers</h3>
            <input
              type="number"
              value={occupancyInput}
              onChange={(e) => setOccupancyInput(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none"
              placeholder="Enter number of guests"
            />
            <div className="flex gap-2">
              <button onClick={() => setIsGuestModalOpen(false)} className="flex-1 py-3 bg-zinc-100 rounded-xl font-bold">Cancel</button>
              <button onClick={handleUpdateGuest} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Update Order Details Modal */}
      {isUpdateOrderModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-xl font-black">Update Order Details</h3>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">Order Type</label>
              <select
                value={orderTypeInput}
                onChange={(e) => setOrderTypeInput(e.target.value as Order['orderType'])}
                className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none"
              >
                <option value="dine-in">Dine-In</option>
                <option value="take-out">Take-Out</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsUpdateOrderModalOpen(false)} className="flex-1 py-3 bg-zinc-100 rounded-xl font-bold">Cancel</button>
              <button onClick={handleUpdateOrderDetails} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {isDiscountModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-xl font-black">Apply Discount</h3>
            {discountError && <p className="text-red-500 text-sm font-bold">{discountError}</p>}
            <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl">
              <button
                onClick={() => setDiscountTypeInput('amount')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  discountTypeInput === 'amount' ? 'bg-white text-primary shadow-sm' : 'text-zinc-500'
                }`}
              >
                Amount
              </button>
              <button
                onClick={() => setDiscountTypeInput('percentage')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                  discountTypeInput === 'percentage' ? 'bg-white text-primary shadow-sm' : 'text-zinc-500'
                }`}
              >
                Percentage
              </button>
            </div>
            <input
              type="number"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none"
              placeholder={discountTypeInput === 'amount' ? "Enter discount amount" : "Enter discount percentage (%)"}
            />
            <input
              type="password"
              value={clearanceCodeInput}
              onChange={(e) => setClearanceCodeInput(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none"
              placeholder="Manager Clearance Code (1234)"
            />
            <div className="flex gap-2">
              <button onClick={() => setIsDiscountModalOpen(false)} className="flex-1 py-3 bg-zinc-100 rounded-xl font-bold">Cancel</button>
              <button onClick={handleUpdateDiscount} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {isNoteModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-xl font-black">Modify Note</h3>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-xl px-4 py-3 font-bold focus:border-primary outline-none min-h-[100px]"
              placeholder="Enter order note..."
            />
            <div className="flex gap-2">
              <button onClick={() => setIsNoteModalOpen(false)} className="flex-1 py-3 bg-zinc-100 rounded-xl font-bold">Cancel</button>
              <button onClick={handleUpdateNote} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Change Table Modal */}
      {isChangeTableModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-xl font-black">Change Table</h3>
            <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
              {tables.filter(t => t.status === 'available' || t.id === activeOrder.tableId).map(table => (
                <button
                  key={table.id}
                  onClick={() => setNewTableId(table.id)}
                  className={`p-3 rounded-xl border-2 font-bold transition-all ${
                    newTableId === table.id 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-zinc-100 bg-zinc-50 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  {table.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsChangeTableModalOpen(false)} className="flex-1 py-3 bg-zinc-100 rounded-xl font-bold">Cancel</button>
              <button 
                onClick={handleChangeTable} 
                disabled={!newTableId || newTableId === activeOrder.tableId}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {isCustomerModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 space-y-6 shadow-2xl">
            <h3 className="text-2xl font-black text-zinc-900 tracking-tight">Assign Customer</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {customers.map(customer => (
                <button
                  key={customer.id}
                  onClick={() => handleAssignCustomer(customer)}
                  className="w-full text-left p-4 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200"
                >
                  <p className="font-bold text-zinc-900">{customer.name}</p>
                  <p className="text-sm text-zinc-500">{customer.phone}</p>
                </button>
              ))}
              {customers.length === 0 && (
                <p className="text-center text-zinc-500 py-4">No customers found.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsCustomerModalOpen(false); setCustomerSearch(''); }} className="flex-1 py-3 bg-zinc-100 rounded-xl font-bold text-zinc-700 hover:bg-zinc-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Maximize Modal */}
      {isMaximizeModalOpen && activeOrder && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl p-8 space-y-8 h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-6">
              <div>
                <h3 className="text-4xl font-black text-zinc-900 tracking-tight">Order #{activeOrder.id.slice(-6).toUpperCase()}</h3>
                <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest mt-2">Placed at {activeOrder.createdAt?.toDate().toLocaleTimeString()}</p>
              </div>
              <button onClick={() => setIsMaximizeModalOpen(false)} className="p-3 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={28} className="text-zinc-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-8 custom-scrollbar pr-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Order Type</p>
                  <p className="font-black text-2xl text-zinc-900 uppercase">{activeOrder.orderType}</p>
                </div>
                <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Status</p>
                  <p className="font-black text-2xl text-zinc-900 uppercase">{activeOrder.status}</p>
                </div>
                <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Table</p>
                  <p className="font-black text-2xl text-zinc-900">{activeOrder.tableNumber || 'N/A'}</p>
                </div>
                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600/70 uppercase tracking-widest mb-2">Total Amount</p>
                  <p className="font-black text-3xl text-emerald-600">{formatCurrency(activeOrder.total)}</p>
                </div>
              </div>

              {activeOrder.notes && (
                <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200/50">
                  <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Pencil size={14} /> Order Notes
                  </h4>
                  <p className="text-lg font-bold text-amber-900">{activeOrder.notes}</p>
                </div>
              )}

              <div>
                <h4 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">Order Items</h4>
                <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Item</th>
                        <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-center">Qty</th>
                        <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Price</th>
                        <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {activeOrder.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-zinc-900 text-lg">{item.name}</p>
                            {item.notes && <p className="text-sm font-medium text-zinc-500 mt-1">{item.notes}</p>}
                          </td>
                          <td className="p-4 text-center">
                            <span className="inline-flex items-center justify-center w-10 h-10 bg-zinc-100 rounded-xl font-black text-zinc-900">
                              {item.quantity}
                            </span>
                          </td>
                          <td className="p-4 text-right font-bold text-zinc-500">{formatCurrency(item.price)}</td>
                          <td className="p-4 text-right font-black text-zinc-900 text-lg">{formatCurrency(item.price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {activeOrder.discount ? (
                <div className="flex justify-end">
                  <div className="w-72 bg-zinc-50 p-6 rounded-2xl border border-zinc-200 space-y-3">
                    <div className="flex justify-between items-center text-sm font-bold text-zinc-500">
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
                    <div className="pt-3 border-t border-zinc-200 flex justify-between items-center">
                      <span className="font-black text-zinc-900 uppercase tracking-widest">Total</span>
                      <span className="text-2xl font-black text-emerald-600">{formatCurrency(activeOrder.total)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
