export interface CierreLoadOptions {
  silent?: boolean;
}

export interface CierreLoadRunnerConfig<T> {
  setLoading: (loading: boolean) => void;
  setLoadError: (error: string) => void;
  fetchData: () => Promise<T>;
  applyData: (data: T) => void;
}

export interface CierreLoadRunner {
  run: (options?: CierreLoadOptions) => Promise<void>;
}

export function createCierreLoadRunner<T>(
  config: CierreLoadRunnerConfig<T>
): CierreLoadRunner {
  return {
    async run(options?: CierreLoadOptions): Promise<void> {
      const silent = options?.silent ?? false;
      if (!silent) {
        config.setLoading(true);
        config.setLoadError('');
      }
      try {
        const data = await config.fetchData();
        config.applyData(data);
      } catch (err) {
        if (!silent) {
          config.setLoadError(err instanceof Error ? err.message : 'Error cargando datos');
        } else {
          console.error('[Cierre] silent refresh failed:', err);
        }
      } finally {
        if (!silent) {
          config.setLoading(false);
        }
      }
    },
  };
}
