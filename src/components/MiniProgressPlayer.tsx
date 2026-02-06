import { useState } from 'react';
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

// Service badge data structure
interface ServiceBadge {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
}

// Parse hit message to extract all service badges
function parseHitBadges(message: string): ServiceBadge[] {
  const badges: ServiceBadge[] = [];
  
  // Microsoft Subscriptions - 🎮GAME PASS ULTIMATE(180d) | 🎮M365 BASIC(90d)
  const subMatches = message.matchAll(/🎮([^|()]+)(?:\((\d+)d\))?/g);
  for (const match of subMatches) {
    const name = match[1]?.trim() || 'Premium';
    const days = match[2] ? `(${match[2]}d)` : '';
    if (!name.toLowerCase().includes('steam')) {
      badges.push({
        icon: '🎮',
        label: `${name}${days}`.substring(0, 20),
        color: 'text-purple-300',
        bgColor: 'bg-purple-500/20'
      });
    }
  }
  
  // Fallback for GAME PASS / M365 without emoji
  if (badges.length === 0 && (message.includes('GAME PASS') || message.includes('M365') || message.includes('PREMIUM'))) {
    const match = message.match(/(GAME PASS[^|]*|M365[^|]*|PREMIUM[^|]*)/i);
    if (match) {
      badges.push({
        icon: '🎮',
        label: match[1].trim().substring(0, 20),
        color: 'text-purple-300',
        bgColor: 'bg-purple-500/20'
      });
    }
  }
  
  // PlayStation Network - PSN:3 or 🎯PSN:3
  const psnMatch = message.match(/(?:🎯)?PSN[:\s]*(\d+)/i);
  if (psnMatch) {
    badges.push({
      icon: '🎯',
      label: `PSN: ${psnMatch[1]}`,
      color: 'text-blue-300',
      bgColor: 'bg-blue-500/20'
    });
  }
  
  // Steam - Steam:5 or 🎮Steam:5
  const steamMatch = message.match(/(?:🎮)?Steam[:\s]*(\d+)/i);
  if (steamMatch) {
    badges.push({
      icon: '🎲',
      label: `Steam: ${steamMatch[1]}`,
      color: 'text-cyan-300',
      bgColor: 'bg-cyan-500/20'
    });
  }
  
  // Supercell - SC:CoC,BS or 🎲SC:Yes
  const scMatch = message.match(/(?:🎲)?SC[:\s]*([^|]+)/i);
  if (scMatch) {
    const games = scMatch[1].trim();
    badges.push({
      icon: '⚔️',
      label: games === 'Yes' ? 'Supercell' : `SC: ${games}`.substring(0, 15),
      color: 'text-yellow-300',
      bgColor: 'bg-yellow-500/20'
    });
  } else if (message.includes('Supercell') || message.includes('CoC') || message.includes('Clash')) {
    badges.push({
      icon: '⚔️',
      label: 'Supercell',
      color: 'text-yellow-300',
      bgColor: 'bg-yellow-500/20'
    });
  }
  
  // TikTok - 📱TikTok:Yes or 📱TikTok:username
  const tiktokMatch = message.match(/(?:📱)?TikTok[:\s]*(\S+)/i);
  if (tiktokMatch) {
    const username = tiktokMatch[1].trim();
    badges.push({
      icon: '📱',
      label: username === 'Yes' ? 'TikTok' : `@${username}`.substring(0, 12),
      color: 'text-pink-300',
      bgColor: 'bg-pink-500/20'
    });
  }
  
  // Minecraft - ⛏️MC:username or MC:Yes
  const mcMatch = message.match(/(?:⛏️)?MC[:\s]*(\S+)/i);
  if (mcMatch) {
    const username = mcMatch[1].trim();
    badges.push({
      icon: '⛏️',
      label: username === 'Yes' ? 'MC' : `MC: ${username}`.substring(0, 12),
      color: 'text-green-300',
      bgColor: 'bg-green-500/20'
    });
  } else if (message.includes('Minecraft')) {
    const match = message.match(/Minecraft[:\s]*(\w+)/i);
    badges.push({
      icon: '⛏️',
      label: match ? `MC: ${match[1]}`.substring(0, 12) : 'MC',
      color: 'text-green-300',
      bgColor: 'bg-green-500/20'
    });
  }
  
  // Custom Keywords / Inboxer - 🔑Keywords:gog:6,steam:3 or 🔑gog:6
  const kwMatch = message.match(/(?:🔑)(?:Keywords[:\s]*)?([^|]+)/i);
  if (kwMatch) {
    const keywords = kwMatch[1].trim();
    // Parse individual keyword counts
    const keywordParts = keywords.split(',').map(k => k.trim()).filter(Boolean);
    for (const part of keywordParts.slice(0, 3)) { // Max 3 keyword badges
      badges.push({
        icon: '🔑',
        label: part.substring(0, 15),
        color: 'text-amber-300',
        bgColor: 'bg-amber-500/20'
      });
    }
  } else if (message.includes('Keywords')) {
    const match = message.match(/Keywords[:\s]*([^|]+)/i);
    if (match) {
      badges.push({
        icon: '🔑',
        label: match[1].trim().substring(0, 15),
        color: 'text-amber-300',
        bgColor: 'bg-amber-500/20'
      });
    }
  }
  
  return badges;
}

// Aggregate service counts across all hits
function aggregateServiceCounts(updates: ProgressUpdate[]): Record<string, number> {
  const counts: Record<string, number> = {
    'PSN': 0,
    'Steam': 0,
    'TikTok': 0,
    'MC': 0,
    'SC': 0,
    'Keywords': 0,
    'GamePass': 0
  };
  
  for (const u of updates) {
    if (u.status !== 'valid' && u.status !== 'success') continue;
    const msg = u.message;
    
    if (/PSN[:\s]*\d+/i.test(msg)) counts['PSN']++;
    if (/Steam[:\s]*\d+/i.test(msg)) counts['Steam']++;
    if (/TikTok/i.test(msg)) counts['TikTok']++;
    if (/MC[:\s]*\S+/i.test(msg) || /Minecraft/i.test(msg)) counts['MC']++;
    if (/SC[:\s]*\S+/i.test(msg) || /Supercell|CoC|Clash/i.test(msg)) counts['SC']++;
    if (/🔑|Keywords/i.test(msg)) counts['Keywords']++;
    if (/GAME PASS|M365|PREMIUM/i.test(msg)) counts['GamePass']++;
  }
  
  return counts;
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

  // Aggregate service counts
  const serviceCounts = aggregateServiceCounts(accountUpdates);

  // Get recent hits (valid accounts with extra data)
  const recentHits = accountUpdates
    .filter(u => (u.status === 'valid' || u.status === 'success') && u.message.length > 10)
    .slice(-8)
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
        isExpanded ? "h-auto max-h-[70vh]" : "h-auto",
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

      {/* Stats row - Account status */}
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

      {/* Service breakdown - PSN, Steam, Keywords, etc. */}
      {valid > 0 && (
        <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap border-b border-border/30">
          {serviceCounts['PSN'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
              🎯 PSN: {serviceCounts['PSN']}
            </span>
          )}
          {serviceCounts['Steam'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
              🎲 Steam: {serviceCounts['Steam']}
            </span>
          )}
          {serviceCounts['TikTok'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300">
              📱 TikTok: {serviceCounts['TikTok']}
            </span>
          )}
          {serviceCounts['MC'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">
              ⛏️ MC: {serviceCounts['MC']}
            </span>
          )}
          {serviceCounts['SC'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300">
              ⚔️ SC: {serviceCounts['SC']}
            </span>
          )}
          {serviceCounts['Keywords'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
              🔑 KW: {serviceCounts['Keywords']}
            </span>
          )}
          {serviceCounts['GamePass'] > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              🎮 GP: {serviceCounts['GamePass']}
            </span>
          )}
        </div>
      )}

      {/* Expanded content - Recent hits with service badges */}
      {isExpanded && (
        <div className="p-3 max-h-56 overflow-y-auto space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            Recent Hits ({recentHits.length})
          </p>
          {recentHits.length > 0 ? (
            recentHits.map((hit, idx) => {
              const badges = parseHitBadges(hit.message);
              return (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-muted/50 border border-green-500/30 border-l-2 border-l-green-500"
                >
                  <p className="text-xs font-mono text-green-400 truncate font-semibold">
                    {hit.email}
                  </p>
                  {badges.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {badges.map((badge, i) => (
                        <span
                          key={i}
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded font-medium",
                            badge.color,
                            badge.bgColor
                          )}
                        >
                          {badge.icon} {badge.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {badges.length === 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Valid account
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-xs text-muted-foreground italic">No hits yet...</p>
          )}
        </div>
      )}
    </div>
  );
}
