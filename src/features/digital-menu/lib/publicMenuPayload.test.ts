import { describe, expect, it } from "vitest";
import { buildCreateOrderRpcArgs } from "./publicMenuPayload";
import type { DeliveryDraft } from "./deliveryOrder";
import type { PublicMenuMode } from "./publicMenuMode";

const cart = [
  {
    id: "it-1",
    plato_id: 101,
    name: "Tacos",
    description: null,
    image_url: null,
    price: 350,
    category: "Entradas",
    sort_order: 1,
    quantity: 2,
  },
];

const delivery: DeliveryDraft = { mode: "delivery", lat: 18.4861, lng: -69.9312, reference: "Casa azul" };

function build(mode: PublicMenuMode, deliveryDraft?: DeliveryDraft | null) {
  return buildCreateOrderRpcArgs({
    slug: "bistro",
    customerName: "Ana",
    customerPhone: "8095551234",
    cart,
    mode,
    partySize: 3,
    mesaCodigo: "1234",
    clientSessionId: "sess-1",
    delivery: deliveryDraft,
  });
}

describe("buildCreateOrderRpcArgs delivery", () => {
  it("adds the delivery arguments to a takeout order", () => {
    expect(build({ kind: "takeout", invalidMesa: false }, delivery)).toMatchObject({
      p_order_type: "takeout",
      p_delivery_mode: "delivery",
      p_delivery_lat: 18.4861,
      p_delivery_lng: -69.9312,
      p_delivery_reference: "Casa azul",
    });
  });

  it("omits every delivery argument for pickup or when no draft is given", () => {
    const pickup = build({ kind: "takeout", invalidMesa: false }, { mode: "pickup", lat: null, lng: null, reference: "" });
    const none = build({ kind: "takeout", invalidMesa: false });
    for (const args of [pickup, none]) {
      expect(Object.keys(args).filter((key) => key.startsWith("p_delivery"))).toEqual([]);
    }
  });

  it("never sends a location for a table order, even if a delivery draft is passed", () => {
    const args = build({ kind: "table", mesa: 4 }, delivery);
    expect(args.p_order_type).toBe("in_store");
    expect(Object.keys(args).filter((key) => key.startsWith("p_delivery"))).toEqual([]);
  });
});
