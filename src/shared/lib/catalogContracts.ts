export type CatalogCommand =
  | { type: "catalog.branch.upsert"; id: string; name: string }
  | { type: "catalog.customer.upsert"; id: string; name: string }
  | { type: "catalog.supplier.upsert"; id: string; name: string }
  | { type: "catalog.category.upsert"; id: string; name: string }
  | { type: "catalog.product.upsert"; id: string; name: string; categoryId: string }
  | { type: "catalog.inventory-product.upsert"; id: string; name: string; unit: string }
  | { type: "catalog.recipe.upsert"; id: string; platoId: string; inventoryProductId: string; quantity: number };

export type CatalogRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};
