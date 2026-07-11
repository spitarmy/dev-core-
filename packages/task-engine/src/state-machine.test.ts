import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStateMachine } from './state-machine.js';
import { TaskStatus, TaskAction } from '@devcore/shared';

describe('TaskStateMachine', () => {
  describe('canTransition', () => {
    it('allows valid transitions', () => {
      expect(TaskStateMachine.canTransition(TaskStatus.QUEUED, TaskStatus.ANALYZING)).toBe(true);
      expect(TaskStateMachine.canTransition(TaskStatus.ANALYZING, TaskStatus.PLANNING)).toBe(true);
      expect(TaskStateMachine.canTransition(TaskStatus.WAITING_FOR_PLAN_APPROVAL, TaskStatus.IMPLEMENTING)).toBe(true);
    });

    it('denies invalid transitions', () => {
      expect(TaskStateMachine.canTransition(TaskStatus.QUEUED, TaskStatus.IMPLEMENTING)).toBe(false);
      expect(TaskStateMachine.canTransition(TaskStatus.COMPLETED, TaskStatus.ANALYZING)).toBe(false);
    });
  });

  describe('transition', () => {
    const mockTask = {
      id: 'task-1',
      projectId: 'proj-1',
      title: 'Test',
      description: 'Test task',
      status: TaskStatus.QUEUED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns new task with next status for valid transition', () => {
      const nextTask = TaskStateMachine.transition(mockTask as any, TaskStatus.ANALYZING);
      expect(nextTask.status).toBe(TaskStatus.ANALYZING);
      expect(nextTask.id).toBe(mockTask.id);
    });

    it('throws error for invalid transition', () => {
      expect(() => {
        TaskStateMachine.transition(mockTask as any, TaskStatus.IMPLEMENTING);
      }).toThrow('Invalid task transition');
    });
  });

  describe('isTerminal', () => {
    it('returns true for terminal states', () => {
      expect(TaskStateMachine.isTerminal(TaskStatus.COMPLETED)).toBe(true);
      expect(TaskStateMachine.isTerminal(TaskStatus.FAILED)).toBe(true);
      expect(TaskStateMachine.isTerminal(TaskStatus.CANCELLED)).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(TaskStateMachine.isTerminal(TaskStatus.QUEUED)).toBe(false);
      expect(TaskStateMachine.isTerminal(TaskStatus.IMPLEMENTING)).toBe(false);
    });
  });
});
