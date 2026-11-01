import { GoogleGenAI } from '@google/genai';

type Message = { role: 'user' | 'assistant'; text: string };
type Request = {
  method?: string;
  body?: unknown;
};
type Response = {
  status: (code: number) => Response;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const MAX_IMAGE_DATA_LENGTH = 3_500_000;

export const config = {
  api: { bodyParser: { sizeLimit: '4.5mb' } },
};

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Gemini is not configured. Set GEMINI_API_KEY in the Vercel project settings.' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
    const history: Message[] = messages
      .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object')
      .filter((message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string' && message.text.trim().length > 0
      )
      .map((message) => ({
        role: message.role as Message['role'],
        text: (message.text as string).trim().slice(0, 4000),
      }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Enter a message before sending.' });
    }

    const candidate = body.attachment;
    const attachment = candidate && typeof candidate === 'object'
      ? candidate as Record<string, unknown>
      : null;
    const validImage = attachment &&
      typeof attachment.data === 'string' &&
      attachment.data.length <= MAX_IMAGE_DATA_LENGTH &&
      typeof attachment.mimeType === 'string' &&
      attachment.mimeType.startsWith('image/');

    const contents = history.map((message, index) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        { text: message.text },
        ...(index === history.length - 1 && validImage
          ? [{ inlineData: { data: attachment.data as string, mimeType: attachment.mimeType as string } }]
          : []),
      ],
    }));

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      contents,
      config: {
        maxOutputTokens: 800,
        systemInstruction: 'You are Project Echo AI, a thoughtful assistant for an accessible multimodal communication product. Be concise, respectful, and clear. Never claim to detect a person’s emotions or intent from appearance. For communication support, offer choices and leave the user in control of what they send or speak.',
      },
    });

    return res.status(200).json({ text: response.text || '' });
  } catch (error) {
    console.error('Gemini chat request failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(502).json({ error: 'Gemini could not complete this request. Check the API key and try again.' });
  }
}
