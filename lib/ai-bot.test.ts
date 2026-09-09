import { classifyAiUserAgent } from './ai-bot';

describe('classifyAiUserAgent', () => {
  it('recognizes known AI crawlers from their user agent', () => {
    expect(classifyAiUserAgent('Mozilla/5.0 GPTBot')).toEqual({ name: 'GPTBot', operator: 'OpenAI', purpose: 'training' });
    expect(classifyAiUserAgent('Mozilla/5.0 AppleWebKit Cloudflare-AI-Search')).toEqual({ name: 'Cloudflare-AI-Search', operator: 'Cloudflare', purpose: 'search' });
  });

  it('does not classify generic bot wording as an AI crawler', () => {
    expect(classifyAiUserAgent('Mozilla/5.0 (compatible; ExampleBot/1.0)')).toBeNull();
    expect(classifyAiUserAgent('')).toBeNull();
  });
});
