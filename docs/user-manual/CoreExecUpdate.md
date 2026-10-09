# NeuroSync Sovereign OS — User Manual

## 5. CoreExec — the run and schedule screen

CoreExec is the part of the app that actually carries out work. It is the engine that runs tasks, handles schedules, and keeps the job pipeline moving.

A simple way to think about it is this: CoreExec is the workshop where approved jobs get built.

### What it does

CoreExec helps the app:

- Run approved workflows
- Track what is happening while a job is in progress
- Manage scheduled jobs that should run later
- Show you how well the system is doing overall
- Let you tune a few engine and recovery settings

It is not the place where you draft the plan. That usually starts in ScopeLogic. CoreExec is where the plan becomes action.

### Main parts of the dashboard

- **Active Workflow Runs**
  This shows jobs that are happening now or have happened recently. You can usually see:
  - A list of runs, each with its own short ID and time
  - The status of each run, such as completed, running, or failed
  - Which run is currently selected

  When you pick a run, the screen can show the steps inside it, often called DAG nodes. Each step may be completed, claimed, or still waiting.

- **How Well Is It Running?**
  This is a small metrics area. It may show things like:
  - Success rate
  - How many runs are in progress
  - Retry rate
  - Average time per task

  These numbers give you a quick feel for whether the engine is behaving well.

- **Activity Log**
  This is a short live log of things the engine notices, such as when steps are claimed or when tasks finish. It is useful when you want to see what is happening moment to moment.

- **Alerts and Things to Review**
  This area shows items that may need your attention. It often appears as a list of escalations or issues that need review.

- **Workflow Scheduler**
  This shows jobs that are set to run on a repeating schedule. If nothing is scheduled, it will say so.

- **Worker Activity**
  This shows a worker or agent activity strip. It helps you see whether the system has active workers and how busy things look.

### Main parts of the Set-up page

- **Speed and Parallel Tasks**
  This section has controls that affect how much work can happen at once. It usually includes:
  - Budget and rigor settings
  - Autonomy and delegation settings

  These are sliders or percentages. They help the app decide how strict or how relaxed it should be when running tasks.

- **Hardware Resource Governor**
  This is a separate control from the speed dials above. It watches the computer itself, not just the workflow queue. It may show real-time information about things like CPU use and worker threads, and it can help the app avoid pushing the hardware too hard.

- **Retry Limits**
  This controls how many times a failing step can be retried before the app stops and asks for help. You can usually set it from a low, fast-fail setting to a higher, more resilient setting.

  A low setting means the app gives up sooner. A high setting means it keeps trying longer.

- **Crash Recovery**
  This section tells the app what to do if the system crashes or restarts. It may include choices such as:
  - Restart interrupted tasks automatically
  - Save a safety copy before recovering

  These settings matter if you care about not losing work in the middle of a run.

- **Recurring Schedules**
  This is where you can create repeating jobs. You usually give the schedule:
  - A workflow name
  - A cron expression, which is a simple way to say when the job should run

  Examples of cron expressions you might see:
  - Daily at 9 a.m.
  - Every 15 minutes
  - Weekly on Monday

  After you add a schedule, it appears in the list of active schedules. You can also remove one if you no longer want it.

- **Commit Configuration**
  When you change settings on the Set-up page, there is usually a button to save them all at once. That button is often labeled something like “Commit Configuration.”

### How it fits with the rest of the app

A typical path looks like this:

1. ScopeLogic helps shape the request.
2. PortGrid helps you approve the plan.
3. CoreExec runs the approved work.
4. Other screens may show the results, memory, or activity afterward.

That means CoreExec is in the middle of the action. It depends on good plans and good approvals. It also feeds information back to the rest of the app.

### What to watch for

- If a run looks stuck, do not assume it is finished. Check the status.
- If a step fails, the app may need help deciding what to do next.
- Scheduled jobs may not run if the system is not ready, so it helps to check the schedule list now and then.
- If you change retry limits or recovery settings, remember that these can change how the system behaves after a problem.

### Good habits here

- Look at the run list before starting something new, if you want to compare behavior.
- If you are testing a workflow, watch one step at a time.
- If a schedule matters, make sure it is set correctly before relying on it.
- If something goes wrong, check whether the problem is the plan, the model, the connection, the schedule, or the run itself.
- Be careful with crash recovery settings if you do not want the app to automatically restart work.

### When to use CoreExec

Use CoreExec when you want to:

- See what jobs are running
- Check the status of a workflow
- Review scheduled work
- Understand why a job is moving slowly or stopping
- Tune how the engine runs or recovers
