import { useState, useEffect } from 'react';
import { X, ChevronUp, ChevronDown, Activity, Zap, CheckCircle, XCircle, Shield, Lock, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProgressUpdate } from '@/hooks/useRealtimeProgress';

interface MiniProgressPlayerProps {
  sessionId: string | null;
  service: string;
  updates: ProgressUpdate[];
  isConnected: boolean;
  onClose: () => void;
  className?: string;
}

export function MiniProgressPlayer({
  sessionId,
  service,
  updates,
  isConnected,
  onClose,
  className
}: MiniProgressPlayerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Filter out COMPLETE row for stats
  const accountUpdates = updates.filter(u => u.email !== 'COMPLETE');
  const completionRow = updates.find(u => u.email === 'COMPLETE');
  
  // Calculate stats
  const total = accountUpdates.length > 0 ? accountUpdates[0]?.total || accountUpdates.length : 0;
  const processed = accountUpdates.filter(u => u.status !== 'checking').length;
  const valid = accountUpdates.filter(u => u.status === 'valid' || u.status === 'success').length;
  const invalid = accountUpdates.filter(u => u.status === 'invalid' || u.status === 'failed').length;
  const twoFa = accountUpdates.filter(u => u.status === '2fa').length;
  const locked = accountUpdates.filter(u => u.status === 'locked').length;
  const noCodes = accountUpdates.filter(u => u.status === 'no_codes').length;
  
  const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isComplete = completionRow !== undefined || (processed === total && total > 0);

  // Get recent hits (valid accounts with extra data)
  const recentHits = accountUpdates
    .filter(u => (u.status === 'valid' || u.status === 'success') && u.message.length > 20)
    .slice(-5)
    .reverse();

  // Get service display name
  const getServiceName = (svc: string) => {
    const names: Record<string, string> = {
      'hotmail_validator': 'Hotmail Checker',
      'xbox_fetcher': 'Xbox Fetcher',
      'manus_checker': 'Manus Checker',
      'codes_checker': 'Codes Checker',
      'wlid_claimer': 'WLID Claimer'
    };
    return names[svc] || svc;
  };

  // Get service color
  const getServiceColor = (svc: string) => {
    const colors: Record<string, string> = {
      'hotmail_validator': 'from-blue-500 to-cyan-500',
      'xbox_fetcher': 'from-green-500 to-emerald-500',
      'manus_checker': 'from-purple-500 to-pink-500',
      'codes_checker': 'from-orange-500 to-amber-500',
      'wlid_claimer': 'from-indigo-500 to-violet-500'
    };
    return colors[svc] || 'from-gray-500 to-slate-500';
  };

  if (!sessionId || !isVisible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl transition-all duration-300",
        isExpanded ? "h-auto max-h-[60vh]" : "h-auto",
        className
      )}
    >
      {/* Header - Spotify style */}
      <div
        className={cn(
          "flex items-center justify-between p-3 cursor-pointer rounded-t-xl bg-gradient-to-r",
          getServiceColor(service)
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Activity className="h-5 w-5 text-white animate-pulse" />
            {isConnected && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-400 animate-ping" />
            )}
          </div>
          <div className="text-white">
            <p className="text-sm font-semibold">{getServiceName(service)}</p>
            <p className="text-xs opacity-80">
              {isComplete ? 'Complete' : `Processing ${processed}/${total}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 py-2 border-b border-border/30">
        <Progress value={progress} className="h-1.5" />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">{progress}%</span>
          <span className="text-[10px] text-muted-foreground">{processed}/{total}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap border-b border-border/30">
        <Badge variant="outline" className="text-[10px] gap-1 bg-green-500/10 text-green-500 border-green-500/30">
          <CheckCircle className="h-3 w-3" />
          {valid}
        </Badge>
        <Badge variant="outline" className="text-[10px] gap-1 bg-red-500/10 text-red-500 border-red-500/30">
          <XCircle className="h-3 w-3" />
          {invalid}
        </Badge>
        {twoFa > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
            <Shield className="h-3 w-3" />
            {twoFa}
          </Badge>
        )}
        {locked > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-orange-500/10 text-orange-500 border-orange-500/30">
            <Lock className="h-3 w-3" />
            {locked}
          </Badge>
        )}
        {noCodes > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-blue-500/10 text-blue-500 border-blue-500/30">
            <AlertCircle className="h-3 w-3" />
            {noCodes}
          </Badge>
        )}
      </div>

      {/* Expanded content - Recent hits */}
      {isExpanded && (
        <div className="p-3 max-h-48 overflow-y-auto space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            Recent Hits
          </p>
          {recentHits.length > 0 ? (
            recentHits.map((hit, idx) => (
              <div
                key={idx}
                className="p-2 rounded-lg bg-muted/50 border border-border/30"
              >
                <p className="text-xs font-mono text-foreground truncate">
                  {hit.email}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {hit.message.replace('✓ Valid | ', '').replace('✓ Valid', 'Valid')}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">No hits yet...</p>
          )}
        </div>
      )}
    </div>
  );
}
