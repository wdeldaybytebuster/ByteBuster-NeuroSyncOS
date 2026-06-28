# NeuroSync Sovereign OS — User Manual

**Version:** 2.1
**For:** Beginner operators, freelancers, and hobbyists
**Last Updated:** 2026-06-26

---

## What is NeuroSync Sovereign OS?

NeuroSync is your personal AI workflow assistant that runs entirely on your own computer. Think of it like having a smart helper that can:

- Break down complex tasks into step-by-step workflows
- Run those steps automatically (like listing files, fetching data, etc.)
- Remember what you like and how you work
- Never send your data to the cloud without your permission

Everything stays on your machine. You're always in control.

---

## Getting Started

### Starting the System

Open two terminal windows:

**Terminal 1 — Backend (the brain):**
```bash
cd ~/Projects/NeuroSyncMega
npm run dev:server
```
Wait until you see: `[NeuroSync] API Gateway running on http://localhost:3743`

**Terminal 2 — Frontend (the screen):**
```bash
cd ~/Projects/NeuroSyncMega
npm run dev:ui
```
Wait until you see: `VITE ready`

**Open your browser:** Go to `http://localhost:3742/`

---

## The Screen Layout

When you open NeuroSync, you'll see:

### Top Bar
- **Left side:** A hamburger menu (☰) to open the module list, plus the current module's logo and name
- **Center:** Two buttons — "Dashboard" and "Set-up" — these switch between viewing information and changing settings
- **Right side:** A sun/moon icon for light/dark mode, the current project filter, and a panel button for project switching

### Left Panel (hidden by default)
Click the ☰ hamburger button to open the module list. This shows all 8 parts of the system you can navigate to.

### Right Panel (hidden by default)
Click the sidebar button (right side of top bar) to see your projects. You can switch between them or create new ones here.

### Center Area
This is where all the action happens. It changes depending on which module you're viewing.

---

## Creating Your First Project

1. Click the **sidebar button** (right side of the top bar) to open the right panel
2. At the bottom, click **"+ New Workspace"**
3. Type a name for your project (example: "My First Project")
4. Click **"Create & Switch"**

Your new project is now active! You'll see its name in the filter badge on the top bar.

---

## Creating Your First Workflow

This is the main thing you'll do with NeuroSync. Here's the step-by-step:

### Step 1: Talk to ScopeLogic (The Interview)

1. Open the left panel (☰ button) and click **"ScopeLogic"**
2. You'll see the **Bounded Interview Pipeline** — this is a chat where the system asks you questions about what you want to build
3. Type what you want, for example: `List all files in my project directory`
4. Answer the follow-up questions (usually 3-7 questions about details)
5. When you're happy, type: `looks good` or `done`

The system will generate a workflow plan and automatically take you to PortGrid.

### Step 2: Review in PortGrid (The Visual Approval)

After the interview, you'll be taken to **PortGrid** where you can see your workflow as a visual flowchart:

- Each **box** represents one step in your workflow
- The **lines** between boxes show the order they run in
- Below the flowchart, you'll see a **numbered list** of each step in plain English

**If everything looks right:**
→ Click the green **"Approve & Execute Workflow"** button

**If you want to change something:**
→ Click **"Reject & Return to ScopeLogic"** to go back and redo the interview

### Step 3: Watch it Run (CoreExec)

After approving, you're taken to **CoreExec** where you can watch your workflow execute:

- Each task shows its status: ⏳ Pending → 🔄 Running → ✅ Completed
- If something goes wrong, it shows as ⚠️ and creates an alert for you to fix

---

## The 8 Modules Explained

| Module | What it does | When you'd use it |
|--------|-------------|-------------------|
| **System View** | Shows everything at a glance — system health, alerts, memory status | Check this first every session |
| **ScopeLogic** | Interview chat to design workflows | When you want to create something new |
| **CoreExec** | Shows running/completed workflows | To monitor what's happening |
| **RouteSwitch** | Controls which AI models are used | When you want to change AI providers |
| **BaseVault** | Database management and backups | To backup your data or check storage |
| **PortGrid** | Visual workflow editor and approvals | To review and approve workflows |
| **ScoutDaemon** | Background monitoring | Runs automatically — check if curious |
| **Cerebro** | Memory management | To see what the system has learned |

---

## Common Tasks

### Backing Up Your Data

1. Go to **BaseVault** → click **"Set-up"** tab
2. Under "Sovereign Portability," click **"Execute Live Backup"**
3. Watch the progress bar — when it hits 100%, your backup is saved

### Changing the AI Provider

1. Go to **RouteSwitch** → click **"Set-up"** tab
2. Under "Provider & Credential Configuration":
   - Choose your provider type (Local, OpenAI Compatible, or Offline Mock)
   - Enter your API details if needed
3. Click **"Commit Configuration"**

### Scheduling a Recurring Workflow

1. Go to **CoreExec** → click **"Set-up"** tab
2. Scroll to **"Workflow Cron Scheduler"**
3. Enter a name and a cron expression (examples are shown)
4. Click **"Add Schedule"**

### Searching Your Memory

1. Go to **Cerebro** → stay on **"Dashboard"** tab
2. In the **Memory Browser**, type what you're looking for
3. Click the search button to find related memories

---

## Troubleshooting

### "Interview is already complete"
If you see a disabled chat with no way to type, click the **"+ New Interview"** button in the top-right corner of the interview section.

### My workflow didn't appear after approval
Go to **CoreExec** → **Dashboard** tab. Your workflow should appear in the "Active Workflow Runs" list. Click on it to see the task details.

### The system seems slow
Go to **ScoutDaemon** → **Dashboard** tab. Check the CPU utilization. If it's above 80%, the system is automatically throttling background tasks to keep your computer responsive.

### I want to start over
Go to **BaseVault** → **Set-up** → click **"Execute Live Backup"** first (just in case), then you can restore from an older backup if needed.

---

## Safety & Privacy

- **Everything stays local** — no data leaves your computer unless you explicitly configure an external AI provider
- **Human approval required** — no workflow executes without you clicking "Approve"
- **Encrypted secrets** — any API keys you enter are encrypted on your hard drive
- **Sandboxed commands** — the system can only run a limited set of safe commands (like `ls`, `cat`, `grep`)

---

## Keyboard Shortcuts

| Shortcut | Where | Action |
|----------|-------|--------|
| Enter | Interview chat | Send your message |
| Enter | Project name field | Create the project |

---

## Glossary

| Term | What it means |
|------|---------------|
| **DAG** | A "Directed Acyclic Graph" — fancy name for a step-by-step workflow where each step depends on the one before it |
| **Workflow** | A series of automated tasks that run in order |
| **Node** | One single step in a workflow |
| **Proposal** | A draft workflow that needs your approval before it runs |
| **Provider** | The AI service that generates responses (can be local or online) |
| **Governor** | The safety system that prevents overspending on AI tokens |
| **WAL** | "Write-Ahead Logging" — a database feature that prevents data loss |
| **Cron** | A scheduling system that runs tasks at specific times |

---

## Getting Help

If something isn't working:
1. Check the **System View** dashboard for any red alerts
2. Look at the **Action Center** section for blocked tasks
3. Try restarting the servers (Ctrl+C in both terminals, then run the start commands again)
