import { useEffect, useCallback } from 'react';

interface KeyboardShortcutsConfig {
  onPause?: () => void;
  onSave?: () => void;
  onQuit?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onPause,
  onSave,
  onQuit,
  enabled = true
}: KeyboardShortcutsConfig) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    // Ignore if user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'p':
        e.preventDefault();
        onPause?.();
        break;
      case 's':
        e.preventDefault();
        onSave?.();
        break;
      case 'q':
        e.preventDefault();
        onQuit?.();
        break;
    }
  }, [enabled, onPause, onSave, onQuit]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);
}

export function useClientInfo() {
  const getClientInfo = useCallback(async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localTime = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    let ip = 'Fetching...';
    try {
      const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      const data = await res.json();
      ip = data.ip || 'Unknown';
    } catch {
      ip = 'Could not fetch';
    }

    return { ip, timezone, localTime };
  }, []);

  return { getClientInfo };
}
