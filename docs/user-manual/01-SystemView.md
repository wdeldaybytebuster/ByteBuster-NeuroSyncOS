# 1. System View

## What this screen is

System View is the front page of the app. It is the first place to look when you want to see the overall state of everything.

A simple way to think about it is this: System View is the dashboard of a car. It does not do the driving. It tells you what is going on so you can decide what to do next.

This screen also has the main global settings. Those are the settings that affect the whole app at once.

## What you can see on it

### Dashboard page

The dashboard page shows a few important things at a glance:

- **System metrics**  
  This shows live numbers about the system, such as how many workers are present and how busy things look. It is meant to give you a quick health check.

- **Needs your attention**  
  This is a list of things that may need your help. If nothing needs attention, this area usually says everything is clear.

- **Memory health**  
  This shows the state of the memory part of the app. It may tell you whether memory is active, how many items it has, and when it was last updated.

- **Scheduled workflows**  
  This shows jobs that are set to run later on a schedule. If nothing is scheduled, it will say so.

There is also a commit button on the set-up page. When you change global settings, you use that button to save them.

### Set-up page

The set-up page contains the basic controls that affect the whole app.

#### Refresh rate

This controls how often some parts of the app ask for new information.

- Faster means the screen updates more quickly.
- Slower can be easier on the computer.

This is useful if you want live updates to feel snappier, or if you want the app to poll less often.

#### Max concurrent tasks

This sets the largest number of tasks that can run at the same time.

- If the number is too low, work may take longer because fewer things run together.
- If the number is too high, the system may get crowded.

Think of this as a limit on how many things the app tries to do at once.

#### Claim batch size

This controls how many tasks can be claimed together in one batch.

In plain language, “claiming” means the app says, “I will handle this one next.” This setting changes how many tasks can be taken in one group.

#### Log level

This chooses how much detail the app writes into its activity log.

- More detail can help when you are trying to understand a problem.
- Less detail is quieter and simpler.

This does not change what the app does. It changes how much it records.

#### Color theme

You can usually choose:

- Dark
- Light
- System

If you choose System, the app follows the setting on your computer.

#### Show Helpful Tips

When this is on, the app may show short explanations next to tricky words or controls. This is helpful when you are learning.

#### Reduced motion

When this is on, the app tries to use fewer animations and transitions. This is useful if you want a calmer screen or if animations bother you.

#### Commit button

When you change settings on the Set-up page, there is usually a button to save them. This button is often labeled something like “Commit Configuration.” It writes your choices so the app can use them.

## What you can do on it

On System View, you can:

- check the overall state of the app,
- see whether anything needs attention,
- look at memory status,
- see scheduled workflows,
- change the refresh rate,
- change how many tasks can run at once,
- change how much the app logs,
- change the look of the app,
- turn helpful tips on or off,
- turn reduced motion on or off,
- save the global settings.

## How it works

System View works by asking the app for current information and showing it in a simple dashboard.

The metrics and status areas are usually updated from the server. That means they are not just decoration. They reflect what the system reports at that moment.

The set-up page stores choices that other parts of the app may read later. So changing something here can affect more than just this screen.

## How to use it in real life

Use System View when:

- you open the app and want a quick look,
- you want to know whether anything is wrong,
- you want to change a setting that affects the whole app,
- you want to make the screens update faster or slower,
- you want to control how much logging happens,
- you want to switch the theme.

A good habit is to check System View first when something feels off. It is the easiest place to get a quick picture of the whole system.

## Small tips

- If you are learning the app, turn helpful tips on.
- If the app feels too busy, try a slower refresh rate.
- If you want quieter behavior, use reduced motion.
- If a setting does not seem to change anything right away, remember that some effects only show up after the app uses the setting in later work.
