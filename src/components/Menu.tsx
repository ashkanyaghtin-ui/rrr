import { useEffect, useState, useRef } from 'react';
import { MenuItem, Category } from '../types';
import { Plus, Minus, ShoppingBag, Clock, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../utils/format';

interface MenuProps {
  items: MenuItem[];
  categories: Category[];
  onAddToCart: (item: MenuItem) => void;
  cartCount: number;
  onOpenCart: () => void;
}

export default function Menu({ items, categories, onAddToCart, cartCount, onOpenCart }: MenuProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const isClickScrolling = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Scroll spy for categories
  useEffect(() => {
    const handleScroll = () => {
      if (isClickScrolling.current) return;

      const scrollPosition = window.scrollY + 200; // Offset for header
      let currentCategory = null;

      for (const cat of categories) {
        const el = document.getElementById(`category-${cat.id}`);
        if (el) {
          const { top, bottom } = el.getBoundingClientRect();
          const absoluteTop = top + window.scrollY;
          const absoluteBottom = bottom + window.scrollY;

          if (scrollPosition >= absoluteTop && scrollPosition < absoluteBottom) {
            currentCategory = cat.id;
            break;
          }
        }
      }

      if (currentCategory !== activeCategory) {
        setActiveCategory(currentCategory);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [categories, activeCategory]);

  // Scroll active category into view in the nav
  useEffect(() => {
    if (activeCategory && !isClickScrolling.current) {
      const navButton = document.getElementById(`nav-cat-${activeCategory}`);
      if (navButton) {
        navButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeCategory]);

  const scrollToCategory = (id: string | null) => {
    isClickScrolling.current = true;
    setActiveCategory(id);
    
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    if (id) {
      const el = document.getElementById(`category-${id}`);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 150;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Re-enable scroll spy after scrolling finishes
    scrollTimeout.current = setTimeout(() => {
      isClickScrolling.current = false;
    }, 1000); // 1 second should be enough for smooth scroll to finish
  };

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com/uc?id=')) {
      const id = url.split('id=')[1];
      return `https://lh3.googleusercontent.com/d/${id}`;
    }
    return url;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Our Menu</h1>
          <p className="text-muted-foreground mt-2">Fresh ingredients, prepared with love.</p>
        </div>
        <button 
          onClick={onOpenCart}
          className="relative p-3 bg-card border border-border rounded-full hover:shadow-md transition-all"
        >
          <ShoppingBag size={24} className="text-foreground" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
              {cartCount}
            </span>
          )}
        </button>
      </header>

      <div className="sticky top-20 z-30 bg-background/80 backdrop-blur-md -mx-4 px-4 py-4 mb-8 border-b border-border">
        <nav className="flex gap-3 overflow-x-auto no-scrollbar max-w-5xl mx-auto">
          <button
            onClick={() => scrollToCategory(null)}
            className={`px-8 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${
              activeCategory === null 
                ? 'bg-primary text-white shadow-primary/20 scale-105' 
                : 'bg-card text-muted-foreground hover:bg-muted border border-border'
            }`}
          >
            All Items
          </button>
          {categories.sort((a, b) => a.order - b.order).map(cat => (
            <button
              key={cat.id}
              id={`nav-cat-${cat.id}`}
              onClick={() => scrollToCategory(cat.id)}
              className={`px-8 py-3 rounded-2xl text-sm font-bold whitespace-nowrap transition-all shadow-sm ${
                activeCategory === cat.id 
                  ? 'bg-primary text-white shadow-primary/20 scale-105' 
                  : 'bg-card text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-12">
        {categories
          .sort((a, b) => a.order - b.order)
          .map(cat => {
            const catItems = items.filter(item => (item.category === cat.id || item.category === cat.name) && item.available);
            if (catItems.length === 0) return null;
            return (
          <div key={cat.id} id={`category-${cat.id}`} className="scroll-mt-32">
            <h2 className="text-2xl font-bold text-foreground mb-6">{cat.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <AnimatePresence mode="popLayout">
                {catItems.map(item => (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={item.id}
                    className="bg-card rounded-[2rem] overflow-hidden border border-border shadow-sm hover:shadow-xl transition-all duration-300 group"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-muted relative">
                      {getImageUrl(item.image) && (
                        <img 
                          src={getImageUrl(item.image)} 
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm px-3 py-1 rounded-full font-bold text-primary shadow-sm">
                        {formatCurrency(item.price)}
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="font-bold text-xl text-foreground mb-2 group-hover:text-primary transition-colors">{item.name}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
                        {item.description || "No description available."}
                      </p>
                      
                      {item.recipeDetails && (
                        <div className="flex flex-wrap gap-2 mb-6">
                          {item.recipeDetails.prepTimeMinutes > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-muted text-muted-foreground rounded-lg text-xs font-bold">
                              <Clock size={12} /> {item.recipeDetails.prepTimeMinutes + item.recipeDetails.cookTimeMinutes}m
                            </span>
                          )}
                          {item.recipeDetails.allergens?.map((allergen, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold">
                              <AlertTriangle size={12} /> {allergen}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      <button
                        onClick={() => onAddToCart(item)}
                        disabled={!item.available}
                        className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus size={18} />
                        {item.available ? 'Add to Cart' : 'Sold Out'}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
            );
          })}
      </div>
    </div>
  );
}
