export interface LinkMenuRestaurant {
  title: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  business_name: string;
  phone: string | null;
  address: string | null;
  currency: string;
  theme?: unknown;
}

export interface LinkMenuItem {
  id: string;
  plato_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category: string;
  sort_order: number;
}

export interface LinkMenuExtra {
  id: string;
  plato_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  category: string;
  sort_order: number;
}

export interface LinkMenuPayload {
  available: boolean;
  reason: string | null;
  label?: string | null;
  link_type: "company" | "public";
  allow_extras: boolean;
  company_name: string | null;
  restaurant: LinkMenuRestaurant | null;
  settings?: LinkMenuRestaurant | null;
  items: LinkMenuItem[];
  extras: LinkMenuExtra[];
}

export interface CartExtra {
  plato_id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface CartLine {
  id: string;
  plato_id: number;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  extras: CartExtra[];
}

export interface CreateOrderPayloadItem {
  plato_id: number;
  quantity: number;
  notes?: string | null;
  extras: Array<{
    plato_id: number;
    quantity: number;
  }>;
}

export interface CreateOrderRpcArgs {
  p_token: string;
  p_employee_name: string | null;
  p_notes: string | null;
  p_items: CreateOrderPayloadItem[];
  p_session_id: string | null;
}

export interface CreateOrderResult {
  order_id: string;
  numero_pedido: number;
  total: number;
}
