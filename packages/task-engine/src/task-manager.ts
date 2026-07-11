import {
  Task,
  TaskStatus,
  TaskPriority,
  ApprovalType,
  ApprovalRequest,
  ApprovalResponse,
  TestResult,
  ModelRole,
} from '@devcore/shared';
import { TaskStateMachine } from './state-machine.js';

/**
 * Manages the lifecycle of tasks including creation, status transitions,
 * approval workflows, and aggregate statistics.
 */
export class TaskManager {
  /** In-memory store of all tasks keyed by task ID. */
  private tasks: Map<string, Task> = new Map();

  /** Pending approval requests keyed by task ID. */
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();

  /**
   * Create a new task in the {@link TaskStatus.QUEUED} state.
   *
   * @param title       - Human-readable title for the task.
   * @param description - Detailed description of the work to be done.
   * @param projectId   - Identifier of the project this task belongs to.
   * @param priority    - Task priority level (defaults to {@link TaskPriority.MEDIUM}).
   * @returns The newly created {@link Task}.
   */
  createTask(
    title: string,
    description: string,
    projectId: string,
    priority: TaskPriority = TaskPriority.MEDIUM,
  ): Task {
    const now = new Date();
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      description,
      projectId,
      priority,
      status: TaskStatus.QUEUED,
      createdAt: now,
      updatedAt: now,
      testResults: [],
    };

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Retrieve a task by its ID.
   *
   * @param taskId - The unique identifier of the task.
   * @returns The {@link Task} if found, otherwise `undefined`.
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Return all tasks, optionally filtered by status, project, and/or priority.
   *
   * @param filter - Optional filter criteria.
   * @returns An array of matching {@link Task} objects.
   */
  getAllTasks(filter?: {
    status?: TaskStatus;
    projectId?: string;
    priority?: TaskPriority;
  }): Task[] {
    let results = [...this.tasks.values()];

    if (filter) {
      if (filter.status !== undefined) {
        results = results.filter((t) => t.status === filter.status);
      }
      if (filter.projectId !== undefined) {
        results = results.filter((t) => t.projectId === filter.projectId);
      }
      if (filter.priority !== undefined) {
        results = results.filter((t) => t.priority === filter.priority);
      }
    }

    return results;
  }

  /**
   * Transition a task to a new status via the {@link TaskStateMachine}.
   *
   * @param taskId    - The ID of the task to update.
   * @param newStatus - The target {@link TaskStatus}.
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found or the transition is invalid.
   */
  updateStatus(taskId: string, newStatus: TaskStatus): Task {
    const task = this.getTaskOrThrow(taskId);
    const updated = TaskStateMachine.transition(task, newStatus);
    this.tasks.set(taskId, updated);
    return updated;
  }

  /**
   * Assign a model to a task.
   *
   * @param taskId  - The ID of the task.
   * @param modelId - The identifier of the model to assign.
   * @param _role   - The role the model will play (reserved for future use).
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found.
   */
  assignModel(taskId: string, modelId: string, _role: ModelRole): Task {
    const task = this.getTaskOrThrow(taskId);
    const updated: Task = {
      ...task,
      assignedModel: modelId,
      updatedAt: new Date(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /**
   * Append a test result to a task's `testResults` array.
   *
   * @param taskId - The ID of the task.
   * @param result - The {@link TestResult} to record.
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found.
   */
  recordTestResult(taskId: string, result: TestResult): Task {
    const task = this.getTaskOrThrow(taskId);
    const testResults = [...(task.testResults ?? []), result];
    const updated: Task = {
      ...task,
      testResults,
      updatedAt: new Date(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /**
   * Create a pending approval request for a task.
   *
   * @param taskId      - The ID of the task requiring approval.
   * @param type        - The {@link ApprovalType} being requested.
   * @param title       - Short summary of the approval request.
   * @param description - Detailed explanation of what is being approved.
   * @param details     - Optional additional metadata.
   * @returns The created {@link ApprovalRequest}.
   */
  requestApproval(
    taskId: string,
    type: ApprovalType,
    title: string,
    description: string,
    details?: Record<string, unknown>,
  ): ApprovalRequest {
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
      taskId,
      type,
      title,
      description,
      details: details ?? {},
      createdAt: new Date(),
    };

    this.pendingApprovals.set(taskId, request);
    return request;
  }

  /**
   * Handle an approval or rejection response for a task.
   *
   * Approved transitions:
   * - `WAITING_FOR_PLAN_APPROVAL` → `IMPLEMENTING`
   * - `WAITING_FOR_CHANGE_APPROVAL` → `READY_TO_DEPLOY`
   * - `WAITING_FOR_DEPLOY_APPROVAL` → `DEPLOYING`
   *
   * Rejected transitions:
   * - `WAITING_FOR_PLAN_APPROVAL` → `PLANNING`
   * - `WAITING_FOR_CHANGE_APPROVAL` → `IMPLEMENTING`
   * - `WAITING_FOR_DEPLOY_APPROVAL` → `CANCELLED`
   *
   * @param taskId   - The ID of the task being responded to.
   * @param response - The {@link ApprovalResponse} (approved or rejected).
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found or no valid transition exists.
   */
  handleApproval(taskId: string, response: ApprovalResponse): Task {
    const task = this.getTaskOrThrow(taskId);

    let targetStatus: TaskStatus;

    if (response.approved) {
      switch (task.status) {
        case TaskStatus.WAITING_FOR_PLAN_APPROVAL:
          targetStatus = TaskStatus.IMPLEMENTING;
          break;
        case TaskStatus.WAITING_FOR_CHANGE_APPROVAL:
          targetStatus = TaskStatus.READY_TO_DEPLOY;
          break;
        case TaskStatus.WAITING_FOR_DEPLOY_APPROVAL:
          targetStatus = TaskStatus.DEPLOYING;
          break;
        default:
          throw new Error(
            `Cannot handle approval for task in status "${task.status}"`,
          );
      }
    } else {
      switch (task.status) {
        case TaskStatus.WAITING_FOR_PLAN_APPROVAL:
          targetStatus = TaskStatus.PLANNING;
          break;
        case TaskStatus.WAITING_FOR_CHANGE_APPROVAL:
          targetStatus = TaskStatus.IMPLEMENTING;
          break;
        case TaskStatus.WAITING_FOR_DEPLOY_APPROVAL:
          targetStatus = TaskStatus.CANCELLED;
          break;
        default:
          throw new Error(
            `Cannot handle rejection for task in status "${task.status}"`,
          );
      }
    }

    const updated = TaskStateMachine.transition(task, targetStatus);
    this.tasks.set(taskId, updated);
    this.pendingApprovals.delete(taskId);
    return updated;
  }

  /**
   * Pause a running task by transitioning it to {@link TaskStatus.PAUSED}.
   *
   * @param taskId - The ID of the task to pause.
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found or cannot be paused.
   */
  pause(taskId: string): Task {
    return this.updateStatus(taskId, TaskStatus.PAUSED);
  }

  /**
   * Resume a paused task by transitioning it back to {@link TaskStatus.QUEUED}.
   *
   * @param taskId - The ID of the task to resume.
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found or is not paused.
   */
  resume(taskId: string): Task {
    return this.updateStatus(taskId, TaskStatus.QUEUED);
  }

  /**
   * Cancel a task by transitioning it to {@link TaskStatus.CANCELLED}.
   *
   * @param taskId - The ID of the task to cancel.
   * @returns The updated {@link Task}.
   * @throws {Error} If the task is not found or cannot be cancelled.
   */
  cancel(taskId: string): Task {
    return this.updateStatus(taskId, TaskStatus.CANCELLED);
  }

  /**
   * Compute aggregate statistics across all managed tasks.
   *
   * @returns An object containing total count, breakdown by status, and
   *          the completion rate (0–1).
   */
  getTaskStats(): {
    total: number;
    byStatus: Partial<Record<TaskStatus, number>>;
    completionRate: number;
  } {
    const byStatus: Partial<Record<TaskStatus, number>> = {};
    let total = 0;

    for (const task of this.tasks.values()) {
      total++;
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    }

    const completed = byStatus[TaskStatus.COMPLETED] ?? 0;
    const completionRate = total > 0 ? completed / total : 0;

    return { total, byStatus, completionRate };
  }

  /**
   * Retrieve a task or throw if it does not exist.
   *
   * @param taskId - The ID of the task to look up.
   * @returns The {@link Task}.
   * @throws {Error} If no task with the given ID exists.
   */
  private getTaskOrThrow(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }
}
