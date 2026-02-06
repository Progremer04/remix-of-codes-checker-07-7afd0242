import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Key, Code, Play, Loader2, CheckCircle, XCircle, Clock, 
  AlertTriangle, RotateCcw, Users, Settings2, Gamepad2, 
  Cookie, Shield, Gift, LogOut, Mail, ShoppingCart, LayoutDashboard, Upload, Download, Zap,
  Pause, Square, FileDown, BarChart3
} from 'lucide-react';
import { Header } from '@/components/Header';
import { CodeInput } from '@/components/CodeInput';
import { ResultCard } from '@/components/ResultCard';
import { StatsCard } from '@/components/StatsCard';
import { ProgressBar } from '@/components/ProgressBar';
import { Background3D } from '@/components/Background3D';
import { UserDashboard } from '@/components/UserDashboard';
import { ManusFileUpload, UploadedFile } from '@/components/ManusFileUpload';
import { LiveProgressFeed } from '@/components/LiveProgressFeed';
import { KeywordsInput } from '@/components/KeywordsInput';
import { MiniProgressPlayer } from '@/components/MiniProgressPlayer';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckResult } from '@/types/checker';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import { ref, push, set } from 'firebase/database';
import { database } from '@/integrations/firebase/config';
import { useRealtimeProgress, generateSessionId } from '@/hooks/useRealtimeProgress';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import JSZip from 'jszip';

interface ClaimResult {
  email: string;
  success: boolean;
  token?: string;
  error?: string;
}

interface XboxFetchResult {
  email: string;
  password?: string;
  status: string;
  codes: string[];
  message: string;
}

interface ManusCheckResult {
  id: string;
  filename: string;
  status: string;
  email: string;
  name: string;
  membership: string;
  plan: string;
  totalCredits: string;
  freeCredits: string;
  usedCredits: string;
  error?: string;
  timestamp?: string;
  checkDuration?: number;
  threadId?: number;
  cookieContent?: string; // Full cookie content for export
}

interface ManusSessionInfo {
  startTime: string;
  endTime: string;
  duration: string;
  clientIP?: string;
  userAgent?: string;
  timezone?: string;
  country?: string;
  threadsUsed: number;
  accountsProcessed: number;
  successRate: string;
}

interface SessionInfo {
  startTime: string;
  endTime?: string;
  duration?: string;
  clientIP?: string;
  userAgent?: string;
  timezone?: string;
  country?: string;
  proxyUsed?: string;
  threadsUsed: number;
  accountsProcessed: number;
  successRate?: string;
}

interface HotmailCheckResult {
  email: string;
  password: string;
  status: string;
  country?: string;
  name?: string;
  checkedAt?: string;
  checkDuration?: number;
  proxyUsed?: string;
  threadId?: number;
  // Microsoft Subscriptions
  msStatus?: string;
  subscriptions?: {
    name: string;
    category: string;
    daysRemaining?: string;
    autoRenew?: string;
    isExpired?: boolean;
  }[];
  rewardsPoints?: string;
  balance?: string;
  // PSN
  psn?: {
    status: string;
    orders: number;
    purchases: any[];
  };
  // Steam
  steam?: {
    status: string;
    count: number;
    purchases?: any[];
  };
  // Supercell
  supercell?: {
    status: string;
    games: string[];
  };
  // TikTok
  tiktok?: {
    status: string;
    username?: string;
  };
  // Minecraft
  minecraft?: {
    status: string;
    username?: string;
    uuid?: string;
    capes?: string[];
  };
  error?: string;
}

export default function Index() {
  const navigate = useNavigate();
  const { user, isAdmin, isLoading: authLoading, userServices, signOut, redeemCode, userData } = useFirebaseAuth();

  // Redeem code state
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Codes Checker State
  const [wlids, setWlids] = useState('');
  const [codes, setCodes] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);
  const [checkStatus, setCheckStatus] = useState('');
  const [checkResults, setCheckResults] = useState<CheckResult[]>([]);
  const [checkThreads, setCheckThreads] = useState(10);

  // WLID Claimer State
  const [accounts, setAccounts] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimProgress, setClaimProgress] = useState(0);
  const [claimStatus, setClaimStatus] = useState('');
  const [claimResults, setClaimResults] = useState<ClaimResult[]>([]);
  const [claimThreads, setClaimThreads] = useState(10);

  // Xbox Fetcher State
  const [xboxAccounts, setXboxAccounts] = useState('');
  const [isXboxFetching, setIsXboxFetching] = useState(false);
  const [xboxProgress, setXboxProgress] = useState(0);
  const [xboxStatus, setXboxStatus] = useState('');
  const [xboxResults, setXboxResults] = useState<XboxFetchResult[]>([]);
  const [xboxThreads, setXboxThreads] = useState(5);

  // Manus Checker State
  const [manusCookies, setManusCookies] = useState('');
  const [isManusChecking, setIsManusChecking] = useState(false);
  const [manusProgress, setManusProgress] = useState(0);
  const [manusStatus, setManusStatus] = useState('');
  const [manusResults, setManusResults] = useState<ManusCheckResult[]>([]);
  const [manusLiveHits, setManusLiveHits] = useState<ManusCheckResult[]>([]);
  const [manusThreads, setManusThreads] = useState(5);
  const [manusSessionInfo, setManusSessionInfo] = useState<ManusSessionInfo | null>(null);
  const [manusUploadedFiles, setManusUploadedFiles] = useState<UploadedFile[]>([]);

  // Hotmail Checker State
  const [hotmailAccounts, setHotmailAccounts] = useState('');
  const [isHotmailChecking, setIsHotmailChecking] = useState(false);
  const [isHotmailPaused, setIsHotmailPaused] = useState(false);
  const [hotmailProgress, setHotmailProgress] = useState(0);
  const [hotmailStatus, setHotmailStatus] = useState('');
  const [hotmailResults, setHotmailResults] = useState<HotmailCheckResult[]>([]);
  const [hotmailThreads, setHotmailThreads] = useState(10);
  const [hotmailCheckMode, setHotmailCheckMode] = useState('all');
  const [hotmailProxies, setHotmailProxies] = useState('');
  const [hotmailKeywords, setHotmailKeywords] = useState<string[]>([]);
  const [hotmailSessionInfo, setHotmailSessionInfo] = useState<SessionInfo | null>(null);
  const [hotmailStartTime, setHotmailStartTime] = useState<number>(0);
  
  // Realtime progress session IDs
  const [hotmailSessionId, setHotmailSessionId] = useState<string | null>(null);
  const [xboxSessionId, setXboxSessionId] = useState<string | null>(null);
  const [manusSessionId, setManusSessionId] = useState<string | null>(null);
  
  // Realtime progress hooks
  const { updates: hotmailUpdates, isConnected: hotmailConnected, clearUpdates: clearHotmailUpdates } = useRealtimeProgress(hotmailSessionId);
  const { updates: xboxUpdates, isConnected: xboxConnected, clearUpdates: clearXboxUpdates } = useRealtimeProgress(xboxSessionId);
  const { updates: manusUpdates, isConnected: manusConnected, clearUpdates: clearManusUpdates } = useRealtimeProgress(manusSessionId);
  
  // Session persistence for crash recovery
  const { saveSession, getLastSession, clearSession } = useSessionPersistence();
  
  // Mini player visibility states
  const [showMiniPlayer, setShowMiniPlayer] = useState(true);
  const [activeService, setActiveService] = useState<string | null>(null);
  
  // Client info for session display
  const [clientIp, setClientIp] = useState<string>('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Fetch client IP on mount
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip || ''))
      .catch(() => setClientIp('Unknown'));
  }, []);
  
  // Auto-save session progress to localStorage
  useEffect(() => {
    if (hotmailSessionId && hotmailUpdates.length > 0) {
      const total = hotmailUpdates[0]?.total || hotmailUpdates.length;
      saveSession(hotmailSessionId, 'hotmail_validator', hotmailUpdates, total);
      setActiveService('hotmail_validator');
    }
  }, [hotmailSessionId, hotmailUpdates, saveSession]);
  
  useEffect(() => {
    if (xboxSessionId && xboxUpdates.length > 0) {
      const total = xboxUpdates[0]?.total || xboxUpdates.length;
      saveSession(xboxSessionId, 'xbox_fetcher', xboxUpdates, total);
      setActiveService('xbox_fetcher');
    }
  }, [xboxSessionId, xboxUpdates, saveSession]);
  
  // Restore last session on mount if exists
  useEffect(() => {
    const lastHotmail = getLastSession('hotmail_validator');
    if (lastHotmail && !lastHotmail.isComplete && !hotmailSessionId) {
      toast.info(`Found previous Hotmail session (${lastHotmail.updates.length} updates). Showing in mini player.`);
      setActiveService('hotmail_validator');
    }
    
    const lastXbox = getLastSession('xbox_fetcher');
    if (lastXbox && !lastXbox.isComplete && !xboxSessionId) {
      toast.info(`Found previous Xbox session (${lastXbox.updates.length} updates). Showing in mini player.`);
      setActiveService('xbox_fetcher');
    }
  }, [getLastSession, hotmailSessionId, xboxSessionId]);
  
  // Active tab for keyboard shortcuts context
  const [activeTab, setActiveTab] = useState('codes');
  
  const username = userData?.displayName || user?.email || 'User';

  // Codes Checker computed values
  const codesList = useMemo(() => 
    codes.split('\n').map(c => c.trim()).filter(c => c.length > 0),
    [codes]
  );

  const wlidsList = useMemo(() => 
    wlids.split('\n').map(w => w.trim()).filter(w => w.length > 0),
    [wlids]
  );

  const checkStats = useMemo(() => ({
    valid: checkResults.filter(r => r.status === 'valid').length,
    used: checkResults.filter(r => r.status === 'used').length,
    expired: checkResults.filter(r => r.status === 'expired').length,
    invalid: checkResults.filter(r => r.status === 'invalid').length,
    total: checkResults.length,
  }), [checkResults]);

  // Format: CODE | TITLE (if title exists) - matching Python output
  const validResults = useMemo(() => 
    checkResults.filter(r => r.status === 'valid').map(r => r.title && r.title !== 'N/A' ? `${r.code} | ${r.title}` : r.code),
    [checkResults]
  );

  const usedResults = useMemo(() => 
    checkResults.filter(r => r.status === 'used').map(r => r.title && r.title !== 'N/A' ? `${r.code} | ${r.title}` : r.code),
    [checkResults]
  );

  const expiredResults = useMemo(() => 
    checkResults.filter(r => r.status === 'expired').map(r => r.title && r.title !== 'N/A' ? `${r.code} | ${r.title}` : r.code),
    [checkResults]
  );

  const invalidResults = useMemo(() => 
    checkResults.filter(r => r.status === 'invalid').map(r => r.code),
    [checkResults]
  );

  // WLID Claimer computed values
  const accountsList = useMemo(() => 
    accounts.split('\n').map(a => a.trim()).filter(a => a.includes(':')),
    [accounts]
  );

  const claimStats = useMemo(() => ({
    success: claimResults.filter(r => r.success).length,
    failed: claimResults.filter(r => !r.success).length,
    total: claimResults.length,
  }), [claimResults]);

  const successfulTokens = useMemo(() => 
    claimResults.filter(r => r.success && r.token).map(r => r.token!),
    [claimResults]
  );

  const failedAccounts = useMemo(() => 
    claimResults.filter(r => !r.success).map(r => `${r.email}: ${r.error || 'Unknown error'}`),
    [claimResults]
  );

  // Xbox Fetcher computed values
  const xboxAccountsList = useMemo(() => 
    xboxAccounts.split('\n').map(a => a.trim()).filter(a => a.includes(':')),
    [xboxAccounts]
  );

  const xboxStats = useMemo(() => ({
    success: (xboxResults || []).filter(r => r.status === 'success').length,
    noCodes: (xboxResults || []).filter(r => r.status === 'no_codes').length,
    failed: (xboxResults || []).filter(r => !['success', 'no_codes'].includes(r.status)).length,
    totalCodes: (xboxResults || []).reduce((sum, r) => sum + (r.codes?.length || 0), 0),
    valid: (xboxResults || []).filter(r => r.status === 'success' || r.status === 'no_codes').length,
    total: (xboxResults || []).length,
  }), [xboxResults]);

  const allXboxCodes = useMemo(() => 
    (xboxResults || []).flatMap(r => r.codes || []),
    [xboxResults]
  );
  
  // Accounts with codes (format: email:password | CODES: code1, code2...)
  const xboxAccountsWithCodes = useMemo(() => 
    (xboxResults || []).filter(r => r.status === 'success' && r.codes?.length > 0)
      .map(r => `${r.email}${r.password ? ':' + r.password : ''} | CODES: ${r.codes.join(', ')}`),
    [xboxResults]
  );
  
  // Valid accounts (working but no codes)
  const xboxValidAccounts = useMemo(() => 
    (xboxResults || []).filter(r => r.status === 'no_codes')
      .map(r => `${r.email}${r.password ? ':' + r.password : ''} | Working (no codes)`),
    [xboxResults]
  );

  // Manus Checker computed values  
  const manusCookiesList = useMemo(() => 
    manusCookies.split('---').map(c => c.trim()).filter(c => c.length > 0),
    [manusCookies]
  );

  const manusStats = useMemo(() => ({
    success: (manusResults || []).filter(r => r.status === 'success').length,
    failed: (manusResults || []).filter(r => r.status === 'failed').length,
    total: (manusResults || []).length,
  }), [manusResults]);

  // Hotmail Checker computed values
  const hotmailAccountsList = useMemo(() => 
    hotmailAccounts.split('\n').map(a => a.trim()).filter(a => a.includes(':')),
    [hotmailAccounts]
  );

  const hotmailStats = useMemo(() => ({
    valid: (hotmailResults || []).filter(r => r.status === 'valid').length,
    invalid: (hotmailResults || []).filter(r => r.status === 'invalid').length,
    twoFa: (hotmailResults || []).filter(r => r.status === '2fa').length,
    locked: (hotmailResults || []).filter(r => r.status === 'locked').length,
    msPremium: (hotmailResults || []).filter(r => r.msStatus === 'PREMIUM').length,
    psnHits: (hotmailResults || []).filter(r => r.psn?.status === 'HAS_ORDERS').length,
    steamHits: (hotmailResults || []).filter(r => r.steam?.status === 'HAS_PURCHASES').length,
    supercellHits: (hotmailResults || []).filter(r => r.supercell?.status === 'LINKED').length,
    tiktokHits: (hotmailResults || []).filter(r => r.tiktok?.status === 'LINKED').length,
    minecraftHits: (hotmailResults || []).filter(r => r.minecraft?.status === 'OWNED').length,
    total: (hotmailResults || []).length,
  }), [hotmailResults]);

  // Check service access
  const hasServiceAccess = (service: string) => {
    if (isAdmin) return true;
    return userServices.includes(service);
  };

  const getFirebaseIdToken = async (): Promise<string | null> => {
    try {
      if (!user) return null;
      return await user.getIdToken();
    } catch (e) {
      console.warn('Failed to get Firebase ID token:', e);
      return null;
    }
  };

  const invokeBackendFunction = async <TData,>(functionName: string, body: any) => {
    const firebaseToken = await getFirebaseIdToken();
    return await supabase.functions.invoke<TData>(functionName, {
      body,
      headers: firebaseToken ? { 'x-firebase-token': firebaseToken } : undefined,
    });
  };

  // Save history to Firebase (user-scoped path to satisfy RTDB rules)
  const saveHistory = async (service: string, inputCount: number, stats: any, results?: any[]) => {
    if (!user) return;

    try {
      const historyRef = ref(database, `users/${user.uid}/checkHistory`);
      const newHistoryRef = push(historyRef);
      
      // Sanitize stats - remove undefined values (Firebase doesn't allow undefined)
      const sanitizedStats = stats ? JSON.parse(JSON.stringify(stats)) : {};
      const sanitizedResults = results ? JSON.parse(JSON.stringify(results)) : [];
      
      await set(newHistoryRef, {
        userId: user.uid,
        username: userData?.displayName || user.email || 'Unknown',
        service,
        inputCount: inputCount || 0,
        stats: sanitizedStats,
        results: sanitizedResults,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  };

  // Codes Checker functions
  const checkCodes = async () => {
    if (wlidsList.length === 0) {
      toast.error('Please enter WLID tokens');
      return;
    }
    if (codesList.length === 0) {
      toast.error('Please enter codes to check');
      return;
    }

    setIsChecking(true);
    setCheckResults([]);
    setCheckProgress(0);
    setCheckStatus('Connecting to server...');

    try {
      setCheckStatus('Processing codes...');
      
      const firebaseToken = await getFirebaseIdToken();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-codes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ...(firebaseToken ? { 'x-firebase-token': firebaseToken } : {}),
          },
          body: JSON.stringify({ wlids: wlidsList, codes: codesList, threads: checkThreads, username }),
        }
      );

      if (!response.ok) {
        let errorMessage = 'Server error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {}
        toast.error(errorMessage);
        setIsChecking(false);
        return;
      }

      const contentType = response.headers.get('Content-Type') || '';
      
      if (contentType.includes('ndjson') || codesList.length > 500) {
        const reader = response.body?.getReader();
        if (!reader) {
          toast.error('Streaming not supported');
          setIsChecking(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        const resultsAccumulator: CheckResult[] = [];
        let lastUpdateTime = Date.now();
        const UPDATE_INTERVAL = 200;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const result = JSON.parse(line);
                resultsAccumulator.push({
                  code: result.code,
                  status: result.status === 'error' ? 'invalid' : result.status,
                  title: result.title,
                });
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }

          const now = Date.now();
          if (now - lastUpdateTime >= UPDATE_INTERVAL) {
            setCheckProgress(resultsAccumulator.length);
            setCheckStatus(`Processing: ${resultsAccumulator.length.toLocaleString()}/${codesList.length.toLocaleString()}`);
            if (resultsAccumulator.length % 500 === 0) {
              setCheckResults([...resultsAccumulator]);
            }
            lastUpdateTime = now;
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        if (buffer.trim()) {
          try {
            const result = JSON.parse(buffer);
            resultsAccumulator.push({
              code: result.code,
              status: result.status === 'error' ? 'invalid' : result.status,
              title: result.title,
            });
          } catch (e) {
            console.error('Final parse error:', e);
          }
        }

        setCheckResults(resultsAccumulator);
        setCheckProgress(codesList.length);
        setCheckStatus('Complete!');
        toast.success(`Successfully checked ${resultsAccumulator.length.toLocaleString()} codes`);
        
        await saveHistory('codes_checker', codesList.length, {
          valid: resultsAccumulator.filter(r => r.status === 'valid').length,
          used: resultsAccumulator.filter(r => r.status === 'used').length,
          expired: resultsAccumulator.filter(r => r.status === 'expired').length,
          invalid: resultsAccumulator.filter(r => r.status === 'invalid').length,
        }, resultsAccumulator);
      } else {
        const data = await response.json();
        
        if (data.error) {
          toast.error(data.error);
          setIsChecking(false);
          return;
        }

        const newResults: CheckResult[] = data.results.map((r: any) => ({
          code: r.code,
          status: r.status === 'error' ? 'invalid' : r.status,
          title: r.title,
        }));

        setCheckResults(newResults);
        setCheckProgress(codesList.length);
        setCheckStatus('Complete!');
        toast.success(`Successfully checked ${codesList.length.toLocaleString()} codes`);
        
        await saveHistory('codes_checker', codesList.length, {
          valid: newResults.filter(r => r.status === 'valid').length,
          used: newResults.filter(r => r.status === 'used').length,
          expired: newResults.filter(r => r.status === 'expired').length,
          invalid: newResults.filter(r => r.status === 'invalid').length,
        }, newResults);
      }
    } catch (err) {
      console.error('Error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsChecking(false);
    }
  };

  const handleCheckReset = () => {
    setCheckResults([]);
    setCheckProgress(0);
    setCheckStatus('');
  };

  // Export Codes Checker results
  const exportCodesResults = (type: 'valid' | 'used' | 'expired' | 'all') => {
    let items: string[] = [];
    let filename = 'codes';

    switch (type) {
      case 'valid':
        items = validResults;
        filename = 'valid_codes';
        break;
      case 'used':
        items = usedResults;
        filename = 'used_codes';
        break;
      case 'expired':
        items = expiredResults;
        filename = 'expired_codes';
        break;
      case 'all':
        items = validResults;
        filename = 'all_valid_codes';
        break;
    }

    if (items.length === 0) {
      toast.error('No codes to export');
      return;
    }

    const content = items.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${items.length} ${type} codes`);
  };

  // WLID Claimer functions
  const claimWlids = async () => {
    if (accountsList.length === 0) {
      toast.error('Please enter accounts (email:password format)');
      return;
    }

    setIsClaiming(true);
    setClaimResults([]);
    setClaimProgress(0);
    setClaimStatus('Connecting to server...');

    try {
      const { data, error } = await invokeBackendFunction<any>('claim-wlids', {
        accounts: accountsList,
        threads: claimThreads,
        username,
      });

      if (error) {
        console.error('Edge function error:', error);
        const errorMsg = error.message || 'Server connection error';
        toast.error(errorMsg.includes('Failed to fetch') ? 'Network error - please check your connection' : errorMsg);
        setIsClaiming(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setIsClaiming(false);
        return;
      }

      setClaimResults(data.results);
      setClaimProgress(accountsList.length);
      setClaimStatus('Complete!');
      toast.success(`Successfully processed ${accountsList.length} accounts`);
      
      await saveHistory('wlid_claimer', accountsList.length, data.stats, data.results);

    } catch (err) {
      console.error('Error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleClaimReset = () => {
    setClaimResults([]);
    setClaimProgress(0);
    setClaimStatus('');
  };

  // Export WLID tokens
  const exportWlidTokens = () => {
    if (successfulTokens.length === 0) {
      toast.error('No tokens to export');
      return;
    }

    const content = successfulTokens.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wlid_tokens_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${successfulTokens.length} WLID tokens`);
  };

  // Xbox Fetcher functions
  const fetchXboxCodes = async () => {
    if (!hasServiceAccess('xbox_fetcher')) {
      toast.error('You need to redeem a code to access Xbox Fetcher');
      return;
    }
    
    if (xboxAccountsList.length === 0) {
      toast.error('Please enter accounts (email:password format)');
      return;
    }

    const sessionId = generateSessionId();
    setXboxSessionId(sessionId);
    clearXboxUpdates();
    setIsXboxFetching(true);
    setXboxResults([]);
    setXboxProgress(0);
    setXboxStatus('Connecting to server...');

    try {
      const { data, error } = await invokeBackendFunction<any>('xbox-fetcher', {
        accounts: xboxAccountsList,
        threads: xboxThreads,
        username,
        sessionId,
      });

      if (error) {
        console.error('Edge function error:', error);
        const errorMsg = error.message || 'Server connection error';
        toast.error(errorMsg.includes('Failed to fetch') ? 'Network error - please check your connection' : errorMsg);
        setIsXboxFetching(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setIsXboxFetching(false);
        return;
      }

      // Handle background processing mode - results come via realtime updates
      if (data.status === 'processing') {
        console.log('Xbox background job started:', data);
        setXboxStatus(`Processing ${data.total} accounts...`);
        toast.success(`Started processing ${data.total} accounts. Watch the live progress feed.`);
        // Don't set results here - they'll come via realtime updates
        // Save initial history entry
        await saveHistory('xbox_fetcher', xboxAccountsList.length, { status: 'processing', total: data.total }, []);
        return;
      }

      // Handle direct results (if returned synchronously)
      setXboxResults(data.results || []);
      setXboxProgress(xboxAccountsList.length);
      setXboxStatus('Complete!');
      toast.success(`Found ${data.stats?.totalCodes || 0} codes from ${data.stats?.success || 0} accounts`);
      
      await saveHistory('xbox_fetcher', xboxAccountsList.length, data.stats || {}, data.results || []);

    } catch (err) {
      console.error('Error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsXboxFetching(false);
    }
  };

  const handleXboxReset = () => {
    setXboxResults([]);
    setXboxProgress(0);
    setXboxStatus('');
    clearXboxUpdates();
    setXboxSessionId(null);
  };

  // Export Xbox codes
  const exportXboxCodes = () => {
    if (allXboxCodes.length === 0) {
      toast.error('No Xbox codes to export');
      return;
    }

    const content = allXboxCodes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xbox_codes_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${allXboxCodes.length} Xbox codes`);
  };

  // Manus Checker functions
  const checkManusCookies = async () => {
    if (!hasServiceAccess('manus_checker')) {
      toast.error('You need to redeem a code to access Manus Checker');
      return;
    }
    
    if (manusCookiesList.length === 0) {
      toast.error('Please enter cookies (separated by ---)');
      return;
    }

    setIsManusChecking(true);
    setManusResults([]);
    setManusLiveHits([]);
    setManusProgress(0);
    setManusSessionInfo(null);
    setManusStatus('Connecting to server...');

    try {
      // Get client info for Canary-style logging
      const clientInfo = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        country: navigator.language?.split('-')[1] || 'Unknown',
        userAgent: navigator.userAgent
      };

      // Pass filenames along with cookies so backend can return them with results
      const filenames = manusUploadedFiles.length > 0 
        ? manusUploadedFiles.map(f => f.name)
        : manusCookiesList.map((_, i) => `cookie_${i + 1}.txt`);

      const { data, error } = await invokeBackendFunction<any>('manus-checker', {
        cookies: manusCookiesList,
        filenames,
        threads: manusThreads,
        username,
        clientInfo,
      });

      if (error) {
        console.error('Manus Edge function error:', error, 'Error details:', JSON.stringify(error));
        const errorMsg = error.message || 'Server connection error';
        toast.error(errorMsg.includes('Failed to fetch') ? 'Network error - please check your connection' : errorMsg);
        setIsManusChecking(false);
        return;
      }

      console.log('Manus response:', data);

      if (!data) {
        toast.error('Empty response from server');
        setIsManusChecking(false);
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setIsManusChecking(false);
        return;
      }

      // Update live hits as results come in
      const hits = data.results.filter((r: ManusCheckResult) => r.status === 'success');
      setManusLiveHits(hits);
      
      setManusResults(data.results);
      setManusSessionInfo(data.sessionInfo);
      setManusProgress(manusCookiesList.length);
      setManusStatus('Complete!');
      
      const duration = data.sessionInfo?.duration || 'N/A';
      toast.success(`Checked ${data.stats?.total || 0} accounts in ${duration}, ${data.stats?.success || 0} hits`);
      
      await saveHistory('manus_checker', manusCookiesList.length, data.stats, data.results);

    } catch (err) {
      console.error('Error:', err);
      toast.error('An unexpected error occurred');
    } finally {
      setIsManusChecking(false);
    }
  };

  const handleManusReset = () => {
    setManusResults([]);
    setManusLiveHits([]);
    setManusProgress(0);
    setManusStatus('');
    setManusSessionInfo(null);
    setManusUploadedFiles([]);
  };

  // Download Manus hits as ZIP with cookie files named [email][plan][credit].txt
  const downloadManusHitsZip = async () => {
    const hits = manusResults.filter(r => r.status === 'success');
    if (hits.length === 0) {
      toast.error('No hits to download');
      return;
    }

    const zip = new JSZip();
    
    for (const hit of hits) {
      // Create filename: [email][plan][credit].txt
      const email = (hit.email || 'unknown').replace(/[<>:"/\\|?*]/g, '_');
      const plan = (hit.plan || hit.membership || 'free').replace(/[^a-zA-Z0-9]/g, '_');
      const credits = hit.totalCredits || '0';
      const filename = `[${email}][${plan}][${credits}].txt`;
      
      // Use cookieContent from backend response if available (preferred)
      let originalContent: string | null = hit.cookieContent || null;
      
      // Fallback: try to match by filename pattern (cookie_N.txt) from uploaded files
      if (!originalContent) {
        const indexMatch = hit.filename?.match(/cookie_(\d+)\.txt/);
        if (indexMatch && manusUploadedFiles.length > 0) {
          const idx = parseInt(indexMatch[1], 10) - 1;
          if (idx >= 0 && idx < manusUploadedFiles.length) {
            originalContent = manusUploadedFiles[idx].content;
          }
        }
      }
      
      // Fallback: try to find by original filename
      if (!originalContent) {
        const matchByName = manusUploadedFiles.find(f => f.name === hit.filename);
        if (matchByName) {
          originalContent = matchByName.content;
        }
      }
      
      // Add to zip with original cookie content
      const content = originalContent || `# Email: ${email}\n# Plan: ${plan}\n# Credits: ${credits}\n# Note: Original cookie content not found`;
      zip.file(filename, content);
    }

    // Generate and download ZIP
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manus_hits_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${hits.length} hits as ZIP`);
  };

  // Hotmail Checker - Background processing mode
  const checkHotmailAccounts = async () => {
    if (!hasServiceAccess('hotmail_validator')) {
      toast.error('You need to redeem a code to access Hotmail Validator');
      return;
    }
    
    if (hotmailAccountsList.length === 0) {
      toast.error('Please enter accounts (email:password format)');
      return;
    }

    const sessionId = generateSessionId();
    setHotmailSessionId(sessionId);
    clearHotmailUpdates();
    setIsHotmailChecking(true);
    setIsHotmailPaused(false);
    setHotmailResults([]);
    setHotmailProgress(0);
    setHotmailSessionInfo(null);
    setHotmailStatus(`Starting check of ${hotmailAccountsList.length} accounts...`);
    setHotmailStartTime(Date.now());

    try {
      const proxyList = hotmailProxies.split('\n').map(p => p.trim()).filter(p => p.length > 0);
      const clientInfo = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        country: navigator.language?.split('-')[1] || 'Unknown',
        userAgent: navigator.userAgent
      };

      // This returns immediately - processing happens in background
      const { data, error } = await invokeBackendFunction<any>('hotmail-checker', {
        accounts: hotmailAccountsList,
        checkMode: hotmailCheckMode,
        threads: hotmailThreads,
        proxies: proxyList,
        keywords: hotmailKeywords,
        clientInfo,
        sessionId,
      });

      if (error) {
        console.error('Hotmail Edge function error:', error);
        toast.error(error.message || 'Server connection error');
        setIsHotmailChecking(false);
        return;
      }

      console.log('Hotmail background job started:', data);
      
      if (data?.status === 'processing') {
        toast.success(`Processing ${data.total} accounts in background. Watch the live feed!`);
        setHotmailStatus(`Processing ${data.total} accounts...`);
      } else if (data?.error) {
        toast.error(data.error);
        setIsHotmailChecking(false);
        return;
      }

    } catch (err) {
      console.error('Error:', err);
      toast.error('An unexpected error occurred');
      setIsHotmailChecking(false);
    }
  };

  // Cancel Hotmail checking
  const cancelHotmailCheck = () => {
    setIsHotmailChecking(false);
    setIsHotmailPaused(false);
    setHotmailStatus('Cancelled by user');
    toast.info('Checking cancelled');
  };

  // Pause/Resume Hotmail checking
  const toggleHotmailPause = () => {
    setIsHotmailPaused(prev => !prev);
    toast.info(isHotmailPaused ? 'Resuming...' : 'Paused');
  };

  // Export Hotmail hits
  const exportHotmailHits = (type: 'all' | 'valid' | '2fa' | 'premium' | 'psn' | 'minecraft') => {
    let items: string[] = [];
    let filename = 'hotmail_hits';

    switch (type) {
      case 'all':
        items = hotmailResults.filter(r => r.status === 'valid').map(r => `${r.email}:${r.password}`);
        filename = 'all_valid';
        break;
      case 'valid':
        items = hotmailResults.filter(r => r.status === 'valid').map(r => `${r.email}:${r.password}`);
        filename = 'valid';
        break;
      case '2fa':
        items = hotmailResults.filter(r => r.status === '2fa').map(r => `${r.email}:${r.password}`);
        filename = '2fa';
        break;
      case 'premium':
        items = hotmailResults.filter(r => r.msStatus === 'PREMIUM').map(r => {
          const subs = r.subscriptions?.filter(s => !s.isExpired).map(s => s.name).join(', ') || '';
          return `${r.email}:${r.password} | ${subs}`;
        });
        filename = 'ms_premium';
        break;
      case 'psn':
        items = hotmailResults.filter(r => r.psn?.status === 'HAS_ORDERS').map(r => 
          `${r.email}:${r.password} | Orders: ${r.psn?.orders}`
        );
        filename = 'psn_hits';
        break;
      case 'minecraft':
        items = hotmailResults.filter(r => r.minecraft?.status === 'OWNED').map(r => 
          `${r.email}:${r.password} | ${r.minecraft?.username}`
        );
        filename = 'minecraft_hits';
        break;
    }

    if (items.length === 0) {
      toast.error('No hits to export');
      return;
    }

    const content = items.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${items.length} ${type} hits`);
  };

  // Watch for completion in realtime updates (Hotmail)
  useEffect(() => {
    if (!isHotmailChecking || hotmailUpdates.length === 0) return;

    const lastUpdate = hotmailUpdates[hotmailUpdates.length - 1];

    // Update progress
    const completed = hotmailUpdates.filter(u => u.status !== 'checking').length;
    setHotmailProgress(completed);

    // Build live results from updates for real-time UI
    const liveResults: HotmailCheckResult[] = hotmailUpdates
      .filter(u => u.email !== 'COMPLETE' && u.status !== 'checking')
      .map(u => {
        // Parse the message to extract service info
        const msg = u.message || '';
        const result: HotmailCheckResult = {
          email: u.email,
          password: u.password || '',
          status: u.status,
        };

        // Parse subscription info from message
        if (msg.includes('GAME PASS') || msg.includes('M365')) {
          result.msStatus = 'PREMIUM';
        }
        if (msg.includes('PSN:')) {
          result.psn = { status: 'HAS_ORDERS', orders: parseInt(msg.match(/PSN:(\d+)/)?.[1] || '0'), purchases: [] };
        }
        if (msg.includes('MC:')) {
          result.minecraft = { status: 'OWNED', username: msg.match(/MC:([^\s|]+)/)?.[1] || '' };
        }

        return result;
      });

    setHotmailResults(liveResults);

    // Check for completion message
    if (lastUpdate?.email === 'COMPLETE' || lastUpdate?.message?.includes('Done!')) {
      setIsHotmailChecking(false);
      setIsHotmailPaused(false);
      setHotmailStatus('Complete!');

      // Calculate stats from updates
      const valid = hotmailUpdates.filter(u => u.status === 'valid' || u.status === 'success').length;
      const invalid = hotmailUpdates.filter(u => u.status === 'invalid' || u.status === 'failed').length;
      const twoFa = hotmailUpdates.filter(u => u.status === '2fa').length;

      const duration = ((Date.now() - hotmailStartTime) / 1000).toFixed(1);

      setHotmailSessionInfo({
        startTime: new Date(hotmailStartTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: `${duration}s`,
        threadsUsed: hotmailThreads,
        accountsProcessed: liveResults.length,
        successRate: `${((valid / Math.max(liveResults.length, 1)) * 100).toFixed(1)}%`
      });

      toast.success(`Complete! ${valid} valid, ${invalid} invalid, ${twoFa} 2FA`);
    }
  }, [hotmailUpdates, isHotmailChecking, hotmailStartTime]);

  // Watch realtime updates (Xbox) so progress + live feed keep working in background mode
  useEffect(() => {
    if (!xboxSessionId || xboxUpdates.length === 0) return;

    const lastUpdate = xboxUpdates[xboxUpdates.length - 1];

    // Update progress count based on completed items
    const completed = xboxUpdates.filter(u => u.status !== 'checking' && u.email !== 'COMPLETE').length;
    setXboxProgress(completed);

    // Keep a human status line even after the initial invoke() returns
    if (xboxAccountsList.length > 0) {
      setXboxStatus(`Processing: ${completed}/${xboxAccountsList.length}`);
    }

    // Mark complete (do NOT hide the feed; user can reset manually)
    if (lastUpdate?.email === 'COMPLETE' || lastUpdate?.message?.includes('Done!')) {
      setXboxStatus('Complete!');
    }
  }, [xboxUpdates, xboxSessionId, xboxAccountsList.length]);

  // Keyboard shortcuts (P=pause, S=save, Q=quit)
  const handleShortcutPause = useCallback(() => {
    if (activeTab === 'hotmail' && isHotmailChecking) {
      toggleHotmailPause();
    }
  }, [activeTab, isHotmailChecking]);

  const handleShortcutSave = useCallback(() => {
    if (activeTab === 'hotmail' && hotmailResults.length > 0) {
      exportHotmailHits('all');
    } else if (activeTab === 'xbox' && allXboxCodes.length > 0) {
      exportXboxCodes();
    }
  }, [activeTab, hotmailResults.length, allXboxCodes.length]);

  const handleShortcutQuit = useCallback(() => {
    if (activeTab === 'hotmail' && isHotmailChecking) {
      cancelHotmailCheck();
    } else if (activeTab === 'xbox' && isXboxFetching) {
      setIsXboxFetching(false);
      setXboxStatus('Cancelled by user');
      toast.info('Xbox fetch cancelled');
    }
  }, [activeTab, isHotmailChecking, isXboxFetching]);

  useKeyboardShortcuts({
    onPause: handleShortcutPause,
    onSave: handleShortcutSave,
    onQuit: handleShortcutQuit,
    enabled: isHotmailChecking || isXboxFetching
  });

  const handleHotmailReset = () => {
    setHotmailResults([]);
    setHotmailProgress(0);
    setHotmailStatus('');
    setHotmailSessionInfo(null);
    setIsHotmailPaused(false);
    clearHotmailUpdates();
    setHotmailSessionId(null);
  };

  // Redeem code handler
  const handleRedeemCode = async () => {
    if (!redeemCodeInput.trim()) {
      toast.error('Please enter a code');
      return;
    }
    
    setIsRedeeming(true);
    const { error, services, codeName } = await redeemCode(redeemCodeInput);
    
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Code "${codeName}" redeemed! Access granted to: ${services?.join(', ')}`);
      setRedeemCodeInput('');
    }
    setIsRedeeming(false);
  };

  // Handle logout
  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <Background3D />
      <Header username={username} onLogout={handleLogout} />
      
      <main className="flex-1 container mx-auto px-4 py-8 space-y-8 relative z-10">
        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
          {isAdmin && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/admin')}
              className="shadow-3d"
            >
              <Shield className="w-4 h-4 mr-2" />
              Admin Panel
            </Button>
          )}
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/hits')}
            className="shadow-3d"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Hits Dashboard
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            className="shadow-3d"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
          
          {/* Redeem Code */}
          <div className="flex items-center gap-2 glass-card px-3 py-1.5 rounded-lg">
            <Gift className="w-4 h-4 text-primary" />
            <Input
              type="text"
              placeholder="Redeem Code"
              value={redeemCodeInput}
              onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
              className="w-32 h-7 text-xs"
            />
            <Button 
              size="sm" 
              variant="secondary" 
              className="h-7 px-2"
              onClick={handleRedeemCode}
              disabled={isRedeeming}
            >
              {isRedeeming ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Redeem'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-4xl mx-auto grid-cols-6 glass-card mb-8">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="checker" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Code className="w-4 h-4 mr-2" />
              Codes
            </TabsTrigger>
            <TabsTrigger value="claimer" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="w-4 h-4 mr-2" />
              WLID
            </TabsTrigger>
            <TabsTrigger value="xbox" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Gamepad2 className="w-4 h-4 mr-2" />
              Xbox
            </TabsTrigger>
            <TabsTrigger value="hotmail" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Mail className="w-4 h-4 mr-2" />
              Hotmail
            </TabsTrigger>
            <TabsTrigger value="manus" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Cookie className="w-4 h-4 mr-2" />
              Manus
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-8">
            <UserDashboard />
          </TabsContent>

          {/* Codes Checker Tab */}
          <TabsContent value="checker" className="space-y-8">
            <div className="grid lg:grid-cols-2 gap-6">
              <CodeInput
                label="WLID Tokens"
                placeholder="Enter each WLID token on a new line..."
                value={wlids}
                onChange={setWlids}
                icon={<Key className="w-4 h-4 text-primary" />}
              />
              <CodeInput
                label="Codes"
                placeholder="Enter each code on a new line..."
                value={codes}
                onChange={setCodes}
                icon={<Code className="w-4 h-4 text-primary" />}
              />
            </div>

            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                <Settings2 className="w-4 h-4 text-primary" />
                <Label htmlFor="checkThreads" className="text-sm">Threads:</Label>
                <Input
                  id="checkThreads"
                  type="number"
                  min={1}
                  max={1000}
                  value={checkThreads}
                  onChange={(e) => setCheckThreads(Math.max(1, Math.min(1000, parseInt(e.target.value) || 10)))}
                  className="w-20 h-8 text-center"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 justify-center">
              <Button
                onClick={checkCodes}
                disabled={isChecking || codesList.length === 0 || wlidsList.length === 0}
                size="lg"
                className="min-w-[220px] gradient-primary text-primary-foreground font-semibold shadow-3d hover:shadow-glow transition-all duration-300 hover:scale-105"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Start Check ({codesList.length} codes)
                  </>
                )}
              </Button>
              
              {checkResults.length > 0 && !isChecking && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleCheckReset}
                    className="shadow-3d hover:shadow-glow transition-all"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={() => exportCodesResults('valid')}
                    className="shadow-3d hover:shadow-glow transition-all"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export Valid
                  </Button>
                </>
              )}
            </div>

            {(isChecking || checkProgress > 0) && (
              <div className="max-w-2xl mx-auto">
                <ProgressBar
                  current={checkProgress}
                  total={codesList.length}
                  status={checkStatus}
                />
              </div>
            )}

            {checkResults.length > 0 && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard
                    label="Valid"
                    value={checkStats.valid}
                    icon={<CheckCircle className="w-5 h-5" />}
                    colorClass="text-success"
                  />
                  <StatsCard
                    label="Used"
                    value={checkStats.used}
                    icon={<XCircle className="w-5 h-5" />}
                    colorClass="text-destructive"
                  />
                  <StatsCard
                    label="Expired"
                    value={checkStats.expired}
                    icon={<Clock className="w-5 h-5" />}
                    colorClass="text-expired"
                  />
                  <StatsCard
                    label="Invalid"
                    value={checkStats.invalid}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    colorClass="text-warning"
                  />
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <ResultCard
                    title="Valid Codes"
                    icon={<CheckCircle className="w-5 h-5" />}
                    items={validResults}
                    colorClass="text-success"
                  />
                  <ResultCard
                    title="Used Codes"
                    icon={<XCircle className="w-5 h-5" />}
                    items={usedResults}
                    colorClass="text-destructive"
                  />
                  <ResultCard
                    title="Expired Codes"
                    icon={<Clock className="w-5 h-5" />}
                    items={expiredResults}
                    colorClass="text-expired"
                  />
                  <ResultCard
                    title="Invalid Codes"
                    icon={<AlertTriangle className="w-5 h-5" />}
                    items={invalidResults}
                    colorClass="text-warning"
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* WLID Claimer Tab */}
          <TabsContent value="claimer" className="space-y-8">
            <div className="max-w-2xl mx-auto">
              <CodeInput
                label="Accounts"
                placeholder="Enter accounts in email:password format, one per line..."
                value={accounts}
                onChange={setAccounts}
                icon={<Users className="w-4 h-4 text-primary" />}
              />
            </div>

            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                <Settings2 className="w-4 h-4 text-primary" />
                <Label htmlFor="claimThreads" className="text-sm">Threads:</Label>
                <Input
                  id="claimThreads"
                  type="number"
                  min={1}
                  max={50}
                  value={claimThreads}
                  onChange={(e) => setClaimThreads(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                  className="w-20 h-8 text-center"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 justify-center">
              <Button
                onClick={claimWlids}
                disabled={isClaiming || accountsList.length === 0}
                size="lg"
                className="min-w-[220px] gradient-primary text-primary-foreground font-semibold shadow-3d hover:shadow-glow transition-all duration-300 hover:scale-105"
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Start Claim ({accountsList.length} accounts)
                  </>
                )}
              </Button>
              
              {claimResults.length > 0 && !isClaiming && (
                <>
                  <Button 
                    variant="outline" 
                    onClick={handleClaimReset}
                    className="shadow-3d hover:shadow-glow transition-all"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset
                  </Button>
                  <Button 
                    variant="secondary" 
                    onClick={exportWlidTokens}
                    className="shadow-3d hover:shadow-glow transition-all"
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Export Tokens
                  </Button>
                </>
              )}
            </div>

            {(isClaiming || claimProgress > 0) && (
              <div className="max-w-2xl mx-auto">
                <ProgressBar
                  current={claimProgress}
                  total={accountsList.length}
                  status={claimStatus}
                />
              </div>
            )}

            {claimResults.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <StatsCard
                    label="Success"
                    value={claimStats.success}
                    icon={<CheckCircle className="w-5 h-5" />}
                    colorClass="text-success"
                  />
                  <StatsCard
                    label="Failed"
                    value={claimStats.failed}
                    icon={<XCircle className="w-5 h-5" />}
                    colorClass="text-destructive"
                  />
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <ResultCard
                    title="Successful Tokens"
                    icon={<CheckCircle className="w-5 h-5" />}
                    items={successfulTokens}
                    colorClass="text-success"
                  />
                  <ResultCard
                    title="Failed Accounts"
                    icon={<XCircle className="w-5 h-5" />}
                    items={failedAccounts}
                    colorClass="text-destructive"
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* Xbox Fetcher Tab */}
          <TabsContent value="xbox" className="space-y-8">
            {!hasServiceAccess('xbox_fetcher') && (
              <div className="text-center p-8 glass-card rounded-xl">
                <Gamepad2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Xbox Fetcher Locked</h3>
                <p className="text-muted-foreground mb-4">Redeem a code to access this feature</p>
              </div>
            )}
            
            {hasServiceAccess('xbox_fetcher') && (
              <>
                <div className="max-w-2xl mx-auto">
                  <CodeInput
                    label="Xbox Accounts"
                    placeholder="Enter accounts in email:password format, one per line..."
                    value={xboxAccounts}
                    onChange={setXboxAccounts}
                    icon={<Gamepad2 className="w-4 h-4 text-primary" />}
                  />
                </div>

                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <Label htmlFor="xboxThreads" className="text-sm">Threads:</Label>
                    <Input
                      id="xboxThreads"
                      type="number"
                      min={1}
                      max={20}
                      value={xboxThreads}
                      onChange={(e) => setXboxThreads(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                      className="w-20 h-8 text-center"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 justify-center">
                  <Button
                    onClick={fetchXboxCodes}
                    disabled={isXboxFetching || xboxAccountsList.length === 0}
                    size="lg"
                    className="min-w-[220px] gradient-primary text-primary-foreground font-semibold shadow-3d hover:shadow-glow transition-all duration-300 hover:scale-105"
                  >
                    {isXboxFetching ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Fetching...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Fetch Codes ({xboxAccountsList.length} accounts)
                      </>
                    )}
                  </Button>
                  
                  {xboxResults.length > 0 && !isXboxFetching && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={handleXboxReset}
                        className="shadow-3d hover:shadow-glow transition-all"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={exportXboxCodes}
                        className="shadow-3d hover:shadow-glow transition-all"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Export Codes
                      </Button>
                    </>
                  )}
                </div>

                {(isXboxFetching || xboxProgress > 0) && (
                  <div className="max-w-2xl mx-auto space-y-4">
                    <ProgressBar
                      current={xboxProgress}
                      total={xboxAccountsList.length}
                      status={xboxStatus}
                    />
                {/* Always show live feed if there are updates (persists until reset) */}
                    {xboxUpdates.length > 0 && (
                      <LiveProgressFeed 
                        updates={xboxUpdates}
                        isConnected={xboxConnected}
                        total={xboxAccountsList.length || xboxUpdates[0]?.total || 1}
                        clientIp={clientIp}
                        timezone={timezone}
                        showShortcuts={isXboxFetching}
                        onClear={handleXboxReset}
                      />
                    )}
                  </div>
                )}
                
                {/* Show live feed even after progress is done if there are updates */}
                {!isXboxFetching && xboxProgress === 0 && xboxUpdates.length > 0 && (
                  <div className="max-w-2xl mx-auto">
                    <LiveProgressFeed 
                      updates={xboxUpdates}
                      isConnected={xboxConnected}
                      total={xboxUpdates[0]?.total || xboxUpdates.length}
                      clientIp={clientIp}
                      timezone={timezone}
                      showShortcuts={false}
                      onClear={handleXboxReset}
                    />
                  </div>
                )}

                {xboxResults.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatsCard
                        label="Success"
                        value={xboxStats.success}
                        icon={<CheckCircle className="w-5 h-5" />}
                        colorClass="text-success"
                      />
                      <StatsCard
                        label="No Codes"
                        value={xboxStats.noCodes}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        colorClass="text-warning"
                      />
                      <StatsCard
                        label="Failed"
                        value={xboxStats.failed}
                        icon={<XCircle className="w-5 h-5" />}
                        colorClass="text-destructive"
                      />
                      <StatsCard
                        label="Total Codes"
                        value={xboxStats.totalCodes}
                        icon={<Gamepad2 className="w-5 h-5" />}
                        colorClass="text-primary"
                      />
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4">
                      <ResultCard
                        title="Accounts With Codes"
                        icon={<Gift className="w-5 h-5" />}
                        items={xboxAccountsWithCodes}
                        colorClass="text-success"
                      />
                      <ResultCard
                        title="Valid Accounts (No Codes)"
                        icon={<CheckCircle className="w-5 h-5" />}
                        items={xboxValidAccounts}
                        colorClass="text-blue-500"
                      />
                    </div>
                    
                    <ResultCard
                      title="All Codes"
                      icon={<Gamepad2 className="w-5 h-5" />}
                      items={allXboxCodes}
                      colorClass="text-primary"
                    />
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* Hotmail Checker Tab */}
          <TabsContent value="hotmail" className="space-y-8">
            {!hasServiceAccess('hotmail_validator') && (
              <div className="text-center p-8 glass-card rounded-xl">
                <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Hotmail Validator Locked</h3>
                <p className="text-muted-foreground mb-4">Redeem a code to access this feature</p>
              </div>
            )}
            
            {hasServiceAccess('hotmail_validator') && (
              <>
                <div className="grid lg:grid-cols-2 gap-6">
                  <CodeInput
                    label="Hotmail Accounts"
                    placeholder="Enter accounts in email:password format, one per line..."
                    value={hotmailAccounts}
                    onChange={setHotmailAccounts}
                    icon={<Mail className="w-4 h-4 text-primary" />}
                  />
                  <CodeInput
                    label="Proxies (Optional)"
                    placeholder="Enter proxies - supports all formats:
http://host:port
host:port:user:pass
user:pass@host:port
socks5://host:port
..."
                    value={hotmailProxies}
                    onChange={setHotmailProxies}
                    icon={<Shield className="w-4 h-4 text-primary" />}
                  />
                </div>

                {/* Keywords Input - like Python's inboxer */}
                <div className="max-w-2xl mx-auto">
                  <KeywordsInput
                    keywords={hotmailKeywords}
                    onChange={setHotmailKeywords}
                    placeholder="Add keywords to search in inbox (like paypal, receipt, crypto...)"
                    maxKeywords={50}
                  />
                </div>

                <div className="flex items-center justify-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <Label htmlFor="hotmailThreads" className="text-sm">Threads:</Label>
                    <Input
                      id="hotmailThreads"
                      type="number"
                      min={1}
                      max={50}
                      value={hotmailThreads}
                      onChange={(e) => setHotmailThreads(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                      className="w-20 h-8 text-center"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    <Label className="text-sm">Check Mode:</Label>
                    <Select value={hotmailCheckMode} onValueChange={setHotmailCheckMode}>
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Full Scan (All)</SelectItem>
                        <SelectItem value="microsoft">Microsoft Subs</SelectItem>
                        <SelectItem value="psn">PlayStation</SelectItem>
                        <SelectItem value="steam">Steam</SelectItem>
                        <SelectItem value="supercell">Supercell</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="minecraft">Minecraft</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4 justify-center flex-wrap">
                  <Button
                    onClick={checkHotmailAccounts}
                    disabled={isHotmailChecking || hotmailAccountsList.length === 0}
                    size="lg"
                    className="min-w-[220px] gradient-primary text-primary-foreground font-semibold shadow-3d hover:shadow-glow transition-all duration-300 hover:scale-105"
                  >
                    {isHotmailChecking ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        {isHotmailPaused ? 'Paused' : 'Checking...'}
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Check ({hotmailAccountsList.length} accounts)
                      </>
                    )}
                  </Button>
                  
                  {isHotmailChecking && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={toggleHotmailPause}
                        className="shadow-3d hover:shadow-glow transition-all"
                      >
                        <Pause className="w-4 h-4 mr-2" />
                        {isHotmailPaused ? 'Resume' : 'Pause'}
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={cancelHotmailCheck}
                        className="shadow-3d hover:shadow-glow transition-all"
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </>
                  )}
                  
                  {hotmailResults.length > 0 && !isHotmailChecking && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={handleHotmailReset}
                        className="shadow-3d hover:shadow-glow transition-all"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={() => exportHotmailHits('all')}
                        className="shadow-3d hover:shadow-glow transition-all"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Export Hits
                      </Button>
                    </>
                  )}
                </div>

                {(isHotmailChecking || hotmailProgress > 0) && (
                  <div className="max-w-2xl mx-auto space-y-4">
                    <ProgressBar
                      current={hotmailProgress}
                      total={hotmailAccountsList.length}
                      status={hotmailStatus}
                    />
                    {/* Always show live feed if there are updates (persists until reset) */}
                    {hotmailUpdates.length > 0 && (
                      <LiveProgressFeed 
                        updates={hotmailUpdates}
                        isConnected={hotmailConnected}
                        total={hotmailAccountsList.length || hotmailUpdates[0]?.total || 1}
                        clientIp={clientIp}
                        timezone={timezone}
                        showShortcuts={isHotmailChecking}
                        onClear={handleHotmailReset}
                      />
                    )}
                  </div>
                )}
                
                {/* Show live feed even after progress is done if there are updates */}
                {!isHotmailChecking && hotmailProgress === 0 && hotmailUpdates.length > 0 && (
                  <div className="max-w-2xl mx-auto">
                    <LiveProgressFeed 
                      updates={hotmailUpdates}
                      isConnected={hotmailConnected}
                      total={hotmailUpdates[0]?.total || hotmailUpdates.length}
                      clientIp={clientIp}
                      timezone={timezone}
                      showShortcuts={false}
                      onClear={handleHotmailReset}
                    />
                  </div>
                )}

                {hotmailResults.length > 0 && (
                  <>
                    {/* Session Info Panel (Canary Style) */}
                    {hotmailSessionInfo && (
                      <div className="glass-card p-4 rounded-xl border border-primary/20 font-mono text-xs">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="text-primary font-semibold">SESSION INFO</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-muted-foreground">
                          <div>
                            <span className="text-foreground">Started:</span> {hotmailSessionInfo.startTime}
                          </div>
                          <div>
                            <span className="text-foreground">Duration:</span> {hotmailSessionInfo.duration}
                          </div>
                          <div>
                            <span className="text-foreground">Threads:</span> {hotmailSessionInfo.threadsUsed}
                          </div>
                          <div>
                            <span className="text-foreground">Success Rate:</span> <span className="text-success">{hotmailSessionInfo.successRate}</span>
                          </div>
                          <div>
                            <span className="text-foreground">Processed:</span> {hotmailSessionInfo.accountsProcessed} accounts
                          </div>
                          <div>
                            <span className="text-foreground">Proxy:</span> {hotmailSessionInfo.proxyUsed}
                          </div>
                          <div>
                            <span className="text-foreground">Timezone:</span> {hotmailSessionInfo.timezone}
                          </div>
                          <div>
                            <span className="text-foreground">Client IP:</span> {hotmailSessionInfo.clientIP?.substring(0, 20)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
                      <StatsCard
                        label="Valid"
                        value={hotmailStats.valid}
                        icon={<CheckCircle className="w-5 h-5" />}
                        colorClass="text-success"
                      />
                      <StatsCard
                        label="MS Premium"
                        value={hotmailStats.msPremium}
                        icon={<Gamepad2 className="w-5 h-5" />}
                        colorClass="text-purple-500"
                      />
                      <StatsCard
                        label="PSN"
                        value={hotmailStats.psnHits}
                        icon={<Gamepad2 className="w-5 h-5" />}
                        colorClass="text-blue-500"
                      />
                      <StatsCard
                        label="Steam"
                        value={hotmailStats.steamHits}
                        icon={<ShoppingCart className="w-5 h-5" />}
                        colorClass="text-cyan-500"
                      />
                      <StatsCard
                        label="Minecraft"
                        value={hotmailStats.minecraftHits}
                        icon={<Shield className="w-5 h-5" />}
                        colorClass="text-green-500"
                      />
                      <StatsCard
                        label="2FA"
                        value={hotmailStats.twoFa}
                        icon={<AlertTriangle className="w-5 h-5" />}
                        colorClass="text-warning"
                      />
                    </div>

                    {/* Results Grid */}
                    <div className="grid lg:grid-cols-2 gap-4">
                      {/* Valid Accounts */}
                      <ResultCard
                        title="Valid Accounts"
                        icon={<CheckCircle className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.status === 'valid').map(r => 
                          `${r.email}:${r.password}${r.country ? ` | ${r.country}` : ''}${r.name ? ` | ${r.name}` : ''}`
                        )}
                        colorClass="text-success"
                      />
                      
                      {/* MS Premium */}
                      <ResultCard
                        title="MS Premium (Xbox/M365)"
                        icon={<Gamepad2 className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.msStatus === 'PREMIUM').map(r => {
                          const subs = r.subscriptions?.filter(s => !s.isExpired).map(s => 
                            `${s.name}${s.daysRemaining ? ` (${s.daysRemaining}d)` : ''}`
                          ).join(', ') || '';
                          return `${r.email}:${r.password} | ${subs}`;
                        })}
                        colorClass="text-purple-500"
                      />
                      
                      {/* PSN */}
                      <ResultCard
                        title="PlayStation Orders"
                        icon={<Gamepad2 className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.psn?.status === 'HAS_ORDERS').map(r => {
                          const purchases = r.psn?.purchases?.slice(0, 3).map(p => p.item).join(', ') || '';
                          return `${r.email}:${r.password} | ${r.psn?.orders} orders${purchases ? ` | ${purchases}` : ''}`;
                        })}
                        colorClass="text-blue-500"
                      />
                      
                      {/* Steam */}
                      <ResultCard
                        title="Steam Purchases"
                        icon={<ShoppingCart className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.steam?.status === 'HAS_PURCHASES').map(r => 
                          `${r.email}:${r.password} | ${r.steam?.count} purchases`
                        )}
                        colorClass="text-cyan-500"
                      />
                      
                      {/* Minecraft */}
                      <ResultCard
                        title="Minecraft Accounts"
                        icon={<Shield className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.minecraft?.status === 'OWNED').map(r => {
                          const capes = r.minecraft?.capes?.length ? ` | Capes: ${r.minecraft.capes.join(',')}` : '';
                          return `${r.email}:${r.password} | ${r.minecraft?.username}${capes}`;
                        })}
                        colorClass="text-green-500"
                      />
                      
                      {/* Supercell */}
                      <ResultCard
                        title="Supercell Games"
                        icon={<Shield className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.supercell?.status === 'LINKED').map(r => 
                          `${r.email}:${r.password} | ${r.supercell?.games?.join(', ')}`
                        )}
                        colorClass="text-yellow-500"
                      />
                      
                      {/* TikTok */}
                      <ResultCard
                        title="TikTok Linked"
                        icon={<Mail className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.tiktok?.status === 'LINKED').map(r => 
                          `${r.email}:${r.password} | @${r.tiktok?.username}`
                        )}
                        colorClass="text-pink-500"
                      />
                      
                      {/* 2FA / Locked */}
                      <ResultCard
                        title="2FA / Locked"
                        icon={<AlertTriangle className="w-5 h-5" />}
                        items={hotmailResults.filter(r => r.status === '2fa' || r.status === 'locked').map(r => 
                          `${r.email}:${r.password} | ${r.status.toUpperCase()}`
                        )}
                        colorClass="text-warning"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* Manus Checker Tab */}
          <TabsContent value="manus" className="space-y-8">
            {!hasServiceAccess('manus_checker') && (
              <div className="text-center p-8 glass-card rounded-xl">
                <Cookie className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Manus Checker Locked</h3>
                <p className="text-muted-foreground mb-4">Redeem a code to access this feature</p>
              </div>
            )}
            
            {hasServiceAccess('manus_checker') && (
              <>
                {/* File Upload Section */}
                <div className="max-w-2xl mx-auto">
                  <ManusFileUpload 
                    onFilesLoaded={(cookies, files) => {
                      setManusCookies(cookies.join('\n---\n'));
                      setManusUploadedFiles(files);
                      toast.success(`Loaded ${cookies.length} cookies from files`);
                    }}
                    isLoading={isManusChecking}
                  />
                </div>

                <div className="text-center text-muted-foreground text-sm">
                  — OR paste cookies directly —
                </div>

                <div className="max-w-2xl mx-auto">
                  <CodeInput
                    label="Manus Cookies"
                    placeholder="Paste cookies here, separate multiple with ---"
                    value={manusCookies}
                    onChange={setManusCookies}
                    icon={<Cookie className="w-4 h-4 text-primary" />}
                  />
                </div>

                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <Label htmlFor="manusThreads" className="text-sm">Threads:</Label>
                    <Input
                      id="manusThreads"
                      type="number"
                      min={1}
                      max={20}
                      value={manusThreads}
                      onChange={(e) => setManusThreads(Math.max(1, Math.min(20, parseInt(e.target.value) || 5)))}
                      className="w-20 h-8 text-center"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 justify-center">
                  <Button
                    onClick={checkManusCookies}
                    disabled={isManusChecking || manusCookiesList.length === 0}
                    size="lg"
                    className="min-w-[220px] gradient-primary text-primary-foreground font-semibold shadow-3d hover:shadow-glow transition-all duration-300 hover:scale-105"
                  >
                    {isManusChecking ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Checking...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Check Cookies ({manusCookiesList.length})
                      </>
                    )}
                  </Button>
                  
                  {manusResults.length > 0 && !isManusChecking && (
                    <Button 
                      variant="outline" 
                      onClick={handleManusReset}
                      className="shadow-3d hover:shadow-glow transition-all"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  )}
                </div>

                {(isManusChecking || manusProgress > 0) && (
                  <div className="max-w-2xl mx-auto space-y-4">
                    <ProgressBar
                      current={manusProgress}
                      total={manusCookiesList.length}
                      status={manusStatus}
                    />
                    
                    {/* Live Hits Panel - Shows during checking */}
                    {isManusChecking && manusLiveHits.length > 0 && (
                      <div className="glass-card p-4 rounded-xl border border-success/30 animate-pulse-glow">
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="w-4 h-4 text-success animate-pulse" />
                          <span className="text-success font-semibold">LIVE HITS ({manusLiveHits.length})</span>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-xs">
                          {manusLiveHits.slice(-10).map((hit, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-success/90">
                              <CheckCircle className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">
                                {hit.email} | {hit.plan || hit.membership} | {hit.totalCredits} credits
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {manusResults.length > 0 && (
                  <>
                    {/* Session Info Panel (Canary Style) */}
                    {manusSessionInfo && (
                      <div className="glass-card p-4 rounded-xl border border-primary/20 font-mono text-xs">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="text-primary font-semibold">SESSION INFO</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-muted-foreground">
                          <div>
                            <span className="text-foreground">Started:</span> {manusSessionInfo.startTime}
                          </div>
                          <div>
                            <span className="text-foreground">Duration:</span> {manusSessionInfo.duration}
                          </div>
                          <div>
                            <span className="text-foreground">Threads:</span> {manusSessionInfo.threadsUsed}
                          </div>
                          <div>
                            <span className="text-foreground">Success Rate:</span> <span className="text-success">{manusSessionInfo.successRate}</span>
                          </div>
                          <div>
                            <span className="text-foreground">Processed:</span> {manusSessionInfo.accountsProcessed} accounts
                          </div>
                          <div>
                            <span className="text-foreground">Timezone:</span> {manusSessionInfo.timezone}
                          </div>
                          <div className="col-span-2">
                            <span className="text-foreground">End:</span> {manusSessionInfo.endTime}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-2xl mx-auto">
                      <StatsCard
                        label="Hits"
                        value={manusStats.success}
                        icon={<CheckCircle className="w-5 h-5" />}
                        colorClass="text-success"
                      />
                      <StatsCard
                        label="Failed"
                        value={manusStats.failed}
                        icon={<XCircle className="w-5 h-5" />}
                        colorClass="text-destructive"
                      />
                      <StatsCard
                        label="Total"
                        value={manusStats.total}
                        icon={<Cookie className="w-5 h-5" />}
                        colorClass="text-primary"
                      />
                      <StatsCard
                        label="Rate"
                        value={manusStats.total > 0 ? `${((manusStats.success / manusStats.total) * 100).toFixed(0)}%` : '0%'}
                        icon={<Clock className="w-5 h-5" />}
                        colorClass="text-blue-500"
                      />
                    </div>

                    {/* Download Hits as ZIP Button */}
                    <div className="flex justify-center">
                      <Button
                        onClick={downloadManusHitsZip}
                        disabled={manusStats.success === 0}
                        className="gradient-primary shadow-3d hover:shadow-glow"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Hits as ZIP ({manusStats.success})
                      </Button>
                    </div>

                    {/* Results - Hits with Email | Plan | Credits */}
                    <ResultCard
                      title="HITS - Email | Plan | Credits"
                      icon={<CheckCircle className="w-5 h-5" />}
                      items={manusResults.filter(r => r.status === 'success').map(r => 
                        `${r.email} | ${r.plan || r.membership} | Total: ${r.totalCredits} | Free: ${r.freeCredits}`
                      )}
                      colorClass="text-success"
                    />

                    {/* Failed accounts */}
                    <ResultCard
                      title="Failed Cookies"
                      icon={<XCircle className="w-5 h-5" />}
                      items={manusResults.filter(r => r.status === 'failed').map(r => 
                        `${r.filename} | ${r.error || 'Invalid cookie'}`
                      )}
                      colorClass="text-destructive"
                    />
                  </>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Mini Progress Player - Spotify style */}
      {showMiniPlayer && activeService && (
        <MiniProgressPlayer
          sessionId={
            activeService === 'hotmail_validator' ? hotmailSessionId :
            activeService === 'xbox_fetcher' ? xboxSessionId :
            null
          }
          service={activeService}
          updates={
            activeService === 'hotmail_validator' ? hotmailUpdates :
            activeService === 'xbox_fetcher' ? xboxUpdates :
            []
          }
          isConnected={
            activeService === 'hotmail_validator' ? hotmailConnected :
            activeService === 'xbox_fetcher' ? xboxConnected :
            false
          }
          onClose={() => setShowMiniPlayer(false)}
        />
      )}
    </div>
  );
}
