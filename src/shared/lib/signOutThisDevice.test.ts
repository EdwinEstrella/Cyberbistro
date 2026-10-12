import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("./supabase", () => ({ supabase: { auth: { signOut: mocks.signOut } } }));

import { signOutThisDevice } from "./signOutThisDevice";

describe("signOutThisDevice", () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("revokes only this device's session so web and desktop stay signed in elsewhere", async () => {
    await signOutThisDevice();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("returns the Supabase error instead of throwing", async () => {
    const error = new Error("network down");
    mocks.signOut.mockResolvedValue({ error });
    await expect(signOutThisDevice()).resolves.toEqual({ error });
  });
});
