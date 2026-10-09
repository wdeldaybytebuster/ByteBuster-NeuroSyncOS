# 3. Storage and Backups

## What this screen is

Storage and Backups is the part of the app that keeps things safe. It is where the app stores important records and where you can make copies of the database.

A simple way to think about it is this: this screen is the filing cabinet and the safety copy machine.

The app uses this storage for many things. Runs may save their results here. Settings may be kept here. History and other records may live here too. So this screen is not just about files. It is about the app’s long-term memory for facts and state.

## What you can see on it

### Dashboard page

The dashboard page usually focuses on the status of the vault and on backup or restore actions.

You may see:

- information about the vault,
- a way to start a backup,
- a way to restore from a backup,
- notices about what backup or restore is doing.

If a backup is running, the screen may show progress. If a restore is happening, it may show a status message because restore can take a while and may restart parts of the system.

### Set-up page

The Set-up page is where you manage backup and restore actions more directly.

#### Live vault backup

This is the main safe-copy tool. It streams a backup of the database while the app is running. That means you do not have to stop the app just to make a copy.

This is useful before making big changes, or any time you want a safe point to return to.

#### Critical system restore

This is the tool for putting an old copy back into place. It is usually labeled in a careful way because it can overwrite the current vault.

Restore is a serious action. It may replace current data with older data. It may also restart the system as part of the process.

## What you can do on it

On Storage and Backups, you can:

- check the state of the vault,
- start a live backup,
- watch backup progress,
- choose a backup file to restore,
- restore from a saved copy,
- read restore status messages.

## How it works

The vault is the app’s local database. Many parts of the system read from it and write to it. That makes it the place where the app keeps the truth of what happened.

A backup is a copy of that database at a moment in time. It is not a second running system. It is a saved snapshot you can return to later if needed.

A restore takes a saved copy and uses it to replace the current vault. After a restore, the app may behave as if it is returning to an earlier state.

Because restore can change what the system remembers, it is treated carefully. The app usually warns you before you do it and may show a strong warning about overwriting the vault.

## How to use it in real life

Use Storage and Backups when:

- you want to make a safe copy before a big change,
- you want to keep a backup in case something goes wrong,
- you need to return to an earlier state,
- you want to understand where the app keeps its records.

A good habit is to back up before major changes. Another good habit is to keep backup files somewhere you trust and can find later.

## Small tips

- Do not restore just to “see what happens.” Restore is meant for a reason.
- If you are not sure whether you need a restore, back up first and then decide.
- If a restore is in progress, give it time and read the status messages.
- Treat backup files like important records. If they are lost, the safety net is gone.
- If the app warns you that restore will overwrite the vault, take that warning seriously.
