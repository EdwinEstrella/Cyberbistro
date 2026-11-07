import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapCalendarError,
  assignPublicMenuCalendar,
  removePublicMenuCalendar,
  savePublicMenuSettings,
  pickPublicMenuSettings,
  type DigitalMenuSettings,
} from "./publicMenuCalendar";
import * as localFirst from "../../../shared/lib/localFirst";
import { supabase } from "../../../shared/lib/supabase";

vi.mock("../../../shared/lib/localFirst", () => ({
  enqueueLocalWrite: vi.fn(),
  getDeviceId: vi.fn().mockResolvedValue("test-device-id"),
  readLocalMirror: vi.fn().mockResolvedValue([]),
}));

const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
};

vi.mock("../../../shared/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockImplementation(() => mockQueryBuilder),
  },
}));

describe("publicMenuCalendar helpers", () => {
  const sampleSettings: DigitalMenuSettings = {
    id: "settings-1",
    tenant_id: "tenant-1",
    sucursal_id: "sucursal-1",
    enabled: true,
    public_slug: "mi-bistro",
    title: "Mi Bistro",
    description: null,
    logo_url: null,
    banner_url: null,
    theme: { accentColor: "#f97316" },
    menu_id: null,
    updated_at: "2026-10-31T00:00:00Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryBuilder.select.mockReturnThis();
    mockQueryBuilder.eq.mockReturnThis();
    mockQueryBuilder.or.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.update.mockReturnThis();
    mockQueryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockQueryBuilder.single.mockResolvedValue({ data: null, error: null });
  });

  describe("mapCalendarError", () => {
    it("maps TENANT_MISMATCH in message to Spanish explanation", () => {
      const err = new Error("new row for relation digital_menu_settings violates trigger: TENANT_MISMATCH");
      expect(mapCalendarError(err)).toBe("El menú seleccionado no pertenece a este restaurante.");
    });

    it("maps TENANT_MISMATCH in error details to Spanish explanation", () => {
      const err = { message: "trigger failed", details: "TENANT_MISMATCH on check_digital_menu_settings_tenant_integrity" };
      expect(mapCalendarError(err)).toBe("El menú seleccionado no pertenece a este restaurante.");
    });

    it("maps network errors correctly", () => {
      const err = new Error("Failed to fetch");
      expect(mapCalendarError(err)).toBe("Se requiere conexión a internet para sincronizar la configuración.");
    });

    it("maps foreign key errors correctly", () => {
      const err = new Error('violates foreign key constraint "digital_menu_settings_menu_id_fkey"');
      expect(mapCalendarError(err)).toBe("El menú seleccionado no existe o no es válido.");
    });

    it("returns fallback for unknown errors", () => {
      expect(mapCalendarError(null)).toBe("Ocurrió un error inesperado al actualizar el calendario.");
      expect(mapCalendarError(new Error("Custom error message"))).toBe("Custom error message");
    });
  });

  describe("assignPublicMenuCalendar", () => {
    it("calls direct supabase update with right filters and returns updated settings", async () => {
      const updatedRow: DigitalMenuSettings = {
        ...sampleSettings,
        menu_id: "menu-123",
        updated_at: "2026-10-31T01:00:00Z",
      };
      mockQueryBuilder.single.mockResolvedValueOnce({ data: updatedRow, error: null });

      const result = await assignPublicMenuCalendar(
        "tenant-1",
        "sucursal-1",
        "menu-123",
        sampleSettings
      );

      expect(supabase.from).toHaveBeenCalledWith("digital_menu_settings");
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          menu_id: "menu-123",
          updated_at: expect.any(String),
        })
      );
      expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(1, "id", "settings-1");
      expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(2, "tenant_id", "tenant-1");
      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.single).toHaveBeenCalled();
      expect(result.menu_id).toBe("menu-123");
      expect(localFirst.enqueueLocalWrite).not.toHaveBeenCalled();
    });

    it("throws Spanish error when existing settings are missing or have no id", async () => {
      await expect(
        assignPublicMenuCalendar("tenant-1", null, "menu-999", null)
      ).rejects.toThrow("Guarda primero la configuración del menú público antes de asignar un calendario.");

      await expect(
        assignPublicMenuCalendar("tenant-1", null, "menu-999", undefined)
      ).rejects.toThrow("Guarda primero la configuración del menú público antes de asignar un calendario.");

      await expect(
        assignPublicMenuCalendar("tenant-1", null, "menu-999", { id: "" } as unknown as DigitalMenuSettings)
      ).rejects.toThrow("Guarda primero la configuración del menú público antes de asignar un calendario.");

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("translates and throws Spanish error on TENANT_MISMATCH", async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { message: "Database trigger: TENANT_MISMATCH" },
      });

      await expect(
        assignPublicMenuCalendar("tenant-1", null, "other-tenant-menu", sampleSettings)
      ).rejects.toThrow("El menú seleccionado no pertenece a este restaurante.");
    });

    it("translates and throws Spanish error on network error", async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: new Error("Failed to fetch"),
      });

      await expect(
        assignPublicMenuCalendar("tenant-1", null, "menu-123", sampleSettings)
      ).rejects.toThrow("Se requiere conexión a internet para sincronizar la configuración.");
    });
  });

  describe("removePublicMenuCalendar", () => {
    it("calls direct supabase update with right filters to set menu_id to null and returns updated settings", async () => {
      const currentWithMenu: DigitalMenuSettings = {
        ...sampleSettings,
        menu_id: "menu-123",
      };
      const updatedRow: DigitalMenuSettings = {
        ...currentWithMenu,
        menu_id: null,
        updated_at: "2026-10-31T02:00:00Z",
      };
      mockQueryBuilder.single.mockResolvedValueOnce({ data: updatedRow, error: null });

      const result = await removePublicMenuCalendar("tenant-1", null, currentWithMenu);

      expect(supabase.from).toHaveBeenCalledWith("digital_menu_settings");
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          menu_id: null,
          updated_at: expect.any(String),
        })
      );
      expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(1, "id", "settings-1");
      expect(mockQueryBuilder.eq).toHaveBeenNthCalledWith(2, "tenant_id", "tenant-1");
      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.single).toHaveBeenCalled();
      expect(result.menu_id).toBeNull();
      expect(localFirst.enqueueLocalWrite).not.toHaveBeenCalled();
    });

    it("throws Spanish error when existing settings are missing", async () => {
      await expect(
        removePublicMenuCalendar("tenant-1", null, null)
      ).rejects.toThrow("Guarda primero la configuración del menú público antes de asignar un calendario.");

      await expect(
        removePublicMenuCalendar("tenant-1", null, undefined)
      ).rejects.toThrow("Guarda primero la configuración del menú público antes de asignar un calendario.");

      expect(supabase.from).not.toHaveBeenCalled();
    });

    it("translates and throws Spanish error on TENANT_MISMATCH", async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { message: "trigger failed", details: "TENANT_MISMATCH on check" },
      });

      await expect(
        removePublicMenuCalendar("tenant-1", null, sampleSettings)
      ).rejects.toThrow("El menú seleccionado no pertenece a este restaurante.");
    });

    it("translates and throws Spanish error on network error", async () => {
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: new Error("Failed to fetch"),
      });

      await expect(
        removePublicMenuCalendar("tenant-1", null, sampleSettings)
      ).rejects.toThrow("Se requiere conexión a internet para sincronizar la configuración.");
    });
  });

  describe("savePublicMenuSettings", () => {
    it("saves all fields without menu_id and syncs tenants menu_url", async () => {
      await savePublicMenuSettings({
        tenantId: "tenant-1",
        enabled: true,
        publicSlug: "cyber-bistro",
        title: "Cyber Bistro",
        description: "Gran comida",
      });

      expect(localFirst.enqueueLocalWrite).toHaveBeenCalledTimes(2);

      const settingsCall = vi.mocked(localFirst.enqueueLocalWrite).mock.calls[0][0];
      expect(settingsCall.tableName).toBe("digital_menu_settings");
      expect(settingsCall.payload).toMatchObject({
        public_slug: "cyber-bistro",
        title: "Cyber Bistro",
        enabled: true,
      });
      // Crucial requirement: save payload must NOT have menu_id
      expect("menu_id" in (settingsCall.payload as Record<string, unknown>)).toBe(false);
      expect((settingsCall.payload as Record<string, unknown>).menu_id).toBeUndefined();

      const tenantCall = vi.mocked(localFirst.enqueueLocalWrite).mock.calls[1][0];
      expect(tenantCall.tableName).toBe("tenants");
      expect(tenantCall.payload).toMatchObject({
        menu_url: "https://cloudix-app.azokia.com/#/menu/cyber-bistro",
      });
    });

    it("preserves existingSettings.menu_id in return value without writing it to payload", async () => {
      const currentSettings: DigitalMenuSettings = {
        ...sampleSettings,
        menu_id: "menu-keep-me",
      };

      const result = await savePublicMenuSettings({
        tenantId: "tenant-1",
        existingSettings: currentSettings,
        enabled: true,
        publicSlug: "cyber-bistro",
      });

      expect(result.menu_id).toBe("menu-keep-me");

      const settingsCall = vi.mocked(localFirst.enqueueLocalWrite).mock.calls[0][0];
      expect("menu_id" in (settingsCall.payload as Record<string, unknown>)).toBe(false);
    });
  });

  describe("pickPublicMenuSettings", () => {
    const tenantNullRow: DigitalMenuSettings = {
      ...sampleSettings,
      id: "settings-null",
      tenant_id: "tenant-1",
      sucursal_id: null,
      public_slug: "tenant-slug",
    };

    const branchRow1: DigitalMenuSettings = {
      ...sampleSettings,
      id: "settings-branch-1",
      tenant_id: "tenant-1",
      sucursal_id: "sucursal-1",
      public_slug: "branch-1-slug",
    };

    const branchRow2: DigitalMenuSettings = {
      ...sampleSettings,
      id: "settings-branch-2",
      tenant_id: "tenant-1",
      sucursal_id: "sucursal-2",
      public_slug: "branch-2-slug",
    };

    const otherTenantRow: DigitalMenuSettings = {
      ...sampleSettings,
      id: "settings-other-tenant",
      tenant_id: "other-tenant",
      sucursal_id: "sucursal-1",
      public_slug: "other-slug",
    };

    it("branch row wins over NULL row regardless of array order", () => {
      // Order 1: NULL row first, branch row second
      const result1 = pickPublicMenuSettings(
        [tenantNullRow, branchRow1],
        "tenant-1",
        "sucursal-1"
      );
      expect(result1).toBe(branchRow1);
      expect(result1?.id).toBe("settings-branch-1");

      // Order 2: branch row first, NULL row second
      const result2 = pickPublicMenuSettings(
        [branchRow1, tenantNullRow],
        "tenant-1",
        "sucursal-1"
      );
      expect(result2).toBe(branchRow1);
      expect(result2?.id).toBe("settings-branch-1");
    });

    it("NULL row used when no branch row matches", () => {
      // Asking for sucursal-1 when only branchRow2 (sucursal-2) and tenantNullRow exist
      const result = pickPublicMenuSettings(
        [branchRow2, tenantNullRow],
        "tenant-1",
        "sucursal-1"
      );
      expect(result).toBe(tenantNullRow);
      expect(result?.id).toBe("settings-null");
    });

    it("other tenant's rows are ignored", () => {
      const result = pickPublicMenuSettings(
        [otherTenantRow],
        "tenant-1",
        "sucursal-1"
      );
      expect(result).toBeNull();

      // Mixed with other tenant
      const resultMixed = pickPublicMenuSettings(
        [otherTenantRow, tenantNullRow],
        "tenant-1",
        "sucursal-1"
      );
      expect(resultMixed).toBe(tenantNullRow);
    });

    it("returns null on empty, null, or undefined rows", () => {
      expect(pickPublicMenuSettings([], "tenant-1", "sucursal-1")).toBeNull();
      expect(pickPublicMenuSettings(null, "tenant-1", "sucursal-1")).toBeNull();
      expect(pickPublicMenuSettings(undefined, "tenant-1", "sucursal-1")).toBeNull();
      expect(pickPublicMenuSettings([branchRow1], "", "sucursal-1")).toBeNull();
    });

    it("falls back to NULL row when sucursalId is null or omitted", () => {
      const resultWithNull = pickPublicMenuSettings(
        [branchRow1, tenantNullRow],
        "tenant-1",
        null
      );
      expect(resultWithNull).toBe(tenantNullRow);

      const resultOmitted = pickPublicMenuSettings(
        [branchRow1, tenantNullRow],
        "tenant-1"
      );
      expect(resultOmitted).toBe(tenantNullRow);

      const resultOnlyBranches = pickPublicMenuSettings(
        [branchRow1, branchRow2],
        "tenant-1",
        null
      );
      expect(resultOnlyBranches).toBeNull();
    });
  });
});
