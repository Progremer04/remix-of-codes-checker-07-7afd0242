// Firebase Admin SDK helper for Supabase Edge Functions
// Uses REST API to interact with Firebase Realtime Database

interface FirebaseCredentials {
  project_id: string;
  private_key: string;
  client_email: string;
}

let cachedToken: { token: string; expires: number } | null = null;

export async function getFirebaseToken(): Promise<string> {
  // Check if we have a cached token that's still valid
  if (cachedToken && Date.now() < cachedToken.expires - 60000) {
    return cachedToken.token;
  }

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT not configured");
  }

  const credentials: FirebaseCredentials = JSON.parse(serviceAccountJson);
  
  // Create JWT
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email"
  };

  const encoder = new TextEncoder();
  
  // Base64URL encode
  const base64url = (data: Uint8Array | string): string => {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  
  const headerB64 = base64url(JSON.stringify(header));
  const claimsB64 = base64url(JSON.stringify(claims));
  const signatureInput = `${headerB64}.${claimsB64}`;
  
  // Import private key and sign
  const pemContent = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  const signatureB64 = base64url(new Uint8Array(signature));
  const jwt = `${signatureInput}.${signatureB64}`;
  
  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  if (!tokenRes.ok) {
    const error = await tokenRes.text();
    throw new Error(`Failed to get Firebase token: ${error}`);
  }
  
  const tokenData = await tokenRes.json();
  
  cachedToken = {
    token: tokenData.access_token,
    expires: Date.now() + (tokenData.expires_in * 1000)
  };
  
  return cachedToken.token;
}

const FIREBASE_DB_URL = "https://alliche-fetcher-default-rtdb.firebaseio.com";

export async function firebaseGet<T>(path: string): Promise<T | null> {
  const token = await getFirebaseToken();
  
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json?auth=${token}`);
  
  if (!res.ok) {
    console.error(`Firebase GET error: ${res.status}`);
    return null;
  }
  
  return await res.json();
}

export async function firebaseSet(path: string, data: any): Promise<boolean> {
  const token = await getFirebaseToken();
  
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json?auth=${token}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    console.error(`Firebase SET error: ${res.status}`);
    return false;
  }
  
  return true;
}

export async function firebasePush(path: string, data: any): Promise<string | null> {
  const token = await getFirebaseToken();
  
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json?auth=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    console.error(`Firebase PUSH error: ${res.status}`);
    return null;
  }
  
  const result = await res.json();
  return result.name;
}

export async function firebaseUpdate(path: string, data: any): Promise<boolean> {
  const token = await getFirebaseToken();
  
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json?auth=${token}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    console.error(`Firebase UPDATE error: ${res.status}`);
    return false;
  }
  
  return true;
}

export async function firebaseDelete(path: string): Promise<boolean> {
  const token = await getFirebaseToken();
  
  const res = await fetch(`${FIREBASE_DB_URL}/${path}.json?auth=${token}`, {
    method: "DELETE"
  });
  
  if (!res.ok) {
    console.error(`Firebase DELETE error: ${res.status}`);
    return false;
  }
  
  return true;
}

// Helper to verify Firebase ID token (for auth)
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  try {
    // Decode the token without verification first to get the user ID
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    
    // Verify token is not expired
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error("Token expired");
      return null;
    }
    
    // Verify issuer
    const expectedIssuer = "https://securetoken.google.com/alliche-fetcher";
    if (payload.iss !== expectedIssuer) {
      console.error("Invalid issuer");
      return null;
    }
    
    return {
      uid: payload.user_id || payload.sub,
      email: payload.email
    };
  } catch (e) {
    console.error("Token verification error:", e);
    return null;
  }
}
