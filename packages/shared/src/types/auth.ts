/**
 * @module @devcore/shared/types/auth
 * Authentication and authorization type definitions for the DevCore platform.
 * Defines user roles, user entity structure, and authentication configuration.
 */

/**
 * Role assigned to a user within the DevCore platform.
 * Determines the level of access and permissions available.
 *
 * - `'owner'` — Full administrative access including user management and system configuration.
 * - `'admin'` — Administrative access to projects and tasks, but no system-level configuration.
 * - `'viewer'` — Read-only access to view tasks, logs, and project status.
 */
export type UserRole = 'owner' | 'admin' | 'viewer';

/**
 * Represents a registered user of the DevCore platform.
 * Users can interact with the system based on their assigned role.
 */
export interface User {
  /** Unique identifier for the user (UUID v4). */
  id: string;
  /** The user's display name / login username. */
  username: string;
  /** The user's email address, used for notifications. */
  email?: string;
  /** The user's access role within the platform. */
  role: UserRole;
  /** Timestamp when the user account was created. */
  createdAt: Date;
}

/**
 * Configuration for the authentication subsystem.
 * Controls session management and token lifecycle parameters.
 */
export interface AuthConfig {
  /** Secret key used for signing and verifying session tokens. */
  sessionSecret: string;
  /** Number of hours before an issued token expires. */
  tokenExpiryHours: number;
  /** Maximum number of concurrent sessions allowed per user. */
  maxSessions: number;
}
