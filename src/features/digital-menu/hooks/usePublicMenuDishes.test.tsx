import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEffect } from "react";
// @ts-ignore react-dom types are not installed in devDependencies
import { flushSync } from "react-dom";
import { usePublicMenuDishes } from "./usePublicMenuDishes";
import { setupFakeDom } from "../test-utils/fakeDom";
import { toast } from "sonner";
import { supabase } from "../../../shared/lib/supabase";
import * as photoProcessing from "../lib/dishPhotoProcessing";
import * as photoUpload from "../lib/dishPhotoUpload";
import * as photoErrors from "../lib/dishPhotoErrors";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../shared/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock("../lib/dishPhotoProcessing", () => ({
  processDishPhoto: vi.fn(),
}));

vi.mock("../lib/dishPhotoUpload", () => ({
  uploadDishPhoto: vi.fn(),
}));

vi.mock("../lib/dishPhotoErrors", () => ({
  DishPhotoError: class DishPhotoError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message || code);
      this.name = "DishPhotoError";
      this.code = code;
    }
  },
  dishPhotoErrorMessage: (code: string) => `Message for ${code}`,
}));

interface TestHarnessProps {
  tenantId: string;
  onReady: (hook: ReturnType<typeof usePublicMenuDishes>) => void;
}

function TestHarness({ tenantId, onReady }: TestHarnessProps) {
  const hook = usePublicMenuDishes({
    tenantId,
    initialPlatos: [],
    initialMenuItems: [],
  });

  useEffect(() => {
    onReady(hook);
  });

  return <div>{hook.uploadingImage ? "uploading" : "idle"}</div>;
}

describe("usePublicMenuDishes handleImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if file or tenantId is missing", async () => {
    const env = setupFakeDom();
    try {
      let hookResult: ReturnType<typeof usePublicMenuDishes> | null = null;
      flushSync(() => {
        env.root.render(
          <TestHarness
            tenantId=""
            onReady={(h) => {
              hookResult = h;
            }}
          />
        );
      });

      const res = await hookResult!.handleImageUpload(
        new File(["data"], "test.png", { type: "image/png" }),
        42
      );
      expect(res).toBeNull();
    } finally {
      env.cleanup();
    }
  });

  it("handles missing auth session token with error toast", async () => {
    const env = setupFakeDom();
    try {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as any);

      let hookResult: ReturnType<typeof usePublicMenuDishes> | null = null;
      flushSync(() => {
        env.root.render(
          <TestHarness
            tenantId="tenant-123"
            onReady={(h) => {
              hookResult = h;
            }}
          />
        );
      });

      const res = await hookResult!.handleImageUpload(
        new File(["data"], "test.png", { type: "image/png" }),
        42
      );
      expect(res).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Message for missing_token");
    } finally {
      env.cleanup();
    }
  });

  it("processes photo, uploads, and returns public URL on success", async () => {
    const env = setupFakeDom();
    try {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: "jwt-token-456",
          },
        },
        error: null,
      } as any);

      const fakeBlob = new Blob(["webp-bytes"], { type: "image/webp" });
      vi.mocked(photoProcessing.processDishPhoto).mockResolvedValue(fakeBlob);
      vi.mocked(photoUpload.uploadDishPhoto).mockResolvedValue(
        "https://fotos.azokia.com/tenant-123/42-123.webp"
      );

      let hookResult: ReturnType<typeof usePublicMenuDishes> | null = null;
      flushSync(() => {
        env.root.render(
          <TestHarness
            tenantId="tenant-123"
            onReady={(h) => {
              hookResult = h;
            }}
          />
        );
      });

      const inputFile = new File(["data"], "dish.jpg", { type: "image/jpeg" });
      const url = await hookResult!.handleImageUpload(inputFile, 42);

      expect(url).toBe("https://fotos.azokia.com/tenant-123/42-123.webp");
      expect(photoProcessing.processDishPhoto).toHaveBeenCalledWith(inputFile);
      expect(photoUpload.uploadDishPhoto).toHaveBeenCalledWith({
        blob: fakeBlob,
        tenantId: "tenant-123",
        platoId: 42,
        accessToken: "jwt-token-456",
      });
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      env.cleanup();
    }
  });

  it("handles photo processing error with toast", async () => {
    const env = setupFakeDom();
    try {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: "jwt-token-456",
          },
        },
        error: null,
      } as any);

      vi.mocked(photoProcessing.processDishPhoto).mockRejectedValue(
        new photoErrors.DishPhotoError("unsupported_format")
      );

      let hookResult: ReturnType<typeof usePublicMenuDishes> | null = null;
      flushSync(() => {
        env.root.render(
          <TestHarness
            tenantId="tenant-123"
            onReady={(h) => {
              hookResult = h;
            }}
          />
        );
      });

      const inputFile = new File(["data"], "dish.heic", { type: "image/heic" });
      const url = await hookResult!.handleImageUpload(inputFile, 42);

      expect(url).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Message for unsupported_format");
    } finally {
      env.cleanup();
    }
  });

  it("handles upload error with toast", async () => {
    const env = setupFakeDom();
    try {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            access_token: "jwt-token-456",
          },
        },
        error: null,
      } as any);

      const fakeBlob = new Blob(["webp-bytes"], { type: "image/webp" });
      vi.mocked(photoProcessing.processDishPhoto).mockResolvedValue(fakeBlob);
      vi.mocked(photoUpload.uploadDishPhoto).mockRejectedValue(
        new photoErrors.DishPhotoError("forbidden")
      );

      let hookResult: ReturnType<typeof usePublicMenuDishes> | null = null;
      flushSync(() => {
        env.root.render(
          <TestHarness
            tenantId="tenant-123"
            onReady={(h) => {
              hookResult = h;
            }}
          />
        );
      });

      const inputFile = new File(["data"], "dish.png", { type: "image/png" });
      const url = await hookResult!.handleImageUpload(inputFile, 42);

      expect(url).toBeNull();
      expect(toast.error).toHaveBeenCalledWith("Message for forbidden");
    } finally {
      env.cleanup();
    }
  });
});
