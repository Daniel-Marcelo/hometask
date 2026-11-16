import { useSyncExternalStore } from "react";
import { createLocalRepo } from "./localRepo";
import { createSupabaseRepo, hasSupabaseEnv } from "./supabaseRepo";
import type { RepoState, TaskRepo } from "./repo";

/**
 * Module singleton used by all pages. Cloud-backed when Supabase env vars
 * are set, localStorage-backed otherwise — dormant until credentials exist.
 */
export const repo: TaskRepo = hasSupabaseEnv() ? createSupabaseRepo() : createLocalRepo();

/** React binding over the singleton repo. */
export function useRepoState(): RepoState {
  return useSyncExternalStore(repo.subscribe, repo.getState);
}
