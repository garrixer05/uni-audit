import { Request, Response, NextFunction, RequestHandler } from "express";
import { AuditManager, Actor } from "@audit-framework/core";

export interface AuditMiddlewareOptions {
  excludePaths?: (string | RegExp)[];
  getActor?: (req: Request) => Actor | Promise<Actor>;
  getTarget?: (req: Request) => { id: string; type: string; name?: string; metadata?: Record<string, any> } | Promise<{ id: string; type: string; name?: string; metadata?: Record<string, any> }>;
  getAction?: (req: Request) => string;
  getMetadata?: (req: Request) => Record<string, any> | Promise<Record<string, any>>;
}

declare global {
  namespace Express {
    interface Request {
      auditActor?: Actor;
      auditTarget?: { id: string; type: string; name?: string; metadata?: Record<string, any> };
      auditMetadata?: Record<string, any>;
    }
  }
}

export function createAuditMiddleware(
  manager: AuditManager,
  options: AuditMiddlewareOptions = {}
): RequestHandler {
  const {
    excludePaths = [],
    getActor,
    getTarget,
    getAction,
    getMetadata,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Check if path is excluded
    const isExcluded = excludePaths.some((pattern) => {
      if (typeof pattern === "string") {
        return req.path === pattern;
      }
      return pattern.test(req.path);
    });

    if (isExcluded) {
      return next();
    }

    // Capture standard response metrics
    const startTime = process.hrtime();

    // Intercept response finish
    res.on("finish", async () => {
      try {
        const diff = process.hrtime(startTime);
        const durationMs = Math.round(diff[0] * 1e3 + diff[1] * 1e-6);

        // Determine action name
        const action = getAction
          ? getAction(req)
          : `${req.method.toLowerCase()}.${req.route?.path || req.path}`;

        // Determine actor
        let actor: Actor = {
          id: "anonymous",
          type: "user",
          ip: req.ip || req.socket.remoteAddress || undefined,
          userAgent: req.get("User-Agent"),
        };

        if (req.auditActor) {
          actor = { ...actor, ...req.auditActor };
        } else if (getActor) {
          try {
            const resolvedActor = await getActor(req);
            actor = { ...actor, ...resolvedActor };
          } catch (err) {
            console.error("Error resolving actor in audit middleware:", err);
          }
        }

        // Determine target
        let target = req.auditTarget;
        if (!target && getTarget) {
          try {
            target = await getTarget(req);
          } catch (err) {
            console.error("Error resolving target in audit middleware:", err);
          }
        }

        // Gather metadata
        let metadata: Record<string, any> = {
          url: req.originalUrl || req.url,
          method: req.method,
          statusCode: res.statusCode,
          durationMs,
        };

        if (req.auditMetadata) {
          metadata = { ...metadata, ...req.auditMetadata };
        }

        if (getMetadata) {
          try {
            const resolvedMeta = await getMetadata(req);
            metadata = { ...metadata, ...resolvedMeta };
          } catch (err) {
            console.error("Error resolving metadata in audit middleware:", err);
          }
        }

        // Log the event
        await manager.log({
          action,
          status: res.statusCode >= 200 && res.statusCode < 400 ? "success" : "failure",
          actor,
          target,
          description: `HTTP ${req.method} ${req.originalUrl} responded with status ${res.statusCode}`,
          metadata,
        });
      } catch (err) {
        console.error("Failed to log express request audit event:", err);
      }
    });

    next();
  };
}
