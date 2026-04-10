import { useState, useEffect } from 'react';
import type { UserSchema } from '@insforge/sdk';
import { insforgeClient } from '../lib/insforge';

export function useAuth() {
  const [user, setUser] = useState<UserSchema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    insforgeClient.auth.getCurrentUser().then(({ data, error }) => {
      if (!error) setUser(data.user);
      setLoading(false);
    });
  }, []);

  const signOut = async () => {
    const { error } = await insforgeClient.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return {
    user,
    loading,
    signOut,
    isAuthenticated: !!user,
  };
}