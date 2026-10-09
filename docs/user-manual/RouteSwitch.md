# NeuroSync Sovereign OS — User Manual

## 4. RouteSwitch — the model and connection screen

RouteSwitch is the part of the app that deals with choosing where a request goes.

If the app needs to talk to an AI model or service, RouteSwitch helps decide which one to use. It also helps set up connections so the app can reach those services.

A simple way to think about it is this: RouteSwitch is the mailing address and backup plan for your requests.

### What it does

RouteSwitch helps you:

- Pick a main model or service
- Set up fallback choices if the first one is busy or unavailable
- Choose what matters most when sending a request
- Save connection details for the app to use

### Main parts of RouteSwitch

- **Model or service choice**
  You can choose which model the app should use first. This is the primary option.

- **Fallback chain**
  A fallback is a second choice, third choice, and so on. If the first model cannot handle a request, the app can try the next one. This is useful when one service is slow, full, or not available.

- **Routing priority**
  This is a setting that tells the app what to care about most when picking a model. For example:
  - Speed
  - Cost
  - Intelligence

  This does not change your request itself. It changes how the app chooses where to send it.

- **Connection settings**
  For some services, you may need to enter details like:
  - A base URL
  - A model name
  - An API key

  RouteSwitch is where those details are usually entered and tested.

### A note about keys and secrets

Some connection settings may include private information, like an API key. Treat that carefully. If you are not sure where to put it or how to keep it safe, it is better to ask before saving it.

### How RouteSwitch fits with the rest of the app

RouteSwitch is mostly about sending requests well. It does not usually write the plan, run the workflow, or store the final memory. Those parts live in other screens.

But because many requests depend on a model being available, RouteSwitch matters a lot. If the wrong model is chosen, or if no fallback is set, a request may fail or be slower than expected.

### Good habits here

- Give the app a backup option if the main one might go down.
- Check that your settings make sense before saving them.
- If something stops working, RouteSwitch is a good place to look first.
- If you are using a local model, make sure the path or setup is correct.

### When to use RouteSwitch

Use RouteSwitch when you need to:

- Add a new model or service
- Fix a connection that is not working
- Change which model is used most often
- Decide whether speed, cost, or quality matters more

---

## Where to go next

The next screen is **CoreExec**. That screen is about running and managing the actual jobs, schedules, and task workers.
