/**
 * @module @devcore/shared/types/project
 * Project-related type definitions for the DevCore platform.
 * Defines project configuration, settings, and memory structures
 * used for persistent project context and decision tracking.
 */

/**
 * Configurable settings for a DevCore-managed project.
 * Controls automation behavior, cost limits, and security boundaries.
 */
export interface ProjectSettings {
  /** Whether to automatically approve plans and changes without human review. */
  autoApprove: boolean;
  /** Maximum allowed cost (in USD) for a single task before requiring approval. */
  costLimitPerTask: number;
  /** Maximum allowed total cost (in USD) across all tasks in a single day. */
  costLimitPerDay: number;
  /** List of shell commands that AI agents are allowed to execute. */
  allowedCommands: string[];
  /** List of file/directory paths that AI agents are denied access to. */
  deniedPaths: string[];
}

/**
 * Core project entity representing a codebase managed by DevCore.
 * Each project is associated with a git repository and has its own
 * configuration, settings, and task history.
 */
export interface Project {
  /** Unique identifier for the project (UUID v4). */
  id: string;
  /** Human-readable name of the project. */
  name: string;
  /** Absolute path to the project root directory on the local filesystem. */
  rootPath: string;
  /** Git remote URL for the project repository, if configured. */
  gitRemote?: string;
  /** Default git branch name (e.g., 'main' or 'master'). */
  defaultBranch: string;
  /** Timestamp when the project was registered with DevCore. */
  createdAt: Date;
  /** Timestamp when the project configuration was last modified. */
  updatedAt: Date;
  /** Project-specific settings controlling automation and security. */
  settings: ProjectSettings;
}

/**
 * Represents a recorded decision made during project development.
 * Decisions capture the rationale behind technical choices for
 * future reference and AI context awareness.
 */
export interface Decision {
  /** Unique identifier for the decision record. */
  id: string;
  /** Human-readable description of the decision that was made. */
  description: string;
  /** Who made the decision — either a human operator or an AI agent. */
  decidedBy: 'human' | 'ai';
  /** The reasoning or justification behind the decision. */
  rationale: string;
  /** Timestamp when the decision was recorded. */
  timestamp: Date;
}

/**
 * Persistent memory store for a project, maintaining context about
 * the technology stack, coding conventions, architecture, and recent
 * decisions. Used by AI agents to maintain consistency across tasks.
 */
export interface ProjectMemory {
  /** Identifier of the project this memory belongs to. */
  projectId: string;
  /** List of technologies, frameworks, and libraries used in the project. */
  techStack: string[];
  /** Coding conventions and style guidelines observed in the project. */
  conventions: string[];
  /** High-level description of the project's software architecture. */
  architecture?: string;
  /** Recent decisions made during project development, ordered by recency. */
  recentDecisions: Decision[];
  /** Timestamp when the project memory was last updated. */
  lastUpdated: Date;
}
