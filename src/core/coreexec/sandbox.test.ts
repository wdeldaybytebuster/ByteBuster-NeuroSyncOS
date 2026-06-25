import { describe, it, expect } from 'vitest';
import { CommandSandbox } from './sandbox';
import path from 'path';

describe('CommandSandbox Security & Path Validation', () => {
  const sandbox = new CommandSandbox(__dirname, true);

  it('allows authorized commands (e.g. echo, but echo is not in ALLOWLIST, so we test with pwd)', async () => {
    const result = await sandbox.execute('pwd');
    expect(result.stdout).toBeDefined();
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it('rejects commands not in the allowlist', async () => {
    await expect(sandbox.execute('malicious_command')).rejects.toThrow(/not in the authorized allowlist/);
  });

  it('rejects shell injection operators', async () => {
    await expect(sandbox.execute('pwd && rm -rf /')).rejects.toThrow(/forbidden/);
    await expect(sandbox.execute('ls | grep secret')).rejects.toThrow(/forbidden/);
    await expect(sandbox.execute('ls > out.txt')).rejects.toThrow(/forbidden/);
  });

  it('rejects directory traversal attempts', async () => {
    await expect(sandbox.execute('cat ../../../etc/passwd')).rejects.toThrow(/Path traversal detected/);
    await expect(sandbox.execute('cat ../sandbox.ts')).rejects.toThrow(/Path traversal detected/);
  });

  it('rejects null byte injection', async () => {
    await expect(sandbox.execute('cat file.txt\0.js')).rejects.toThrow(/Null byte detected/);
  });

  it('rejects double URL encoded traversal', async () => {
    // %2e%2e%2f is ../
    await expect(sandbox.execute('cat %2e%2e%2f%2e%2e%2fetc/passwd')).rejects.toThrow(/Path traversal detected/);
  });
  
  it('allows safe local paths', async () => {
    // This file exists locally
    const result = await sandbox.execute('cat sandbox.ts');
    expect(result.stdout).toContain('CommandSandbox');
  });

  it('captures non-zero exit codes and returns stdout and stderr logs', async () => {
    try {
      // Execute a command that fails, such as listing a non-existent file
      await sandbox.execute('ls nonexistent_file_for_test.txt');
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('CommandExecutionError');
      expect(err.exitCode).toBeDefined();
      expect(err.exitCode).not.toBe(0);
      expect(err.stderr).toContain('No such file or directory');
      expect(err.stdout).toBeDefined();
    }
  });
});
