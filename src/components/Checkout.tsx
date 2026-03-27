import React, { useState } from 'react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, MapPin, Phone, Building, Home, Plus, LogIn, X, Banknote, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CartItem } from '../types';
import { formatCurrency } from '../utils/format';

interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  building: string;
  apartment: string;
  phone: string;
}

interface CheckoutProps {
  amount: number;
  cartItems: CartItem[];
  onSuccess: () => void;
  onClose: () => void;
}

export default function Checkout({ amount, cartItems, onSuccess, onClose }: CheckoutProps) {
  const { user, profile, login, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'auth' | 'type' | 'address' | 'details' | 'confirm'>(user ? 'type' : 'auth');
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('online');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  
  const [addressForm, setAddressForm] = useState<Omit<Address, 'id'>>({
    label: 'Home',
    street: '',
    city: 'Dubai',
    building: '',
    apartment: '',
    phone: ''
  });

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      let finalAddress: Omit<Address, 'id'> | undefined;
      
      if (orderType === 'delivery') {
        if (selectedAddressId && profile) {
          const saved = profile.addresses.find(a => a.id === selectedAddressId);
          if (!saved) throw new Error("Address not found");
          finalAddress = saved;
        } else {
          finalAddress = addressForm;
          
          // Save address to profile if requested and logged in
          if (user && profile && saveAddress) {
            const newAddress: Address = { ...addressForm, id: Date.now().toString() };
            await updateProfile({
              addresses: [...(profile.addresses || []), newAddress]
            });
          }
        }
      } else {
        // Pickup order, still requires name and phone
        finalAddress = {
          label: 'Pickup',
          street: 'Pickup',
          city: 'Pickup',
          building: 'Pickup',
          apartment: 'Pickup',
          phone: addressForm.phone || profile?.phone || ''
        };
      }

      // Create the order with full details
      console.log("Creating order with items:", cartItems);
      const orderRef = await addDoc(collection(db, 'orders'), {
        userId: user?.uid || 'guest',
        customerName: profile?.name || 'Guest',
        customerPhone: finalAddress.phone,
        items: cartItems.map(i => ({ itemId: i.id, name: i.name, price: i.price, quantity: i.quantity })),
        total: amount,
        orderType: orderType,
        paymentMethod: paymentMethod,
        status: paymentMethod === 'online' ? 'paid' : 'confirmed',
        address: finalAddress,
        createdAt: serverTimestamp(),
        paymentIntentId: paymentMethod === 'online' ? 'mock_payment_' + Date.now() : null
      });
      console.log("Order created successfully:", orderRef.id);

      onSuccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'auth' && !user) {
    return (
      <div className="bg-card rounded-3xl p-8 shadow-xl border border-border relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full text-muted-foreground">
          <X size={20} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-foreground">Checkout</h2>
        <div className="space-y-4">
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
          >
            <LogIn size={20} />
            Sign In to Save Address
          </button>
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-4 text-muted-foreground text-sm">or</span>
            <div className="flex-grow border-t border-border"></div>
          </div>
          <button
            onClick={() => setStep('type')}
            className="w-full bg-muted text-foreground py-4 rounded-2xl font-bold hover:bg-muted/80 transition-all"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    );
  }

  if (step === 'type' || (step === 'auth' && user)) {
    return (
      <div className="bg-card rounded-3xl p-8 shadow-xl border border-border relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full text-muted-foreground">
          <X size={20} />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-foreground">Order Type</h2>
        <div className="space-y-4">
          <button
            onClick={() => {
              setOrderType('delivery');
              setStep('address');
            }}
            className="w-full flex items-center justify-between p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
          >
            <div>
              <h3 className="font-bold text-lg text-foreground">Delivery</h3>
              <p className="text-sm text-zinc-500">We'll deliver to your address</p>
            </div>
            <Home className="text-zinc-400" size={24} />
          </button>
          <button
            onClick={() => {
              setOrderType('pickup');
              setStep('details');
            }}
            className="w-full flex items-center justify-between p-6 rounded-2xl border-2 border-zinc-100 hover:border-primary hover:bg-primary/5 transition-all text-left"
          >
            <div>
              <h3 className="font-bold text-lg text-zinc-900">Pickup</h3>
              <p className="text-sm text-zinc-500">Pick up your order at the store</p>
            </div>
            <MapPin className="text-zinc-400" size={24} />
          </button>
        </div>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-zinc-100 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-zinc-100 rounded-full text-zinc-400">
          <X size={20} />
        </button>
        <h2 className="text-2xl font-bold mb-6">Pickup Details</h2>
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Phone Number</label>
            <input
              type="tel"
              value={addressForm.phone}
              onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
              className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-black outline-none"
              placeholder="+971 XX XXX XXXX"
            />
          </div>
        </div>
        <button
          onClick={() => setStep('confirm')}
          disabled={!addressForm.phone}
          className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/10"
        >
          Continue to Payment
        </button>
      </div>
    );
  }

  if (step === 'address') {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-xl border border-zinc-100 max-h-[80vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-zinc-100 rounded-full text-zinc-400">
          <X size={20} />
        </button>
        <h2 className="text-2xl font-bold mb-6">Delivery Address</h2>
        
        {user && profile?.addresses && profile.addresses.length > 0 && !isAddingNew ? (
          <div className="space-y-4 mb-6">
            {profile.addresses.map(addr => (
              <button
                key={addr.id}
                onClick={() => setSelectedAddressId(addr.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  selectedAddressId === addr.id ? 'border-black bg-zinc-50' : 'border-zinc-100 hover:border-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Home size={16} />
                  {addr.label}
                </div>
                <p className="text-sm text-zinc-500">{addr.street}, {addr.building}</p>
                <p className="text-sm text-zinc-500">{addr.city} • {addr.phone}</p>
              </button>
            ))}
            <button
              onClick={() => {
                setIsAddingNew(true);
                setSelectedAddressId(null);
              }}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-all"
            >
              <Plus size={18} />
              Add New Address
            </button>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Street Address</label>
                <input
                  type="text"
                  value={addressForm.street}
                  onChange={e => setAddressForm({ ...addressForm, street: e.target.value })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-black outline-none"
                  placeholder="Street name / number"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Building</label>
                <input
                  type="text"
                  value={addressForm.building}
                  onChange={e => setAddressForm({ ...addressForm, building: e.target.value })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-black outline-none"
                  placeholder="Building name"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Apartment</label>
                <input
                  type="text"
                  value={addressForm.apartment}
                  onChange={e => setAddressForm({ ...addressForm, apartment: e.target.value })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-black outline-none"
                  placeholder="Apt / Suite"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-bold text-zinc-400 uppercase mb-1 block">Phone Number</label>
                <input
                  type="tel"
                  value={addressForm.phone}
                  onChange={e => setAddressForm({ ...addressForm, phone: e.target.value })}
                  className="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-black outline-none"
                  placeholder="+971 XX XXX XXXX"
                />
              </div>
            </div>
            
            {user && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={e => setSaveAddress(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-black focus:ring-black"
                />
                <span className="text-sm text-zinc-600">Save this address to my profile</span>
              </label>
            )}

            {user && profile?.addresses && profile.addresses.length > 0 && (
              <button
                onClick={() => setIsAddingNew(false)}
                className="text-sm text-zinc-500 hover:text-black underline"
              >
                Back to saved addresses
              </button>
            )}
          </div>
        )}

        <button
          onClick={() => setStep('confirm')}
          disabled={!selectedAddressId && (!addressForm.street || !addressForm.phone)}
          className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/10"
        >
          Continue to Payment
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-8 shadow-xl border border-zinc-100 relative">
      <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-zinc-100 rounded-full text-zinc-400">
        <X size={20} />
      </button>
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="text-zinc-900" size={32} />
        </div>
        <h2 className="text-2xl font-bold mb-2">Payment Method</h2>
        <p className="text-zinc-500 mb-6">
          Total: <span className="text-zinc-900 font-bold">{formatCurrency(amount)}</span>
        </p>

        <div className="grid grid-cols-3 gap-3 w-full mb-8">
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
              paymentMethod === 'cash' ? 'border-primary bg-primary/5' : 'border-zinc-100 hover:border-zinc-200'
            }`}
          >
            <Banknote className={paymentMethod === 'cash' ? 'text-primary' : 'text-zinc-400'} size={24} />
            <span className="text-xs font-bold">Cash</span>
          </button>
          <button
            onClick={() => setPaymentMethod('card')}
            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
              paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'border-zinc-100 hover:border-zinc-200'
            }`}
          >
            <CreditCard className={paymentMethod === 'card' ? 'text-primary' : 'text-zinc-400'} size={24} />
            <span className="text-xs font-bold">Card</span>
          </button>
          <button
            onClick={() => setPaymentMethod('online')}
            className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
              paymentMethod === 'online' ? 'border-primary bg-primary/5' : 'border-zinc-100 hover:border-zinc-200'
            }`}
          >
            <LogIn className={paymentMethod === 'online' ? 'text-primary' : 'text-zinc-400'} size={24} />
            <span className="text-xs font-bold">Online</span>
          </button>
        </div>
        
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          ) : (
            paymentMethod === 'online' ? "Pay & Place Order" : "Place Order"
          )}
        </button>
        
        <button
          onClick={() => setStep(orderType === 'delivery' ? 'address' : 'details')}
          className="mt-4 text-sm text-zinc-400 hover:text-zinc-600"
        >
          Back
        </button>
      </div>
    </div>
  );
}
