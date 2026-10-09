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
- Watch alerts, usage, and model status

### Main parts of the dashboard

- **AI Usage in the Last 24 Hours**
  This shows how much the app has been using its AI services lately. You may see things like:
  - How many tokens were used
  - How many requests were made
  - An estimated cost
  - How many calls may be left before a daily limit

  There is also a simple progress bar for the daily usage. It helps you see whether you are getting close to a limit.

- **AI Model Status**
  This shows the services the app knows about. Each one may be active or disabled. This is the “fleet” of models and endpoints the app can pick from.

- **AI Connection Alerts**
  This area tells you when something may be wrong, such as:
  - A model or provider being exhausted or rate-limited
  - A token limit being reached or nearly reached

  When everything is fine, it usually says “All Clear.”

- **Fallback Cascade Path**
  This shows the order the app uses when one choice does not work. A simple version looks like this:
  - Agent Preference
  - Category Default
  - Local Mock

  That means if the first choice cannot handle a request, the app may try the next one instead of failing right away.

- **High-Risk Arbitration Log**
  For some risky requests, the app may ask more than one model to answer and then compare them. This log shows those moments and how confident the app was in the answer it picked.

### Main parts of the Set-up page

- **Your AI Services**
  This is where you add, edit, test, and delete the services the app can use. Each service has a name and a type. Some types need more details than others.

  Common provider types you may see:
  - FreeLLMAPI, which is a self-hosted proxy
  - OpenCode Zen, which is a retired type unless you turn it on
  - OpenRouter
  - Local GGUF with llama.cpp
  - OpenAI Compatible, for a custom endpoint
  - Offline Mock, for local testing

  When you add or edit a service, you may also enter:
  - A base URL
  - A model ID
  - An API key
  - A local model path
  - A “paid” flag if the service may cost money

  There is also a test button so you can check whether a service connects before you rely on it.

- **Which AI To Try First**
  This is where you put services in order. The first one is tried first. If it fails, the app moves down the list.

  You can set this order for different scopes, such as:
  - Global
  - Cerebro
  - Project
  - Agent

  For project or agent scope, you may also choose the specific project or agent you want the rule to apply to.

  You can add providers to the chain, move them up or down, or remove them.

- **Spending Limits**
  This section controls how freely the app can use online services.

  It includes:
  - A paid provider lock
  - A hard daily cost ceiling
  - An external calls setting
  - A grammar-constrained setting
  - An OpenCode Zen retired flag

  The paid provider lock is important. When it is locked, services marked as paid are skipped unless you unlock them. That is a safety feature.

  The daily cost ceiling sets a limit for how much automated spending can happen before the app stops and parks the request.

- **Connected Tools**
  This shows extra tools the AI may be able to use through a connection standard called MCP. Each tool may show:
  - Its name
  - Its transport
  - Whether it is active or offline

  You do not have to use these tools, but if they are installed, this is where you can see them.

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
- Be careful with the paid-provider lock and daily cost limit if you care about spending.

### When to use RouteSwitch

Use RouteSwitch when you need to:

- Add a new model or service
- Fix a connection that is not working
- Change which model is used most often
- Decide whether speed, cost, or quality matters more
- Check alerts or usage
- See which tools are connected
