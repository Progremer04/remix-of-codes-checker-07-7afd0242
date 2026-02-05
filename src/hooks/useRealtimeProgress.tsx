import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ProgressUpdate {
  index: number;
  total: number;
  email: string;
  password?: string;
  status: 'checking' | 'success' | 'failed' | 'no_codes' | 'valid' | 'invalid' | '2fa' | 'locked' | 'error';
  message: string;
  timestamp: number;
}

export function useRealtimeProgress(sessionId: string | null) {
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setUpdates([]);
      return;
    }

    const channelName = `progress:${sessionId}`;
    
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: true } }
    });

    channel
      .on('broadcast', { event: 'progress' }, (payload) => {
        const update = payload.payload as ProgressUpdate;
        setUpdates(prev => {
          // Replace if same index exists, otherwise add
          const existing = prev.findIndex(u => u.index === update.index);
          if (existing >= 0) {
            const newUpdates = [...prev];
            newUpdates[existing] = update;
            return newUpdates;
          }
          return [...prev, update].slice(-100); // Keep last 100
        });
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [sessionId]);

  return { updates, isConnected, clearUpdates };
}

// Generate a unique session ID for tracking progress
export function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
