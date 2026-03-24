import React, { useState } from 'react';
import { MenuItem, InventoryItem } from '../types';
import { Plus, X, Save, ChefHat, BookOpen, Clock, AlertTriangle, Calculator, DollarSign, Trash2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { formatCurrency } from '../utils/format';

interface RecipeManagerProps {
  item: MenuItem;
  inventory: InventoryItem[];
  onClose: () => void;
  readOnly?: boolean;
}

export default function RecipeManager({ item, inventory, onClose, readOnly = false }: RecipeManagerProps) {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'instructions' | 'details'>('ingredients');
  
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
  const [newAllergen, setNewAllergen] = useState('');

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

  const handleRemoveInstruction = (index: number) => {
    setRecipeDetails({
      ...recipeDetails,
      instructions: recipeDetails.instructions.filter((_, i) => i !== index)
    });
  };

  const handleAddAllergen = () => {
    if (!newAllergen.trim()) return;
    if (!recipeDetails.allergens.includes(newAllergen.trim())) {
      setRecipeDetails({
        ...recipeDetails,
        allergens: [...recipeDetails.allergens, newAllergen.trim()]
      });
    }
    setNewAllergen('');
  };

  const handleRemoveAllergen = (allergen: string) => {
    setRecipeDetails({
      ...recipeDetails,
      allergens: recipeDetails.allergens.filter(a => a !== allergen)
    });
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

  // Cost Calculations
  const totalCost = recipe.reduce((acc, ing) => {
    const invItem = inventory.find(i => i.id === ing.inventoryItemId);
    return acc + ((invItem?.costPerUnit || 0) * ing.quantity);
  }, 0);

  const profitMargin = item.price > 0 ? ((item.price - totalCost) / item.price) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <BookOpen size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-zinc-900">Advanced Recipe Manager</h2>
              <p className="text-sm font-medium text-zinc-500">Editing recipe for: <span className="text-primary">{item.name}</span></p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 bg-zinc-50 border-r border-zinc-100 p-4 space-y-2">
            <button
              onClick={() => setActiveTab('ingredients')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                activeTab === 'ingredients' ? 'bg-white text-primary shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50'
              }`}
            >
              <ChefHat size={18} /> Ingredients
            </button>
            <button
              onClick={() => setActiveTab('instructions')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                activeTab === 'instructions' ? 'bg-white text-primary shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50'
              }`}
            >
              <BookOpen size={18} /> Instructions
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                activeTab === 'details' ? 'bg-white text-primary shadow-sm' : 'text-zinc-500 hover:bg-zinc-200/50'
              }`}
            >
              <Clock size={18} /> Details & Allergens
            </button>

            {/* Cost Summary Widget */}
            <div className="mt-8 p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-zinc-900 font-bold">
                <Calculator size={16} className="text-primary" /> Cost Analysis
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Selling Price</span>
                  <span className="font-bold">{formatCurrency(item.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Recipe Cost</span>
                  <span className="font-bold text-red-600">{formatCurrency(totalCost)}</span>
                </div>
                <div className="pt-2 border-t border-zinc-100 flex justify-between">
                  <span className="text-zinc-500">Gross Margin</span>
                  <span className={`font-black ${profitMargin >= 60 ? 'text-emerald-600' : profitMargin > 30 ? 'text-amber-500' : 'text-red-600'}`}>
                    {profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === 'ingredients' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-zinc-900">Ingredients</h3>
                  {!readOnly && (
                    <button
                      onClick={handleAddIngredient}
                      className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary font-bold rounded-xl hover:bg-primary/20 transition-colors"
                    >
                      <Plus size={16} /> Add Ingredient
                    </button>
                  )}
                </div>

                {recipe.length === 0 ? (
                  <div className="text-center py-12 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
                    <ChefHat size={48} className="text-zinc-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-zinc-900">No ingredients added</h3>
                    <p className="text-zinc-500 text-sm mt-1">Add ingredients to track inventory and calculate costs.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recipe.map((ingredient, index) => {
                      const invItem = inventory.find(i => i.id === ingredient.inventoryItemId);
                      const itemCost = (invItem?.costPerUnit || 0) * ingredient.quantity;
                      
                      return (
                        <div key={index} className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                          <div className="flex-1">
                            <select
                              value={ingredient.inventoryItemId}
                              onChange={(e) => handleUpdateIngredient(index, 'inventoryItemId', e.target.value)}
                              className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none text-sm font-bold bg-white"
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
                                className="w-full p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none text-sm font-bold pr-10"
                                min="0"
                                step="0.01"
                                disabled={readOnly}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
                                {invItem?.unit || ''}
                              </span>
                            </div>
                          </div>
                          <div className="w-24 text-right font-bold text-zinc-600">
                            {formatCurrency(itemCost)}
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => handleRemoveIngredient(index)}
                              className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'instructions' && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-zinc-900">Preparation Instructions</h3>
                
                <div className="space-y-4">
                  {recipeDetails.instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-200">
                      <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-black flex-shrink-0">
                        {index + 1}
                      </div>
                      <p className="flex-1 text-zinc-700 pt-1">{instruction}</p>
                      {!readOnly && (
                        <button
                          onClick={() => handleRemoveInstruction(index)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors h-fit"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!readOnly && (
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newInstruction}
                      onChange={(e) => setNewInstruction(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddInstruction()}
                      placeholder="Add a step (e.g. 'Chop the onions finely...')"
                      className="flex-1 p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button
                      onClick={handleAddInstruction}
                      className="px-6 py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-colors"
                    >
                      Add Step
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-6">Time Requirements</h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 bg-zinc-50 rounded-3xl border border-zinc-200">
                      <label className="flex items-center gap-2 text-sm font-bold text-zinc-500 mb-3">
                        <Clock size={16} /> Prep Time (Minutes)
                      </label>
                      <input
                        type="number"
                        value={recipeDetails.prepTimeMinutes}
                        onChange={(e) => setRecipeDetails({...recipeDetails, prepTimeMinutes: Number(e.target.value)})}
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none text-xl font-black"
                        min="0"
                        disabled={readOnly}
                      />
                    </div>
                    <div className="p-6 bg-zinc-50 rounded-3xl border border-zinc-200">
                      <label className="flex items-center gap-2 text-sm font-bold text-zinc-500 mb-3">
                        <Clock size={16} /> Cook Time (Minutes)
                      </label>
                      <input
                        type="number"
                        value={recipeDetails.cookTimeMinutes}
                        onChange={(e) => setRecipeDetails({...recipeDetails, cookTimeMinutes: Number(e.target.value)})}
                        className="w-full p-4 rounded-2xl border border-zinc-200 focus:ring-2 focus:ring-primary outline-none text-xl font-black"
                        min="0"
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
                    <AlertTriangle size={20} className="text-amber-500" /> Allergens
                  </h3>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    {recipeDetails.allergens.map((allergen, index) => (
                      <div key={index} className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-sm">
                        {allergen}
                        {!readOnly && (
                          <button onClick={() => handleRemoveAllergen(allergen)} className="hover:text-amber-900">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {recipeDetails.allergens.length === 0 && (
                      <p className="text-zinc-500 text-sm italic">No allergens added.</p>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex gap-3 max-w-md">
                      <input
                        type="text"
                        value={newAllergen}
                        onChange={(e) => setNewAllergen(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddAllergen()}
                        placeholder="e.g. Peanuts, Dairy, Gluten..."
                        className="flex-1 p-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-amber-500 outline-none"
                      />
                      <button
                        onClick={handleAddAllergen}
                        className="px-4 py-3 bg-amber-100 text-amber-700 font-bold rounded-xl hover:bg-amber-200 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-zinc-600 hover:bg-zinc-200 transition-colors"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              className="px-8 py-3 rounded-xl font-bold bg-primary text-white hover:scale-105 transition-transform flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Save size={20} /> Save Recipe
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
