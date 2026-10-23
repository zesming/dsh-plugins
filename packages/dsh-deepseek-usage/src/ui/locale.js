/**
 * The plugin's own dictionaries.
 *
 * DeepSeek Harness ships English and Simplified Chinese; these mirror that
 * pair, with Chinese as the key-set source of truth so a missing translation
 * fails a test rather than rendering a raw key.
 */

/** Simplified Chinese dictionary. */
const zh = {
  balance: '余额',
  balanceUnavailable: '暂时无法读取',
  expiresIn: '{amount} 将在 {when}过期',
  usage: '用量',
  topUp: '充值',
  expiryExplain: '赠送余额暂无到期日（平台未提供）',
  nav: '用量',
  title: '用量',
  calls: '{count} 次调用 · 含缓存读取',
  cacheRead: '缓存读取',
  cacheShare: '占 {percent}%',
  output: '输出',
  input: '输入 {value}',
  viewDay: '按天',
  viewWeek: '按周',
  viewTotal: '累计',
  channelOfficial: '官方账号',
  channelApiKey: 'API Key',
  channelRelay: '第三方',
  channelUnknown: '未知通道',
  excludeSubagents: '排除子代理',
  dayHint: '近 26 周',
  dayAria: '每天 tokens 用量热力图',
  weekHint: '近 26 周',
  totalHint: '近 26 周',
  colorHint: '颜色越浓 tokens 越多',
  byModel: '按模型',
  model: '模型',
  modelCalls: '调用',
  modelInput: '输入',
  modelOutput: '输出',
  modelCache: '缓存读取',
  modelTotal: '合计',
  modelShare: '占比',
  noUsageTitle: '还没有用量记录',
  noUsageBody: '选中的通道下没有任何模型的调用记录。',
  noData: '没有数据',
  loadFailedTitle: '用量读取失败',
  loadFailedBody: '本机日志暂时无法读取，请稍后重试。',
  retry: '重试',
  refresh: '刷新',
  truncated: '会话过多，仅统计了最近 {count} 个会话。',
  failedSessions: '{count} 个会话读取失败，未计入。',
  footnote: '统计来源：本机会话日志中每次模型调用的 usage 记录，按本地时区归日。总量含缓存读取，缓存单独展示。',
  channelNote: '会话日志不记录 DeepSeek 账号 ID，因此这里按接入通道区分，而不是按账号。',
  cost: '预估费用',
  costPeak: '高峰时段',
  costOffPeak: '空闲时段',
  costUnpriced: '{count} 个模型没有官方定价，未计入',
  costPeakNote: '工作日的北京时间 9:00–12:00、14:00–18:00，法定节假日除外',
  costBundled: '官网价目表暂时无法读取，正在使用 {date} 的内置价格',
  costLive: '价目表更新于 {date}',
  costUnavailable: '暂时无法读取官方价目表',
  costColumn: '费用',
  costHolidayGap: '所选时段早于内置节假日表，法定节假日可能被按高峰计价，费用偏高。',
  costNoData: '所选时段没有用量',
  costUnpricedAll: '所选时段的用量来自没有官方定价的模型，无法估算费用',
  periodToday: '今天',
  periodThisWeek: '本周',
  periodAll: '统计以来',
  recordedTotal: '累计记录',
  blockUnit: '每块 {value} tokens',
  blockClipped: '有列超出上限，按 {count} 块截断',
  blocksCount: '{count} 块',
  weekRange: '起一周',
  cumulativeSince: '累计到此',
  weekAria: '每周 tokens 用量柱状图',
  totalAria: '累计 tokens 用量柱状图',
}

/** English dictionary, checked complete against the Chinese key set. */
const en = {
  balance: 'Balance',
  balanceUnavailable: 'Temporarily unavailable',
  expiresIn: '{amount} expires {when}',
  usage: 'Usage',
  topUp: 'Top up',
  expiryExplain: 'No expiry date for granted credit (not provided by the platform)',
  nav: 'Usage',
  title: 'Usage',
  calls: '{count} calls · cache reads included',
  cacheRead: 'Cache reads',
  cacheShare: '{percent}% of total',
  output: 'Output',
  input: '{value} input',
  viewDay: 'Daily',
  viewWeek: 'Weekly',
  viewTotal: 'Cumulative',
  channelOfficial: 'Account',
  channelApiKey: 'API key',
  channelRelay: 'Third party',
  channelUnknown: 'Unknown',
  excludeSubagents: 'Exclude subagents',
  dayHint: 'Last 26 weeks',
  dayAria: 'Daily token usage heatmap',
  weekHint: 'Last 26 weeks',
  totalHint: 'Last 26 weeks',
  colorHint: 'Stronger color means more tokens',
  byModel: 'By model',
  model: 'Model',
  modelCalls: 'Calls',
  modelInput: 'Input',
  modelOutput: 'Output',
  modelCache: 'Cache',
  modelTotal: 'Total',
  modelShare: 'Share',
  noUsageTitle: 'No usage recorded yet',
  noUsageBody: 'No model calls were recorded for the selected channels.',
  noData: 'No data',
  loadFailedTitle: 'Could not read usage',
  loadFailedBody: 'The local Session logs are unavailable right now. Try again shortly.',
  retry: 'Retry',
  refresh: 'Refresh',
  truncated: 'Too many Sessions; only the most recent {count} were counted.',
  failedSessions: '{count} Sessions could not be read and are excluded.',
  footnote: 'Source: the usage record of every model call in this machine\'s Session logs, bucketed by local calendar day. Totals include cache reads; cache is also shown separately.',
  channelNote: 'Session logs do not record a DeepSeek account id, so this axis is the access channel rather than the account.',
  cost: 'Estimated cost',
  costPeak: 'Peak',
  costOffPeak: 'Off-peak',
  costUnpriced: '{count} models have no published price and are excluded',
  costPeakNote: 'Weekdays 09:00–12:00 and 14:00–18:00 Beijing time, excluding Chinese public holidays',
  costBundled: 'The published price list is unreachable; using prices bundled on {date}',
  costLive: 'Price list updated {date}',
  costUnavailable: 'The published price list is unavailable right now',
  costColumn: 'Cost',
  costHolidayGap: 'This range predates the bundled holiday schedule, so public holidays may be priced at the peak rate.',
  costNoData: 'No usage in this range',
  costUnpricedAll: 'This range was served by models with no published price, so it cannot be estimated',
  periodToday: 'Today',
  periodThisWeek: 'This week',
  periodAll: 'Since records began',
  recordedTotal: 'All recorded',
  blockUnit: '{value} tokens per block',
  blockClipped: 'Some columns exceed the ceiling and are clipped at {count} blocks',
  blocksCount: '{count} blocks',
  weekRange: 'week',
  cumulativeSince: 'running total',
  weekAria: 'Weekly token usage as block columns',
  totalAria: 'Cumulative token usage as block columns',
}

/** The dictionary namespaces and their rows. */
export const dictionaries = { zh, en }

/** Key set used to validate every translation. */
export const keys = Object.keys(zh)

/**
 * Interpolate `{name}` placeholders.
 *
 * @param template - dictionary row.
 * @param values - placeholder values.
 * @returns the filled text.
 */
export function interpolate(template, values) {
  if (values === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
}

/**
 * Pick a dictionary for the active language.
 *
 * @param language - active UI language such as `zh-CN`.
 * @returns dictionary rows.
 */
export function dictionaryFor(language) {
  return String(language ?? '').toLowerCase().startsWith('zh') ? zh : en
}
