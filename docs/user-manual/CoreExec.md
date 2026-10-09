# NeuroSync Sovereign OS — User Manual

## 5. CoreExec — the run and schedule screen

CoreExec is the part of the app that actually carries out work. It is the engine that runs tasks, handles schedules, and keeps the job pipeline moving.

A simple way to think about it is this: CoreExec is the workshop where approved jobs get built.

### What it does

CoreExec helps the app:

- Run approved workflows
- Track what is happening while a job is in progress
- Manage scheduled jobs that should run later
- Show you what tasks are waiting, running, or finished

It is not the place where you draft the plan. That usually starts in ScopeLogic. CoreExec is where the plan becomes action.

### Main parts of CoreExec

- **Active runs**
  This shows jobs that are happening now or have happened recently. You can often see things like:
  - Which run is active
  - What state it is in
  - When it started

- **Task status**
  A workflow is made of steps. CoreExec can show the status of those steps so you can tell which ones are done, which are still working, and which may have had trouble.

- **Schedules**
  Some jobs are not meant to run right away. They are meant to run at set times. CoreExec usually shows those scheduled jobs and when they are expected to run next.

- **Controls and tuning**
  CoreExec may include settings that affect how the engine behaves. These can include things like how many tasks can run at once and how the system handles workload.

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

### Good habits here

- Look at the run history before starting something new, if you want to compare behavior.
- If you are testing a workflow, watch one step at a time.
- If a schedule matters, make sure it is set correctly before relying on it.
- If something goes wrong, check whether the problem is the plan, the model, the connection, or the run itself.

### When to use CoreExec

Use CoreExec when you want to:

- See what jobs are running
- Check the status of a workflow
- Review scheduled work
- Understand why a job is moving slowly or stopping

---

## Where to go next

The next screen is **BaseVault**. That screen is about the app’s storage, backups, and long-term records.
