# 4. AI Model Settings

## What this screen is

AI Model Settings is the part of the app that decides which AI service handles a request. If the app needs to talk to a model or an AI provider, this is where you set that up.

A simple way to think about it is this: this screen is the address book and fallback plan for AI work.

It helps you answer questions like:

- Which service should I use first?
- What should the app try if the first one fails?
- How much should the app care about speed, cost, or quality?
- Which services are connected and ready?
- How much usage or spending should be allowed?

## What you can see on it

### Dashboard page

The dashboard page shows the current state of AI usage and the services the app knows about.

You may see:

- AI usage over the last 24 hours,
- how many tokens were used,
- how many requests were made,
- an estimated cost,
- how many calls may be left,
- a daily usage bar,
- the list of configured providers,
- alerts about provider problems,
- the fallback order,
- a log of high-risk arbitration decisions.

#### AI usage

This shows how much the app has used its AI services lately. It is meant to help you see whether you are getting close to a limit.

The daily usage bar is a simple visual version of the same idea. If the bar gets high, it means the app has used a lot of the allowed amount for the day.

#### Provider status

This shows the services the app knows about. Each one may be active or disabled.

You may see different kinds of providers, such as:

- a self-hosted proxy,
- OpenRouter,
- a local GGUF model,
- an OpenAI-compatible endpoint,
- an offline mock,
- a retired provider type that stays off unless you turn it on.

Each provider may show its name, type, and whether it is active.

#### Alerts

This area tells you when something may be wrong. For example, a provider may be exhausted or rate-limited, or the app may be near a token limit.

When everything is fine, this area usually says all clear.

#### Fallback order

This shows the order the app uses when one choice does not work. A simple version looks like this:

- agent preference,
- category default,
- local mock.

That means if the first choice cannot handle a request, the app may try the next one instead of failing right away.

#### High-risk arbitration log

For some risky requests, the app may ask more than one model to answer and then compare them. This log shows those moments and how confident the app was in the answer it picked.

### Set-up page

The Set-up page is where you manage the services and limits in detail.

#### Your AI services

This is where you add, edit, test, and delete providers.

When you add or edit a provider, you may enter:

- a name,
- a provider type,
- a base URL,
- a model ID,
- an API key,
- a local model path,
- a paid flag.

The available fields depend on the provider type.

Common provider types you may see include:

- FreeLLMAPI, a self-hosted proxy,
- OpenCode Zen, a retired type unless you turn it on,
- OpenRouter,
- local GGUF with llama.cpp,
- OpenAI compatible, for a custom endpoint,
- offline mock, for local testing.

There is usually a test button so you can check whether a provider connects before you rely on it.

#### Which AI to try first

This is where you put services in order. The first one is tried first. If it fails, the app moves down the list.

You can often set this order for different scopes, such as:

- global,
- Cerebro,
- project,
- agent.

For project or agent scope, you may also choose the specific project or agent the rule should apply to.

You can usually:

- add a provider to the chain,
- move a provider up or down,
- remove a provider from the chain.

#### Spending limits

This section controls how freely the app can use online services.

It may include:

- a paid provider lock,
- a hard daily cost ceiling,
- an external calls setting,
- a grammar-constrained setting,
- a retired provider flag.

The paid provider lock is important. When it is locked, providers marked as paid are skipped unless you unlock them. That is a safety feature.

The daily cost ceiling sets a limit for how much automated spending can happen before the app stops and parks the request.

The external calls setting controls whether the app can use outside services at all. If it is turned off, all requests may go to the local mock provider instead.

The grammar-constrained setting affects whether the app tries to force AI answers into a strict format. This can help when the app needs predictable output.

The retired provider flag matters for a provider type that is off by default. If it is retired and you have not enabled it, it stays disabled.

#### Connected tools

This shows extra tools the AI may be able to use through a connection standard called MCP. Each tool may show:

- its name,
- its transport,
- whether it is active or offline.

You do not have to use these tools, but if they are installed, this is where you can see them.

#### Commit button

When you change settings on the Set-up page, there is usually a button to save them all at once. This is often labeled something like “Commit Configuration.”

## What you can do on it

On AI Model Settings, you can:

- view recent AI usage,
- see which providers are active,
- read alerts,
- check the fallback order,
- review high-risk arbitration decisions,
- add a provider,
- edit a provider,
- test a provider,
- delete a provider,
- reorder the fallback chain,
- set scope-specific routing rules,
- lock or unlock paid providers,
- set a daily cost ceiling,
- turn external calls on or off,
- turn grammar-constrained mode on or off,
- enable or disable a retired provider,
- view connected tools,
- save settings.

## How it works

AI Model Settings works by storing the services and rules the app should use when sending requests.

When a request needs an AI model, the app can look at the provider list and the fallback order to decide where to send it. If the first choice is unavailable, the next one may be tried.

The scope rules let you set different orders for different parts of the app. That means the global rule is not always the only rule. A more specific scope can take over when it applies.

The spending controls affect whether outside services are allowed and how much they can be used before the app stops. The paid provider lock is one of the main safety tools here, because it keeps paid services out of the chain unless you say otherwise.

The connected tools section is about extra abilities the AI may use through MCP. These are not the same thing as the AI models themselves. They are additional tools the system may plug into.

## How to use it in real life

Use AI Model Settings when:

- you need to add a new service,
- a service has stopped working,
- you want a backup service in case the main one fails,
- you want to decide whether speed, cost, or quality matters more,
- you want to check how much the app has used recently,
- you want to control spending,
- you want to see which tools are connected.

A good habit is to give the app a fallback if the main service might go down. Another good habit is to be careful with the paid provider lock and daily cost limit if you care about spending.

## Small tips

- Test a provider before you rely on it.
- Keep at least one fallback if your main service can fail.
- If you are using a local model, make sure the path is correct.
- If you care about cost, keep the paid provider lock locked unless you need it open.
- If something stops working, check alerts first.
- Remember that external calls off means the app may only use the local mock.
