import React, { useState, useEffect } from 'react';
import { collection, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { safeOnSnapshot as onSnapshot } from '../utils/firestoreSafeSnapshot';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { 
  Star, MessageSquare, User, Calendar, Trash2, Reply, CheckCircle2, 
  X, Filter, Search, ThumbsUp, TrendingUp, ChevronRight
} from 'lucide-react';

interface Feedback {
  id: string;
  orderId?: string;
  customerName: string;
  rating: number; // 1-5
  comment: string;
  status: 'pending' | 'responded' | 'hidden';
  response?: string;
  createdAt: any;
  source: 'pos' | 'online' | 'app' | 'delivery';
  tags?: string[];
}

export default function FeedbackSection() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'responded'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [respondingTo, setRespondingTo] = useState<Feedback | null>(null);
  const [responseMsg, setResponseMsg] = useState('');

  const safeText = (value: unknown) => (typeof value === 'string' ? value : '');

  useEffect(() => {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setFeedbacks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Feedback)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'feedback'));
    return () => unsub();
  }, []);

  const handleResponse = async () => {
    if (!respondingTo || !responseMsg.trim()) return;
    try {
      await updateDoc(doc(db, 'feedback', respondingTo.id), {
        response: responseMsg,
        status: 'responded',
        respondedAt: serverTimestamp()
      });
      setRespondingTo(null);
      setResponseMsg('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `feedback/${respondingTo.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently delete this customer feedback?')) return;
    try {
      await deleteDoc(doc(db, 'feedback', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `feedback/${id}`);
    }
  };

  const filteredFeedbacks = feedbacks.filter(f => {
    const matchesFilter = filter === 'all' || f.status === filter;
    const customerName = safeText(f.customerName);
    const comment = safeText(f.comment);
    const matchesSearch = customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          comment.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const avgRating = feedbacks.length > 0 
    ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
    : '0.0';

  const stats = {
    total: feedbacks.length,
    pending: feedbacks.filter(f => f.status === 'pending').length,
    responded: feedbacks.filter(f => f.status === 'responded').length,
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'Just now';
    try {
      // Handle both Firestore timestamps and raw JS Dates
      const date = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Pending';
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-foreground uppercase tracking-tight">Vibe Analytics</h2>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest leading-none mt-1">
            {stats.total} total reviews · Average <span className="text-emerald-500">{avgRating} ★</span> satisfaction
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search sentiment..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-primary outline-none min-w-[240px] transition-all"
            />
          </div>
        </div>
      </div>

      {/* Modern Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Inflow', value: stats.total, color: 'text-foreground', bg: 'bg-muted/30' },
          { label: 'Avg Delight', value: `${avgRating} ★`, color: 'text-emerald-400', bg: 'bg-emerald-400/5' },
          { label: 'Needs Attention', value: stats.pending, color: 'text-amber-400', bg: 'bg-amber-400/5' },
          { label: 'Resolution Rate', value: `${stats.total > 0 ? ((stats.responded/stats.total)*100).toFixed(0) : 0}%`, color: 'text-indigo-400', bg: 'bg-indigo-400/5' },
        ].map(s => (
          <div key={s.label} className={`p-8 ${s.bg} border border-border rounded-[2.5rem] flex flex-col justify-center shadow-sm`}>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Segmented Filter */}
      <div className="flex items-center gap-2 bg-muted/20 border border-border p-1.5 rounded-2xl w-fit shadow-inner">
        {(['all', 'pending', 'responded'] as const).map(f => (
          <button 
            key={f}
            onClick={() => setFilter(f)}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              filter === f ? 'bg-foreground text-card shadow-lg' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Review Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredFeedbacks.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-card border border-border rounded-[3rem] border-dashed">
            <MessageSquare className="mx-auto text-muted-foreground/50 mb-6" size={56} />
            <h3 className="text-xl font-black text-foreground uppercase tracking-tight">No Sentiment Recorded</h3>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2">{searchTerm ? 'Broaden your search criteria' : 'Engagement will appear here'}</p>
          </div>
        ) : filteredFeedbacks.map(f => (
          <div key={f.id} className="bg-card border border-border rounded-[2.5rem] p-8 space-y-6 hover:shadow-xl hover:-translate-y-1 transition-all group overflow-hidden relative">
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[1.25rem] bg-foreground text-card flex items-center justify-center font-black text-sm uppercase shadow-lg">
                  {safeText(f.customerName).charAt(0) || '?'}
                </div>
                <div>
                  <h4 className="font-black text-foreground text-base tracking-tight">{safeText(f.customerName) || 'Anonymous Guest'}</h4>
                  <div className="flex items-center gap-1 mt-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star key={star} size={12} className={star <= f.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50'} />
                    ))}
                    <span className="text-[9px] text-muted-foreground font-black ml-2 uppercase tracking-widest opacity-60">Via {f.source}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-wider ${
                  f.status === 'responded' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {f.status}
                </span>
                <button onClick={() => handleDelete(f.id)} className="p-2 text-rose-400 hover:bg-rose-400/10 rounded-xl transition-all">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <p className="text-sm font-medium text-foreground italic leading-relaxed bg-muted/10 p-5 rounded-[1.5rem] border border-border/30">
              "{safeText(f.comment) || 'No comment provided.'}"
            </p>

            {f.response ? (
              <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[1.5rem] space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                  <Reply size={40} className="text-indigo-500" />
                </div>
                <div className="flex items-center gap-2 text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">
                   Manager Response
                </div>
                <p className="text-xs font-semibold text-foreground/90 leading-relaxed">{f.response}</p>
              </div>
            ) : (
              <button 
                onClick={() => setRespondingTo(f)}
                className="flex items-center gap-2 text-[10px] font-black text-primary hover:translate-x-1 transition-transform uppercase tracking-widest"
              >
                <Reply size={16} /> Craft professional response
              </button>
            )}

            <div className="flex items-center justify-between text-[9px] text-muted-foreground font-black uppercase tracking-widest border-t border-border pt-4 mt-2">
              <span className="flex items-center gap-1.5"><Calendar size={12} className="text-primary" /> {formatDate(f.createdAt)}</span>
              {f.orderId && <span className="bg-muted px-2 py-0.5 rounded-md">ID: {safeText(f.orderId).slice(-6).toUpperCase()}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Modern Dialog */}
      {respondingTo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="p-8 border-b border-border flex justify-between items-center bg-muted/5">
              <div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight">Public Response</h3>
                <p className="text-[10px] font-black text-muted-foreground uppercase mt-1 tracking-widest">Managing sentiment for {respondingTo.customerName}</p>
              </div>
              <button onClick={() => setRespondingTo(null)} className="p-3 bg-muted/50 text-muted-foreground rounded-full hover:bg-border transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="p-5 bg-muted/30 rounded-[1.5rem] border border-border">
                <p className="text-[9px] font-black text-muted-foreground uppercase mb-2 tracking-widest">Original Sentiment:</p>
                <p className="text-sm italic font-medium">"{respondingTo.comment}"</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase ml-1 tracking-widest">Official Reply</label>
                <textarea 
                  value={responseMsg}
                  onChange={e => setResponseMsg(e.target.value)}
                  placeholder="Draft your response here..."
                  className="w-full p-6 bg-background border border-border rounded-[2rem] text-sm focus:ring-2 focus:ring-primary outline-none h-40 resize-none font-medium transition-all"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setRespondingTo(null)}
                  className="flex-1 py-4 bg-muted/50 text-foreground rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all"
                >
                  Discard
                </button>
                <button 
                  onClick={handleResponse}
                  className="flex-[2] py-4 bg-foreground text-card rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-zinc-900/10 hover:scale-[1.02] transition-all"
                >
                  Publish Response
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
