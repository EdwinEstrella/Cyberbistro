import type { CatalogCommand, CatalogRepositoryResult } from "./catalogContracts";

/** Minimal renderer adapter: catalog UI may request named commands but never owns SQLite access. */
export async function saveCatalogCommandLocally(command: CatalogCommand): Promise<CatalogRepositoryResult> {
  const execute = window.electronAPI?.executeCatalogCommand;
  if (!execute) throw new Error("Catalog local storage is unavailable");
  const result = await execute(command);
  return result.data;
}
