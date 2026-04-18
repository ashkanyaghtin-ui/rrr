import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, MapPin, Plus, Trash2, Save, User, Phone, Home, Building, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProfileModalProps {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [addresses, setAddresses] = useState(profile?.addresses || []);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddAddress = () => {
    const newAddress = {
      id: Date.now().toString(),
      label: 'Home',
      street: '',
      city: '',
      building: '',
      apartment: '',
      phone: profile?.phone || ''
    };
    setAddresses([...addresses, newAddress]);
  };

  const handleRemoveAddress = (id: string) => {
    setAddresses(addresses.filter(a => a.id !== id));
  };

  const handleUpdateAddress = (id: string, updates: any) => {
    setAddresses(addresses.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({
        displayName,
        addresses
      });
      onClose();
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-card w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-border flex justify-between items-center bg-muted/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <User size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-foreground tracking-tight">Your Profile</h2>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{profile?.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-sm font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
              <User size={14} /> Personal Information
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Full Name</label>
                <input 
                  type="text" 
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                  placeholder="Your Name"
                />
              </div>
            </div>
          </section>

          {/* Addresses */}
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2">
                <MapPin size={14} /> Saved Addresses
              </h3>
              <button 
                onClick={handleAddAddress}
                className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/20 transition-all border border-primary/20"
              >
                <Plus size={14} /> Add New
              </button>
            </div>

            <div className="space-y-4">
              {addresses.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-3xl border-2 border-dashed border-border group hover:border-primary/20 transition-all">
                  <Map size={48} className="mx-auto text-muted-foreground mb-4 group-hover:scale-110 transition-transform" />
                  <p className="font-bold text-muted-foreground">No saved addresses yet</p>
                  <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto mt-1">Add your delivery addresses for a faster checkout experience.</p>
                </div>
              ) : (
                addresses.map((addr) => (
                  <div key={addr.id} className="p-6 bg-background border border-border rounded-[2rem] space-y-4 group hover:shadow-xl hover:shadow-primary/5 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Label</label>
                          <div className="relative">
                            <Home className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <input 
                              type="text" 
                              value={addr.label}
                              onChange={e => handleUpdateAddress(addr.id, { label: e.target.value })}
                              className="w-full pl-9 pr-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                              placeholder="e.g. Home, Office"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Phone for delivery</label>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <input 
                              type="text" 
                              value={addr.phone}
                              onChange={e => handleUpdateAddress(addr.id, { phone: e.target.value })}
                              className="w-full pl-9 pr-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                              placeholder="Phone number"
                            />
                          </div>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Street Address</label>
                          <input 
                            type="text" 
                            value={addr.street}
                            onChange={e => handleUpdateAddress(addr.id, { street: e.target.value })}
                            className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="Street name & area"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Building/Villa No.</label>
                          <div className="relative">
                            <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                            <input 
                              type="text" 
                              value={addr.building}
                              onChange={e => handleUpdateAddress(addr.id, { building: e.target.value })}
                              className="w-full pl-9 pr-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Apartment/Flat No.</label>
                          <input 
                            type="text" 
                            value={addr.apartment}
                            onChange={e => handleUpdateAddress(addr.id, { apartment: e.target.value })}
                            className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveAddress(addr.id)}
                        className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-xl transition-all ml-4"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="p-8 border-t border-border bg-muted/30 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Save size={20} />
                Save Changes
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
