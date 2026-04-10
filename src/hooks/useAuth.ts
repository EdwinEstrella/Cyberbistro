import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { insforgeClient } from '../lib/insforge';

/**
 * Hook de autenticación para InsForge
 *
 * Gestiona el estado del usuario autenticado en toda la aplicación
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtener usuario actual
    async function loadUser() {
      try {
        const { data: { user }, error } = await insforgeClient.auth.getUser();

        if (error) {
          console.error('Error loading user:', error);
          setUser(null);
        } else {
          setUser(user);
        }
      } catch (err) {
        console.error('Error in auth:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = insforgeClient.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Cleanup
    return () => {
      subscription.unsubscribe();
    };
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
    isAuthenticated: !!user
  };
}

/**
 * HOC para proteger rutas que requieren autenticación
 */
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { user, loading } = useAuth();

    if (loading) {
      return <div className="flex items-center justify-center min-h-screen bg-[#0e0e0e]">
        <div className="text-[#ff906d] font-['Space_Grotesk',sans-serif]">
          Verificando acceso...
        </div>
      </div>;
    }

    if (!user) {
      // Redirigir al login si no está autenticado
      window.location.href = '/';
      return null;
    }

    return <Component {...props} />;
  };
}
