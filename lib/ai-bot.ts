export type AiBotMatch = {
  name: string;
  operator: string;
  purpose: 'training' | 'search' | 'assistant' | 'agent';
};

// Conservative allow-list: generic crawlers/search spiders are deliberately excluded.
const AI_BOTS: Array<{ name: string; operator: string; purpose: AiBotMatch['purpose']; patterns: RegExp[] }> = [
  { name: 'GPTBot', operator: 'OpenAI', purpose: 'training', patterns: [/\bgptbot\b/i] },
  { name: 'OAI-SearchBot', operator: 'OpenAI', purpose: 'search', patterns: [/\boai-searchbot\b/i] },
  { name: 'ChatGPT-User', operator: 'OpenAI', purpose: 'assistant', patterns: [/\bchatgpt-user\b/i] },
  { name: 'ClaudeBot', operator: 'Anthropic', purpose: 'training', patterns: [/\bclaudebot\b/i] },
  { name: 'Claude-SearchBot', operator: 'Anthropic', purpose: 'search', patterns: [/\bclaude-searchbot\b/i] },
  { name: 'Claude-User', operator: 'Anthropic', purpose: 'assistant', patterns: [/\bclaude-user\b/i] },
  { name: 'PerplexityBot', operator: 'Perplexity', purpose: 'search', patterns: [/\bperplexitybot\b/i] },
  { name: 'Bytespider', operator: 'ByteDance', purpose: 'training', patterns: [/\bbytespider\b/i] },
  { name: 'Meta-ExternalAgent', operator: 'Meta', purpose: 'training', patterns: [/\bmeta-externalagent\b/i] },
  { name: 'Meta-ExternalFetcher', operator: 'Meta', purpose: 'assistant', patterns: [/\bmeta-externalfetcher\b/i] },
  { name: 'Amazonbot', operator: 'Amazon', purpose: 'training', patterns: [/\bamazonbot\b/i] },
  { name: 'Google-CloudVertexBot', operator: 'Google', purpose: 'training', patterns: [/\bgoogle-cloudvertexbot\b/i] },
  { name: 'DuckAssistBot', operator: 'DuckDuckGo', purpose: 'assistant', patterns: [/\bduckassistbot\b/i] },
  { name: 'MistralAI-User', operator: 'Mistral', purpose: 'assistant', patterns: [/\bmistralai-user\b/i] },
  { name: 'Cloudflare-AI-Search', operator: 'Cloudflare', purpose: 'search', patterns: [/\bcloudflare-ai-search\b/i] },
];

export function classifyAiUserAgent(userAgent: string | null | undefined): AiBotMatch | null {
  const value = String(userAgent || '').slice(0, 2048);
  if (!value) return null;
  for (const bot of AI_BOTS) if (bot.patterns.some((pattern) => pattern.test(value))) return { name: bot.name, operator: bot.operator, purpose: bot.purpose };
  return null;
}

export function aiBotCatalog() {
  return AI_BOTS.map(({ name, operator, purpose }) => ({ name, operator, purpose }));
}
