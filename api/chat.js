const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 2000;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Use POST to send a chat message.' });
  }

  const origin = request.headers.origin;
  const requestHost = request.headers['x-forwarded-host'] || request.headers.host;
  if (!origin || !requestHost || new URL(origin).host !== requestHost) {
    return response.status(403).json({ error: 'This chat only accepts messages from your toolkit.' });
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return response.status(503).json({ error: 'DeepSeek is not connected yet. Add DEEPSEEK_API_KEY to your Vercel environment variables, then redeploy.' });
  }

  const messages = request.body?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return response.status(400).json({ error: 'Send up to 12 chat messages at a time.' });
  }

  const safeMessages = [];
  for (const message of messages) {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_LENGTH) {
      return response.status(400).json({ error: 'Each message must be text under 2,000 characters.' });
    }
    safeMessages.push({ role: message.role, content: message.content.trim() });
  }

  const tools = Array.isArray(request.body.tools)
    ? request.body.tools.slice(0, 20).map(tool => ({
      name: String(tool?.name || '').slice(0, 80),
      description: String(tool?.description || '').slice(0, 500),
      url: String(tool?.url || '').slice(0, 200)
    })).filter(tool => tool.name)
    : [];

  const systemPrompt = `You are AJB, a friendly, witty, practical personal assistant for AJB's tools website. Your job is to help the owner understand and use only the tools in this toolkit. Keep the conversation focused on those tools and their workflows. If asked for unrelated help, briefly steer the conversation back to the toolkit. Give clear, numbered steps when useful, and mention which tool to open. Never claim you can operate a tool, access a user's files, or see their screen. The tools run in the user's browser unless their description says otherwise. Be warm and entertaining without getting in the way. Available tools:\n${JSON.stringify(tools)}`;

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }, ...safeMessages],
        temperature: 0.7,
        max_tokens: 700
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!upstream.ok) {
      return response.status(502).json({ error: 'DeepSeek could not answer just now. Please try again in a moment.' });
    }

    const result = await upstream.json();
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return response.status(502).json({ error: 'DeepSeek sent back an empty reply. Try asking a different way.' });
    }
    return response.status(200).json({ reply: reply.trim() });
  } catch {
    return response.status(502).json({ error: 'I lost connection to DeepSeek. Please try again.' });
  }
}