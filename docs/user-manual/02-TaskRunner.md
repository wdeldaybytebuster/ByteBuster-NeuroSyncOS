# 2. Task Runner

## What this screen is

Task Runner is the screen where work actually gets run and watched. In technical terms, this screen is also called CoreExec, but from the user’s point of view it is the place where approved jobs are carried out.

A simple way to think about it is this: if ScopeLogic is the planning desk, Task Runner is the workshop.

This screen is useful when you want to:

- see which jobs are active,
- check what a job is doing right now,
- look at completed or failed runs,
- see scheduled work,
- tune how the engine behaves,
- control how the system recovers if something crashes.

## What you can see on it

### Dashboard page

The dashboard page is built around a few main areas.

#### Active workflow runs

This shows the jobs that exist in the system. You can usually see:

- a list of runs,
- each run’s short ID,
- the time it started,
- its status.

If you pick a run, the screen can show more detail about the steps inside it. Those steps are often shown as a chain of nodes. Each node may be completed, claimed, running, failed, or still pending.

This is helpful because a workflow is usually not just one thing. It is a sequence of steps, and this screen helps you see which step is doing what.

#### How well is it running?

This is a small metrics area. It may show things like:

- success rate,
- how many runs are in progress,
- retry rate,
- average time per task.

These numbers are meant to give you a quick feel for whether the engine is behaving well.

#### Activity log

This is a short live log of things the engine notices. It may show messages about steps being claimed or tasks finishing. It is useful when you want to watch what is happening moment by moment.

#### Alerts and things to review

This area shows items that may need your attention. It often appears as a list of escalations or issues. If something needs review, this is one of the places it may show up.

#### Workflow scheduler

This shows jobs that are set to run on a repeating schedule. If nothing is scheduled, it will say so.

#### Worker activity

This shows a worker activity strip. It helps you see whether the system has active workers and how busy things look.

### Set-up page

The Set-up page lets you change how the engine works.

#### Speed and parallel tasks

This section has controls that affect how much work can happen at once. It may include:

- Budget and rigor settings
- Autonomy and delegation settings

These are usually shown as sliders or percentages.

Budget and rigor affect how strict the system is when using resources. A lower budget can make the system stop requests sooner. A higher budget can let it go further before stopping.

Autonomy and delegation affect how much the system can approve on its own. More autonomy means the system can handle more without asking. Less autonomy means it asks more often.

#### Hardware resource governor

This is a separate control from the speed dials. It watches the computer itself, not just the workflow queue.

It may show real-time information about things like CPU use and worker threads. It can also help the app avoid pushing the hardware too hard.

This matters because a workflow engine can be busy without the rest of the computer being healthy. This control helps keep both in mind.

#### Retry limits

This controls how many times a failing step can be retried before the app stops and asks for help.

You can usually set it from a low value to a higher one.

- A low setting means the app gives up sooner.
- A high setting means it keeps trying longer.

This is useful when you want to decide how patient the system should be with a stuck or failing step.

#### Crash recovery

This section tells the app what to do if the system crashes or restarts. It may include choices such as:

- restart interrupted tasks automatically,
- save a safety copy before recovering.

These settings matter if you care about not losing work in the middle of a run.

#### Recurring schedules

This is where you can create repeating jobs. You usually give the schedule:

- a workflow name,
- a cron expression.

A cron expression is just a short way to say when something should run. The app may show examples to help you write one.

After you add a schedule, it appears in the list of active schedules. You can also remove one if you no longer want it.

#### Commit button

When you change settings on the Set-up page, there is usually a button to save them all at once. This is often labeled something like “Commit Configuration.”

## What you can do on it

On Task Runner, you can:

- view active and recent runs,
- select a run and inspect its steps,
- see workflow metrics,
- read the activity log,
- check alerts and escalations,
- view scheduled jobs,
- watch worker activity,
- change max iterations,
- change auto-requeue behavior,
- change snapshot-before-recovery behavior,
- create recurring schedules,
- remove schedules,
- save engine settings.

## How it works

Task Runner works by taking approved work and moving it through the system.

When a workflow runs, it is usually broken into steps. Each step does part of the work. The screen shows those steps so you can follow progress.

If a step fails, the engine may retry it a certain number of times. If it still cannot finish, the issue may appear in the alerts area.

Schedules work by storing a repeating rule. When the time comes, the system can start the job automatically if the schedule is active.

The engine settings affect how much work can happen at once, how patient the system is, and what it does after a crash.

## How to use it in real life

Use Task Runner when:

- you want to see what is running now,
- you want to follow a workflow step by step,
- a job seems slow or stuck,
- you want to check why something failed,
- you want to schedule a repeating job,
- you want to decide how hard the system should try before giving up,
- you want to control what happens after a crash.

A good habit is to look at the run list before starting something new if you want to compare behavior. Another good habit is to check the activity log when you are testing a workflow and want to see what happens in order.

If you are not sure whether a problem is in the plan, the model, the connection, or the run itself, Task Runner is a good place to narrow it down.

## Small tips

- If a run looks stuck, do not assume it is finished. Check its status.
- If a step fails, check whether the issue is the step itself or something the step depends on.
- If you create a schedule, make sure the time and expression are what you meant.
- If you change retry limits, remember that a higher limit means more patience but also more waiting.
- If you change crash recovery settings, think about whether you want the system to automatically restart interrupted work.
