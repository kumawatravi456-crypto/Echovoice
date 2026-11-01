import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

type ChatRole = 'user' | 'assistant';

function geminiChatPlugin(apiKey: string, model: string): Plugin {
  const middleware = async (req: any, res: any, next: any) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.end();
      return;
    }

    if (!apiKey) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Gemini is not configured. Set GEMINI_API_KEY in the server environment or .env.local.' }));
      return;
    }

    try {
      let rawBody = '';
      for await (const chunk of req) {
        rawBody += Buffer.from(chunk).toString('utf8');
        if (rawBody.length > 10 * 1024 * 1024) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'This message is too large to send.' }));
          return;
        }
      }

      const body = JSON.parse(rawBody || '{}');
      const messages = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
      const history = messages
        .filter((message: any) =>
          (message?.role === 'user' || message?.role === 'assistant') &&
          typeof message?.text === 'string' && message.text.trim().length > 0
        )
        .map((message: any) => ({ role: message.role, text: message.text.trim().slice(0, 4000) }));

      if (history.length === 0 || history[history.length - 1].role !== 'user') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Enter a message before sending.' }));
        return;
      }

      const attachment = body.attachment;
      const validImage = attachment &&
        typeof attachment.data === 'string' &&
        typeof attachment.mimeType === 'string' &&
        attachment.mimeType.startsWith('image/') &&
        attachment.data.length <= 8 * 1024 * 1024;

      const contents = history.map((message: { role: ChatRole; text: string }, index: number) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [
          { text: message.text },
          ...(index === history.length - 1 && validImage
            ? [{ inlineData: { data: attachment.data, mimeType: attachment.mimeType } }]
            : []),
        ],
      }));

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          maxOutputTokens: 800,
          systemInstruction: 'You are Project Echo AI, a thoughtful assistant for an accessible multimodal communication product. Be concise, respectful, and clear. Never claim to detect a person’s emotions or intent from appearance. For communication support, offer choices and leave the user in control of what they send or speak.',
        },
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ text: response.text || '' }));
    } catch (error) {
      console.error('Gemini chat request failed:', error instanceof Error ? error.message : 'Unknown error');
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Gemini could not complete this request. Check the API key and try again.' }));
    }
  };

  return {
    name: 'project-echo-gemini-chat',
    configureServer(server) {
      server.middlewares.use('/api/chat', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      geminiChatPlugin(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '', env.GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.8-flash'),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
