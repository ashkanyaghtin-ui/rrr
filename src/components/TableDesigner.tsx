import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { Table } from '../types';
import { Plus, Trash2, Save, Move, Square, Circle, RotateCcw } from 'lucide-react';

export default function TableDesigner() {
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'tables'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tables'));
    return unsubscribe;
  }, []);

  const addTable = async () => {
    try {
      const newTable: Omit<Table, 'id'> = {
        name: `Table ${tables.length + 1}`,
        capacity: 4,
        status: 'available',
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        shape: 'rectangle'
      };
      await addDoc(collection(db, 'tables'), newTable);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tables');
    }
  };

  const updateTable = async (id: string, updates: Partial<Table>) => {
    try {
      await updateDoc(doc(db, 'tables', id), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tables/${id}`);
    }
  };

  const deleteTable = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tables', id));
      if (selectedTable?.id === id) setSelectedTable(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tables/${id}`);
    }
  };

  const resetAllTables = async () => {
    try {
      const batch = writeBatch(db);
      tables.forEach(table => {
        const tableRef = doc(db, 'tables', table.id);
        batch.update(tableRef, { status: 'available', currentOrderId: null });
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'tables/reset-all');
    }
  };

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [localTables, setLocalTables] = useState<Table[]>([]);

  useEffect(() => {
    setLocalTables(tables);
  }, [tables]);

  const handleMouseDown = (e: React.MouseEvent, table: Table) => {
    setSelectedTable(table);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - table.x,
      y: e.clientY - table.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && selectedTable) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Snap to grid (optional, but good for alignment)
      const snappedX = Math.round(newX / 10) * 10;
      const snappedY = Math.round(newY / 10) * 10;

      setLocalTables(prev => prev.map(t => 
        t.id === selectedTable.id ? { ...t, x: snappedX, y: snappedY } : t
      ));
      setSelectedTable(prev => prev ? { ...prev, x: snappedX, y: snappedY } : null);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && selectedTable) {
      updateTable(selectedTable.id, { x: selectedTable.x, y: selectedTable.y });
    }
    setIsDragging(false);
  };

  return (
    <div className="flex h-full gap-8">
      {/* Designer Canvas */}
      <div 
        className="flex-1 bg-zinc-100 rounded-[2.5rem] relative overflow-hidden border-4 border-zinc-200 shadow-inner"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="absolute inset-0 opacity-5 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        
        {localTables.map(table => (
          <div
            key={table.id}
            onMouseDown={(e) => handleMouseDown(e, table)}
            className={`absolute cursor-move flex flex-col items-center justify-center transition-all shadow-lg select-none ${
              table.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
            } ${
              selectedTable?.id === table.id ? 'ring-4 ring-primary ring-offset-4 z-10' : 'hover:scale-102'
            } ${
              table.status === 'occupied' ? 'bg-amber-500' : 'bg-white'
            }`}
            style={{
              left: `${table.x}px`,
              top: `${table.y}px`,
              width: `${table.width}px`,
              height: `${table.height}px`,
            }}
          >
            <span className={`font-black text-sm ${table.status === 'occupied' ? 'text-white' : 'text-zinc-900'}`}>
              {table.name}
            </span>
            <span className={`text-[10px] font-bold ${table.status === 'occupied' ? 'text-white/80' : 'text-zinc-400'}`}>
              Cap: {table.capacity}
            </span>
          </div>
        ))}
      </div>

      {/* Sidebar Controls */}
      <div className="w-80 space-y-6">
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={addTable}
            className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all"
          >
            <Plus size={20} /> Add Table
          </button>
          
          <button
            onClick={resetAllTables}
            className="w-full bg-white border-2 border-zinc-200 text-zinc-600 py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-50 transition-all"
          >
            <RotateCcw size={20} /> Reset All Tables
          </button>
        </div>

        {selectedTable ? (
          <div className="bg-white p-6 rounded-[2rem] border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-zinc-900 uppercase tracking-tight">Edit {selectedTable.name}</h3>
              <button onClick={() => deleteTable(selectedTable.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-all">
                <Trash2 size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Name</label>
                <input
                  type="text"
                  value={selectedTable.name}
                  onChange={(e) => updateTable(selectedTable.id, { name: e.target.value })}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Capacity</label>
                <input
                  type="number"
                  value={selectedTable.capacity}
                  onChange={(e) => updateTable(selectedTable.id, { capacity: parseInt(e.target.value) })}
                  className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">X Position</label>
                  <input
                    type="number"
                    value={selectedTable.x}
                    onChange={(e) => updateTable(selectedTable.id, { x: parseInt(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Y Position</label>
                  <input
                    type="number"
                    value={selectedTable.y}
                    onChange={(e) => updateTable(selectedTable.id, { y: parseInt(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Width</label>
                  <input
                    type="number"
                    value={selectedTable.width}
                    onChange={(e) => updateTable(selectedTable.id, { width: parseInt(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Height</label>
                  <input
                    type="number"
                    value={selectedTable.height}
                    onChange={(e) => updateTable(selectedTable.id, { height: parseInt(e.target.value) })}
                    className="w-full bg-zinc-50 border border-zinc-100 rounded-xl px-4 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => updateTable(selectedTable.id, { shape: 'rectangle' })}
                  className={`flex-1 py-2 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    selectedTable.shape === 'rectangle' ? 'bg-primary/10 border-primary text-primary' : 'bg-zinc-50 border-zinc-100 text-zinc-400'
                  }`}
                >
                  <Square size={16} /> Rect
                </button>
                <button
                  onClick={() => updateTable(selectedTable.id, { shape: 'circle' })}
                  className={`flex-1 py-2 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    selectedTable.shape === 'circle' ? 'bg-primary/10 border-primary text-primary' : 'bg-zinc-50 border-zinc-100 text-zinc-400'
                  }`}
                >
                  <Circle size={16} /> Circle
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-[2rem] p-8 text-center">
            <Move className="mx-auto text-zinc-300 mb-4" size={32} />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Select a table to edit its properties</p>
          </div>
        )}
      </div>
    </div>
  );
}
