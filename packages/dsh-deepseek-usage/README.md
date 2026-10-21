# dsh-deepseek-usage

Your DeepSeek account balance in the sidebar, and a token-usage heatmap of what this machine
actually spent.

## What it does

**Balance row.** When a DeepSeek account credential is stored, a row appears directly above the
account launcher in the sidebar. It shows the spendable balance, and — when granted credit is
about to expire — a second line naming the amount and how long is left. Clicking the row opens a
small menu with **Usage**, **Top up**, and **Refresh now**. With no account credential the row is
not rendered at all, so an API-key or third-party setup sees an unchanged sidebar.

**Usage.** A heatmap of tokens per day, per week, or as a weekly stack, split into one lane per
model and filterable by access channel. It reads the `usage` record that every model call already
writes into this machine's Session logs, so it needs no network access and no DeepSeek login.

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
that way, rather than presenting it as an account breakdown it cannot support.

## Counting rules

- Tokens are bucketed by **local calendar day**, so a total matches the day the person experienced.
- `totalTokens` already includes cache reads; the cache figure is also shown on its own because it
  usually dominates the total and would otherwise make the number look implausible.
- Delegated (subagent) Sessions are counted, with a switch to exclude them.
- A Session that cannot be read is counted and reported, never silently dropped.

## Install

```bash
dsh plugin --profile <profile> add "link:/absolute/path/to/packages/dsh-deepseek-usage"
```

Restart that profile. The balance row appears in the sidebar; the usage page is reachable from the
row's menu, from the sidebar's panel list, and from **Settings → Usage**.

## Boundaries

- The usage page opens as a **main-area panel**, not inside the Settings dialog. A third-party
  bundle cannot address a Settings section directly, and a year of heatmap lanes needs the wider
  column anyway. The same view is also registered as a Settings section for people who look there.
- The plugin adds no agent tool and changes no model-visible prompt.

## Build and test

From the repository root:

```bash
node scripts/build.mjs
node --test packages/dsh-deepseek-usage/test/
```
