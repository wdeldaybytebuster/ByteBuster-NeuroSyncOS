# NeuroSync Sovereign OS — User Manual

## 8. ScoutDaemon — the watcher screen

ScoutDaemon is the part of the app that keeps an eye on things in the background. It is meant to notice, suggest, and prepare — not to jump in and take over.

A simple way to think about it is this: ScoutDaemon is the lookout on the roof, not the worker on the ground.

### What it does

ScoutDaemon helps the app:

- Watch for things worth noticing
- Suggest actions or ideas when it sees something useful
- Support background work like research or monitoring when it is appropriate
- Help the system stay aware of its own state

It is a background helper. In many cases, you will not control it step by step. You will mostly use it to check what it has noticed.

### Main parts of ScoutDaemon

- **Observed activity**
  This can show things the watcher has picked up. It may include status changes, unusual events, or other signals that something deserves attention.

- **Background suggestions**
  ScoutDaemon may suggest next steps or flag things that might need a human look. These are suggestions, not orders.

- **Environmental awareness**
  ScoutDaemon can help the app notice conditions around it, like system state or activity that may matter later. That helps the app make better choices about what to do next.

### Important boundary

ScoutDaemon is a watcher. It does not run workflows by itself, and it should not be treated as the same thing as the execution engine. If something needs to happen, ScoutDaemon may point at it, but the actual action usually belongs to another part of the app.

That separation is intentional. It keeps the system calm and predictable. One part notices. Another part acts.

### How to read ScoutDaemon output

- If you see a suggestion, think of it as “this might be worth checking.”
- If you see an alert or notice, decide whether it needs action now or later.
- If the app seems to be watching quietly and nothing unusual is happening, that is often a good sign.

Not every notice means something is wrong. Some notices are just awareness.

### Good habits here

- Check ScoutDaemon when you want to know whether the system has noticed anything useful.
- Do not assume every alert is urgent.
- If ScoutDaemon suggests something, compare it with the actual screen where the work will happen.
- Use it as a second set of eyes, not as the final decision-maker.

### When to use ScoutDaemon

Use ScoutDaemon when you want to:

- See background activity
- Check for notices or suggestions
- Understand what the watcher layer has observed
- Look for early signs that something may need attention

---

## Where to go next

After looking at all the main screens, you can read the final short section on **everyday use and good habits** in the app.
