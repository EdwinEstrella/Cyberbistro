export type MenuSettings = {
  id: string;
  tenant_id: string;
  public_slug: string;
};

export type MenuLinkJoined = {
  label: string;
  link_type: 'public' | 'company' | string;
  customer_id?: string | null;
  customer: {
    id?: string;
    name: string;
    credit_limit?: number | null;
  } | null;
};

export type DigitalOrder = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
  status: 'pending' | 'accepted' | 'rejected' | string;
  total: number;
  created_at: string;
  order_type: 'takeout' | 'in_store' | 'company' | string;
  mesa_numero: number | null;
  numero_pedido: number | null;
  sucursal_id: string | null;
  menu_link_id: string | null;
  employee_name: string | null;
  comanda_id?: string | null;
  menu_links?: MenuLinkJoined | MenuLinkJoined[] | null;
};

export type DigitalOrderItem = {
  id: string;
  order_id: string;
  plato_id: number | null;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  subtotal: number;
  status: 'active' | 'cancelled' | string;
  parent_item_id: string | null;
  notes?: string | null;
};

export type CancelItemRpcResult = {
  order_id: string;
  item_id: string;
  new_total: number;
  active_items_count: number;
  order_status: 'pending' | 'accepted' | 'rejected' | string;
};
