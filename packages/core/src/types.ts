import type { AuditManager } from "./framework.js";

export interface Actor {
  id: string;
  type: string; // e.g. 'user', 'system', 'api-key'
  name?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface Target {
  id: string;
  type: string; // e.g. 'document', 'settings', 'user'
  name?: string;
  metadata?: Record<string, any>;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  action: string; // e.g. 'user.login', 'document.create', 'document.delete'
  status: 'success' | 'failure';
  actor: Actor;
  target?: Target;
  description?: string;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  metadata?: Record<string, any>;
}

export interface StorageProvider {
  name: string;
  save(event: AuditEvent): Promise<void>;
  query?(filter: Record<string, any>): Promise<AuditEvent[]>;
}

export interface AuditPlugin {
  name: string;
  onInit?(manager: AuditManager): void | Promise<void>;
  beforeLog?(event: Partial<AuditEvent>): void | Promise<void | Partial<AuditEvent>>;
  onLog?(event: AuditEvent): void | Promise<void>;
}

export interface AuditConfig {
  storage: StorageProvider[];
  plugins?: AuditPlugin[];
  defaultActor?: Partial<Actor>;
}
