import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request-scoped context used to tag AI cost logs with the search that caused them.
 * Wrap a search request in `runWithCostContext` and every `recordOperationCost`
 * call made inside it (query expansion, embeddings, re-ranking, ...) is linked
 * to that search automatically.
 */
export interface CostContext {
  searchId?: string;
  searchQuery?: string;
  scopeVideoId?: string;
}

const storage = new AsyncLocalStorage<CostContext>();

export function runWithCostContext<T>(ctx: CostContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getCostContext(): CostContext | undefined {
  return storage.getStore();
}
