import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, setDoc } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { Customer, CustomerGroup, Order } from '../types';
import { Users, Plus, Edit2, Trash2, Save, X, Search, MapPin, CreditCard, Tag, FileText, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { exportToExcel } from '../utils/excel';
import * as XLSX from 'xlsx';
import { serverTimestamp } from 'firebase/firestore';

export default function CRM({ systemSettings }: { systemSettings?: any }) {
  const currencySymbol = systemSettings?.currency || 'AED';
  const sharedCustomerSubsidiaryName = 'Customers Subsidiary';
  const sharedCustomerSubsidiaryId = 'shared-customers';
  
  const formatCurrency = (amount: number) => {
    return `${currencySymbol} ${(amount / 100).toFixed(2)}`;
  };
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'customers' | 'groups'>('customers');
  const [searchQuery, setSearchQuery] = useState('');

  // Customer Form State
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    addresses: [],
    balance: 0,
    loyaltyPoints: 0,
    groupId: '',
    subsidiaryId: ''
  });

  // Group Form State
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<Partial<CustomerGroup>>({
    name: '',
    discountPercentage: 0,
    description: ''
  });

  // Open Bills State
  const [viewingCustomerId, setViewingCustomerId] = useState<string | null>(null);
  const [viewingCustomerAccountId, setViewingCustomerAccountId] = useState<string | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [allJournalEntries, setAllJournalEntries] = useState<any[]>([]);
  const [allJournal, setAllJournal] = useState<any[]>([]);
  const [allBills, setAllBills] = useState<any[]>([]);

  const activeCustomerOrderTarget = viewingCustomerId || viewingCustomerAccountId;

  useEffect(() => {
    if (!activeCustomerOrderTarget) {
      setCustomerOrders([]);
      return;
    }
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', activeCustomerOrderTarget),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomerOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [activeCustomerOrderTarget]);
  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customers'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'customerGroups'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CustomerGroup)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'customerGroups'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'subsidiaries'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubsidiaries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'subsidiaries'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubJournalEntries = onSnapshot(collection(db, 'journal_entries'), (snapshot) => {
      setAllJournalEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journal_entries'));

    const unsubJournal = onSnapshot(collection(db, 'journal'), (snapshot) => {
      setAllJournal(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journal'));

    const unsubBills = onSnapshot(collection(db, 'bills'), (snapshot) => {
      setAllBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bills'));

    return () => {
      unsubJournalEntries();
      unsubJournal();
      unsubBills();
    };
  }, []);

  const ensureCustomerSubsidiary = async (customerId: string, customerName: string, existingSubsidiaryId?: string) => {
    const existingShared = subsidiaries.find(sub => sub.id === sharedCustomerSubsidiaryId || (sub.name === sharedCustomerSubsidiaryName && sub.type === 'customer'));
    const subsidiaryId = existingShared?.id || sharedCustomerSubsidiaryId;

    await setDoc(doc(db, 'subsidiaries', subsidiaryId), {
      name: sharedCustomerSubsidiaryName,
      type: 'customer',
      parentAccountCode: '1103',
      parentAccountName: 'Accounts Receivable',
      sourceCollection: 'customers',
      sourceId: 'shared-customers',
      isSharedBucket: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await updateDoc(doc(db, 'customers', customerId), {
      subsidiaryId,
      updatedAt: serverTimestamp(),
    });

    return subsidiaryId;
  };

  const linkCustomerToSubsidiary = async (customerId: string, customerName: string, chosenSubsidiaryId?: string) => {
    return ensureCustomerSubsidiary(customerId, customerName, chosenSubsidiaryId);
  };

  const ensureCustomerLedgerAccount = async (customerId: string, customerName: string) => {
    const accountCode = `1103-${customerId.slice(0, 4).toUpperCase()}`;
    await setDoc(doc(db, 'ledgerGroups', accountCode), {
      code: accountCode,
      name: `AR - ${customerName}`,
      type: 'Asset',
      isAccount: true,
      parentGroupId: '1103',
      sourceCollection: 'customers',
      sourceId: customerId,
      description: `Accounts Receivable for ${customerName}`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await updateDoc(doc(db, 'customers', customerId), {
      ledgerAccountCode: accountCode,
      updatedAt: serverTimestamp(),
    });

    return accountCode;
  };

  const handleSaveCustomer = async () => {
    if (!customerForm.name || !customerForm.phone) return;
    try {
      if (editingCustomerId) {
        await updateDoc(doc(db, 'customers', editingCustomerId), customerForm);

        const existingCustomer = customers.find(c => c.id === editingCustomerId) as any;
        await linkCustomerToSubsidiary(
          editingCustomerId,
          customerForm.name || existingCustomer?.name || 'Customer',
          String(customerForm.subsidiaryId || existingCustomer?.subsidiaryId || '') || undefined
        );
        await ensureCustomerLedgerAccount(editingCustomerId, customerForm.name || existingCustomer?.name || 'Customer');
      } else {
        const custDoc = await addDoc(collection(db, 'customers'), customerForm);

        await linkCustomerToSubsidiary(custDoc.id, customerForm.name || 'Customer', String(customerForm.subsidiaryId || '') || undefined);
        await ensureCustomerLedgerAccount(custDoc.id, customerForm.name || 'Customer');
      }
      setIsAddingCustomer(false);
      setEditingCustomerId(null);
      setCustomerForm({ name: '', phone: '', email: '', addresses: [], balance: 0, loyaltyPoints: 0, groupId: '', subsidiaryId: '' });
    } catch (err) {
      handleFirestoreError(err, editingCustomerId ? OperationType.UPDATE : OperationType.CREATE, 'customers');
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setDeletingCustomerId(id);
  };

  const confirmDeleteCustomer = async () => {
    if (!deletingCustomerId) return;
    try {
      await deleteDoc(doc(db, 'customers', deletingCustomerId));
      setDeletingCustomerId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'customers');
    }
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name) return;
    try {
      if (editingGroupId) {
        await updateDoc(doc(db, 'customerGroups', editingGroupId), groupForm);
      } else {
        await addDoc(collection(db, 'customerGroups'), groupForm);
      }
      setIsAddingGroup(false);
      setEditingGroupId(null);
      setGroupForm({ name: '', discountPercentage: 0, description: '' });
    } catch (err) {
      handleFirestoreError(err, editingGroupId ? OperationType.UPDATE : OperationType.CREATE, 'customerGroups');
    }
  };

  const handleDeleteGroup = async (id: string) => {
    setDeletingGroupId(id);
  };

  const confirmDeleteGroup = async () => {
    if (!deletingGroupId) return;
    try {
      await deleteDoc(doc(db, 'customerGroups', deletingGroupId));
      setDeletingGroupId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'customerGroups');
    }
  };

  const downloadCustomerTemplate = () => {
    const data = [{
      Name: 'John Doe',
      Phone: '+971501234567',
      Email: 'john@example.com',
      Group: 'VIP',
      Balance: 0,
      LoyaltyPoints: 100
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "customer_import_template.xlsx");
  };

  const handleBulkImportCustomers = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      try {
        let importedCount = 0;
        for (const row of jsonData as any[]) {
          if (!row.Name || !row.Phone) continue;

          // Check if customer already exists (simple phone check)
          const existing = customers.find(c => c.phone === String(row.Phone));
          if (existing) continue;

          // Find group ID if specified
          let groupId = '';
          if (row.Group) {
            const group = groups.find(g => g.name.toLowerCase() === String(row.Group).toLowerCase());
            if (group) groupId = group.id;
          }

          const customerData = {
            name: row.Name,
            phone: String(row.Phone),
            email: row.Email || '',
            balance: Number(row.Balance) || 0,
            loyaltyPoints: Number(row.LoyaltyPoints) || 0,
            groupId: groupId,
            addresses: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          const custDoc = await addDoc(collection(db, 'customers'), customerData);

          await linkCustomerToSubsidiary(custDoc.id, customerData.name, String((customerData as any).subsidiaryId || '') || undefined);
          await ensureCustomerLedgerAccount(custDoc.id, customerData.name);
          
          importedCount++;
        }
        alert(`Successfully imported ${importedCount} customers!`);
      } catch (err) {
        console.error("Bulk import failed:", err);
        alert("Failed to import customers. Please check the file format.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  const selectedCustomer = viewingCustomerAccountId ? customers.find(c => c.id === viewingCustomerAccountId) : null;
  const selectedCustomerSubsidiaryId = (selectedCustomer as any)?.subsidiaryId || '';
  const selectedCustomerBills = selectedCustomer
    ? allBills.filter(b => b.customerId === selectedCustomer.id || b.customerId === viewingCustomerAccountId || b.vendorId === selectedCustomer.id)
    : [];
  const selectedCustomerJournalEntries = selectedCustomer
    ? allJournalEntries.filter(entry => {
        const customerName = String(selectedCustomer.name || '').toLowerCase();
        const customerLedgerCode = String((selectedCustomer as any).ledgerAccountCode || `1103-${String(selectedCustomer.id || '').slice(0, 4).toUpperCase()}`).toLowerCase();
        const lines = Array.isArray(entry.lines) ? entry.lines : [];
        const lineMatches = lines.some((line: any) =>
          String(line.accountId || '').toLowerCase() === customerLedgerCode ||
          String(line.accountName || '').toLowerCase().includes('accounts receivable') ||
          String(line.accountName || '').toLowerCase().includes(customerName)
        );
        const desc = String(entry.description || '').toLowerCase();
        return entry.customerId === selectedCustomer.id ||
          entry.relatedCustomerId === selectedCustomer.id ||
          lineMatches ||
          desc.includes(customerName);
      })
    : [];
  const selectedCustomerJournal = selectedCustomer
    ? allJournal.filter(entry => {
        const customerName = String(selectedCustomer.name || '').toLowerCase();
        const customerLedgerCode = String((selectedCustomer as any).ledgerAccountCode || `1103-${String(selectedCustomer.id || '').slice(0, 4).toUpperCase()}`).toLowerCase();
        const desc = String(entry.description || '').toLowerCase();
        return entry.customerId === selectedCustomer.id ||
          entry.relatedCustomerId === selectedCustomer.id ||
          String(entry.accountId || '').toLowerCase() === customerLedgerCode ||
          desc.includes(customerName);
      })
    : [];

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-black text-foreground tracking-tight">CRM</h2>
          <p className="text-muted-foreground font-medium mt-1">Manage your customer relationships and loyalty programs.</p>
        </div>
        <div className="flex bg-muted/30 p-1.5 rounded-2xl border border-border backdrop-blur-md">
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'customers' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`}
          >
            Customers
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'groups' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground hover:bg-background'}`}
          >
            Groups & Loyalty
          </button>
        </div>
      </div>

      {activeTab === 'customers' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/30 p-4 rounded-[2rem] border border-border">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                type="text"
                placeholder="Search customers by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-background border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-bold shadow-sm transition-all"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={downloadCustomerTemplate}
                className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-background transition-all shadow-sm"
              >
                <FileSpreadsheet size={16} className="text-emerald-500" />
                Template
              </button>
              <label className="flex items-center gap-2 bg-card border border-border text-muted-foreground px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-background transition-all cursor-pointer shadow-sm">
                <Upload size={16} className="text-primary" />
                Bulk Import
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls" 
                  onChange={(e) => e.target.files?.[0] && handleBulkImportCustomers(e.target.files[0])} 
                />
              </label>
              <button
                onClick={() => {
                  setIsAddingCustomer(true);
                  setEditingCustomerId(null);
                  setCustomerForm({ name: '', phone: '', email: '', addresses: [], balance: 0, loyaltyPoints: 0, groupId: '' });
                }}
                className="flex items-center gap-2 bg-primary text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
              >
                <Plus size={20} />
                Add Customer
              </button>
            </div>
          </div>

          {(isAddingCustomer || editingCustomerId) && (
            <div className="bg-card/50 backdrop-blur-xl p-8 rounded-[2.5rem] border border-border shadow-2xl space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black text-foreground tracking-tight">{editingCustomerId ? 'Edit Customer' : 'Add New Customer'}</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">Required information *</p>
                </div>
                <button onClick={() => { setIsAddingCustomer(false); setEditingCustomerId(null); }} className="p-3 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-foreground">
                  <X size={24} />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Full Name *</label>
                  <input
                    type="text"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                    placeholder="Enter customer name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Phone Number *</label>
                  <input
                    type="text"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                    placeholder="+971 50 123 4567"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                    placeholder="customer@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Customer Group</label>
                  <select
                    value={customerForm.groupId}
                    onChange={(e) => setCustomerForm({ ...customerForm, groupId: e.target.value })}
                    className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold appearance-none cursor-pointer"
                  >
                    <option value="">No Special Group</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.discountPercentage}% Discount)</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Shared Customer Subsidiary</label>
                  <select
                    value={customerForm.subsidiaryId || ''}
                    onChange={(e) => setCustomerForm({ ...customerForm, subsidiaryId: e.target.value })}
                    className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold appearance-none cursor-pointer"
                  >
                    <option value="">Use shared customers bucket</option>
                    {subsidiaries.map(sub => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} {sub.type ? `(${sub.type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Opening Balance</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">{currencySymbol}</span>
                    <input
                      type="number"
                      value={customerForm.balance}
                      onChange={(e) => setCustomerForm({ ...customerForm, balance: Number(e.target.value) })}
                      className="w-full pl-14 pr-4 py-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Loyalty Points</label>
                  <input
                    type="number"
                    value={customerForm.loyaltyPoints}
                    onChange={(e) => setCustomerForm({ ...customerForm, loyaltyPoints: Number(e.target.value) })}
                    className="w-full p-4 bg-background border border-border rounded-2xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold"
                  />
                </div>
              </div>
              
              {/* Addresses Section */}
              <div className="space-y-6 bg-muted/20 p-8 rounded-3xl border border-border">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-foreground tracking-tight">Saved Addresses</h4>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Delivery locations</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setCustomerForm({
                        ...customerForm,
                        addresses: [...(customerForm.addresses || []), { id: Date.now().toString(), label: 'New Address', street: '', city: '', building: '', apartment: '', phone: customerForm.phone || '' }]
                      });
                    }}
                    className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all border border-primary/20"
                  >
                    <Plus size={14} /> Add Address
                  </button>
                </div>
                
                <div className="space-y-4">
                  {(customerForm.addresses || []).length === 0 ? (
                    <div className="py-12 border-2 border-dashed border-border rounded-[2rem] text-center">
                      <MapPin size={40} className="mx-auto text-muted-foreground/30 mb-2" />
                      <p className="text-sm font-bold text-muted-foreground">No addresses added yet</p>
                    </div>
                  ) : (
                    (customerForm.addresses || []).map((addr, idx) => (
                      <div key={addr.id} className="p-6 bg-background border border-border rounded-[2rem] flex flex-col md:flex-row gap-6 items-start group hover:shadow-xl hover:shadow-primary/5 transition-all">
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Label</label>
                            <input
                              type="text"
                              value={addr.label}
                              onChange={(e) => {
                                const newAddresses = [...(customerForm.addresses || [])];
                                newAddresses[idx].label = e.target.value;
                                setCustomerForm({ ...customerForm, addresses: newAddresses });
                              }}
                              className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                              placeholder="e.g. Home"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Phone</label>
                            <input
                              type="text"
                              value={addr.phone}
                              onChange={(e) => {
                                const newAddresses = [...(customerForm.addresses || [])];
                                newAddresses[idx].phone = e.target.value;
                                setCustomerForm({ ...customerForm, addresses: newAddresses });
                              }}
                              className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Street</label>
                            <input
                              type="text"
                              value={addr.street}
                              onChange={(e) => {
                                const newAddresses = [...(customerForm.addresses || [])];
                                newAddresses[idx].street = e.target.value;
                                setCustomerForm({ ...customerForm, addresses: newAddresses });
                              }}
                              className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Building</label>
                            <input
                              type="text"
                              value={addr.building}
                              onChange={(e) => {
                                const newAddresses = [...(customerForm.addresses || [])];
                                newAddresses[idx].building = e.target.value;
                                setCustomerForm({ ...customerForm, addresses: newAddresses });
                              }}
                              className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">City</label>
                            <input
                              type="text"
                              value={addr.city}
                              onChange={(e) => {
                                const newAddresses = [...(customerForm.addresses || [])];
                                newAddresses[idx].city = e.target.value;
                                setCustomerForm({ ...customerForm, addresses: newAddresses });
                              }}
                              className="w-full p-2.5 bg-muted/30 border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const newAddresses = [...(customerForm.addresses || [])];
                            newAddresses.splice(idx, 1);
                            setCustomerForm({ ...customerForm, addresses: newAddresses });
                          }}
                          className="p-3 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all self-center"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-8 border-t border-border mt-8">
                <button
                  onClick={handleSaveCustomer}
                  className="flex items-center gap-2 bg-primary text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
                >
                  <Save size={20} />
                  Save Customer Profile
                </button>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Name</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Contact</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Group</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Balance</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Points</th>
                  <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredCustomers.map(customer => (
                  <tr key={customer.id} className="hover:bg-background/50 transition-colors">
                    <td className="p-4 font-bold text-foreground">{customer.name}</td>
                    <td className="p-4">
                      <p className="font-medium text-foreground">{customer.phone}</p>
                      <p className="text-sm text-muted-foreground">{customer.email}</p>
                    </td>
                    <td className="p-4">
                      {customer.groupId ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-background text-muted-foreground">
                          {groups.find(g => g.id === customer.groupId)?.name || 'Unknown'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`font-bold ${customer.balance > 0 ? 'text-red-500' : customer.balance < 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        {formatCurrency(customer.balance)}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-foreground">{customer.loyaltyPoints}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingCustomerId(customer.id);
                            setCustomerForm(customer);
                            setIsAddingCustomer(false);
                          }}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-background rounded-xl transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => setViewingCustomerId(customer.id)}
                          className="p-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="View Order History"
                        >
                          <FileText size={18} />
                        </button>
                        <button
                          onClick={() => setViewingCustomerAccountId(customer.id)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                          title="View Customer Account"
                        >
                          <CreditCard size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order History Modal */}
      {viewingCustomerId && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl w-full max-w-3xl p-8 space-y-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-border pb-4">
              <h3 className="text-2xl font-black text-foreground tracking-tight">
                Order History for {customers.find(c => c.id === viewingCustomerId)?.name}
              </h3>
              <button onClick={() => setViewingCustomerId(null)} className="p-2 hover:bg-background rounded-full transition-colors">
                <X size={24} className="text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {customerOrders.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
                  <p className="text-lg font-bold text-foreground">No order history</p>
                  <p className="text-muted-foreground">This customer has no orders yet.</p>
                </div>
              ) : (
                customerOrders.map(order => (
                  <div key={order.id} className="bg-background border border-border rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-lg text-foreground">Order #{order.id.slice(-6).toUpperCase()}</p>
                        <p className="text-sm font-bold text-muted-foreground mt-1">
                          {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'Just now'}
                        </p>
                        <div className="flex gap-2 mt-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${order.status === 'finalized' ? 'bg-emerald-100 text-emerald-800' : order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{order.status}</span>
                          <span className="px-2.5 py-1 bg-accent text-foreground rounded-lg text-xs font-black uppercase tracking-widest">{order.orderType}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{order.status === 'finalized' ? 'Total Paid' : 'Total Due'}</p>
                        <p className={`text-2xl font-black ${order.status === 'finalized' ? 'text-emerald-500' : order.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-red-500'}`}>{formatCurrency(order.total)}</p>
                      </div>
                    </div>
                    
                    <div className="border-t border-border pt-4">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Items</p>
                      <div className="space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-muted-foreground font-bold"><span className="text-muted-foreground mr-2">{item.quantity}x</span> {item.name}</span>
                            <span className="text-foreground font-black">{formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl w-full max-w-5xl p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-4">
              <div>
                <h3 className="text-2xl font-black text-foreground tracking-tight">Customer Account: {selectedCustomer.name}</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                  Subsidiary: {selectedCustomerSubsidiaryId || 'Not linked'} | Ledger: {(selectedCustomer as any).ledgerAccountCode || 'Not linked'}
                </p>
              </div>
              <button onClick={() => setViewingCustomerAccountId(null)} className="p-2 hover:bg-background rounded-full transition-colors">
                <X size={24} className="text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 border border-border rounded-2xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Orders</p>
                <p className="text-2xl font-black text-foreground mt-2">{customerOrders.length}</p>
              </div>
              <div className="p-4 border border-border rounded-2xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bills</p>
                <p className="text-2xl font-black text-foreground mt-2">{selectedCustomerBills.length}</p>
              </div>
              <div className="p-4 border border-border rounded-2xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Journal Entries</p>
                <p className="text-2xl font-black text-foreground mt-2">{selectedCustomerJournalEntries.length}</p>
              </div>
              <div className="p-4 border border-border rounded-2xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Journal Records</p>
                <p className="text-2xl font-black text-foreground mt-2">{selectedCustomerJournal.length}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">Customer Bills</h4>
                <div className="space-y-2">
                  {selectedCustomerBills.length === 0 ? <p className="text-sm text-muted-foreground">No customer bills found.</p> : selectedCustomerBills.map((bill: any) => (
                    <div key={bill.id} className="p-4 border border-border rounded-xl flex justify-between gap-4">
                      <div>
                        <p className="font-bold text-foreground">{bill.description || `Bill ${bill.id.slice(-6).toUpperCase()}`}</p>
                        <p className="text-xs text-muted-foreground">status: {bill.status || 'open'}</p>
                      </div>
                      <p className="font-black text-foreground">{formatCurrency(Number(bill.totalAmount || bill.amount || 0))}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">Journal Entries</h4>
                <div className="space-y-2">
                  {selectedCustomerJournalEntries.length === 0 ? <p className="text-sm text-muted-foreground">No journal entries found.</p> : selectedCustomerJournalEntries.map((entry: any) => (
                    <div key={entry.id} className="p-4 border border-border rounded-xl">
                      <p className="font-bold text-foreground">{entry.description || `Entry ${entry.id.slice(-6).toUpperCase()}`}</p>
                      <p className="text-xs text-muted-foreground mt-1">ref: {entry.reference || 'n/a'} | subsidiary: {entry.subsidiaryId || 'n/a'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-3">Journal Records</h4>
                <div className="space-y-2">
                  {selectedCustomerJournal.length === 0 ? <p className="text-sm text-muted-foreground">No journal records found.</p> : selectedCustomerJournal.map((entry: any) => (
                    <div key={entry.id} className="p-4 border border-border rounded-xl flex justify-between gap-4">
                      <p className="font-bold text-foreground">{entry.description || 'Journal record'}</p>
                      <p className="font-black text-foreground">{formatCurrency(Number(entry.amount || 0))}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">Customer Groups</h3>
            <button
              onClick={() => {
                setIsAddingGroup(true);
                setEditingGroupId(null);
                setGroupForm({ name: '', discountPercentage: 0, description: '' });
              }}
              className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors"
            >
              <Plus size={20} />
              Add Group
            </button>
          </div>

          {(isAddingGroup || editingGroupId) && (
            <div className="bg-background p-6 rounded-2xl border border-border space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">{editingGroupId ? 'Edit Group' : 'New Group'}</h3>
                <button onClick={() => { setIsAddingGroup(false); setEditingGroupId(null); }} className="p-2 hover:bg-accent rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Group Name</label>
                  <input
                    type="text"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    className="w-full p-3 bg-card border border-border rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Discount Percentage (%)</label>
                  <input
                    type="number"
                    value={groupForm.discountPercentage}
                    onChange={(e) => setGroupForm({ ...groupForm, discountPercentage: Number(e.target.value) })}
                    className="w-full p-3 bg-card border border-border rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Description</label>
                  <input
                    type="text"
                    value={groupForm.description}
                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                    className="w-full p-3 bg-card border border-border rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSaveGroup}
                  className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors"
                >
                  <Save size={20} />
                  Save Group
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {groups.map(group => (
              <div key={group.id} className="bg-card border border-border rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-xl text-foreground">{group.name}</h4>
                    {group.description && <p className="text-sm text-muted-foreground mt-1">{group.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingGroupId(group.id);
                        setGroupForm(group);
                        setIsAddingGroup(false);
                      }}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-background rounded-xl transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl w-fit">
                  <Tag size={16} />
                  <span className="font-bold">{group.discountPercentage}% Discount</span>
                </div>
                <div className="pt-4 border-t border-border">
                  <p className="text-sm font-bold text-muted-foreground">
                    {customers.filter(c => c.groupId === group.id).length} Customers in group
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {deletingCustomerId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Delete Customer?</h3>
            <p className="text-muted-foreground mb-8">Are you sure you want to delete this customer? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingCustomerId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-muted-foreground bg-background hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCustomer}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingGroupId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Delete Group?</h3>
            <p className="text-muted-foreground mb-8">Are you sure you want to delete this group? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingGroupId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-muted-foreground bg-background hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteGroup}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
