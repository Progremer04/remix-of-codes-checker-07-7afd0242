// Broadcast progress updates via Supabase Realtime
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface ProgressPayload {
  index: number;
  total: number;
  email: string;
  status: string;
  message: string;
  timestamp: number;
}

export async function broadcastProgress(sessionId: string, payload: ProgressPayload): Promise<void> {
  if (!sessionId) return;
  
  try {
    const channelName = `progress:${sessionId}`;
    
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: channelName,
          event: 'progress',
          payload,
        }],
      }),
    });
  } catch (e) {
    // Silently fail - don't break the main flow for progress updates
    console.log(`Broadcast error (non-fatal): ${e}`);
  }
}
