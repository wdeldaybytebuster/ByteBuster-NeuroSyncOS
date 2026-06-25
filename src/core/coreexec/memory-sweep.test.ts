import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { sweepOrphanedWorkspaces } from './memory-sweep';
import { db } from '../basevault/db';

vi.mock('fs');
vi.mock('../basevault/db', () => ({
  db: {
    prepare: vi.fn()
  }
}));

describe('MemorySweepScheduler', () => {
  const workspacesDir = path.join(process.cwd(), '.data', 'workspaces');
  const now = Date.now();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    (fs.existsSync as any).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should not sweep directories created within the last 30 seconds', () => {
    (fs.readdirSync as any).mockReturnValue([
      { name: 'task-1', isDirectory: () => true }
    ]);
    (fs.statSync as any).mockReturnValue({ ctimeMs: now - 10000 }); // 10s ago

    sweepOrphanedWorkspaces();

    expect(fs.rmSync).not.toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('should sweep directories stuck in claimed state older than 30 seconds', () => {
    (fs.readdirSync as any).mockReturnValue([
      { name: 'task-stuck', isDirectory: () => true }
    ]);
    (fs.statSync as any).mockReturnValue({ ctimeMs: now - 35000 }); // 35s ago
    
    const prepareMock = vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ status: 'claimed' })
    });
    (db.prepare as any) = prepareMock;

    sweepOrphanedWorkspaces();

    expect(prepareMock).toHaveBeenCalledWith('SELECT status FROM tasks WHERE id = ?');
    expect(fs.rmSync).toHaveBeenCalledWith(path.join(workspacesDir, 'task-stuck'), { recursive: true, force: true });
  });

  it('should not sweep directories that have completed tasks', () => {
    (fs.readdirSync as any).mockReturnValue([
      { name: 'task-completed', isDirectory: () => true }
    ]);
    (fs.statSync as any).mockReturnValue({ ctimeMs: now - 35000 });
    
    const prepareMock = vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ status: 'completed' })
    });
    (db.prepare as any) = prepareMock;

    sweepOrphanedWorkspaces();

    expect(fs.rmSync).not.toHaveBeenCalled();
  });
});
