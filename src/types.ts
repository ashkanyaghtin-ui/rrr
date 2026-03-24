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
  status: 'pending' | 'confirmed' | 'preparing' | 'serving' | 'done-serving' | 'awaiting-bill' | 'finalized' | 'cancelled' | 'paid';
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
  paymentMethod?: 'cash' | 'card' | 'online' | 'talabat' | 'zomato' | 'deliveroo' | 'careem' | 'noon' | 'open bill';
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
}

export interface JournalEntry {
  id: string;
  orderId?: string;
  type: 'sale' | 'refund' | 'wastage' | 'expense';
  amount: number;
  description: string;
  timestamp: any;
  items?: {
    name: string;
    quantity: number;
    price: number;
  }[];
}

export interface InventoryItem {
  id: string;
  name: string;
  stock: number;
  unit: string;
  costPerUnit?: number;
  lowStockThreshold: number;
  lastUpdated: any;
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

export interface LedgerGroup {
  id: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentGroupId?: string;
  description?: string;
}
