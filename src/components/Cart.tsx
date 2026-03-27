import { CartItem } from '../types';
import { X, Plus, Minus, Trash2, ArrowRight, ShoppingBag } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

interface CartProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onCheckout: () => void;
}

export default function Cart({ items, onUpdateQuantity, onRemove, onClose, onCheckout }: CartProps) {
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com/uc?id=')) {
      const id = url.split('id=')[1];
      return `https://lh3.googleusercontent.com/d/${id}`;
    }
    return url;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-md bg-card h-full shadow-2xl flex flex-col"
      >
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold text-foreground">Your Order</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors text-foreground">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <ShoppingBag size={48} className="mb-4 opacity-20" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                  {getImageUrl(item.image) && (
                    <img 
                      src={getImageUrl(item.image)} 
                      alt={item.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-foreground truncate">{item.name}</h4>
                    <button onClick={() => onRemove(item.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{formatCurrency(item.price)}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-border rounded-lg">
                      <button 
                        onClick={() => onUpdateQuantity(item.id, -1)}
                        className="p-1 hover:bg-muted transition-colors text-foreground"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-foreground">{item.quantity}</span>
                      <button 
                        onClick={() => onUpdateQuantity(item.id, 1)}
                        className="p-1 hover:bg-muted transition-colors text-foreground"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <span className="text-sm font-semibold ml-auto text-foreground">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-border bg-muted/50">
            <div className="flex justify-between items-center mb-6">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-2xl font-bold text-foreground">{formatCurrency(subtotal)}</span>
            </div>
            <button 
              onClick={onCheckout}
              className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
            >
              Checkout
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
