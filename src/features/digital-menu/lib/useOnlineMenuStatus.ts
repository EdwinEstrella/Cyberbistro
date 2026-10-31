import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../shared/lib/supabase";
import { parseOnlineMenuStatus } from "./onlineStatus";

interface UseOnlineMenuStatusOptions {
  token?: string;
  slug?: string;
}

export function useOnlineMenuStatus({ token, slug }: UseOnlineMenuStatusOptions) {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async (): Promise<boolean> => {
    const trimmedToken = token?.trim();
    const trimmedSlug = slug?.trim();

    if (!trimmedToken && !trimmedSlug) {
      setIsOpen(false);
      return false;
    }

    setChecking(true);
    try {
      const args = trimmedToken
        ? { p_token: trimmedToken }
        : { p_public_slug: trimmedSlug };

      const { data, error } = await supabase.rpc("get_online_menu_status", args);
      if (error) {
        setIsOpen(false);
        return false;
      }

      const open = parseOnlineMenuStatus(data);
      setIsOpen(open);
      return open;
    } catch {
      setIsOpen(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, [token, slug]);

  // Periodic poll every 60s while page is visible, and on window focus
  useEffect(() => {
    const trimmedToken = token?.trim();
    const trimmedSlug = slug?.trim();
    if (!trimmedToken && !trimmedSlug) return;

    const runIfVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        void checkStatus();
      }
    };

    const intervalId = window.setInterval(runIfVisible, 60_000);
    window.addEventListener("focus", runIfVisible);
    document.addEventListener("visibilitychange", runIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runIfVisible);
      document.removeEventListener("visibilitychange", runIfVisible);
    };
  }, [token, slug, checkStatus]);

  return {
    isOpen,
    checking,
    checkStatus,
    setIsOpen,
  };
}
