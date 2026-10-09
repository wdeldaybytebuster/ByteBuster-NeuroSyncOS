# NeuroSync Sovereign OS — User Manual

## 6. BaseVault — the storage and backup screen

BaseVault is the part of the app that keeps things safe and organized. It is meant to hold important records, saved state, and anything the app needs to remember.

A simple way to think about it is this: BaseVault is the filing cabinet and the safe copy machine.

### What it does

BaseVault helps the app:

- Store data in a local database
- Keep records that other parts of the system may need later
- Save backups
- Restore from a saved copy if needed

It is not usually where you start a task. It is where the results, history, and stored information live.

### Main parts of BaseVault

- **The vault itself**
  This is the main storage area. Many parts of the app read from it and write to it. You can think of it as the app’s long-term memory for facts, runs, and saved settings.

- **Backups**
  Backups are copies of the vault at a particular moment. They are useful if you want a safety copy before making big changes.

- **Restore**
  Restore means putting an old copy back into place. This can be helpful after a problem, but it should be used carefully because it can replace current data with older data.

- **Retention and stored history**
  BaseVault may show information about how long certain things are kept. That is useful if you want to know whether old records are still available or when they might be removed.

### How it fits with the rest of the app

Almost everything in the app may touch BaseVault at some point:

- A run may save its results.
- A schedule may store its job details.
- Scopes and plans may leave behind records.
- Memory and history may depend on what is stored here.

That makes BaseVault one of the most important parts of the system. It is not just a storage folder. It is the place where the app keeps the truth of what happened.

### A careful note about restore

Restoring a backup is a serious action. It can overwrite current data. Before you restore, ask yourself:

- Do I really need the old copy?
- Am I okay with replacing what is there now?
- Have I saved anything important from the current state first?

If you are not sure, it is better to wait and confirm than to restore by accident.

### Good habits here

- Back up before big changes.
- Keep backup copies in a place you trust.
- Do not restore just to “see what happens.”
- Check your backup list now and then so you know what you have.

### When to use BaseVault

Use BaseVault when you want to:

- Make a backup
- Restore from a backup
- Check what is being stored
- Understand where the app keeps its records

---

## Where to go next

The next screen is **Cerebro**. That screen is about the app’s memory system and how it remembers, organizes, and refreshes information.
