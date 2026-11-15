/**
 * Thin promise wrapper over `navigator.geolocation.getCurrentPosition` with failures the UI can explain.
 * Kept free of React so it can be tested with a fake geolocation object.
 */

export type GeolocationFailureCode = "unsupported" | "denied" | "unavailable" | "timeout";

export class GeolocationFailure extends Error {
  readonly code: GeolocationFailureCode;

  constructor(code: GeolocationFailureCode) {
    super(code);
    this.name = "GeolocationFailure";
    this.code = code;
  }
}

export interface CurrentPosition {
  lat: number;
  lng: number;
  /** Horizontal accuracy in meters, when the device reports it. */
  accuracy: number | null;
}

const FAILURE_MESSAGES: Record<GeolocationFailureCode, string> = {
  unsupported: "Tu navegador no permite obtener la ubicación. Márcala en el mapa o escribe una referencia.",
  denied: "No diste permiso para usar tu ubicación. Actívalo en tu navegador o márcala en el mapa.",
  unavailable: "No pudimos detectar tu ubicación. Márcala en el mapa o escribe una referencia.",
  timeout: "Tardó demasiado en detectar tu ubicación. Inténtalo de nuevo o márcala en el mapa.",
};

export function describeGeolocationFailure(code: GeolocationFailureCode): string {
  return FAILURE_MESSAGES[code];
}

function failureFromPositionError(error: { code?: number }): GeolocationFailure {
  // GeolocationPositionError: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
  if (error.code === 1) return new GeolocationFailure("denied");
  if (error.code === 3) return new GeolocationFailure("timeout");
  return new GeolocationFailure("unavailable");
}

export function requestCurrentPosition(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.geolocation
): Promise<CurrentPosition> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new GeolocationFailure("unsupported"));
      return;
    }
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
      (error) => reject(failureFromPositionError(error)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}
