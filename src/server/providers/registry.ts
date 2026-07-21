import type { ProviderId } from "../../shared/projects.js";
import type { AgentAdapter } from "../../shared/providers.js";

export class ProviderNotRegisteredError extends Error {}

export class AgentAdapterRegistry {
  private readonly adapters = new Map<ProviderId, AgentAdapter>();

  constructor(adapters: readonly AgentAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.id)) {
        throw new Error(`Provider '${adapter.id}' is registered more than once.`);
      }
      this.adapters.set(adapter.id, adapter);
    }
  }

  require(provider: ProviderId): AgentAdapter {
    const adapter = this.adapters.get(provider);
    if (adapter === undefined) {
      throw new ProviderNotRegisteredError(`Provider '${provider}' is not registered.`);
    }
    return adapter;
  }
}
