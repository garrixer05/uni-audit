import { StorageProvider, AuditEvent } from "@audit-framework/core";
import pg from "pg";

export interface PostgresStorageOptions {
  connectionString?: string;
  pool?: pg.Pool;
  tableName?: string;
  schema?: string;
  createTableIfNotExists?: boolean;
}

export class PostgresStorage implements StorageProvider {
  public name = "postgres-storage";
  private pool: pg.Pool;
  private tableName: string;
  private schema: string;
  private createTableIfNotExists: boolean;
  private tableInitialized = false;

  // For testing/playground purposes when no real DB connection string is provided
  private inMemoryFallback: AuditEvent[] = [];
  private isFallbackMode = false;

  constructor(options: PostgresStorageOptions = {}) {
    this.tableName = options.tableName || "audit_logs";
    this.schema = options.schema || "public";
    this.createTableIfNotExists = options.createTableIfNotExists ?? true;

    if (options.pool) {
      this.pool = options.pool;
    } else if (options.connectionString) {
      this.pool = new pg.Pool({ connectionString: options.connectionString });
    } else {
      // Fallback mode for playground / testing when no config is provided
      this.isFallbackMode = true;
      // Instantiate an empty Pool to satisfy TypeScript, won't be used since we check isFallbackMode first
      this.pool = new pg.Pool();
      console.warn("[PostgresStorage] No connection parameters provided. Running in in-memory fallback mode.");
    }
  }

  private async initializeTable(): Promise<void> {
    if (this.isFallbackMode || this.tableInitialized || !this.createTableIfNotExists) {
      return;
    }

    const queryText = `
      CREATE TABLE IF NOT EXISTS ${this.schema}.${this.tableName} (
        id UUID PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        action VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        actor_id VARCHAR(255) NOT NULL,
        actor_type VARCHAR(50) NOT NULL,
        actor_name VARCHAR(255),
        actor_email VARCHAR(255),
        actor_ip VARCHAR(50),
        actor_user_agent TEXT,
        target_id VARCHAR(255),
        target_type VARCHAR(50),
        target_name VARCHAR(255),
        description TEXT,
        changes JSONB,
        metadata JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON ${this.schema}.${this.tableName} (timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON ${this.schema}.${this.tableName} (action);
    `;

    try {
      await this.pool.query(queryText);
      this.tableInitialized = true;
    } catch (err) {
      console.error(`[PostgresStorage] Failed to initialize table ${this.schema}.${this.tableName}:`, err);
      throw err;
    }
  }

  public async save(event: AuditEvent): Promise<void> {
    if (this.isFallbackMode) {
      this.inMemoryFallback.push(event);
      console.log(`[PostgresStorage (Mock DB Insert)] Saved event: ${event.action} (${event.id})`);
      return;
    }

    await this.initializeTable();

    const queryText = `
      INSERT INTO ${this.schema}.${this.tableName} (
        id, timestamp, action, status,
        actor_id, actor_type, actor_name, actor_email, actor_ip, actor_user_agent,
        target_id, target_type, target_name,
        description, changes, metadata
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16
      )
    `;

    const values = [
      event.id,
      event.timestamp,
      event.action,
      event.status,
      event.actor.id,
      event.actor.type,
      event.actor.name || null,
      event.actor.email || null,
      event.actor.ip || null,
      event.actor.userAgent || null,
      event.target?.id || null,
      event.target?.type || null,
      event.target?.name || null,
      event.description || null,
      event.changes ? JSON.stringify(event.changes) : null,
      event.metadata ? JSON.stringify(event.metadata) : null,
    ];

    await this.pool.query(queryText, values);
  }

  public async query(filter: Record<string, any> = {}): Promise<AuditEvent[]> {
    if (this.isFallbackMode) {
      let results = [...this.inMemoryFallback];
      if (filter.action) {
        results = results.filter((r) => r.action === filter.action);
      }
      if (filter.status) {
        results = results.filter((r) => r.status === filter.status);
      }
      return results.reverse(); // Newest first
    }

    await this.initializeTable();

    let queryText = `SELECT * FROM ${this.schema}.${this.tableName}`;
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCounter = 1;

    if (filter.action) {
      conditions.push(`action = $${paramCounter++}`);
      values.push(filter.action);
    }
    if (filter.status) {
      conditions.push(`status = $${paramCounter++}`);
      values.push(filter.status);
    }
    if (filter.actorId) {
      conditions.push(`actor_id = $${paramCounter++}`);
      values.push(filter.actorId);
    }

    if (conditions.length > 0) {
      queryText += ` WHERE ${conditions.join(" AND ")}`;
    }

    queryText += ` ORDER BY timestamp DESC`;

    const res = await this.pool.query(queryText, values);

    return res.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      status: row.status as "success" | "failure",
      actor: {
        id: row.actor_id,
        type: row.actor_type,
        name: row.actor_name,
        email: row.actor_email,
        ip: row.actor_ip,
        userAgent: row.actor_user_agent,
      },
      target: row.target_id ? {
        id: row.target_id,
        type: row.target_type,
        name: row.target_name,
      } : undefined,
      description: row.description,
      changes: row.changes || undefined,
      metadata: row.metadata || undefined,
    }));
  }

  public getFallbackEvents(): AuditEvent[] {
    return this.inMemoryFallback;
  }
}
