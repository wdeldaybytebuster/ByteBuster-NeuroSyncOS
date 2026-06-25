import fs from 'fs';
import path from 'path';
import { db } from '../basevault/db';

export function sweepOrphanedWorkspaces(): void {
  const workspacesDir = path.join(process.cwd(), '.data', 'workspaces');
  
  if (!fs.existsSync(workspacesDir)) {
    return;
  }

  const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const taskId = entry.name;
    const dirPath = path.join(workspacesDir, taskId);
    
    try {
      const stats = fs.statSync(dirPath);
      // Check if created more than 30 seconds ago
      if (now - stats.ctimeMs > 30000) {
        const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId) as { status: string } | undefined;
        
        // Delete if the task is stuck in 'claimed' or 'active' (or missing entirely, but we stick to the criteria)
        if (task && (task.status === 'claimed' || task.status === 'active' || task.status === 'running')) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`[MemorySweep] Swept orphaned workspace: ${taskId}`);
        } else if (!task) {
          // If task doesn't exist, it's also orphaned
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`[MemorySweep] Swept untracked workspace: ${taskId}`);
        }
      }
    } catch (err) {
      console.error(`[MemorySweep] Failed to sweep ${dirPath}:`, err);
    }
  }
}
