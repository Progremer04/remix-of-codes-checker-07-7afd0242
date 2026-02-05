 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const corsHeaders = {
   "Access-Control-Allow-Origin": "*",
   "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
 };
 
 interface CheckRequest {
   cookies: string[];
   threads?: number;
   username?: string;
 }
 
 interface CheckResult {
   id: string;
   filename: string;
   status: 'success' | 'failed';
   email: string;
   name: string;
   membership: string;
   totalCredits: string;
   freeCredits: string;
   error?: string;
   timestamp: string;
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
 
 async function checkSingleAccount(fileContent: string, filename: string, idx: number): Promise<CheckResult> {
   const result: CheckResult = {
     id: `${Date.now()}_${idx}`,
     filename,
     status: 'failed',
     email: 'N/A',
     name: 'N/A',
     membership: 'N/A',
     totalCredits: 'N/A',
     freeCredits: 'N/A',
     timestamp: new Date().toISOString(),
   };
   
   try {
     const { cookies, sessionKey } = parseCookieContent(fileContent);
     
     if (Object.keys(cookies).length === 0) {
       result.error = 'Cannot parse cookie content';
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
       return result;
     }
     
     const userData = await userInfoResponse.json();
     
     if (!userData.email || !userData.avatar) {
       result.error = 'Invalid cookie response';
       return result;
     }
     
     result.email = userData.email || 'N/A';
     result.name = userData.displayname || 'N/A';
     result.membership = userData.membershipVersion || 'N/A';
     
     // Request 2: Get credits info
     const creditsResponse = await fetch('https://api.manus.im/user.v1.UserService/GetAvailableCredits', {
       method: 'POST',
       headers: userInfoHeaders,
       body: '{}',
     });
     
     if (creditsResponse.status === 200) {
       const creditsData = await creditsResponse.json();
       result.totalCredits = String(creditsData.totalCredits || 'N/A');
       result.freeCredits = String(creditsData.freeCredits || 'N/A');
     }
     
     result.status = 'success';
     
   } catch (e) {
     result.error = `Error: ${String(e)}`;
   }
   
   return result;
 }
 
 async function processWithWorkerPool<T, R>(
   items: T[],
   concurrency: number,
   fn: (item: T, index: number) => Promise<R>
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
         
         if (completedCount % 10 === 0) {
           console.log(`Progress: ${completedCount}/${items.length}`);
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
     .map(() => worker());
 
   await Promise.all(workers);
   return results;
 }
 
 serve(async (req) => {
   if (req.method === "OPTIONS") {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const { cookies, threads = 5, username }: CheckRequest = await req.json();
 
     console.log(`Starting Manus check for ${cookies.length} cookies, ${threads} threads, user: ${username || 'unknown'}`);
 
     if (!cookies || cookies.length === 0) {
       return new Response(
         JSON.stringify({ error: "Cookies are required" }),
         { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
       );
     }
 
     const concurrency = Math.min(threads, 10);
     const results = await processWithWorkerPool(
       cookies,
       concurrency,
       async (cookie, idx) => checkSingleAccount(cookie, `cookie_${idx + 1}.txt`, idx)
     );
 
     console.log(`Check complete. Results: ${results.length}`);
 
     // Calculate stats
     const stats = {
       total: results.length,
       success: results.filter(r => r.status === 'success').length,
       failed: results.filter(r => r.status === 'failed').length,
     };
 
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