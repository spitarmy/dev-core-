/**
 * Path guard module for validating filesystem access within workspace boundaries.
 * @module path-guard
 */

import { resolve, relative, normalize, basename } from 'node:path';

/**
 * Result of a path guard check.
 */
export interface PathGuardResult {
  /** Whether access to the path is allowed. */
  allowed: boolean;
  /** Human-readable reason when access is denied. */
  reason?: string;
}

/**
 * Guards against unauthorized filesystem access outside the workspace
 * and protects sensitive files from being read or modified.
 */
export class PathGuard {
  private readonly workspaceRoot: string;

  /** Patterns indicating sensitive file paths (checked case-insensitively). */
  private readonly sensitivePatterns: readonly string[] = [
    '.env',
    '.env.local',
    '.env.production',
    '.env.staging',
    'credentials',
    'secrets',
    '.ssh',
    '.aws',
    '.gcp',
    'id_rsa',
    'id_ed25519',
    '.gpg',
    'token',
    'password',
    '.npmrc',
    '.pypirc',
    'service-account',
    'private-key',
  ];

  private readonly deniedPaths: readonly string[];

  /**
   * Creates a new PathGuard instance.
   *
   * @param workspaceRoot - Absolute path to the workspace root directory.
   * @param options - Optional configuration for additional restrictions.
   * @param options.additionalDeniedPaths - Extra paths to deny access to.
   * @param options.additionalSensitivePatterns - Extra patterns to treat as sensitive.
   */
  constructor(
    workspaceRoot: string,
    options?: {
      additionalDeniedPaths?: string[];
      additionalSensitivePatterns?: string[];
    },
  ) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.deniedPaths = options?.additionalDeniedPaths ?? [];

    if (options?.additionalSensitivePatterns) {
      this.sensitivePatterns = [
        ...this.sensitivePatterns,
        ...options.additionalSensitivePatterns,
      ];
    }
  }

  /**
   * Checks whether a target path resides within the workspace root.
   *
   * Resolves the path to an absolute form and verifies it does not
   * escape the workspace via `..` traversal.
   *
   * @param targetPath - The path to validate.
   * @returns `true` if the path is within the workspace root.
   */
  isPathWithinWorkspace(targetPath: string): boolean {
    const absolutePath = resolve(this.workspaceRoot, targetPath);
    const rel = relative(this.workspaceRoot, absolutePath);

    // Block any path that escapes the workspace
    if (rel.startsWith('..') || resolve(absolutePath) !== absolutePath.replace(/\/+$/, '')) {
      // Re-check using the resolved absolute path
      const resolvedRel = relative(this.workspaceRoot, absolutePath);
      if (resolvedRel.startsWith('..')) {
        return false;
      }
    }

    return absolutePath.startsWith(this.workspaceRoot);
  }

  /**
   * Checks whether a path references a sensitive file or directory.
   *
   * Performs case-insensitive matching against known sensitive patterns,
   * checking both the basename and all path segments.
   *
   * @param targetPath - The path to check.
   * @returns `true` if the path is considered sensitive.
   */
  isSensitivePath(targetPath: string): boolean {
    const normalizedPath = normalize(targetPath).toLowerCase();
    const pathBasename = basename(targetPath).toLowerCase();
    const segments = normalizedPath.split(/[/\\]/);

    for (const pattern of this.sensitivePatterns) {
      const lowerPattern = pattern.toLowerCase();

      // Check basename
      if (pathBasename === lowerPattern || pathBasename.includes(lowerPattern)) {
        return true;
      }

      // Check path segments
      for (const segment of segments) {
        if (segment === lowerPattern || segment.includes(lowerPattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Performs a comprehensive check to determine whether a path is accessible.
   *
   * Combines workspace boundary checks, sensitive path detection,
   * and explicit deny-list matching.
   *
   * @param targetPath - The path to validate.
   * @returns A {@link PathGuardResult} with the access decision and reason.
   */
  isPathAllowed(targetPath: string): PathGuardResult {
    // Check workspace boundary
    if (!this.isPathWithinWorkspace(targetPath)) {
      return {
        allowed: false,
        reason: `Path is outside workspace root: '${targetPath}'`,
      };
    }

    // Check sensitive patterns
    if (this.isSensitivePath(targetPath)) {
      return {
        allowed: false,
        reason: `Path matches sensitive pattern: '${targetPath}'`,
      };
    }

    // Check denied paths
    const absolutePath = resolve(this.workspaceRoot, targetPath);
    for (const denied of this.deniedPaths) {
      const deniedAbsolute = resolve(this.workspaceRoot, denied);
      if (absolutePath === deniedAbsolute || absolutePath.startsWith(deniedAbsolute + '/')) {
        return {
          allowed: false,
          reason: `Path is in denied list: '${denied}'`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Returns a redacted version of a path if it is sensitive.
   *
   * Replaces the filename component with `[REDACTED]` for sensitive paths.
   * Non-sensitive paths are returned unchanged.
   *
   * @param targetPath - The path to potentially redact.
   * @returns The original or redacted path string.
   */
  getRedactedPath(targetPath: string): string {
    if (this.isSensitivePath(targetPath)) {
      const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));
      return dir ? `${dir}/[REDACTED]` : '[REDACTED]';
    }

    return targetPath;
  }

  /**
   * Normalizes a path by resolving `.` and `..` segments and removing trailing slashes.
   *
   * @param inputPath - The path to normalize.
   * @returns The normalized path string.
   */
  static normalizePath(inputPath: string): string {
    const normalized = normalize(inputPath);
    return normalized.replace(/\/+$/, '');
  }
}
