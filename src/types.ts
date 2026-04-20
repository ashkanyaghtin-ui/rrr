export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  image?: string;
  available: boolean;
  recipe?: {
    inventoryItemId: string;
    quantity: number;
  }[];
  recipeDetails?: {
    instructions: string[];
    prepTimeMinutes: number;
    cookTimeMinutes: number;
    allergens: string[];
  };
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export interface Table {
  id: string;
  name: string;
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'rectangle' | 'circle';
}

export interface Order {
  id: string;
  userId: string;
  items: {
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    notes?: string;
  }[];
  total: number;
  status: 'pending' | 'awaiting-confirmation' | 'confirmed' | 'preparing' | 'serving' | 'done-serving' | 'awaiting-bill' | 'finalized' | 'cancelled' | 'paid';
  createdAt: any;
  invoicedAt?: any;
  paymentIntentId?: string;
  orderType: 'delivery' | 'dine-in' | 'pickup' | 'take-out';
  tableNumber?: string;
  tableId?: string;
  kotNo?: string;
  orderNo?: string;
  waiter?: string;
  occupancy?: number;
  notes?: string;
  paymentMethod?: 'cash' | 'card' | 'online' | 'talabat' | 'zomato' | 'deliveroo' | 'careem' | 'noon' | 'open bill' | 'multi';
  multiPayment?: {
    cash: number;
    card: number;
  };
  amountReceived?: number;
  changeGiven?: number;
  discount?: number;
  discountType?: 'amount' | 'percentage';
  discountReason?: string;
  store?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  splitDetails?: {
    isSplit: boolean;
    numberOfSplits: number;
    paidSplits: number;
  };
  address?: {
    street: string;
    city: string;
    building: string;
    apartment: string;
    phone: string;
  };
  completedAt?: any;
  payments?: {
    method: string;
    amount: number;
    timestamp: string;
    cashAmount?: number;
    cardAmount?: number;
    onlineAmount?: number;
  }[];
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  costPerUnit?: number;
  averageCost?: number;
  lowStockThreshold: number;
  lastUpdated: any;
  category?: 'raw_material' | 'finished_good';
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  balance: number;
  loyaltyPoints: number;
  groupId?: string;
  addresses: {
    id: string;
    label: string;
    street: string;
    city: string;
    building: string;
    apartment: string;
    phone: string;
  }[];
  createdAt: any;
  updatedAt: any;
}

export interface CustomerGroup {
  id: string;
  name: string;
  discountPercentage: number;
  description?: string;
}

export interface Journal {
  id: string;
  date: any;
  referenceId?: string;
  referenceType: 'voucher' | 'bill' | 'cheque' | 'sale' | 'manual' | 'production';
  description: string;
  accountId?: string;
  debit?: number;
  credit?: number;
  amount?: number;
  type?: 'sale' | 'expense' | 'wastage' | 'income' | 'production';
  items?: any[];
  orderId?: string;
  taxRateId?: string;
  taxAmount?: number;
  createdAt: any;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  description?: string;
  isActive: boolean;
}

export interface Voucher {
  id: string;
  voucherNo: string;
  date: any;
  type: 'receipt' | 'payment';
  accountId: string; // The account being paid to/from (e.g. Cash, Bank)
  partyAccountId: string; // The other side of the transaction
  amount: number;
  description: string;
  status: 'pending' | 'posted' | 'cancelled';
}

export interface Bill {
  id: string;
  billNo: string;
  date: any;
  vendorId: string;
  items: {
    inventoryItemId: string;
    name: string;
    quantity: number;
    price: number;
    taxRateId?: string;
  }[];
  totalAmount: number;
  taxTotal: number;
  status: 'pending' | 'posted' | 'cancelled';
}

export interface Cheque {
  id: string;
  chequeNo: string;
  date: any;
  bankAccountId: string;
  partyAccountId: string;
  amount: number;
  type: 'issued' | 'received';
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
}

export interface LedgerGroup {
  id: string;
  name: string;
  code?: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  parentGroupId?: string;
  isAccount: boolean; // If true, it's a ledger account, otherwise it's a group
  description?: string;
}

export interface Reservation {
  id: string;
  date: string;
  time: string;
  guests: number;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no-show';
  source: 'phone' | 'walk-in' | 'online' | 'app';
  customerName: string;
  customerPhone: string;
  customerId?: string;
  email?: string;
  tableNumber?: string;
  tableId?: string;
  occasion?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  guests: number;
  quotedTime: number; // in minutes
  status: 'waiting' | 'seated' | 'cancelled' | 'no-show';
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Shift {
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
