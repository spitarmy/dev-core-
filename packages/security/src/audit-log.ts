/**
 * Audit logging module for tracking security-relevant events.
 * @module audit-log
 */

import type { ModelUsage } from '@devcore/shared';

/**
 * Severity levels for audit log entries.
 */
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * Actor types that can trigger auditable actions.
 */
export type AuditActor = 'system' | 'user' | 'ai';

/**
 * A single entry in the audit log.
 */
export interface AuditEntry {
  /** Unique identifier for this log entry. */
  id: string;
  /** Timestamp when the event occurred. */
  timestamp: Date;
  /** Name of the action that was performed. */
  action: string;
  /** The actor that triggered the action. */
  actor: AuditActor;
  /** Additional structured details about the event. */
  details: Record<string, unknown>;
  /** Severity level of the event. */
  severity: AuditSeverity;
}

/**
 * In-memory audit logger for tracking security-relevant events.
 *
 * Maintains a bounded buffer of {@link AuditEntry} records with
 * convenience methods for logging approvals, dangerous operations,
 * and model usage.
 */
export class AuditLogger {
  private entries: AuditEntry[] = [];
  private readonly maxEntries: number;

  /**
   * Creates a new AuditLogger instance.
   *
   * @param options - Optional configuration.
   * @param options.maxEntries - Maximum number of entries to retain (default: 10000).
   */
  constructor(options?: { maxEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? 10_000;
  }

  /**
   * Logs a new audit entry.
   *
   * If the log exceeds {@link maxEntries}, the oldest entries are removed.
   *
   * @param action - Name of the action being logged.
   * @param actor - The actor performing the action.
   * @param details - Structured details about the event.
   * @param severity - Severity level (default: `'info'`).
   * @returns The created {@link AuditEntry}.
   */
  log(
    action: string,
    actor: AuditActor,
    details: Record<string, unknown>,
    severity: AuditSeverity = 'info',
  ): AuditEntry {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      action,
      actor,
      details,
      severity,
    };

    this.entries.push(entry);

    // Trim oldest entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }

    return entry;
  }

  /**
   * Logs an approval decision.
   *
   * @param requestId - The ID of the approval request.
   * @param approved - Whether the request was approved.
   * @param approver - Identifier of the approver.
   * @param taskId - The ID of the task being approved.
   * @returns The created {@link AuditEntry}.
   */
  logApproval(
    requestId: string,
    approved: boolean,
    approver: string,
    taskId: string,
  ): AuditEntry {
    return this.log(
      'approval',
      'user',
      { requestId, approved, approver, taskId },
      approved ? 'info' : 'warn',
    );
  }

  /**
   * Logs an attempt to execute a dangerous operation.
   *
   * @param operation - The type of dangerous operation.
   * @param command - The command that was attempted.
   * @param allowed - Whether the operation was permitted.
   * @param reason - Optional reason for the decision.
   * @returns The created {@link AuditEntry}.
   */
  logDangerousOperation(
    operation: string,
    command: string,
    allowed: boolean,
    reason?: string,
  ): AuditEntry {
    return this.log(
      'dangerous_operation',
      'system',
      { operation, command, allowed, reason },
      allowed ? 'critical' : 'warn',
    );
  }

  /**
   * Logs model usage metrics.
   *
   * @param usage - The model usage data to log.
   * @returns The created {@link AuditEntry}.
   */
  logModelUsage(usage: ModelUsage): AuditEntry {
    return this.log('model_usage', 'ai', { ...usage } as Record<string, unknown>, 'info');
  }

  /**
   * Retrieves log entries matching the given filter criteria.
   *
   * All filter fields are optional; only provided fields are matched.
   *
   * @param filter - Optional filter criteria.
   * @param filter.action - Filter by action name.
   * @param filter.actor - Filter by actor type.
   * @param filter.severity - Filter by severity level.
   * @param filter.since - Filter entries created on or after this date.
   * @returns An array of matching {@link AuditEntry} records.
   */
  getEntries(filter?: {
    action?: string;
    actor?: AuditActor;
    severity?: AuditSeverity;
    since?: Date;
  }): AuditEntry[] {
    if (!filter) {
      return [...this.entries];
    }

    return this.entries.filter((entry) => {
      if (filter.action && entry.action !== filter.action) return false;
      if (filter.actor && entry.actor !== filter.actor) return false;
      if (filter.severity && entry.severity !== filter.severity) return false;
      if (filter.since && entry.timestamp < filter.since) return false;
      return true;
    });
  }

  /**
   * Returns the most recent audit log entries.
   *
   * @param count - Number of entries to return (default: 50).
   * @returns An array of the most recent {@link AuditEntry} records.
   */
  getRecentEntries(count: number = 50): AuditEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Clears all entries from the audit log.
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Serializes the audit log to a JSON-compatible array.
   *
   * @returns A shallow copy of all {@link AuditEntry} records.
   */
  toJSON(): AuditEntry[] {
    return [...this.entries];
  }
}
