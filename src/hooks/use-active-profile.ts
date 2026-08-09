import { useState, useEffect } from 'react';

const STORAGE_KEY = 'meu-cofre-active-profile-id';

export function useActiveProfile() {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(STORAGE_KEY);
    }
    return null;
  });

  const updateActiveProfile = (id: string | null) => {
    setActiveProfileId(id);
    if (typeof window !== 'undefined') {
      if (id) {
        window.localStorage.setItem(STORAGE_KEY, id);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      // Emitir evento para outras instâncias do hook
      window.dispatchEvent(new Event('storage'));
    }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const id = window.localStorage.getItem(STORAGE_KEY);
      if (id !== activeProfileId) {
        setActiveProfileId(id);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [activeProfileId]);

  return { activeProfileId, setActiveProfileId: updateActiveProfile };
}
