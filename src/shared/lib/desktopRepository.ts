import { randomUUID } from "node:crypto";

export type DesktopCommand = {
  type: "foundation.record.write";
  id: string;
  value: string;
};

export type DesktopRepositoryResult = {
  commitId: string;
  localStatus: "committed";
  syncStatus: "pending";
};

export interface DesktopRepositoryStore {
  executeDesktopCommand(input: {
    command: DesktopCommand;
    commitId: string;
    branchId: string;
  }): void;
}

/** Main-process-only gateway for the small, typed local command surface. */
export class DesktopRepository {
  constructor(private readonly input: {
    store: DesktopRepositoryStore;
    branchId: string;
    createCommitId?: () => string;
  }) {}

  execute(command: DesktopCommand): DesktopRepositoryResult {
    const commitId = this.input.createCommitId?.() ?? randomUUID();
    this.input.store.executeDesktopCommand({ command, commitId, branchId: this.input.branchId });
    return { commitId, localStatus: "committed", syncStatus: "pending" };
  }
}
