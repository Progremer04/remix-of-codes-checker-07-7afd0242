import { useEffect, useRef, useMemo, useState } from 'react';
import { ProgressUpdate } from '@/hooks/useRealtimeProgress';
import { CheckCircle, XCircle, AlertCircle, Loader2, Lock, ShieldAlert, Zap, Wifi, WifiOff, Globe, Clock, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LiveProgressFeedProps {
  updates: ProgressUpdate[];
  isConnected: boolean;
  total: number;
  clientIp?: string;
  timezone?: string;
  showShortcuts?: boolean;
  onClear?: () => void;
}

const statusConfig = {
  checking: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-500/10', animate: true, label: '⟳' },
  success: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-500/10', animate: false, label: '✓' },
  valid: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-500/10', animate: false, label: '✓' },
  failed: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10', animate: false, label: '✗' },
  invalid: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-500/10', animate: false, label: '✗' },
  no_codes: { icon: AlertCircle, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', animate: false, label: '○' },
  '2fa': { icon: ShieldAlert, color: 'text-orange-400', bgColor: 'bg-orange-500/10', animate: false, label: '🔐' },
  locked: { icon: Lock, color: 'text-red-500', bgColor: 'bg-red-500/10', animate: false, label: '🔒' },
  error: { icon: AlertCircle, color: 'text-gray-400', bgColor: 'bg-gray-500/10', animate: false, label: '!' },
};

export function LiveProgressFeed({ updates, isConnected, total, clientIp, timezone, showShortcuts = true, onClear }: LiveProgressFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [localTime, setLocalTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false }));

  // The backend sends a final "COMPLETE" row. It must NOT count toward progress,
  // otherwise it can skew percentages and (previously) overwrite the last account.
  const accountUpdates = useMemo(
    () => updates.filter((u) => u.email !== 'COMPLETE'),
    [updates]
  );

  // Check if processing is complete - based on actual total, not updates length
  const isComplete = useMemo(() => {
    if (accountUpdates.length === 0 || total <= 0) return false;
    const nonChecking = accountUpdates.filter((u) => u.status !== 'checking').length;
    // Consider complete when all items are done (not checking)
    return nonChecking >= total;
  }, [accountUpdates, total]);

  // Calculate stats like Python's LiveStats
  const stats = useMemo(() => {
    const checking = accountUpdates.filter((u) => u.status === 'checking').length;
    const completed = accountUpdates.filter((u) => u.status !== 'checking');
    const hits = completed.filter((u) => u.status === 'valid' || u.status === 'success').length;
    const twoFa = completed.filter((u) => u.status === '2fa').length;
    const locked = completed.filter((u) => u.status === 'locked').length;
    const bads = completed.filter((u) => u.status === 'invalid' || u.status === 'failed').length;
    const errors = completed.filter((u) => u.status === 'error').length;
    const noCodes = completed.filter((u) => u.status === 'no_codes').length;

    // Calculate CPM (checks per minute)
    const now = Date.now();
    const windowMs = 60_000;
    const windowCompleted = completed.filter((u) => u.timestamp >= now - windowMs);
    let cpm = 0;
    if (windowCompleted.length >= 2) {
      const first = windowCompleted[0];
      const last = windowCompleted[windowCompleted.length - 1];
      const elapsedMs = last.timestamp - first.timestamp;
      const elapsedMin = elapsedMs / 60000;
      if (elapsedMin > 0) cpm = Math.round(windowCompleted.length / elapsedMin);
    }

    // Estimated time remaining
    let eta = '--:--';
    if (cpm > 0 && total > 0) {
      const remaining = total - completed.length;
      const etaSeconds = Math.round((remaining / cpm) * 60);
      const etaMins = Math.floor(etaSeconds / 60).toString().padStart(2, '0');
      const etaSecs = (etaSeconds % 60).toString().padStart(2, '0');
      eta = `${etaMins}:${etaSecs}`;
    }

    return {
      checking,
      completed: completed.length,
      hits,
      twoFa,
      locked,
      bads,
      errors,
      noCodes,
      cpm,
      eta,
      // Use actual total passed in, not updates length
      percentage: total > 0 ? Math.round((completed.length / total) * 100) : 0
    };
  }, [accountUpdates, total]);

  // Format elapsed time
  const getElapsedTime = () => {
    if (accountUpdates.length < 2) return "00:00";
    const elapsed = Math.floor((accountUpdates[accountUpdates.length - 1].timestamp - accountUpdates[0].timestamp) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Auto-scroll when new updates come in
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [updates, autoScroll]);

  // Update local time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Detect when user manually scrolls
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  if (updates.length === 0) {
    return null;
  }

  return (
    <div className="card-3d relative rounded-xl p-4 space-y-3 font-mono animate-fade-in">
      {/* Header with status, IP/Timezone, and clear button */}
      <div className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2.5 h-2.5 rounded-full transition-colors",
              isComplete ? 'bg-green-500' : isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )} />
            {isComplete ? (
              <span className="text-green-400 font-semibold">✓ Complete!</span>
            ) : isConnected ? (
              <span className="text-green-400 flex items-center gap-1">
                <Wifi className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="text-red-400 flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Disconnected
              </span>
            )}
          </div>
          
          {/* IP Address */}
          {clientIp && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {clientIp}
            </span>
          )}
          
          {/* Timezone/Time */}
          <span className="text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {localTime} {timezone && `(${timezone.split('/').pop()})`}
          </span>
        </div>
        
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="text-yellow-400 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {stats.cpm} CPM
          </span>
          <span>ETA: {isComplete ? 'Done' : stats.eta}</span>
          
          {/* Clear button */}
          {onClear && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClear}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      {showShortcuts && !isComplete && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-3 border-b border-border/30 pb-2">
          <span>Shortcuts:</span>
          <span className="px-1.5 py-0.5 bg-secondary rounded text-foreground">P</span>
          <span>Pause</span>
          <span className="px-1.5 py-0.5 bg-secondary rounded text-foreground">S</span>
          <span>Save</span>
          <span className="px-1.5 py-0.5 bg-secondary rounded text-foreground">Q</span>
          <span>Quit</span>
        </div>
      )}
      
      {/* Python-style status bar with stats */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {/* Progress count */}
        <span className="text-blue-400 font-bold">[{stats.completed}/{total}]</span>
        
        {/* Stats with icons */}
        <StatBadge count={stats.checking} label="Checking" color="text-blue-300" icon="⟳" show={true} />
        <StatBadge count={stats.hits} label="Valid" color="text-green-400" icon="✓" show={true} />
        <StatBadge count={stats.twoFa} label="2FA" color="text-orange-400" icon="🔐" show={true} />
        <StatBadge count={stats.locked} label="Locked" color="text-red-500" icon="🔒" show={true} />
        <StatBadge count={stats.bads} label="Invalid" color="text-red-400" icon="✗" show={true} />
        <StatBadge count={stats.noCodes} label="No Codes" color="text-yellow-400" icon="○" show={true} />
        <StatBadge count={stats.errors} label="Errors" color="text-gray-400" icon="!" show={true} />
        
        <span className="text-muted-foreground">|</span>
        
        {/* Percentage */}
        <span className={cn(
          "font-bold transition-colors",
          stats.percentage < 30 ? "text-blue-400" :
          stats.percentage < 70 ? "text-cyan-400" :
          stats.percentage < 100 ? "text-green-400" :
          "text-green-500"
        )}>
          {stats.percentage}%
        </span>
        
        <span className="text-muted-foreground">|</span>
        
        {/* Time */}
        <span className="text-cyan-400">{getElapsedTime()}</span>
      </div>

      {/* Animated progress bar */}
      <div className="h-2.5 bg-secondary rounded-full overflow-hidden relative">
        <div 
          className={cn(
            "h-full bg-gradient-to-r from-green-500 via-cyan-500 to-blue-500 transition-all duration-500 ease-out rounded-full",
            !isComplete && "animate-pulse"
          )}
          style={{ width: `${stats.percentage}%` }}
        />
        {!isComplete && (
          <div 
            className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-scan"
            style={{ left: `${Math.max(0, stats.percentage - 10)}%` }}
          />
        )}
      </div>

      {/* Live log feed */}
      <ScrollArea className="h-72 rounded-lg bg-black/60 border border-border/50">
        <div 
          ref={scrollRef} 
          className="p-3 space-y-0.5 text-xs"
          onScroll={handleScroll}
        >
          {updates.map((update, idx) => (
            <ProgressRow key={`${update.index}-${idx}`} update={update} />
          ))}
        </div>
      </ScrollArea>
      
      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button 
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-16 right-6 px-2 py-1 bg-primary text-primary-foreground text-xs rounded-md shadow-lg animate-bounce"
        >
          ↓ New updates
        </button>
      )}
    </div>
  );
}

// Stat badge component
function StatBadge({ count, label, color, icon, show }: { 
  count: number; 
  label: string; 
  color: string; 
  icon: string;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <span className={cn("font-semibold flex items-center gap-0.5", color)} title={label}>
      {icon}{count}
    </span>
  );
}

// Individual progress row
function ProgressRow({ update }: { update: ProgressUpdate }) {
  const config = statusConfig[update.status] || statusConfig.error;
  const Icon = config.icon;
  const isHit = update.status === 'valid' || update.status === 'success';
  
  // Parse extra data from message if present
  const extraData = parseExtraData(update.message);
  
  return (
    <div 
      className={cn(
        "flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0 transition-colors",
        isHit && "bg-green-500/10 -mx-3 px-3 border-l-2 border-l-green-500",
        update.status === 'checking' && "opacity-70"
      )}
    >
      {/* Status icon */}
      <Icon 
        className={cn(
          "w-3.5 h-3.5 mt-0.5 flex-shrink-0",
          config.color,
          config.animate && "animate-spin"
        )} 
      />
      
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Email line */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "truncate max-w-[200px]",
            isHit ? 'text-green-400 font-bold' : 'text-foreground'
          )}>
            {truncateEmail(update.email)}
          </span>
          
          {/* Status badge */}
          <span className={cn(
            "text-[10px] uppercase font-medium px-1.5 py-0.5 rounded",
            config.color,
            config.bgColor
          )}>
            {update.status === 'checking' ? 'checking...' : update.status}
          </span>
        </div>
        
        {/* Extra data for hits */}
        {isHit && extraData.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {extraData.map((data, i) => (
              <span 
                key={i} 
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  data.color,
                  data.bgColor
                )}
              >
                {data.icon} {data.label}
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Index */}
      <span className="text-muted-foreground text-[10px] flex-shrink-0 font-mono">
        [{update.index}/{update.total}]
      </span>
    </div>
  );
}

function truncateEmail(email: string): string {
  if (email.length <= 35) return email;
  const atIndex = email.indexOf('@');
  if (atIndex > 15) {
    return email.substring(0, 14) + '...' + email.substring(atIndex);
  }
  return email.substring(0, 32) + '...';
}

interface ExtraDataItem {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
}

function parseExtraData(message: string): ExtraDataItem[] {
  const items: ExtraDataItem[] = [];
  
  // Microsoft Subscriptions (Game Pass, M365, etc.)
  // Match patterns like: 🎮GAME PASS ULTIMATE(180d) | 🎮M365 BASIC(90d)
  const subMatches = message.matchAll(/🎮([^|()]+)(?:\((\d+)d\))?/g);
  for (const match of subMatches) {
    const name = match[1]?.trim() || 'Premium';
    const days = match[2] ? `(${match[2]}d)` : '';
    // Skip if it's Steam (uses same emoji sometimes)
    if (!name.toLowerCase().includes('steam')) {
      items.push({
        icon: '🎮',
        label: `${name}${days}`.substring(0, 25),
        color: 'text-purple-300',
        bgColor: 'bg-purple-500/20'
      });
    }
  }
  
  // Also check for PREMIUM/GAME PASS text without emoji
  if (items.length === 0 && (message.includes('GAME PASS') || message.includes('M365') || message.includes('PREMIUM'))) {
    const match = message.match(/(GAME PASS[^|]*|M365[^|]*|PREMIUM[^|]*)/i);
    if (match) {
      items.push({
        icon: '🎮',
        label: match[1].trim().substring(0, 25),
        color: 'text-purple-300',
        bgColor: 'bg-purple-500/20'
      });
    }
  }
  
  // PlayStation Network - format: 🎯PSN:3 or PSN:3
  const psnMatch = message.match(/(?:🎯)?PSN[:\s]*(\d+)/i);
  if (psnMatch) {
    items.push({
      icon: '🎯',
      label: `PSN: ${psnMatch[1]} orders`,
      color: 'text-blue-300',
      bgColor: 'bg-blue-500/20'
    });
  }
  
  // Steam - format: 🎮Steam:5 or Steam:5
  const steamMatch = message.match(/(?:🎮)?Steam[:\s]*(\d+)/i);
  if (steamMatch) {
    items.push({
      icon: '🎲',
      label: `Steam: ${steamMatch[1]} purchases`,
      color: 'text-cyan-300',
      bgColor: 'bg-cyan-500/20'
    });
  }
  
  // Supercell - format: 🎲SC:CoC,BS or SC:Yes
  const scMatch = message.match(/(?:🎲)?SC[:\s]*([^|]+)/i);
  if (scMatch) {
    const games = scMatch[1].trim();
    items.push({
      icon: '⚔️',
      label: games === 'Yes' ? 'Supercell' : `SC: ${games}`.substring(0, 20),
      color: 'text-yellow-300',
      bgColor: 'bg-yellow-500/20'
    });
  } else if (message.includes('Supercell') || message.includes('CoC') || message.includes('Clash')) {
    items.push({
      icon: '⚔️',
      label: 'Supercell',
      color: 'text-yellow-300',
      bgColor: 'bg-yellow-500/20'
    });
  }
  
  // TikTok - format: 📱TikTok:Yes or 📱TikTok:username
  const tiktokMatch = message.match(/(?:📱)?TikTok[:\s]*(\S+)/i);
  if (tiktokMatch) {
    const username = tiktokMatch[1].trim();
    items.push({
      icon: '📱',
      label: username === 'Yes' ? 'TikTok: Yes' : `TikTok: @${username}`.substring(0, 20),
      color: 'text-pink-300',
      bgColor: 'bg-pink-500/20'
    });
  }
  
  // Minecraft - format: ⛏️MC:username or MC:Yes
  const mcMatch = message.match(/(?:⛏️)?MC[:\s]*(\S+)/i);
  if (mcMatch) {
    const username = mcMatch[1].trim();
    items.push({
      icon: '⛏️',
      label: username === 'Yes' ? 'Minecraft' : `MC: ${username}`.substring(0, 18),
      color: 'text-green-300',
      bgColor: 'bg-green-500/20'
    });
  } else if (message.includes('Minecraft')) {
    const match = message.match(/Minecraft[:\s]*(\w+)/i);
    items.push({
      icon: '⛏️',
      label: match ? `MC: ${match[1]}`.substring(0, 18) : 'Minecraft',
      color: 'text-green-300',
      bgColor: 'bg-green-500/20'
    });
  }
  
  // Inbox Keywords - format: 🔑Keywords:gog:6,steam:3 or 🔑gog:6
  const kwMatch = message.match(/(?:🔑)(?:Keywords[:\s]*)?([^|]+)/i);
  if (kwMatch) {
    const keywords = kwMatch[1].trim();
    items.push({
      icon: '🔑',
      label: keywords.substring(0, 25),
      color: 'text-amber-300',
      bgColor: 'bg-amber-500/20'
    });
  } else if (message.includes('Keywords')) {
    const match = message.match(/Keywords[:\s]*([^|]+)/i);
    if (match) {
      items.push({
        icon: '🔑',
        label: match[1].trim().substring(0, 25),
        color: 'text-amber-300',
        bgColor: 'bg-amber-500/20'
      });
    }
  }
  
  return items;
}