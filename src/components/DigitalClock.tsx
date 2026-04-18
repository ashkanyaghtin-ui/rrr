import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function DigitalClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-background/50 backdrop-blur-md rounded-2xl border border-border shadow-sm">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-inner">
        <Clock size={16} className="animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-black text-foreground tabular-nums leading-none">
          {time.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
          {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}
