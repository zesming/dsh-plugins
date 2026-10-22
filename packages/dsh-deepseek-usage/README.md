# dsh-deepseek-usage

Your DeepSeek account balance in the sidebar, and a token-usage heatmap of what this machine
actually spent.

<p align="center">
  <img src="../../docs/images/usage-daily.png" alt="Usage panel: KPI row, a daily heatmap with one lane per model, and a per-model table" width="760">
</p>

## What it does

**Balance row.** When a DeepSeek account credential is stored, a row appears directly above the
account launcher. It shows the spendable balance and — when granted credit is about to expire — a
second line naming the amount and how long is left. Opening the row's menu refreshes the figure and
offers **Usage** and **Top up**. With no stored credential the row is not rendered at all, and
neither is it when the balance cannot be read: a failed read cannot prove an account exists.

<p align="center">
  <img src="../../docs/images/balance-menu.png" alt="The balance row with its menu open" width="300">
</p>

**Usage page.** Tokens per day, per week, or as a weekly stack, one lane per model, filterable by
access channel. It reads the `usage` record every model call already writes into this machine's
Session logs, so it needs no network access and no DeepSeek login. Reachable from the balance menu,
from the sidebar's panel list, and from **Settings → Usage**.

<p align="center">
  <img src="../../docs/images/usage-weekly.png" alt="The weekly view: one row of week cells per model" width="760">
</p>

## Where the numbers come from

| Figure | Source |
|---|---|
| Balance, bonus wallets | `ctx.deepseekAccount.getBalance()` — Platform's `get_user_summary` |
| Expiry of granted credit | `ctx.deepseekAccount.getUnnotifiedBonuses()` — the only Platform field carrying an expiry |
| Token usage | `assistant/message.data.usage` in each stored Session log |

Two deliberate choices follow from those sources:

- **A failed balance read is never shown as `¥0.00`.** The row reads `--` and says the balance is
  temporarily unavailable, because a zero and an error mean opposite things to the person reading it.
- **This plugin never calls `ackBonusNotified`.** That call tells Platform the user has seen a
  granted-bonus notice, and Platform stops offering it. The expiry line here is a derived display
  that can be recomputed at any time, so consuming a one-shot product notification for it would be
  the wrong trade.

## What "channel" means

Session logs record the provider and model of each call but no DeepSeek account id. The usage page
therefore groups by **access channel** — DeepSeek account, API key, or third party — and labels it
that way, rather than presenting an account breakdown it cannot support.

## Counting rules

- Tokens are bucketed by **local calendar day**, so a total matches the day the person experienced.
- `totalTokens` already includes cache reads; the cache figure is also shown on its own because it
  usually dominates the total and would otherwise make the number look implausible.
- Delegated (subagent) Sessions are counted, with a switch to exclude them.
- The window applies to **events**, not to a Session's creation date: a Session resumed after months
  contributes only its in-window usage.
- A Session that cannot be read is counted and reported, never silently dropped.

## Install

```bash
dsh plugin --profile <profile> add "link:/absolute/path/to/packages/dsh-deepseek-usage"
```

Restart that profile. The balance row appears in the sidebar; the usage page is reachable from the
row's menu, from the sidebar's panel list, and from **Settings → Usage**.

<p align="center">
  <img src="../../docs/images/settings-nav.png" alt="The settings navigation with a dedicated usage icon" width="260">
</p>

## Boundaries

- The row's **Usage** entry opens a **main-area panel**, not the Settings dialog. A third-party
  bundle cannot address a Settings section directly, and a year of heatmap lanes needs the wider
  column anyway. The same view is also registered as a Settings section for people who look there.
- The Settings nav glyph is chosen by the shell per section id, with no icon option for third-party
  sections. The section's label therefore carries this plugin's own mark, and a narrow rule hides
  the shell's fallback gear in that row only.
- The plugin adds no agent tool and changes no model-visible prompt.

## Build and test

From the repository root:

```bash
npm run build
npm test
```
