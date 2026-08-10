import { randomUUID } from "node:crypto";
import type { CatalogCommand, CatalogRepositoryResult } from "../../src/shared/lib/catalogContracts";

export interface CatalogRepositoryStore {
  executeCatalogCommand(input: { command: CatalogCommand; commitId: string; branchId: string }): void;
}

/** Main-process-only catalog command gateway. Renderer input never chooses tenant, SQL, or table names. */
export class CatalogRepository {
  constructor(private readonly input: {
    store: CatalogRepositoryStore;
    branchId: string;
    createCommitId?: () => string;
  }) {}

  execute(command: CatalogCommand): CatalogRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeCatalogCommand({ command, commitId, branchId: this.input.branchId });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
