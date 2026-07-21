import { AuditPlugin, AuditEvent } from "@audit-framework/core";

export interface ConsolePluginOptions {
  enabled?: boolean;
  colors?: boolean;
}

export class ConsolePlugin implements AuditPlugin {
  public name = "console-plugin";
  private enabled: boolean;
  private useColors: boolean;

  constructor(options: ConsolePluginOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.useColors = options.colors ?? true;
  }

  private color(text: string, ansiCode: string): string {
    if (!this.useColors) return text;
    return `\x1b[${ansiCode}m${text}\x1b[0m`;
  }

  public onLog(event: AuditEvent): void {
    if (!this.enabled) return;

    const timestamp = new Date(event.timestamp).toISOString();
    const actionStr = this.color(event.action, "36"); // Cyan
    const statusColor = event.status === "success" ? "32" : "31"; // Green or Red
    const statusStr = this.color(event.status.toUpperCase(), statusColor);
    const actorStr = this.color(`${event.actor.type}:${event.actor.id}`, "33"); // Yellow
    const targetStr = event.target
      ? ` -> target: ${this.color(`${event.target.type}:${event.target.id}`, "35")}` // Magenta
      : "";

    console.log(
      `[${this.color("AUDIT", "90")}] ${timestamp} | ${statusStr} | ${actionStr} | actor: ${actorStr}${targetStr} | msg: "${event.description || ""}"`
    );
  }
}
