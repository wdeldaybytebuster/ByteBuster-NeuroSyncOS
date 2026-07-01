import { spawn } from 'child_process';
import path from 'path';
import { PathValidator } from '../coreexec/path-validator';

/**
 * Export the allowlist so dispatch.ts (the §2.1 prompt classifier) can mirror
 * it without drift. Update both files together when adding new commands.
 */
export class CommandExecutionError extends Error {
  constructor(
    public exitCode: number,
    public stdout: string,
    public stderr: string
  ) {
    super(`Process exited with code ${exitCode}: ${stderr}`);
    this.name = 'CommandExecutionError';
    Object.setPrototypeOf(this, CommandExecutionError.prototype);
  }
}

export const ALLOWLIST: ReadonlySet<string> = new Set([
  'ls', 'cat', 'grep', 'pwd', 'diff', 'find', 'head', 'tail', 'wc', 'sort',
  'uniq', 'stat', 'file', 'du', 'df', 'lsblk', 'lscpu', 'uname', 'whoami', 'date',
  'python', 'python3' // Authorized explicitly for Scrapling/Cloak support
]);

export class CommandSandbox {
  private baseDir: string;

  constructor(projectIdOrWorkspacePath?: string, isWorkspacePath = false) {
    if (isWorkspacePath && projectIdOrWorkspacePath) {
      this.baseDir = projectIdOrWorkspacePath;
    } else if (projectIdOrWorkspacePath) {
      this.baseDir = CommandSandbox.resolveCwd(projectIdOrWorkspacePath);
    } else {
      // Lock execution to a specific directory (CWD Lock) - Legacy fallback
      this.baseDir = process.cwd();
    }
  }

  /**
   * Resolve the CWD for sandboxed execution from a project ID.
   * Priority: project_root_path (user's actual source dir) > workspace_path (system sandbox dir).
   * This locks all allowlisted commands to the project's physical directory,
   * preventing path-traversal attacks from escaping the project boundary.
   */
  public static resolveCwd(projectId: string): string {
    const { db } = require('../basevault/db');
    const project = db.prepare('SELECT project_root_path, workspace_path FROM projects WHERE id = ?').get(projectId) as { project_root_path: string | null; workspace_path: string | null } | undefined;

    if (!project) {
      throw new Error(`Sandbox Error: Project ${projectId} not found.`);
    }

    // Prefer project_root_path (user-defined source directory) — this is the real code boundary
    if (project.project_root_path) {
      return project.project_root_path;
    }

    // Fallback to workspace_path (system-created .data/workspaces/<id>)
    if (project.workspace_path) {
      return project.workspace_path;
    }

    throw new Error(`Sandbox Error: Project ${projectId} has no project_root_path or workspace_path configured.`);
  }

  /**
   * Securely executes a command if it passes the Zero-Trust allowlist.
   */
  public async execute(commandLine: string): Promise<{ stdout: string; stderr: string }> {
    const parts = commandLine.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) throw new Error("Sandbox Error: Empty command");

    const rootCommand = parts[0] as string;

    // 1. Verify Allowlist
    if (!ALLOWLIST.has(rootCommand)) {
      throw new Error(`Sandbox Security Violation: Command '${rootCommand}' is not in the authorized allowlist.`);
    }

    // 2. Prevent shell injection operators
    const maliciousChars = ['|', '&&', ';', '||', '>', '<', '$', '`'];
    for (const char of maliciousChars) {
      if (commandLine.includes(char)) {
        throw new Error(`Sandbox Security Violation: Shell operators like '${char}' are forbidden.`);
      }
    }

    // 2.5 Strict Path Containment Validation
    for (const arg of parts.slice(1)) {
      PathValidator.validateContainment(this.baseDir, arg);
    }

    // 3. Execute with strict network isolation using bubblewrap (since unshare --net fails locally)
    return new Promise((resolve, reject) => {
      const child = spawn('bwrap', ['--unshare-net', '--dev-bind', '/', '/', rootCommand, ...parts.slice(1)], {
        cwd: this.baseDir,
        env: { ...process.env },
        shell: false
      }) as any;

      let stdout = '';
      let stderr = '';
      
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Sandbox Error: Process timed out after 30s`));
      }, 30000);
      timeout.unref();

      child.stdout.on('data', (data: any) => stdout += data.toString());
      child.stderr.on('data', (data: any) => stderr += data.toString());

      child.on('close', (code: number) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new CommandExecutionError(code, stdout, stderr));
        } else {
          resolve({ stdout, stderr });
        }
      });

      child.on('error', (err: any) => {
        reject(new Error(`Failed to start process: ${err.message}`));
      });
    });
  }
}
