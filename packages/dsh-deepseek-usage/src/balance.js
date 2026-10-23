/**
 * Pure projection of the DeepSeek Platform wallet payload into what the sidebar
 * shows: a headline balance, plus the granted credit that is about to expire.
 *
 * The Host already validates the wire shape; these functions only decide
 * which numbers a person reads and which ones stay hidden.
 */

/**
 * How far ahead an expiry is still worth mentioning.
 *
 * DeepSeek grants credit in batches and Platform reports a date for very few of
 * them, so the threshold is not there to filter noise — it exists so a date
 * years away is not dressed up as an urgent warning. A tighter window was
 * hiding real dates outright, which is the wrong trade when the date itself is
 * the scarce thing.
 */
export const EXPIRY_WINDOW_DAYS = 365

/** Decimal string grammar Platform's own Web client accepts. */
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

/**
 * Read one wallet balance without losing the exact decimal string.
 *
 * @param value - untrusted balance.
 * @returns the original string when it is a valid decimal, else undefined.
 */
export function decimalOf(value) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? { text: value, number } : undefined
}

/**
 * Add two decimal strings exactly enough for display.
 *
 * Money is never computed in floating point when both operands are ordinary
 * decimals; the string math keeps cents from drifting.
 *
 * @param left - decimal string.
 * @param right - decimal string.
 * @returns their sum as a decimal string.
 */
export function addDecimal(left, right) {
  const a = decimalOf(left)
  const b = decimalOf(right)
  if (a === undefined || b === undefined) return undefined
  const scale = Math.max(decimals(left), decimals(right), 0)
  const total = Math.round(a.number * 10 ** scale) + Math.round(b.number * 10 ** scale)
  return (total / 10 ** scale).toFixed(scale)
}

/** Count the fractional digits of a decimal string. */
function decimals(text) {
  const body = text.toLowerCase().split('e')[0]
  const dot = body.indexOf('.')
  return dot === -1 ? 0 : body.length - dot - 1
}

/**
 * Pick the currency the sidebar leads with.
 *
 * CNY wins because the shipped DeepSeek Platform prices in CNY; an account
 * holding only USD still shows its own wallet instead of a converted number.
 *
 * @param wallets - validated `{currency, balance}` rows.
 * @returns the preferred row, or undefined when there is nothing to show.
 */
export function primaryWallet(wallets) {
  if (!Array.isArray(wallets)) return undefined
  const usable = wallets
    .map(wallet => ({ wallet, parsed: decimalOf(wallet?.balance) }))
    .filter(entry => entry.parsed !== undefined && (entry.wallet.currency === 'CNY' || entry.wallet.currency === 'USD'))
  if (usable.length === 0) return undefined
  return (usable.find(entry => entry.wallet.currency === 'CNY') ?? usable[0]).wallet
}

/**
 * Sum the wallets that share one currency.
 *
 * @param wallets - validated `{currency, balance}` rows.
 * @param currency - currency to total.
 * @returns the total as a decimal string, or undefined when the currency is absent.
 */
export function totalOf(wallets, currency) {
  if (!Array.isArray(wallets)) return undefined
  let total
  for (const wallet of wallets) {
    if (wallet?.currency !== currency) continue
    const parsed = decimalOf(wallet.balance)
    if (parsed === undefined) continue
    total = total === undefined ? parsed.text : addDecimal(total, parsed.text)
  }
  return total
}

/**
 * Turn granted bonuses into the "expires in N days" notices the sidebar shows.
 *
 * Only future expiries inside the window survive: an already-expired credit is
 * gone from the account, so a line about it would be noise with no action
 * behind it. Entries without an expiry never do.
 *
 * @param bonuses - `{expiresAt, amount, currency, message, title}` rows.
 * @param now - current epoch milliseconds, injected for tests.
 * @returns notices sorted by soonest expiry.
 */
export function expiringBonuses(bonuses, now) {
  if (!Array.isArray(bonuses)) return []
  const horizon = now + EXPIRY_WINDOW_DAYS * 86_400_000
  const notices = []
  for (const bonus of bonuses) {
    const raw = typeof bonus?.expiresAt === 'string' ? bonus.expiresAt.trim() : ''
    if (raw === '') continue
    const at = Date.parse(raw)
    if (!Number.isFinite(at) || at <= now || at > horizon) continue
    const amount = decimalOf(bonus.amount)
    notices.push({
      expiresAt: new Date(at).toISOString(),
      expiresAtMs: at,
      daysLeft: Math.max(1, Math.ceil((at - now) / 86_400_000)),
      ...amount === undefined ? {} : { amount: amount.text },
      ...typeof bonus.currency === 'string' ? { currency: bonus.currency } : {},
      ...typeof bonus.message === 'string' && bonus.message !== '' ? { message: bonus.message } : {},
      ...typeof bonus.title === 'string' && bonus.title !== '' ? { title: bonus.title } : {},
    })
  }
  return notices.sort((a, b) => a.expiresAtMs - b.expiresAtMs)
}

/**
 * Describe why an expiry line is or is not present.
 *
 * There are exactly two sources: `getBalance` knows the granted wallet total
 * but carries no expiry field, and `getUnnotifiedBonuses` carries expiry but
 * only for grants Platform has not yet recorded as displayed. A funded bonus
 * with an empty unnotified list therefore has no date anywhere in the payload,
 * and saying so is the only honest answer.
 *
 * @param input.bonus - granted wallet total for the leading currency, if any.
 * @param input.bonuses - `getUnnotifiedBonuses()` outcome, or undefined.
 * @param input.now - current epoch milliseconds.
 * @returns a short code plus the counts a reader can act on.
 */
export function expiryDiagnosis(input) {
  const { bonus, bonuses, now } = input
  const funded = bonus !== undefined && bonus !== null && decimalOf(bonus) !== undefined && Number(bonus) > 0
  if (bonuses === undefined || bonuses === null) {
    return { code: funded ? 'unnotified-unavailable' : 'no-grant', listed: 0, dated: 0, expired: 0 }
  }
  const list = Array.isArray(bonuses.bonuses) ? bonuses.bonuses : []
  let dated = 0
  let expired = 0
  for (const row of list) {
    const raw = typeof row?.expiresAt === 'string' ? row.expiresAt.trim() : ''
    if (raw === '') continue
    const at = Date.parse(raw)
    if (!Number.isFinite(at)) continue
    dated += 1
    if (at <= now) expired += 1
  }
  if (funded && dated === 0) return { code: 'grant-without-date', listed: list.length, dated, expired }
  return { code: dated > 0 ? 'dated' : 'no-grant', listed: list.length, dated, expired }
}

/**
 * Build the whole sidebar balance payload from the provider's answers.
 *
 * `available: false` is deliberately distinct from a zero balance: a failed
 * read must never render as "you have nothing left".
 *
 * @param input.signedIn - whether a DeepSeek account credential is stored.
 * @param input.balance - `getBalance()` outcome, or undefined.
 * @param input.bonuses - `getUnnotifiedBonuses()` outcome, or undefined.
 * @param input.now - current epoch milliseconds.
 * @param input.error - failure code when a read failed after sign-in.
 * @returns the JSON the Client renders.
 */
export function balanceView(input) {
  const { signedIn, balance, bonuses, now, error } = input
  if (signedIn !== true) return { signedIn: false, available: false, error: null }
  if (balance?.status !== 'ready') {
    return { signedIn: true, available: false, error: error ?? 'balance-failed', readAt: now }
  }
  const primary = primaryWallet(balance.value)
  if (primary === undefined) {
    return { signedIn: true, available: false, error: 'balance-empty', readAt: now }
  }
  const currency = primary.currency
  const balanceText = decimalOf(primary.balance)?.text
  const bonusText = totalOf(balance.bonusWallets, currency)
  return {
    signedIn: true,
    available: true,
    currency,
    balance: balanceText,
    bonus: bonusText ?? null,
    total: bonusText === undefined ? balanceText : addDecimal(balanceText, bonusText),
    expiring: expiringBonuses(bonuses?.bonuses, now),
    // Carried so the sidebar can explain an absent expiry line instead of
    // silently showing nothing.
    expiry: expiryDiagnosis({ bonus: bonusText, bonuses, now }),
    readAt: now,
    error: null,
  }
}
