import { type DeliveryDraft } from "./deliveryOrder";
import {
  describeGeolocationFailure,
  GeolocationFailure,
  requestCurrentPosition,
  type CurrentPosition,
} from "./geolocation";

export type LocateCustomerResult = { draft: DeliveryDraft; error: null } | { draft: DeliveryDraft; error: string };

/**
 * "Usar mi ubicación actual": asks the device for its position and stores it in the delivery draft.
 * On failure the draft is returned untouched together with a message the customer can act on.
 */
export async function locateCustomer(
  draft: DeliveryDraft,
  request: () => Promise<CurrentPosition> = () => requestCurrentPosition()
): Promise<LocateCustomerResult> {
  try {
    const position = await request();
    return { draft: { ...draft, lat: position.lat, lng: position.lng }, error: null };
  } catch (error) {
    const code = error instanceof GeolocationFailure ? error.code : "unavailable";
    return { draft, error: describeGeolocationFailure(code) };
  }
}
