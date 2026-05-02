import { useEffect } from 'react';

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrl === (e.ctrlKey || e.metaKey);
        const altMatch = !!shortcut.alt === e.altKey;
        const shiftMatch = !!shortcut.shift === e.shiftKey;
        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
          e.preventDefault();
          shortcut.handler(e);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, active]);
}
