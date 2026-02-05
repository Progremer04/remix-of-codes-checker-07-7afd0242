import { useEffect, useRef } from 'react';
import { ProgressUpdate } from '@/hooks/useRealtimeProgress';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LiveProgressFeedProps {
  updates: ProgressUpdate[];
  isConnected: boolean;
  total: number;
}

const statusConfig = {
  checking: { icon: Loader2, color: 'text-blue-400', animate: true },
  success: { icon: CheckCircle, color: 'text-green-400', animate: false },
  valid: { icon: CheckCircle, color: 'text-green-400', animate: false },
  failed: { icon: XCircle, color: 'text-red-400', animate: false },
  invalid: { icon: XCircle, color: 'text-red-400', animate: false },
  no_codes: { icon: AlertCircle, color: 'text-yellow-400', animate: false },
  '2fa': { icon: AlertCircle, color: 'text-orange-400', animate: false },
  locked: { icon: XCircle, color: 'text-red-500', animate: false },
};

export function LiveProgressFeed({ updates, isConnected, total }: LiveProgressFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [updates]);

  if (updates.length === 0) {
    return null;
  }

  const completed = updates.filter(u => u.status !== 'checking').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="card-3d rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-muted-foreground">
            Live Progress
          </span>
        </div>
        <span className="text-sm font-mono text-primary">
          {completed}/{total} ({percentage}%)
        </span>
      </div>

      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div 
          className="h-full gradient-primary transition-all duration-300 ease-out rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <ScrollArea className="h-48 rounded-lg bg-background/50 border border-border/50">
        <div ref={scrollRef} className="p-3 space-y-1.5 font-mono text-xs">
          {updates.map((update, idx) => {
            const config = statusConfig[update.status] || statusConfig.failed;
            const Icon = config.icon;
            
            return (
              <div 
                key={`${update.index}-${idx}`}
                className="flex items-center gap-2 py-1 animate-fade-in"
              >
                <Icon 
                  className={`w-3.5 h-3.5 ${config.color} ${config.animate ? 'animate-spin' : ''}`} 
                />
                <span className="text-muted-foreground">[{update.index}/{update.total}]</span>
                <span className="text-foreground truncate flex-1">
                  {update.email.length > 30 ? update.email.substring(0, 30) + '...' : update.email}
                </span>
                <span className={config.color}>
                  {update.status === 'checking' ? 'checking...' : update.status}
                </span>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
