import { AuditPlugin, AuditEvent } from "@audit-framework/core";

export interface IdentityPluginOptions {
  resolveIdentity?: (actorId: string) => Promise<{ name?: string; email?: string; metadata?: Record<string, any> } | null>;
}

export class IdentityPlugin implements AuditPlugin {
  public name = "identity-plugin";
  private resolveIdentity?: (actorId: string) => Promise<{ name?: string; email?: string; metadata?: Record<string, any> } | null>;

  constructor(options: IdentityPluginOptions = {}) {
    this.resolveIdentity = options.resolveIdentity;
  }

  public async beforeLog(event: Partial<AuditEvent>): Promise<Partial<AuditEvent>> {
    if (!event.actor || !event.actor.id || event.actor.id === "anonymous" || event.actor.id === "system") {
      return event;
    }

    if (this.resolveIdentity) {
      try {
        const details = await this.resolveIdentity(event.actor.id);
        if (details) {
          return {
            ...event,
            actor: {
              ...event.actor,
              name: details.name || event.actor.name,
              email: details.email || event.actor.email,
              metadata: {
                ...(event.actor.metadata || {}),
                ...(details.metadata || {}),
              },
            },
          };
        }
      } catch (err) {
        console.error(`[IdentityPlugin] Error resolving identity for actor ${event.actor.id}:`, err);
      }
    }

    return event;
  }
}
