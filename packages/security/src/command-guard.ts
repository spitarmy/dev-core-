/**
 * Command guard module for validating and sanitizing shell commands.
 * @module command-guard
 */

import { ALLOWED_COMMANDS, DENIED_COMMANDS, DangerousOperations } from '@devcore/shared';

/**
 * Result of a command guard check.
 */
export interface CommandGuardResult {
  /** Whether the command is allowed to execute. */
  allowed: boolean;
  /** Human-readable reason when the command is denied. */
  reason?: string;
}

/**
 * Guards against execution of unauthorized or dangerous shell commands.
 *
 * Maintains allow/deny lists and timeout configurations, providing
 * validation, sanitization, and timeout resolution for commands.
 */
export class CommandGuard {
  /** Default timeout in milliseconds for commands without a custom timeout. */
  static readonly DEFAULT_TIMEOUT = 30_000;

  private readonly allowedCommands: readonly string[];
  private readonly deniedCommands: readonly string[];
  private readonly commandTimeouts: ReadonlyMap<string, number>;

  /**
   * Creates a new CommandGuard instance.
   *
   * @param options - Optional configuration to extend default allow/deny lists and timeouts.
   * @param options.additionalAllowed - Extra commands to add to the allow list.
   * @param options.additionalDenied - Extra commands to add to the deny list.
   * @param options.customTimeouts - Custom timeout overrides keyed by command prefix.
   */
  constructor(options?: {
    additionalAllowed?: string[];
    additionalDenied?: string[];
    customTimeouts?: Record<string, number>;
  }) {
    this.allowedCommands = [
      ...ALLOWED_COMMANDS,
      ...(options?.additionalAllowed ?? []),
    ];
    this.deniedCommands = [
      ...DENIED_COMMANDS,
      ...(options?.additionalDenied ?? []),
    ];

    const defaultTimeouts: Record<string, number> = {
      'npm install': 300_000,
      'npm ci': 300_000,
      'tsc': 120_000,
      'git clone': 120_000,
      'git pull': 60_000,
      'git push': 60_000,
      'vitest': 120_000,
      'jest': 120_000,
    };

    this.commandTimeouts = new Map<string, number>(
      Object.entries({ ...defaultTimeouts, ...(options?.customTimeouts ?? {}) }),
    );
  }

  /**
   * Checks whether a command is allowed to execute.
   *
   * Evaluation order:
   * 1. Empty/whitespace-only commands are denied.
   * 2. Commands matching any denied pattern (substring) are denied.
   * 3. Commands whose first word matches an allowed prefix are allowed.
   * 4. All other commands are denied as unknown.
   *
   * @param command - The shell command string to validate.
   * @returns A {@link CommandGuardResult} indicating whether execution is permitted.
   */
  isCommandAllowed(command: string): CommandGuardResult {
    const trimmed = command.trim();

    if (trimmed.length === 0) {
      return { allowed: false, reason: 'Empty command' };
    }

    // Check denied list (substring match)
    for (const denied of this.deniedCommands) {
      if (trimmed.includes(denied)) {
        return { allowed: false, reason: `Command matches denied pattern: '${denied}'` };
      }
    }

    // Check allowed list (first word / prefix match)
    const firstWord = trimmed.split(/\s+/)[0]!;
    for (const allowed of this.allowedCommands) {
      if (firstWord === allowed || trimmed.startsWith(allowed)) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: `Unknown command: '${firstWord}'` };
  }

  /**
   * Sanitizes a command string by removing shell injection vectors.
   *
   * Removes: `;`, `&&`, `||`, `|`, backticks, `$()`, `#{}`,
   * redirect operators (`>`, `<`, `>>`), and leading environment
   * variable assignments (`VAR=val`).
   *
   * @param command - The raw command string to sanitize.
   * @returns The sanitized command string.
   */
  sanitizeCommand(command: string): string {
    let sanitized = command;

    // Remove shell chaining and piping operators
    sanitized = sanitized.replace(/;/g, '');
    sanitized = sanitized.replace(/&&/g, '');
    sanitized = sanitized.replace(/\|\|/g, '');
    sanitized = sanitized.replace(/\|/g, '');

    // Remove backticks
    sanitized = sanitized.replace(/`/g, '');

    // Remove $() command substitution
    sanitized = sanitized.replace(/\$\([^)]*\)/g, '');

    // Remove #{} interpolation
    sanitized = sanitized.replace(/#\{[^}]*\}/g, '');

    // Remove redirect operators
    sanitized = sanitized.replace(/>>/g, '');
    sanitized = sanitized.replace(/>/g, '');
    sanitized = sanitized.replace(/</g, '');

    // Strip leading env var assignments (VAR=val)
    sanitized = sanitized.replace(/^(\s*[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)+/, '');

    return sanitized.trim();
  }

  /**
   * Resolves the timeout for a given command.
   *
   * Matches the command against registered timeout prefixes (longest match first).
   * Falls back to {@link CommandGuard.DEFAULT_TIMEOUT} if no match is found.
   *
   * @param command - The command string to resolve a timeout for.
   * @returns The timeout in milliseconds.
   */
  getTimeout(command: string): number {
    const trimmed = command.trim();

    for (const [prefix, timeout] of this.commandTimeouts) {
      if (trimmed.startsWith(prefix)) {
        return timeout;
      }
    }

    return CommandGuard.DEFAULT_TIMEOUT;
  }

  /**
   * Determines whether a command matches any known dangerous operation pattern.
   *
   * @param command - The command string to check.
   * @returns `true` if the command is considered dangerous.
   */
  static isDangerous(command: string): boolean {
    const trimmed = command.trim().toLowerCase();

    for (const pattern of DangerousOperations) {
      if (trimmed.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }
}
