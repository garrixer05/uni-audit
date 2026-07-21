import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AuditManager } from "@audit-framework/core";
import { createAuditMiddleware } from "@audit-framework/express";
import { IdentityPlugin } from "@audit-framework/identity";
import { PostgresStorage } from "@audit-framework/storage-postgres";
import { ConsolePlugin } from "@audit-framework/plugin-console";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Mock DB of users for the Identity Plugin lookup
const userDatabase: Record<string, { name: string; email: string; metadata: any }> = {
  "user-1": { name: "Alice Vance", email: "alice@audit-framework.dev", metadata: { role: "Engineer", department: "Security" } },
  "user-2": { name: "Bob Carter", email: "bob@audit-framework.dev", metadata: { role: "Auditor", department: "Compliance" } },
  "admin-3": { name: "Charlie Admin", email: "charlie@audit-framework.dev", metadata: { role: "SysAdmin", department: "IT Operations" } },
};

// 1. Instantiate Storage Provider (will run in mock fallback mode since no connectionString is passed)
const storage = new PostgresStorage();

// 2. Instantiate Plugins
const identityPlugin = new IdentityPlugin({
  resolveIdentity: async (id) => {
    return userDatabase[id] || null;
  },
});
const consolePlugin = new ConsolePlugin();

// 3. Instantiate Audit Manager
const auditManager = new AuditManager({
  storage: [storage],
  plugins: [identityPlugin, consolePlugin],
  defaultActor: {
    id: "system",
    type: "system",
    name: "Playground Core System",
  },
});

// Mock Session State
let currentUser = {
  id: "user-1",
  type: "user",
};

// 4. Configure Express Audit Middleware
app.use(
  createAuditMiddleware(auditManager, {
    excludePaths: ["/api/logs", "/favicon.ico", /^\/public\/.*/],
    getActor: () => currentUser,
  })
);

// Serve Static Frontend UI files
app.use(express.static(path.join(__dirname, "../src/public")));

// API: Get logs
app.get("/api/logs", async (req, res) => {
  try {
    const logs = await storage.query();
    res.json({ logs });
  } catch (err) {
    console.error("Failed to query audit logs:", err);
    res.status(500).json({ error: "Failed to load audit logs" });
  }
});

// API: Simulate User Session Login Change
app.post("/api/login", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const prevUser = currentUser.id;
  if (userId === "anonymous") {
    currentUser = { id: "anonymous", type: "guest" };
  } else {
    currentUser = { id: userId, type: "user" };
  }

  // Manually log this event
  await auditManager.log({
    action: "session.login_changed",
    status: "success",
    actor: { id: userId, type: userId === "anonymous" ? "guest" : "user" },
    description: `User session changed from ${prevUser} to ${userId}`,
    metadata: {
      previousUser: prevUser,
      newUser: userId,
    },
  });

  res.json({ success: true, currentUser });
});

// API: Trigger Mock Action
app.post("/api/action", async (req, res) => {
  const { actionType, targetType, targetId, targetName, success, description, changes } = req.body;

  if (!actionType) {
    return res.status(400).json({ error: "Missing actionType" });
  }

  // Simulate doing work...
  const status = success ?? true ? "success" : "failure";

  // Manually log custom business logic event
  const loggedEvent = await auditManager.log({
    action: actionType,
    status,
    actor: currentUser,
    target: targetType ? {
      id: targetId || Math.random().toString(36).substring(7),
      type: targetType,
      name: targetName,
    } : undefined,
    description: description || `Executed action ${actionType}`,
    changes: changes || undefined,
  });

  res.json({ success: true, event: loggedEvent });
});

// Start express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Playground audit server listening on http://localhost:${PORT}`);
  console.log(`👉 Open http://localhost:${PORT} in your browser to view the interactive dashboard.\n`);
});
