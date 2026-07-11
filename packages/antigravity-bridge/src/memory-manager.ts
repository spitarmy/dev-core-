import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProjectMemory, Decision } from '@devcore/shared';
import { DEVCORE_DIR } from '@devcore/shared';

/**
 * Manages project memory stored in the `.devcore/` directory.
 *
 * Handles persistence of project conventions, architecture notes,
 * tech stack information, and decision history.
 */
export class MemoryManager {
  private readonly workspaceRoot: string;
  private readonly devCoreDir: string;

  /**
   * Creates a new MemoryManager instance.
   * @param workspaceRoot - Absolute path to the workspace root directory.
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.devCoreDir = join(workspaceRoot, DEVCORE_DIR);
  }

  /**
   * Initializes the `.devcore/` directory with default files.
   *
   * Creates the directory structure and writes initial `memory.json`,
   * `conventions.md`, `architecture.md`, and `.gitkeep` files.
   */
  async initializeMemory(): Promise<void> {
    await mkdir(this.devCoreDir, { recursive: true });

    const defaultMemory = this.getDefaultMemory();
    await writeFile(
      join(this.devCoreDir, 'memory.json'),
      JSON.stringify(defaultMemory, null, 2),
      'utf-8',
    );

    await writeFile(
      join(this.devCoreDir, 'conventions.md'),
      '# Project Conventions\n\n_No conventions recorded yet._\n',
      'utf-8',
    );

    await writeFile(
      join(this.devCoreDir, 'architecture.md'),
      '# Architecture\n\n_No architecture notes recorded yet._\n',
      'utf-8',
    );

    await writeFile(join(this.devCoreDir, '.gitkeep'), '', 'utf-8');
  }

  /**
   * Loads the current project memory from disk.
   *
   * @returns The parsed {@link ProjectMemory}, or a default empty memory
   *          if the file does not exist.
   */
  async loadMemory(): Promise<ProjectMemory> {
    try {
      const raw = await readFile(
        join(this.devCoreDir, 'memory.json'),
        'utf-8',
      );
      return JSON.parse(raw) as ProjectMemory;
    } catch {
      return this.getDefaultMemory();
    }
  }

  /**
   * Merges a partial update into the current project memory.
   *
   * The `lastUpdated` timestamp is automatically refreshed.
   *
   * @param update - Partial fields to merge into the existing memory.
   * @returns The full, updated {@link ProjectMemory}.
   */
  async updateMemory(update: Partial<ProjectMemory>): Promise<ProjectMemory> {
    const current = await this.loadMemory();
    const updated: ProjectMemory = {
      ...current,
      ...update,
      lastUpdated: new Date().toISOString(),
    };

    await this.ensureDevCoreDir();
    await writeFile(
      join(this.devCoreDir, 'memory.json'),
      JSON.stringify(updated, null, 2),
      'utf-8',
    );

    return updated;
  }

  /**
   * Records a new decision in project memory.
   *
   * Decisions are stored in `recentDecisions` with a maximum of 100 entries;
   * the oldest entries are dropped when the limit is exceeded.
   *
   * @param description - Short description of the decision.
   * @param decidedBy   - Whether the decision was made by a human or AI.
   * @param rationale   - Reasoning behind the decision.
   * @returns The newly created {@link Decision}.
   */
  async addDecision(
    description: string,
    decidedBy: 'human' | 'ai',
    rationale: string,
  ): Promise<Decision> {
    const decision: Decision = {
      id: randomUUID(),
      description,
      decidedBy,
      rationale,
      timestamp: new Date().toISOString(),
    };

    const memory = await this.loadMemory();
    memory.recentDecisions.push(decision);

    // Keep a maximum of 100 decisions
    if (memory.recentDecisions.length > 100) {
      memory.recentDecisions = memory.recentDecisions.slice(-100);
    }

    await this.updateMemory({ recentDecisions: memory.recentDecisions });
    return decision;
  }

  /**
   * Replaces the project conventions list and writes a Markdown summary.
   *
   * @param conventions - Array of convention strings.
   */
  async updateConventions(conventions: string[]): Promise<void> {
    await this.updateMemory({ conventions });

    const markdown =
      '# Project Conventions\n\n' +
      conventions.map((c) => `- ${c}`).join('\n') +
      '\n';

    await this.ensureDevCoreDir();
    await writeFile(
      join(this.devCoreDir, 'conventions.md'),
      markdown,
      'utf-8',
    );
  }

  /**
   * Updates the architecture description and writes it to Markdown.
   *
   * @param architecture - Free-form architecture documentation string.
   */
  async updateArchitecture(architecture: string): Promise<void> {
    await this.updateMemory({ architecture });

    const markdown = `# Architecture\n\n${architecture}\n`;

    await this.ensureDevCoreDir();
    await writeFile(
      join(this.devCoreDir, 'architecture.md'),
      markdown,
      'utf-8',
    );
  }

  /**
   * Updates the recorded tech stack list in project memory.
   *
   * @param techStack - Array of technology/framework names.
   */
  async updateTechStack(techStack: string[]): Promise<void> {
    await this.updateMemory({ techStack });
  }

  /**
   * Resolves the absolute path to a file inside the `.devcore/` directory.
   *
   * @param filename - Name of the file relative to `.devcore/`.
   * @returns The absolute path.
   */
  getMemoryFilePath(filename: string): string {
    return join(this.devCoreDir, filename);
  }

  /**
   * Ensures the `.devcore/` directory exists, creating it if necessary.
   */
  private async ensureDevCoreDir(): Promise<void> {
    await mkdir(this.devCoreDir, { recursive: true });
  }

  /**
   * Returns a default, empty {@link ProjectMemory} structure.
   */
  private getDefaultMemory(): ProjectMemory {
    const now = new Date().toISOString();
    return {
      conventions: [],
      architecture: '',
      techStack: [],
      recentDecisions: [],
      lastUpdated: now,
      createdAt: now,
    };
  }
}
