import React, { useState } from 'react';
import { MenuItem, InventoryItem } from '../types';
import { Plus, X, Save, ChefHat, BookOpen, Calculator, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';

interface RecipeManagerProps {
  item: MenuItem;
  inventory: InventoryItem[];
  onClose: () => void;
  readOnly?: boolean;
  systemSettings?: any;
}

export default function RecipeManager({ item, inventory, onClose, readOnly = false, systemSettings }: RecipeManagerProps) {
  const currencySymbol = systemSettings?.currency || 'AED';
  const formatCurrencyLocal = (amount: number) => {
    return `${currencySymbol} ${(amount / 100).toFixed(2)}`;
  };
  const [recipe, setRecipe] = useState<{ inventoryItemId: string; quantity: number }[]>(
    item.recipe || []
  );
  
  const [recipeDetails, setRecipeDetails] = useState({
    instructions: item.recipeDetails?.instructions || [],
    prepTimeMinutes: item.recipeDetails?.prepTimeMinutes || 0,
    cookTimeMinutes: item.recipeDetails?.cookTimeMinutes || 0,
    allergens: item.recipeDetails?.allergens || []
  });

  const [newInstruction, setNewInstruction] = useState('');

  const handleAddIngredient = () => {
    if (inventory.length === 0) return;
    setRecipe([...recipe, { inventoryItemId: inventory[0].id, quantity: 1 }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setRecipe(recipe.filter((_, i) => i !== index));
  };

  const handleUpdateIngredient = (index: number, field: 'inventoryItemId' | 'quantity', value: any) => {
    const newRecipe = [...recipe];
    newRecipe[index] = { ...newRecipe[index], [field]: value };
    setRecipe(newRecipe);
  };

  const handleAddInstruction = () => {
    if (!newInstruction.trim()) return;
    setRecipeDetails({
      ...recipeDetails,
      instructions: [...recipeDetails.instructions, newInstruction.trim()]
    });
    setNewInstruction('');
  };

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'menu', item.id), {
        recipe,
        recipeDetails
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `menu/${item.id}`);
    }
  };

  const totalCost = recipe.reduce((acc, ing) => {
    const invItem = inventory.find(i => i.id === ing.inventoryItemId);
    return acc + ((invItem?.averageCost || invItem?.costPerUnit || 0) * ing.quantity);
  }, 0);

  const profitMargin = item.price > 0 ? ((item.price - totalCost) / item.price) * 100 : 0;

  const [activeTab, setActiveTab] = useState<'ingredients' | 'instructions' | 'analysis'>('ingredients');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-[2.5rem] shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-8 border-b border-border flex justify-between items-center bg-card/50">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
              <ChefHat size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Recipe Manager</h2>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Item: <span className="text-primary">{item.name}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-muted/30 p-1.5 rounded-2xl flex items-center gap-1 border border-border shrink-0">
              {(['ingredients', 'instructions', 'analysis'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground underline-offset-4 hover:underline'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button 
              onClick={onClose}
              className="p-3 text-muted-foreground hover:bg-muted rounded-full transition-all ml-4"
            >
              <X size={28} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'ingredients' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-foreground uppercase flex items-center gap-2">
                  <BookOpen size={20} className="text-primary" /> Ingredients List
                </h3>
                {!readOnly && (
                  <button
                    onClick={handleAddIngredient}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-bold rounded-xl hover:scale-105 transition-all text-xs uppercase"
                  >
                    <Plus size={14} /> Add Ingredient
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {recipe.map((ingredient, index) => {
                  const invItem = inventory.find(i => i.id === ingredient.inventoryItemId);
                  const itemCost = (invItem?.averageCost || invItem?.costPerUnit || 0) * ingredient.quantity;
                  
                  return (
                    <div key={index} className="flex items-center gap-4 p-4 bg-muted/30 rounded-2xl border border-border group hover:border-primary/30 transition-all">
                      <div className="flex-1">
                        <select
                          value={ingredient.inventoryItemId}
                          onChange={(e) => handleUpdateIngredient(index, 'inventoryItemId', e.target.value)}
                          className="w-full p-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm font-bold"
                          disabled={readOnly}
                        >
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name} ({inv.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <div className="relative">
                          <input
                            type="number"
                            value={ingredient.quantity}
                            onChange={(e) => handleUpdateIngredient(index, 'quantity', Number(e.target.value))}
                            className="w-full p-3 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm font-bold pr-10"
                            min="0"
                            step="0.01"
                            disabled={readOnly}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground uppercase">
                            {invItem?.unit || ''}
                          </span>
                        </div>
                      </div>
                      <div className="w-24 text-right font-black text-foreground text-sm">
                        {formatCurrencyLocal(itemCost)}
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => handleRemoveIngredient(index)}
                          className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {recipe.length === 0 && (
                  <div className="text-center py-20 border-2 border-dashed border-border rounded-[2rem]">
                    <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">No ingredients defined</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'instructions' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              <h3 className="text-lg font-black text-foreground uppercase">Preparation Workflow</h3>
              <div className="space-y-4">
                {recipeDetails.instructions.map((step, idx) => (
                  <div key={idx} className="flex gap-6 p-6 bg-card border border-border rounded-[2rem] hover:border-primary/20 transition-all shadow-sm">
                    <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center font-black shrink-0 text-sm shadow-lg shadow-primary/20">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium pt-2 leading-relaxed">{step}</p>
                    </div>
                    {!readOnly && (
                      <button 
                        onClick={() => {
                          const newInst = [...recipeDetails.instructions];
                          newInst.splice(idx, 1);
                          setRecipeDetails({...recipeDetails, instructions: newInst});
                        }}
                        className="p-2 text-muted-foreground hover:text-red-500 transition-colors self-start"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <div className="flex gap-3 pt-4">
                    <input 
                      type="text"
                      placeholder="Add next step in the process..."
                      value={newInstruction}
                      onChange={e => setNewInstruction(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddInstruction()}
                      className="flex-1 p-5 bg-muted/20 border border-border rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button onClick={handleAddInstruction} className="px-8 bg-foreground text-card font-black rounded-2xl text-xs uppercase hover:scale-[1.02] transition-all">Add Step</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="space-y-10 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-10 bg-card border border-border rounded-[3rem] text-white space-y-8 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl -mr-16 -mt-16 group-hover:bg-primary/20 transition-all duration-700" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                    <Calculator size={14} className="text-primary" /> Margin Analysis
                  </h3>
                  
                  <div className="space-y-6">
                    <div className="flex justify-between items-end border-b border-white/5 pb-6">
                      <span className="text-sm font-black text-muted-foreground uppercase">Retail Price</span>
                      <span className="text-3xl font-black tabular-nums">{formatCurrencyLocal(item.price)}</span>
                    </div>
                    <div className="flex justify-between items-end border-b border-white/5 pb-6">
                      <span className="text-sm font-black text-muted-foreground uppercase">Cost Content</span>
                      <span className="text-3xl font-black text-rose-500 tabular-nums">{formatCurrencyLocal(totalCost)}</span>
                    </div>
                    <div className="pt-4">
                      <div className="flex justify-between items-end mb-4">
                        <span className="text-sm font-black text-muted-foreground uppercase tracking-tighter">Yield Margin</span>
                        <span className={`text-4xl font-black tabular-nums ${profitMargin > 60 ? 'text-emerald-400' : profitMargin > 30 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {profitMargin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${profitMargin > 60 ? 'bg-emerald-400' : profitMargin > 30 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${Math.min(100, Math.max(0, profitMargin))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-10 bg-card border border-border rounded-[3rem] space-y-8 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
                    <Clock size={14} className="text-primary" /> Logistics
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Prep Time (min)</label>
                      <input type="number" value={recipeDetails.prepTimeMinutes} onChange={e => setRecipeDetails({...recipeDetails, prepTimeMinutes: Number(e.target.value)})} className="w-full p-4 bg-muted/20 border border-border rounded-2xl font-black text-sm tabular-nums focus:ring-2 focus:ring-primary outline-none transition-all" disabled={readOnly} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-muted-foreground uppercase ml-1">Cook Time (min)</label>
                      <input type="number" value={recipeDetails.cookTimeMinutes} onChange={e => setRecipeDetails({...recipeDetails, cookTimeMinutes: Number(e.target.value)})} className="w-full p-4 bg-muted/20 border border-border rounded-2xl font-black text-sm tabular-nums focus:ring-2 focus:ring-primary outline-none transition-all" disabled={readOnly} />
                    </div>
                  </div>

                  <div className="pt-4 space-y-4">
                    <h4 className="text-[10px] font-black text-muted-foreground uppercase flex items-center gap-2 tracking-widest">
                      <AlertTriangle size={14} className="text-amber-500" /> Allergen Profile
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {['Dairy', 'Gluten', 'Nuts', 'Shellfish', 'Soy', 'Egg'].map(a => (
                        <button
                          key={a}
                          onClick={() => {
                            if (readOnly) return;
                            const allergens = recipeDetails.allergens || [];
                            setRecipeDetails({
                              ...recipeDetails,
                              allergens: allergens.includes(a) ? allergens.filter(x => x !== a) : [...allergens, a]
                            });
                          }}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                            recipeDetails.allergens?.includes(a) 
                              ? 'bg-amber-500/20 text-amber-600 border border-amber-500/30 shadow-sm' 
                              : 'bg-muted/30 text-muted-foreground border border-transparent hover:border-border'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-border bg-card/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:bg-muted transition-all"
          >
            Close Console
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              className="px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] bg-primary text-white hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 flex items-center gap-2"
            >
              <Save size={18} /> Push Updates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
