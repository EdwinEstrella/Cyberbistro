export type ScheduleMode = "recurring" | "weekly";

export type LinkType = "public" | "company";

export interface Menu {
  id: string;
  tenant_id: string;
  sucursal_id?: string | null;
  name: string;
  schedule_mode: ScheduleMode;
  week_start?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MenuItem {
  id: string;
  tenant_id: string;
  menu_id: string;
  plato_id: number;
  weekdays: number[];
  sort_order: number;
  display_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MenuLink {
  id: string;
  tenant_id: string;
  sucursal_id?: string | null;
  menu_id: string;
  label: string;
  link_type: LinkType;
  token: string;
  customer_id?: string | null;
  allow_extras: boolean;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
  menu?: Pick<Menu, "id" | "name" | "schedule_mode" | "week_start"> | null;
  customer?: { id: string; name: string } | null;
}

export interface PlatoSoldOut {
  tenant_id: string;
  plato_id: number;
  sold_out_date: string;
  created_at?: string;
}

export interface CatalogDish {
  id: number;
  nombre: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  va_a_cocina: boolean;
  is_extra?: boolean;
}
