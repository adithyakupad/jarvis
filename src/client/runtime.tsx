import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DeterministicMockJarvisClientService } from "./mock-service.js";
import type { JarvisClientService, JarvisSnapshot } from "./service.js";

const ServiceContext = createContext<JarvisClientService | null>(null);

export function JarvisRuntimeProvider({ children }: { children: ReactNode }): ReactNode {
  const service = useMemo(() => new DeterministicMockJarvisClientService(), []);
  return <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>;
}

export function useJarvisService(): JarvisClientService {
  const service = useContext(ServiceContext);
  if (!service) throw new Error("JarvisRuntimeProvider is missing.");
  return service;
}

export function useJarvisSnapshot(): JarvisSnapshot {
  const service = useJarvisService();
  return useSyncExternalStore(
    (listener) => service.subscribe(listener),
    () => service.getSnapshot(),
    () => service.getSnapshot(),
  );
}
