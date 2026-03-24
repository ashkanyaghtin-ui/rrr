import React, { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { Customer, CustomerGroup, Order } from '../types';
import { Users, Plus, Edit2, Trash2, Save, X, Search, MapPin, CreditCard, Tag, FileText, CheckCircle2, Download } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { exportToExcel } from '../utils/excel';

export default function CRM() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
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
    groupId: ''
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
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!viewingCustomerId) {
      setCustomerOrders([]);
      return;
    }
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', viewingCustomerId),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomerOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'orders'));
    return () => unsubscribe();
  }, [viewingCustomerId]);
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

  const handleSaveCustomer = async () => {
    if (!customerForm.name || !customerForm.phone) return;
    try {
      if (editingCustomerId) {
        await updateDoc(doc(db, 'customers', editingCustomerId), customerForm);
      } else {
        await addDoc(collection(db, 'customers'), customerForm);
      }
      setIsAddingCustomer(false);
      setEditingCustomerId(null);
      setCustomerForm({ name: '', phone: '', email: '', addresses: [], balance: 0, loyaltyPoints: 0, groupId: '' });
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

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.phone.includes(searchQuery)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-zinc-900">CRM</h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportToExcel(activeTab === 'customers' ? customers : groups, activeTab === 'customers' ? 'Customers' : 'Customer_Groups')}
            className="flex items-center gap-2 bg-white border border-zinc-200 text-zinc-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-50 transition-all mr-2"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'customers' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
          >
            Customers
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 rounded-xl font-bold transition-all ${activeTab === 'groups' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
          >
            Groups & Loyalty
          </button>
        </div>
      </div>

      {activeTab === 'customers' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
              <input
                type="text"
                placeholder="Search customers by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium"
              />
            </div>
            <button
              onClick={() => {
                setIsAddingCustomer(true);
                setEditingCustomerId(null);
                setCustomerForm({ name: '', phone: '', email: '', addresses: [], balance: 0, loyaltyPoints: 0, groupId: '' });
              }}
              className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors"
            >
              <Plus size={20} />
              Add Customer
            </button>
          </div>

          {(isAddingCustomer || editingCustomerId) && (
            <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-200 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">{editingCustomerId ? 'Edit Customer' : 'New Customer'}</h3>
                <button onClick={() => { setIsAddingCustomer(false); setEditingCustomerId(null); }} className="p-2 hover:bg-zinc-200 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Phone</label>
                  <input
                    type="text"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Group</label>
                  <select
                    value={customerForm.groupId}
                    onChange={(e) => setCustomerForm({ ...customerForm, groupId: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  >
                    <option value="">None</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Balance</label>
                  <input
                    type="number"
                    value={customerForm.balance}
                    onChange={(e) => setCustomerForm({ ...customerForm, balance: Number(e.target.value) })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Loyalty Points</label>
                  <input
                    type="number"
                    value={customerForm.loyaltyPoints}
                    onChange={(e) => setCustomerForm({ ...customerForm, loyaltyPoints: Number(e.target.value) })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              
              {/* Addresses Section */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-bold text-zinc-500">Addresses</label>
                  <button
                    onClick={() => {
                      setCustomerForm({
                        ...customerForm,
                        addresses: [...(customerForm.addresses || []), { id: Date.now().toString(), label: 'New Address', street: '', city: '', building: '', apartment: '', phone: '' }]
                      });
                    }}
                    className="text-sm font-bold text-primary flex items-center gap-1"
                  >
                    <Plus size={16} /> Add Address
                  </button>
                </div>
                <div className="space-y-3">
                  {(customerForm.addresses || []).map((addr, idx) => (
                    <div key={addr.id} className="p-4 bg-white border border-zinc-200 rounded-xl flex gap-4 items-start">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Label (e.g., Home)"
                          value={addr.label}
                          onChange={(e) => {
                            const newAddresses = [...(customerForm.addresses || [])];
                            newAddresses[idx].label = e.target.value;
                            setCustomerForm({ ...customerForm, addresses: newAddresses });
                          }}
                          className="p-2 border border-zinc-200 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Street"
                          value={addr.street}
                          onChange={(e) => {
                            const newAddresses = [...(customerForm.addresses || [])];
                            newAddresses[idx].street = e.target.value;
                            setCustomerForm({ ...customerForm, addresses: newAddresses });
                          }}
                          className="p-2 border border-zinc-200 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Building"
                          value={addr.building}
                          onChange={(e) => {
                            const newAddresses = [...(customerForm.addresses || [])];
                            newAddresses[idx].building = e.target.value;
                            setCustomerForm({ ...customerForm, addresses: newAddresses });
                          }}
                          className="p-2 border border-zinc-200 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          placeholder="City"
                          value={addr.city}
                          onChange={(e) => {
                            const newAddresses = [...(customerForm.addresses || [])];
                            newAddresses[idx].city = e.target.value;
                            setCustomerForm({ ...customerForm, addresses: newAddresses });
                          }}
                          className="p-2 border border-zinc-200 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const newAddresses = [...(customerForm.addresses || [])];
                          newAddresses.splice(idx, 1);
                          setCustomerForm({ ...customerForm, addresses: newAddresses });
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSaveCustomer}
                  className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-zinc-800 transition-colors"
                >
                  <Save size={20} />
                  Save Customer
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Name</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Contact</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Group</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Balance</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">Points</th>
                  <th className="p-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredCustomers.map(customer => (
                  <tr key={customer.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="p-4 font-bold text-zinc-900">{customer.name}</td>
                    <td className="p-4">
                      <p className="font-medium text-zinc-900">{customer.phone}</p>
                      <p className="text-sm text-zinc-500">{customer.email}</p>
                    </td>
                    <td className="p-4">
                      {customer.groupId ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-600">
                          {groups.find(g => g.id === customer.groupId)?.name || 'Unknown'}
                        </span>
                      ) : (
                        <span className="text-zinc-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`font-bold ${customer.balance > 0 ? 'text-red-500' : customer.balance < 0 ? 'text-emerald-500' : 'text-zinc-500'}`}>
                        {formatCurrency(customer.balance)}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-zinc-900">{customer.loyaltyPoints}</td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingCustomerId(customer.id);
                            setCustomerForm(customer);
                            setIsAddingCustomer(false);
                          }}
                          className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => setViewingCustomerId(customer.id)}
                          className="p-2 text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="View Order History"
                        >
                          <FileText size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
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
          <div className="bg-white rounded-3xl w-full max-w-3xl p-8 space-y-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-4">
              <h3 className="text-2xl font-black text-zinc-900 tracking-tight">
                Order History for {customers.find(c => c.id === viewingCustomerId)?.name}
              </h3>
              <button onClick={() => setViewingCustomerId(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                <X size={24} className="text-zinc-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {customerOrders.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
                  <p className="text-lg font-bold text-zinc-900">No order history</p>
                  <p className="text-zinc-500">This customer has no orders yet.</p>
                </div>
              ) : (
                customerOrders.map(order => (
                  <div key={order.id} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-lg text-zinc-900">Order #{order.id.slice(-6).toUpperCase()}</p>
                        <p className="text-sm font-bold text-zinc-500 mt-1">{order.createdAt?.toDate().toLocaleString()}</p>
                        <div className="flex gap-2 mt-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-widest ${order.status === 'finalized' ? 'bg-emerald-100 text-emerald-800' : order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{order.status}</span>
                          <span className="px-2.5 py-1 bg-zinc-200 text-zinc-700 rounded-lg text-xs font-black uppercase tracking-widest">{order.orderType}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">{order.status === 'finalized' ? 'Total Paid' : 'Total Due'}</p>
                        <p className={`text-2xl font-black ${order.status === 'finalized' ? 'text-emerald-500' : order.status === 'cancelled' ? 'text-zinc-400 line-through' : 'text-red-500'}`}>{formatCurrency(order.total)}</p>
                      </div>
                    </div>
                    
                    <div className="border-t border-zinc-200 pt-4">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Items</p>
                      <div className="space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-zinc-600 font-bold"><span className="text-zinc-400 mr-2">{item.quantity}x</span> {item.name}</span>
                            <span className="text-zinc-900 font-black">{formatCurrency(item.price * item.quantity)}</span>
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
            <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-200 space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">{editingGroupId ? 'Edit Group' : 'New Group'}</h3>
                <button onClick={() => { setIsAddingGroup(false); setEditingGroupId(null); }} className="p-2 hover:bg-zinc-200 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Group Name</label>
                  <input
                    type="text"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Discount Percentage (%)</label>
                  <input
                    type="number"
                    value={groupForm.discountPercentage}
                    onChange={(e) => setGroupForm({ ...groupForm, discountPercentage: Number(e.target.value) })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-zinc-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={groupForm.description}
                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                    className="w-full p-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:border-primary"
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
              <div key={group.id} className="bg-white border border-zinc-200 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-black text-xl text-zinc-900">{group.name}</h4>
                    {group.description && <p className="text-sm text-zinc-500 mt-1">{group.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingGroupId(group.id);
                        setGroupForm(group);
                        setIsAddingGroup(false);
                      }}
                      className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl w-fit">
                  <Tag size={16} />
                  <span className="font-bold">{group.discountPercentage}% Discount</span>
                </div>
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-sm font-bold text-zinc-500">
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
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">Delete Customer?</h3>
            <p className="text-zinc-500 mb-8">Are you sure you want to delete this customer? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingCustomerId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
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
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={32} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">Delete Group?</h3>
            <p className="text-zinc-500 mb-8">Are you sure you want to delete this group? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeletingGroupId(null)}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors"
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
