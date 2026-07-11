import {
  Task,
  TaskStatus,
  TaskAction,
} from '@devcore/shared';

/**
 * Static state machine governing valid task status transitions and available actions.
 *
 * All methods are static — this class is never instantiated.
 */
export class TaskStateMachine {
  /** Map of each status to the statuses it may legally transition to. */
  private static readonly VALID_TRANSITIONS: ReadonlyMap<TaskStatus, readonly TaskStatus[]> = new Map<TaskStatus, readonly TaskStatus[]>([
    [TaskStatus.QUEUED, [TaskStatus.ANALYZING, TaskStatus.CANCELLED]],
    [TaskStatus.ANALYZING, [TaskStatus.PLANNING, TaskStatus.FAILED, TaskStatus.CANCELLED]],
    [TaskStatus.PLANNING, [TaskStatus.WAITING_FOR_PLAN_APPROVAL, TaskStatus.FAILED, TaskStatus.CANCELLED]],
    [TaskStatus.WAITING_FOR_PLAN_APPROVAL, [TaskStatus.IMPLEMENTING, TaskStatus.PLANNING, TaskStatus.CANCELLED, TaskStatus.PAUSED]],
    [TaskStatus.IMPLEMENTING, [TaskStatus.TESTING, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.PAUSED]],
    [TaskStatus.TESTING, [TaskStatus.REVIEWING, TaskStatus.IMPLEMENTING, TaskStatus.FAILED, TaskStatus.CANCELLED]],
    [TaskStatus.REVIEWING, [TaskStatus.WAITING_FOR_CHANGE_APPROVAL, TaskStatus.IMPLEMENTING, TaskStatus.FAILED, TaskStatus.CANCELLED]],
    [TaskStatus.WAITING_FOR_CHANGE_APPROVAL, [TaskStatus.READY_TO_DEPLOY, TaskStatus.IMPLEMENTING, TaskStatus.CANCELLED, TaskStatus.PAUSED]],
    [TaskStatus.READY_TO_DEPLOY, [TaskStatus.WAITING_FOR_DEPLOY_APPROVAL, TaskStatus.CANCELLED]],
    [TaskStatus.WAITING_FOR_DEPLOY_APPROVAL, [TaskStatus.DEPLOYING, TaskStatus.CANCELLED, TaskStatus.PAUSED]],
    [TaskStatus.DEPLOYING, [TaskStatus.COMPLETED, TaskStatus.FAILED]],
    [TaskStatus.COMPLETED, []],
    [TaskStatus.PAUSED, [TaskStatus.QUEUED, TaskStatus.CANCELLED]],
    [TaskStatus.FAILED, [TaskStatus.QUEUED, TaskStatus.CANCELLED]],
    [TaskStatus.CANCELLED, []],
  ]);

  /** Mapping from each status to the user-facing actions available in that state. */
  private static readonly STATUS_ACTIONS: ReadonlyMap<TaskStatus, readonly TaskAction[]> = new Map<TaskStatus, readonly TaskAction[]>([
    [TaskStatus.QUEUED, [TaskAction.CANCEL]],
    [TaskStatus.ANALYZING, [TaskAction.CANCEL]],
    [TaskStatus.PLANNING, [TaskAction.CANCEL]],
    [TaskStatus.WAITING_FOR_PLAN_APPROVAL, [TaskAction.APPROVE, TaskAction.REJECT, TaskAction.REQUEST_CHANGES, TaskAction.PAUSE, TaskAction.CANCEL]],
    [TaskStatus.IMPLEMENTING, [TaskAction.PAUSE, TaskAction.CANCEL]],
    [TaskStatus.TESTING, [TaskAction.CANCEL, TaskAction.RERUN_TESTS]],
    [TaskStatus.REVIEWING, [TaskAction.CANCEL, TaskAction.RERUN_REVIEW]],
    [TaskStatus.WAITING_FOR_CHANGE_APPROVAL, [TaskAction.APPROVE, TaskAction.REJECT, TaskAction.REQUEST_CHANGES, TaskAction.PAUSE, TaskAction.CANCEL]],
    [TaskStatus.READY_TO_DEPLOY, [TaskAction.APPROVE_DEPLOY, TaskAction.CANCEL]],
    [TaskStatus.WAITING_FOR_DEPLOY_APPROVAL, [TaskAction.APPROVE_DEPLOY, TaskAction.APPROVE_ROLLBACK, TaskAction.PAUSE, TaskAction.CANCEL]],
    [TaskStatus.DEPLOYING, []],
    [TaskStatus.COMPLETED, []],
    [TaskStatus.PAUSED, [TaskAction.RESUME, TaskAction.CANCEL]],
    [TaskStatus.FAILED, [TaskAction.RESUME, TaskAction.CANCEL]],
    [TaskStatus.CANCELLED, []],
  ]);

  /** Terminal statuses that cannot transition further (except retry/cancel for FAILED). */
  private static readonly TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
    TaskStatus.FAILED,
  ]);

  /** Statuses where the workflow is blocked waiting for human intervention. */
  private static readonly WAITING_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
    TaskStatus.WAITING_FOR_PLAN_APPROVAL,
    TaskStatus.WAITING_FOR_CHANGE_APPROVAL,
    TaskStatus.WAITING_FOR_DEPLOY_APPROVAL,
  ]);

  // Prevent instantiation
  private constructor() {}

  /**
   * Check whether a transition from one status to another is valid.
   *
   * @param from - The current task status.
   * @param to   - The desired target status.
   * @returns `true` if the transition is allowed.
   */
  static canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const allowed = TaskStateMachine.VALID_TRANSITIONS.get(from);
    return allowed !== undefined && allowed.includes(to);
  }

  /**
   * Perform a validated status transition, returning a **new** Task object.
   *
   * If the target status is `COMPLETED`, the returned task will also have its
   * `completedAt` timestamp set.
   *
   * @param task - The current task to transition.
   * @param to   - The desired target status.
   * @returns A new {@link Task} with the updated status and timestamps.
   * @throws {Error} If the transition is not valid.
   */
  static transition(task: Task, to: TaskStatus): Task {
    if (!TaskStateMachine.canTransition(task.status, to)) {
      throw new Error(
        `Invalid task transition: cannot move from "${task.status}" to "${to}"`,
      );
    }

    const now = new Date();
    return {
      ...task,
      status: to,
      updatedAt: now,
      ...(to === TaskStatus.COMPLETED ? { completedAt: now } : {}),
    };
  }

  /**
   * Return the list of user-facing actions available for a given status.
   *
   * @param status - The current task status.
   * @returns An array of {@link TaskAction} values (may be empty).
   */
  static getAvailableActions(status: TaskStatus): TaskAction[] {
    return [...(TaskStateMachine.STATUS_ACTIONS.get(status) ?? [])];
  }

  /**
   * Determine whether a status is terminal (no further automatic transitions).
   *
   * @param status - The status to check.
   * @returns `true` if the status is `COMPLETED`, `CANCELLED`, or `FAILED`.
   */
  static isTerminal(status: TaskStatus): boolean {
    return TaskStateMachine.TERMINAL_STATUSES.has(status);
  }

  /**
   * Determine whether a status represents a human-approval gate.
   *
   * @param status - The status to check.
   * @returns `true` if the status is any of the `WAITING_FOR_*` statuses.
   */
  static isWaitingForHuman(status: TaskStatus): boolean {
    return TaskStateMachine.WAITING_STATUSES.has(status);
  }
}
