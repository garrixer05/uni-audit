import crypto from "node:crypto";
import { AuditEvent, AuditConfig, Actor, StorageProvider, AuditPlugin } from "./types.js";

export class AuditManager {
  private storageProviders: StorageProvider[] = [];
  private plugins: AuditPlugin[] = [];
  private defaultActor: Partial<Actor> = {};

  constructor(config: AuditConfig) {
    this.storageProviders = config.storage;
    this.plugins = config.plugins || [];
    this.defaultActor = config.defaultActor || { id: "system", type: "system", name: "System Process" };

    // Initialize plugins
    for (const plugin of this.plugins) {
      if (plugin.onInit) {
        try {
          plugin.onInit(this);
        } catch (err) {
          console.error(`Failed to initialize plugin "${plugin.name}":`, err);
        }
      }
    }
  }

  public registerPlugin(plugin: AuditPlugin): void {
    this.plugins.push(plugin);
    if (plugin.onInit) {
      try {
        plugin.onInit(this);
      } catch (err) {
        console.error(`Failed to initialize plugin "${plugin.name}":`, err);
      }
    }
  }

  public registerStorageProvider(provider: StorageProvider): void {
    this.storageProviders.push(provider);
  }

  public getStorageProviders(): StorageProvider[] {
    return this.storageProviders;
  }

  public getPlugins(): AuditPlugin[] {
    return this.plugins;
  }

  public async log(eventData: Omit<AuditEvent, "id" | "timestamp"> & { id?: string; timestamp?: Date }): Promise<AuditEvent> {
    let event: Partial<AuditEvent> = {
      id: eventData.id || crypto.randomUUID(),
      timestamp: eventData.timestamp || new Date(),
      action: eventData.action,
      status: eventData.status,
      actor: { ...this.defaultActor, ...eventData.actor } as Actor,
      target: eventData.target,
      description: eventData.description,
      changes: eventData.changes,
      metadata: eventData.metadata || {},
    };

    // Run beforeLog hooks
    for (const plugin of this.plugins) {
      if (plugin.beforeLog) {
        try {
          const result = await plugin.beforeLog(event);
          if (result) {
            event = { ...event, ...result };
          }
        } catch (err) {
          console.error(`Error in beforeLog hook for plugin "${plugin.name}":`, err);
        }
      }
    }

    const finalizedEvent = event as AuditEvent;

    // Save to all storage providers in parallel
    const savePromises = this.storageProviders.map(async (provider) => {
      try {
        await provider.save(finalizedEvent);
      } catch (err) {
        console.error(`Failed to save audit event to storage "${provider.name}":`, err);
      }
    });

    await Promise.all(savePromises);

    // Run onLog hooks
    for (const plugin of this.plugins) {
      if (plugin.onLog) {
        try {
          await plugin.onLog(finalizedEvent);
        } catch (err) {
          console.error(`Error in onLog hook for plugin "${plugin.name}":`, err);
        }
      }
    }

    return finalizedEvent;
  }
}
