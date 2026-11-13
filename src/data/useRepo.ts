import { useSyncExternalStore } from "react";
import { createLocalRepo } from "./localRepo";
import type { RepoState, TaskRepo } from "./repo";

/** Module singleton used by all pages. */
export const repo: TaskRepo = createLocalRepo();

/** React binding over the singleton repo. */
export function useRepoState(): RepoState {
  return useSyncExternalStore(repo.subscribe, repo.getState);
}
