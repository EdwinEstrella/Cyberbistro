import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../shared/hooks/useAuth";
import { isWaiterPresenceRole } from "../../digital-menu/lib/waiterPresence";
import { useServiceRequestAlerts } from "../hooks/useServiceRequestAlerts";
import { ServiceAlertsBell } from "./ServiceAlertsBell";

export interface ServiceAlertsBellContainerProps {
  onPendingMesasChange?: (pendingMesaNumbers: Set<number>) => void;
}

export function ServiceAlertsBellContainer({
  onPendingMesasChange,
}: ServiceAlertsBellContainerProps = {}) {
  const { tenantId, rol } = useAuth();
  const enabled = Boolean(tenantId && isWaiterPresenceRole(rol));

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      setNow(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [enabled]);

  const { alerts, attend, attendingId, error } = useServiceRequestAlerts({
    tenantId,
    enabled,
  });

  const pendingMesaNumbers = useMemo(
    () => new Set(alerts.map((a) => a.mesaNumero)),
    [alerts]
  );

  useEffect(() => {
    if (enabled) {
      onPendingMesasChange?.(pendingMesaNumbers);
    }
  }, [enabled, pendingMesaNumbers, onPendingMesasChange]);

  useEffect(() => {
    return () => {
      onPendingMesasChange?.(new Set());
    };
  }, [onPendingMesasChange]);

  if (!enabled) {
    return null;
  }

  return (
    <ServiceAlertsBell
      alerts={alerts}
      attendingId={attendingId}
      error={error}
      now={now}
      onAttend={attend}
    />
  );
}
