import { useState, useEffect, useCallback } from 'react';
import type { ProgressUpdate } from './useRealtimeProgress';

export interface PersistedSession {
  sessionId: string;
  service: string;
  updates: ProgressUpdate[];
  startedAt: number;
  lastUpdatedAt: number;
  total: number;
  isComplete: boolean;
}

const STORAGE_KEY = 'checker_sessions';
const MAX_SESSIONS = 5; // Keep last 5 sessions
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useSessionPersistence() {
  const [sessions, setSessions] = useState<PersistedSession[]>([]);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: PersistedSession[] = JSON.parse(stored);
        // Filter out expired sessions
        const now = Date.now();
        const valid = parsed.filter(s => now - s.lastUpdatedAt < SESSION_TTL);
        setSessions(valid);
        // Save filtered list back
        if (valid.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
        }
      }
    } catch (e) {
      console.error('Failed to load persisted sessions:', e);
    }
  }, []);

  // Save session to localStorage
  const saveSession = useCallback((
    sessionId: string,
    service: string,
    updates: ProgressUpdate[],
    total: number
  ) => {
    if (!sessionId || updates.length === 0) return;

    const accountUpdates = updates.filter(u => u.email !== 'COMPLETE');
    const isComplete = updates.some(u => u.email === 'COMPLETE') ||
      (accountUpdates.filter(u => u.status !== 'checking').length === total && total > 0);

    const session: PersistedSession = {
      sessionId,
      service,
      updates: updates.slice(-500), // Keep last 500 updates to limit storage
      startedAt: updates[0]?.timestamp || Date.now(),
      lastUpdatedAt: Date.now(),
      total,
      isComplete
    };

    setSessions(prev => {
      // Remove existing session with same ID and add updated one
      const filtered = prev.filter(s => s.sessionId !== sessionId);
      const updated = [session, ...filtered].slice(0, MAX_SESSIONS);
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save session:', e);
      }
      
      return updated;
    });
  }, []);

  // Get a specific session
  const getSession = useCallback((sessionId: string): PersistedSession | null => {
    return sessions.find(s => s.sessionId === sessionId) || null;
  }, [sessions]);

  // Get most recent incomplete session for a service
  const getActiveSession = useCallback((service: string): PersistedSession | null => {
    return sessions.find(s => s.service === service && !s.isComplete) || null;
  }, [sessions]);

  // Get most recent session for a service (complete or not)
  const getLastSession = useCallback((service: string): PersistedSession | null => {
    return sessions.find(s => s.service === service) || null;
  }, [sessions]);

  // Clear a specific session
  const clearSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.sessionId !== sessionId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to clear session:', e);
      }
      return updated;
    });
  }, []);

  // Clear all sessions
  const clearAllSessions = useCallback(() => {
    setSessions([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear all sessions:', e);
    }
  }, []);

  return {
    sessions,
    saveSession,
    getSession,
    getActiveSession,
    getLastSession,
    clearSession,
    clearAllSessions
  };
}
