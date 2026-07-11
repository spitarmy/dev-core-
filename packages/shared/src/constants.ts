/**
 * @module @devcore/shared/constants
 * Shared constants for the DevCore platform.
 * Provides human-readable labels, default configuration values,
 * security boundaries, and platform-wide defaults.
 */

import { TaskStatus } from './types/task.js';
import { ApprovalType } from './types/approval.js';

/**
 * Human-readable Japanese labels for each task status.
 * Used in the UI to display localized status information.
 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.QUEUED]: '待機中',
  [TaskStatus.ANALYZING]: '分析中',
  [TaskStatus.PLANNING]: '計画中',
  [TaskStatus.WAITING_FOR_PLAN_APPROVAL]: '計画承認待ち',
  [TaskStatus.IMPLEMENTING]: '実装中',
  [TaskStatus.TESTING]: 'テスト中',
  [TaskStatus.REVIEWING]: 'レビュー中',
  [TaskStatus.WAITING_FOR_CHANGE_APPROVAL]: '変更承認待ち',
  [TaskStatus.READY_TO_DEPLOY]: 'デプロイ準備完了',
  [TaskStatus.WAITING_FOR_DEPLOY_APPROVAL]: 'デプロイ承認待ち',
  [TaskStatus.DEPLOYING]: 'デプロイ中',
  [TaskStatus.COMPLETED]: '完了',
  [TaskStatus.PAUSED]: '一時停止',
  [TaskStatus.FAILED]: '失敗',
  [TaskStatus.CANCELLED]: 'キャンセル',
} as const;

/**
 * List of approval types that require explicit human authorization.
 * Operations matching these types will pause the pipeline and create
 * an approval request for a human operator.
 */
export const APPROVAL_REQUIRED_OPERATIONS: readonly ApprovalType[] = [
  ApprovalType.PLAN,
  ApprovalType.CODE_CHANGES,
  ApprovalType.DEPLOYMENT,
  ApprovalType.DANGEROUS_OPERATION,
  ApprovalType.COST_THRESHOLD,
  ApprovalType.ROLLBACK,
] as const;

/**
 * Default cost limits (in USD) for automated operations.
 * These limits act as safety guardrails to prevent runaway spending.
 */
export const DEFAULT_COST_LIMITS = {
  /** Maximum cost allowed for a single task before requiring approval. */
  perTask: 5.0,
  /** Maximum total cost allowed across all tasks in a single day. */
  perDay: 50.0,
  /** Maximum total cost allowed across all tasks in a single month. */
  perMonth: 500.0,
} as const;

/**
 * Prefix applied to all git branches created by DevCore.
 * Ensures DevCore-managed branches are easily identifiable.
 */
export const BRANCH_PREFIX = 'devcore/' as const;

/**
 * List of shell commands that AI agents are allowed to execute by default.
 * Commands not in this list will be blocked unless explicitly added
 * to the project's allowed commands configuration.
 */
export const ALLOWED_COMMANDS: readonly string[] = [
  'npm',
  'npx',
  'node',
  'git',
  'tsc',
  'eslint',
  'prettier',
  'vitest',
  'jest',
  'pnpm',
  'yarn',
  'cat',
  'ls',
  'find',
  'grep',
  'head',
  'tail',
  'wc',
  'echo',
  'mkdir',
  'cp',
  'mv',
  'touch',
  'diff',
] as const;

/**
 * List of shell commands and patterns that are always denied.
 * These commands are considered too dangerous for automated execution
 * and will be blocked regardless of project configuration.
 */
export const DENIED_COMMANDS: readonly string[] = [
  'rm -rf /',
  'sudo',
  'chmod 777',
  'curl | sh',
  'wget | sh',
  'eval',
  'exec',
  ':(){:|:&};:',
  'dd if=',
  'mkfs',
  'shutdown',
  'reboot',
  'kill -9',
  'pkill -9',
] as const;

/**
 * Maximum number of automatic retry attempts for a failed operation
 * before marking the task as permanently failed.
 */
export const MAX_RETRY_COUNT = 3 as const;

/**
 * Name of the hidden directory used by DevCore to store project-level
 * configuration, memory, and metadata within each managed project.
 */
export const DEVCORE_DIR = '.devcore' as const;
