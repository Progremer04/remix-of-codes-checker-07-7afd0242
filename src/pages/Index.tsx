 import { useState, useMemo, useEffect } from 'react';
 import { useNavigate } from 'react-router-dom';
 import { 
   Key, Code, Play, Loader2, CheckCircle, XCircle, Clock, 
   AlertTriangle, RotateCcw, Users, Settings2, Gamepad2, 
   Cookie, Shield, Gift, LogIn
 } from 'lucide-react';
 import { Header } from '@/components/Header';
 import { CodeInput } from '@/components/CodeInput';
 import { ResultCard } from '@/components/ResultCard';
 import { StatsCard } from '@/components/StatsCard';
 import { ProgressBar } from '@/components/ProgressBar';
 import { Background3D } from '@/components/Background3D';
 import { UsernameModal } from '@/components/UsernameModal';
 import { Button } from '@/components/ui/button';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { CheckResult } from '@/types/checker';
 import { toast } from 'sonner';
 import { supabase } from '@/integrations/supabase/client';
 import { useAuth } from '@/hooks/useAuth';

 interface ClaimResult {
   email: string;
   success: boolean;
   token?: string;
   error?: string;
 }
 
 interface XboxFetchResult {
   email: string;
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
   totalCredits: string;
   freeCredits: string;
   error?: string;
 }

export default function Index() {
   const navigate = useNavigate();
   const { user, isAdmin, isLoading: authLoading, userServices, signOut, redeemCode } = useAuth();
 
  // Username State
  const [username, setUsername] = useState<string | null>(null);
  const [isLoadingUsername, setIsLoadingUsername] = useState(true);
 
   // Redeem code state
   const [redeemCodeInput, setRedeemCodeInput] = useState('');
   const [isRedeeming, setIsRedeeming] = useState(false);

  // Check for saved username on mount
  useEffect(() => {
     if (!authLoading) {
       if (user) {
         // Use email or user id as username if logged in
         setUsername(user.email || user.id);
       } else {
         const savedUsername = localStorage.getItem('checker_username');
         if (savedUsername) {
           setUsername(savedUsername);
         }
       }
       setIsLoadingUsername(false);
    }
   }, [authLoading, user]);

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
   const [manusThreads, setManusThreads] = useState(5);

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

  const validResults = useMemo(() => 
    checkResults.filter(r => r.status === 'valid').map(r => r.title ? `${r.code} | ${r.title}` : r.code),
    [checkResults]
  );

  const usedResults = useMemo(() => 
    checkResults.filter(r => r.status === 'used').map(r => r.code),
    [checkResults]
  );

  const expiredResults = useMemo(() => 
    checkResults.filter(r => r.status === 'expired').map(r => r.title ? `${r.code} | ${r.title}` : r.code),
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
     success: xboxResults.filter(r => r.status === 'success').length,
     noCodes: xboxResults.filter(r => r.status === 'no_codes').length,
     failed: xboxResults.filter(r => !['success', 'no_codes'].includes(r.status)).length,
     totalCodes: xboxResults.reduce((sum, r) => sum + r.codes.length, 0),
     total: xboxResults.length,
   }), [xboxResults]);
 
   const allXboxCodes = useMemo(() => 
     xboxResults.flatMap(r => r.codes),
     [xboxResults]
   );
 
   // Manus Checker computed values  
   const manusCookiesList = useMemo(() => 
     manusCookies.split('---').map(c => c.trim()).filter(c => c.length > 0),
     [manusCookies]
   );
 
   const manusStats = useMemo(() => ({
     success: manusResults.filter(r => r.status === 'success').length,
     failed: manusResults.filter(r => r.status === 'failed').length,
     total: manusResults.length,
   }), [manusResults]);
 
   // Check service access
   const hasServiceAccess = (service: string) => {
     if (isAdmin) return true;
     return userServices.includes(service);
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
      // Always use streaming for better memory management
      setCheckStatus('Processing codes...');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-codes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ wlids: wlidsList, codes: codesList, threads: checkThreads, username })
        }
      );

      if (!response.ok) {
        let errorMessage = 'Server error';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response might not be JSON
        }
        toast.error(errorMessage);
        setIsChecking(false);
        return;
      }

      const contentType = response.headers.get('Content-Type') || '';
      
      // Handle streaming response (ndjson)
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
        const UPDATE_INTERVAL = 200; // Update UI every 200ms max

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

          // Batch UI updates to prevent freezing
          const now = Date.now();
          if (now - lastUpdateTime >= UPDATE_INTERVAL) {
            setCheckProgress(resultsAccumulator.length);
            setCheckStatus(`Processing: ${resultsAccumulator.length.toLocaleString()}/${codesList.length.toLocaleString()}`);
            // Only update results every 500 items or at intervals
            if (resultsAccumulator.length % 500 === 0) {
              setCheckResults([...resultsAccumulator]);
            }
            lastUpdateTime = now;
            // Allow browser to breathe
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }

        // Process remaining buffer
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
      } else {
        // Handle regular JSON response
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
      const { data, error } = await supabase.functions.invoke('claim-wlids', {
        body: { accounts: accountsList, threads: claimThreads, username }
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error('Server connection error');
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
 
     setIsXboxFetching(true);
     setXboxResults([]);
     setXboxProgress(0);
     setXboxStatus('Connecting to server...');
 
     try {
       const { data, error } = await supabase.functions.invoke('xbox-fetcher', {
         body: { accounts: xboxAccountsList, threads: xboxThreads, username }
       });
 
       if (error) {
         console.error('Edge function error:', error);
         toast.error('Server connection error');
         setIsXboxFetching(false);
         return;
       }
 
       if (data.error) {
         toast.error(data.error);
         setIsXboxFetching(false);
         return;
       }
 
       setXboxResults(data.results);
       setXboxProgress(xboxAccountsList.length);
       setXboxStatus('Complete!');
       toast.success(`Found ${data.stats?.totalCodes || 0} codes from ${data.stats?.success || 0} accounts`);
 
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
     setManusProgress(0);
     setManusStatus('Connecting to server...');
 
     try {
       const { data, error } = await supabase.functions.invoke('manus-checker', {
         body: { cookies: manusCookiesList, threads: manusThreads, username }
       });
 
       if (error) {
         console.error('Edge function error:', error);
         toast.error('Server connection error');
         setIsManusChecking(false);
         return;
       }
 
       if (data.error) {
         toast.error(data.error);
         setIsManusChecking(false);
         return;
       }
 
       setManusResults(data.results);
       setManusProgress(manusCookiesList.length);
       setManusStatus('Complete!');
       toast.success(`Checked ${data.stats?.total || 0} accounts, ${data.stats?.success || 0} valid`);
 
     } catch (err) {
       console.error('Error:', err);
       toast.error('An unexpected error occurred');
     } finally {
       setIsManusChecking(false);
     }
   };
 
   const handleManusReset = () => {
     setManusResults([]);
     setManusProgress(0);
     setManusStatus('');
   };
 
   // Redeem code handler
   const handleRedeemCode = async () => {
     if (!user) {
       toast.error('Please sign in to redeem codes');
       navigate('/auth');
       return;
     }
     
     if (!redeemCodeInput.trim()) {
       toast.error('Please enter a code');
       return;
     }
     
     setIsRedeeming(true);
     const { error, services } = await redeemCode(redeemCodeInput);
     
     if (error) {
       toast.error(error);
     } else {
       toast.success(`Code redeemed! Access granted to: ${services?.join(', ')}`);
       setRedeemCodeInput('');
     }
     setIsRedeeming(false);
   };

  // Show loading state
   if (isLoadingUsername || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show username modal if no username
  if (!username) {
    return (
      <>
        <Background3D />
         <UsernameModal onSubmit={(name) => {
           localStorage.setItem('checker_username', name);
           setUsername(name);
         }} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      <Background3D />
       <Header 
         username={username} 
         onLogout={() => { 
           localStorage.removeItem('checker_username'); 
           setUsername(null); 
           if (user) signOut();
         }} 
       />
      
      <main className="flex-1 container mx-auto px-4 py-8 space-y-8 relative z-10">
         {/* Quick Actions Bar */}
         <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
           {user ? (
             <>
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
             </>
           ) : (
             <Button 
               variant="outline" 
               size="sm" 
               onClick={() => navigate('/auth')}
               className="shadow-3d"
             >
               <LogIn className="w-4 h-4 mr-2" />
               Sign In
             </Button>
           )}
           
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
 
        <Tabs defaultValue="checker" className="w-full">
           <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 glass-card mb-8">
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
             <TabsTrigger value="manus" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
               <Cookie className="w-4 h-4 mr-2" />
               Manus
             </TabsTrigger>
          </TabsList>

          {/* Codes Checker Tab */}
          <TabsContent value="checker" className="space-y-8">
            {/* Input Section */}
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

            {/* Threads Control */}
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

            {/* Action Buttons */}
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
                <Button 
                  variant="outline" 
                  onClick={handleCheckReset}
                  className="shadow-3d hover:shadow-glow transition-all"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              )}
            </div>

            {/* Progress */}
            {(isChecking || checkProgress > 0) && (
              <div className="max-w-2xl mx-auto">
                <ProgressBar
                  current={checkProgress}
                  total={codesList.length}
                  status={checkStatus}
                />
              </div>
            )}

            {/* Stats */}
            {checkResults.length > 0 && (
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
            )}

            {/* Results */}
            {checkResults.length > 0 && (
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
            )}
          </TabsContent>

          {/* WLID Claimer Tab */}
          <TabsContent value="claimer" className="space-y-8">
            {/* Input Section */}
            <div className="max-w-2xl mx-auto">
              <CodeInput
                label="Accounts"
                placeholder="Enter accounts in email:password format, one per line..."
                value={accounts}
                onChange={setAccounts}
                icon={<Users className="w-4 h-4 text-primary" />}
              />
            </div>

            {/* Threads Control */}
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

            {/* Action Buttons */}
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
                <Button 
                  variant="outline" 
                  onClick={handleClaimReset}
                  className="shadow-3d hover:shadow-glow transition-all"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
              )}
            </div>

            {/* Progress */}
            {(isClaiming || claimProgress > 0) && (
              <div className="max-w-2xl mx-auto">
                <ProgressBar
                  current={claimProgress}
                  total={accountsList.length}
                  status={claimStatus}
                />
              </div>
            )}

            {/* Stats */}
            {claimResults.length > 0 && (
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
            )}

            {/* Results */}
            {claimResults.length > 0 && (
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
                 {/* Input Section */}
                 <div className="max-w-2xl mx-auto">
                   <CodeInput
                     label="Xbox Accounts"
                     placeholder="Enter accounts in email:password format, one per line..."
                     value={xboxAccounts}
                     onChange={setXboxAccounts}
                     icon={<Gamepad2 className="w-4 h-4 text-primary" />}
                   />
                 </div>
 
                 {/* Threads Control */}
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
 
                 {/* Action Buttons */}
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
                     <Button 
                       variant="outline" 
                       onClick={handleXboxReset}
                       className="shadow-3d hover:shadow-glow transition-all"
                     >
                       <RotateCcw className="w-4 h-4 mr-2" />
                       Reset
                     </Button>
                   )}
                 </div>
 
                 {/* Progress */}
                 {(isXboxFetching || xboxProgress > 0) && (
                   <div className="max-w-2xl mx-auto">
                     <ProgressBar
                       current={xboxProgress}
                       total={xboxAccountsList.length}
                       status={xboxStatus}
                     />
                   </div>
                 )}
 
                 {/* Stats */}
                 {xboxResults.length > 0 && (
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
                 )}
 
                 {/* Results */}
                 {xboxResults.length > 0 && (
                   <div className="grid lg:grid-cols-2 gap-4">
                     <ResultCard
                       title="Fetched Codes"
                       icon={<Gamepad2 className="w-5 h-5" />}
                       items={allXboxCodes}
                       colorClass="text-success"
                     />
                     <ResultCard
                       title="Failed Accounts"
                       icon={<XCircle className="w-5 h-5" />}
                       items={xboxResults.filter(r => !['success', 'no_codes'].includes(r.status)).map(r => r.message)}
                       colorClass="text-destructive"
                     />
                   </div>
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
                 {/* Input Section */}
                 <div className="max-w-2xl mx-auto">
                   <CodeInput
                     label="Manus Cookies"
                     placeholder="Paste cookies here, separate multiple accounts with ---"
                     value={manusCookies}
                     onChange={setManusCookies}
                     icon={<Cookie className="w-4 h-4 text-primary" />}
                   />
                 </div>
 
                 {/* Threads Control */}
                 <div className="flex items-center justify-center gap-4">
                   <div className="flex items-center gap-2 glass-card p-3 rounded-lg">
                     <Settings2 className="w-4 h-4 text-primary" />
                     <Label htmlFor="manusThreads" className="text-sm">Threads:</Label>
                     <Input
                       id="manusThreads"
                       type="number"
                       min={1}
                       max={10}
                       value={manusThreads}
                       onChange={(e) => setManusThreads(Math.max(1, Math.min(10, parseInt(e.target.value) || 5)))}
                       className="w-20 h-8 text-center"
                     />
                   </div>
                 </div>
 
                 {/* Action Buttons */}
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
 
                 {/* Progress */}
                 {(isManusChecking || manusProgress > 0) && (
                   <div className="max-w-2xl mx-auto">
                     <ProgressBar
                       current={manusProgress}
                       total={manusCookiesList.length}
                       status={manusStatus}
                     />
                   </div>
                 )}
 
                 {/* Stats */}
                 {manusResults.length > 0 && (
                   <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                     <StatsCard
                       label="Valid"
                       value={manusStats.success}
                       icon={<CheckCircle className="w-5 h-5" />}
                       colorClass="text-success"
                     />
                     <StatsCard
                       label="Invalid"
                       value={manusStats.failed}
                       icon={<XCircle className="w-5 h-5" />}
                       colorClass="text-destructive"
                     />
                   </div>
                 )}
 
                 {/* Results */}
                 {manusResults.length > 0 && (
                   <div className="grid lg:grid-cols-2 gap-4">
                     <ResultCard
                       title="Valid Accounts"
                       icon={<CheckCircle className="w-5 h-5" />}
                       items={manusResults.filter(r => r.status === 'success').map(r => 
                         `${r.email} | ${r.membership} | Credits: ${r.totalCredits}`
                       )}
                       colorClass="text-success"
                     />
                     <ResultCard
                       title="Invalid Accounts"
                       icon={<XCircle className="w-5 h-5" />}
                       items={manusResults.filter(r => r.status === 'failed').map(r => 
                         `${r.filename}: ${r.error || 'Unknown error'}`
                       )}
                       colorClass="text-destructive"
                     />
                   </div>
                 )}
               </>
             )}
           </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
