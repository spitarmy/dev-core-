import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BRANCH_PREFIX } from '@devcore/shared';

const execFileAsync = promisify(execFile);

/** Snapshot of the current Git repository state. */
export interface GitState {
  /** Whether the working directory is inside a Git repository. */
  isGitRepo: boolean;
  /** Name of the currently checked-out branch. */
  currentBranch: string;
  /** Whether there are uncommitted changes in the working tree. */
  hasUncommittedChanges: boolean;
  /** Inverse of `hasUncommittedChanges` — `true` when the tree is clean. */
  isClean: boolean;
  /** List of configured remote names (e.g. `["origin"]`). */
  remotes: string[];
}

/** Options for creating a pull request via the GitHub CLI. */
export interface PROptions {
  /** Title of the pull request. */
  title: string;
  /** Body / description of the pull request. */
  body: string;
  /** Target branch to merge into. Defaults to `"develop"`. */
  baseBranch?: string;
  /** Whether to create the PR as a draft. */
  draft?: boolean;
  /** Labels to apply to the pull request. */
  labels?: string[];
}

/** Result returned after successfully creating a pull request. */
export interface PRResult {
  /** URL of the created pull request. */
  url: string;
  /** PR number. */
  number: number;
  /** Title of the created pull request. */
  title: string;
}

/**
 * Provides high-level Git operations scoped to a workspace.
 *
 * Wraps common Git and GitHub CLI commands with opinionated defaults
 * such as automatic branch prefixing and commit message tagging.
 */
export class GitOperations {
  private readonly workspaceRoot: string;
  private readonly branchPrefix: string;

  /**
   * Creates a new GitOperations instance.
   * @param workspaceRoot - Absolute path to the workspace root directory.
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.branchPrefix = BRANCH_PREFIX;
  }

  /**
   * Creates and checks out a new branch using the devcore naming convention.
   *
   * The branch name is constructed as `{BRANCH_PREFIX}{taskId}-{sanitizedSlug}`.
   *
   * @param taskId - Unique identifier for the task.
   * @param slug   - Human-readable slug describing the work.
   * @returns The full name of the created branch.
   */
  async createBranch(taskId: string, slug: string): Promise<string> {
    const sanitizedSlug = this.sanitizeSlug(slug);
    const branchName = `${this.branchPrefix}${taskId}-${sanitizedSlug}`;
    await this.execGit(['checkout', '-b', branchName]);
    return branchName;
  }

  /**
   * Inspects the current Git repository state.
   *
   * Gathers information about the current branch, uncommitted changes,
   * and configured remotes. Returns safe defaults when the working
   * directory is not a Git repository.
   *
   * @returns A {@link GitState} snapshot.
   */
  async checkGitState(): Promise<GitState> {
    try {
      await this.execGit(['rev-parse', '--is-inside-work-tree']);

      const currentBranch = await this.execGit([
        'branch',
        '--show-current',
      ]);

      const statusOutput = await this.execGit(['status', '--porcelain']);
      const hasUncommittedChanges = statusOutput.length > 0;

      let remotes: string[] = [];
      try {
        const remotesOutput = await this.execGit(['remote']);
        remotes = remotesOutput
          .split('\n')
          .filter((r) => r.length > 0);
      } catch {
        // No remotes configured
      }

      return {
        isGitRepo: true,
        currentBranch,
        hasUncommittedChanges,
        isClean: !hasUncommittedChanges,
        remotes,
      };
    } catch {
      return {
        isGitRepo: false,
        currentBranch: '',
        hasUncommittedChanges: false,
        isClean: true,
        remotes: [],
      };
    }
  }

  /**
   * Stashes uncommitted changes to protect them before risky operations.
   *
   * If the working tree is dirty, creates an auto-stash with a
   * timestamped name. If the tree is already clean, no action is taken.
   *
   * @returns An object indicating whether changes were stashed and
   *          the stash name used.
   */
  async protectUncommittedChanges(): Promise<{
    protected: boolean;
    stashName?: string;
  }> {
    const state = await this.checkGitState();

    if (!state.hasUncommittedChanges) {
      return { protected: false };
    }

    const stashName = `devcore-auto-stash-${Date.now()}`;
    await this.execGit(['stash', 'push', '-m', stashName]);

    return { protected: true, stashName };
  }

  /**
   * Stages files and creates a commit with a `[devcore]` prefix.
   *
   * If specific files are provided they are staged individually;
   * otherwise all changes are staged via `git add -A`.
   *
   * @param message - Commit message (will be prefixed with `[devcore] `).
   * @param files   - Optional list of file paths to stage.
   * @returns The commit hash and the full prefixed message.
   */
  async createCommit(
    message: string,
    files?: string[],
  ): Promise<{ commitHash: string; message: string }> {
    if (files && files.length > 0) {
      await this.execGit(['add', ...files]);
    } else {
      await this.execGit(['add', '-A']);
    }

    const prefixedMessage = `[devcore] ${message}`;
    await this.execGit(['commit', '-m', prefixedMessage]);

    const commitHash = await this.execGit(['rev-parse', 'HEAD']);

    return { commitHash, message: prefixedMessage };
  }

  /**
   * Creates a pull request using the GitHub CLI (`gh`).
   *
   * By default the PR targets `develop` rather than `main`/`master`
   * unless an explicit `baseBranch` is provided.
   *
   * @param options - Configuration for the pull request.
   * @returns A {@link PRResult} with the URL, number, and title.
   * @throws If `gh` is not installed or the command fails.
   */
  async createPR(options: PROptions): Promise<PRResult> {
    const baseBranch = options.baseBranch ?? 'develop';

    const args: string[] = [
      'pr',
      'create',
      '--title',
      options.title,
      '--body',
      options.body,
      '--base',
      baseBranch,
    ];

    if (options.draft) {
      args.push('--draft');
    }

    if (options.labels && options.labels.length > 0) {
      for (const label of options.labels) {
        args.push('--label', label);
      }
    }

    const output = await this.execGh(args);

    // `gh pr create` typically outputs the PR URL as the last line
    const url = output.trim();
    const numberMatch = url.match(/\/pull\/(\d+)$/);
    const prNumber = numberMatch ? parseInt(numberMatch[1], 10) : 0;

    return {
      url,
      number: prNumber,
      title: options.title,
    };
  }

  /**
   * Checks whether the given branch name is a primary branch
   * (`main` or `master`).
   *
   * @param branchName - Branch name to test.
   * @returns `true` if the branch is `main` or `master`.
   */
  isMainBranch(branchName: string): boolean {
    return branchName === 'main' || branchName === 'master';
  }

  /**
   * Converts an arbitrary string into a URL/branch-safe slug.
   *
   * Lowercases the input, replaces non-alphanumeric characters with
   * hyphens, collapses consecutive hyphens, trims leading/trailing
   * hyphens, and caps the result at 50 characters.
   *
   * @param input - Raw string to sanitize.
   * @returns A sanitized slug suitable for branch names.
   */
  sanitizeSlug(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
  }

  /**
   * Executes a Git command in the workspace root.
   *
   * @param args - Arguments to pass to `git`.
   * @returns The trimmed stdout output.
   * @throws A descriptive error if the command fails.
   */
  private async execGit(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.workspaceRoot,
      });
      return stdout.trim();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`git ${args.join(' ')} failed: ${message}`);
    }
  }

  /**
   * Executes a GitHub CLI (`gh`) command in the workspace root.
   *
   * @param args - Arguments to pass to `gh`.
   * @returns The trimmed stdout output.
   * @throws A descriptive error if the command fails.
   */
  private async execGh(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('gh', args, {
        cwd: this.workspaceRoot,
      });
      return stdout.trim();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new Error(`gh ${args.join(' ')} failed: ${message}`);
    }
  }
}
