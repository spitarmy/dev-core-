/**
 * @module @devcore/shared/types/task
 * Task-related type definitions for the DevCore platform.
 * Defines the core data structures for task lifecycle management,
 * including statuses, priorities, actions, and result tracking.
 */

/**
 * Represents the current status of a task in the DevCore pipeline.
 * Tasks progress through these statuses as they move from creation
 * to completion, with approval gates at key checkpoints.
 */
export enum TaskStatus {
  /** Task is queued and waiting to be picked up by an AI agent. */
  QUEUED = 'queued',
  /** Task is being analyzed to understand requirements and scope. */
  ANALYZING = 'analyzing',
  /** AI agent is generating an implementation plan for the task. */
  PLANNING = 'planning',
  /** Plan has been generated and is awaiting human approval. */
  WAITING_FOR_PLAN_APPROVAL = 'waiting_for_plan_approval',
  /** Approved plan is being implemented by the AI agent. */
  IMPLEMENTING = 'implementing',
  /** Implementation is being tested against defined criteria. */
  TESTING = 'testing',
  /** Code changes are being reviewed for quality and correctness. */
  REVIEWING = 'reviewing',
  /** Code changes have been reviewed and are awaiting human approval. */
  WAITING_FOR_CHANGE_APPROVAL = 'waiting_for_change_approval',
  /** All checks passed; task is ready for deployment. */
  READY_TO_DEPLOY = 'ready_to_deploy',
  /** Deployment is pending human approval. */
  WAITING_FOR_DEPLOY_APPROVAL = 'waiting_for_deploy_approval',
  /** Task changes are actively being deployed. */
  DEPLOYING = 'deploying',
  /** Task has been successfully completed and deployed. */
  COMPLETED = 'completed',
  /** Task has been temporarily paused by a human operator. */
  PAUSED = 'paused',
  /** Task encountered an unrecoverable error during processing. */
  FAILED = 'failed',
  /** Task was explicitly cancelled by a human operator. */
  CANCELLED = 'cancelled',
}

/**
 * Priority level for a task, determining its position in the processing queue.
 * Higher priority tasks are processed before lower priority ones.
 */
export enum TaskPriority {
  /** Low priority — processed when no higher priority tasks are pending. */
  LOW = 'low',
  /** Medium priority — standard processing order (default). */
  MEDIUM = 'medium',
  /** High priority — processed before low and medium priority tasks. */
  HIGH = 'high',
  /** Urgent priority — processed immediately, preempting other tasks. */
  URGENT = 'urgent',
}

/**
 * Actions that can be performed on a task by a human operator.
 * These actions drive task state transitions and control the pipeline flow.
 */
export enum TaskAction {
  /** Approve the current pending item (plan, changes, or deployment). */
  APPROVE = 'approve',
  /** Reject the current pending item and return to a previous stage. */
  REJECT = 'reject',
  /** Request modifications to the current plan or implementation. */
  REQUEST_CHANGES = 'request_changes',
  /** Pause the task, halting all automated processing. */
  PAUSE = 'pause',
  /** Resume a previously paused task. */
  RESUME = 'resume',
  /** Cancel the task entirely, stopping all processing. */
  CANCEL = 'cancel',
  /** Change the priority level of the task. */
  REPRIORITIZE = 'reprioritize',
  /** Re-run the code review process on the current implementation. */
  RERUN_REVIEW = 'rerun_review',
  /** Re-run the test suite on the current implementation. */
  RERUN_TESTS = 'rerun_tests',
  /** Approve the deployment of changes to production. */
  APPROVE_DEPLOY = 'approve_deploy',
  /** Approve a rollback of previously deployed changes. */
  APPROVE_ROLLBACK = 'approve_rollback',
}

/**
 * Represents the result of a single test execution.
 */
export interface TestResult {
  /** The name or identifier of the test case. */
  name: string;
  /** Whether the test passed successfully. */
  passed: boolean;
  /** Duration of the test execution in milliseconds. */
  duration: number;
  /** Error message if the test failed. */
  error?: string;
}

/**
 * Represents the estimated or actual cost of an AI operation,
 * broken down by token usage and monetary cost.
 */
export interface CostEstimate {
  /** Number of input tokens consumed. */
  inputTokens: number;
  /** Number of output tokens generated. */
  outputTokens: number;
  /** Estimated monetary cost of the operation. */
  estimatedCost: number;
  /** Currency code for the cost (defaults to 'USD'). */
  currency: string;
}

/**
 * Core task entity representing a unit of work in the DevCore platform.
 * Tasks are created by users, processed by AI agents, and move through
 * a defined lifecycle with human approval gates.
 */
export interface Task {
  /** Unique identifier for the task (UUID v4). */
  id: string;
  /** Human-readable title summarizing the task objective. */
  title: string;
  /** Detailed description of the task requirements and acceptance criteria. */
  description: string;
  /** Current status of the task in the processing pipeline. */
  status: TaskStatus;
  /** Priority level determining processing order. */
  priority: TaskPriority;
  /** Identifier of the AI model currently assigned to process this task. */
  assignedModel?: string;
  /** Identifier of the project this task belongs to. */
  projectId: string;
  /** Git branch name associated with this task's changes. */
  branchName?: string;
  /** Summary of the generated implementation plan. */
  planSummary?: string;
  /** Results from test execution, if tests have been run. */
  testResults?: TestResult[];
  /** Timestamp when the task was created. */
  createdAt: Date;
  /** Timestamp when the task was last updated. */
  updatedAt: Date;
  /** Timestamp when the task was completed, if applicable. */
  completedAt?: Date;
  /** Estimated or actual cost of processing this task. */
  costEstimate?: CostEstimate;
  /** Additional key-value metadata associated with the task. */
  metadata?: Record<string, unknown>;
}
