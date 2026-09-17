export type CatalogCommand =
  | { type: "catalog.branch.upsert"; id: string; name: string }
  | { type: "catalog.customer.upsert"; id: string; name: string }
  | { type: "catalog.supplier.upsert"; id: string; name: string }
  | {
      type: "catalog.category.upsert";
      id: string;
      nombre: string;
      color: string;
      sortOrder: number;
      sucursalId: string;
    }
  | { type: "catalog.category.delete"; id: string }
  | {
      type: "catalog.product.upsert";
      id: string;
      tenantId?: string;
      sucursalId: string;
      nombre: string;
      precio: number;
      categoria: string;
      disponible: boolean;
      va_a_cocina: boolean;
    }
  | { type: "catalog.product.delete"; id: string }
  | { type: "catalog.inventory-product.upsert"; id: string; name: string; unit: string }
  | { type: "catalog.recipe.upsert"; id: string; platoId: string; inventoryProductId: string; quantity: number };

export type CatalogRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};
