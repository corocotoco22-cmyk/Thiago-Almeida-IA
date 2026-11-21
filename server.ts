import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, type Content, type Part } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';
const TTS_MODEL = 'gemini-3.8-flash-lite-tts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const aiBeta = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  apiVersion: 'v1beta',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const MODE_INSTRUCTIONS: Record<string, string> = {
  geral:
    'Você atua como um interlocutor versátil, lúcido e pragmático. Responda com clareza, objetividade e profundidade equilibrada, adaptando o nível técnico ao contexto da pergunta.',
  engenharia:
    'Você atua como arquiteto de software sênior e engenheiro full-stack. Priorize código limpo, seguro, tipado, boas práticas de arquitetura web (HTML, CSS, TypeScript, React, Node.js), explicações técnicas diretas e exemplos funcionais.',
  estrategia:
    'Você atua como consultor estratégico de produto e negócios. Estruture análises com clareza, avalie trade-offs, riscos, métricas relevantes e próximos passos práticos.',
  escrita:
    'Você atua como editor e redator sênior. Produza textos elegantes, naturais, bem ritmados e persuasivos em português do Brasil, evitando clichês e prolixidade.',
  didatica:
    'Você atua como tutor e professor experiente. Explique conceitos complexos passo a passo, use analogias concretas do dia a dia, destaque armadilhas comuns e proponha pequenas verificações de entendimento.',
};

function buildSystemInstruction(mode: string): string {
  const specialty = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS.geral;
  return [
    'Você é Thiago Almeida, uma inteligência artificial conversacional brasileira, inteligente, articulada, ética e acessível.',
    'Identidade: Seu nome é Thiago Almeida. Nunca diga que você é um modelo genérico sem nome; apresente-se naturalmente como Thiago Almeida quando perguntado quem você é.',
    'Idioma: Responda em português do Brasil natural e fluente, a menos que o usuário peça explicitamente outro idioma.',
    'Postura: Seja honesto sobre incertezas, não invente fatos ou URLs, organize respostas longas com títulos curtos, listas e blocos de código em Markdown bem formatados.',
    `Especialidade ativa: ${specialty}`,
  ].join('\n\n');
}

interface IncomingMessage {
  role: 'user' | 'model';
  text: string;
  image?: {
    mimeType: string;
    data: string;
  };
}

interface ChatRequestBody {
  messages?: IncomingMessage[];
  mode?: string;
  depth?: 'rapido' | 'profundo';
}

function extractReadableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: number; status?: string };
    };
    if (parsed?.error?.message) {
      try {
        const inner = JSON.parse(parsed.error.message) as {
          error?: { message?: string };
        };
        if (inner?.error?.message) return inner.error.message;
      } catch {
        return parsed.error.message;
      }
    }
  } catch {
    // Raw message is not JSON
  }
  return raw;
}

function isTransientError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('500') ||
    raw.includes('INTERNAL') ||
    raw.includes('ECONNRESET') ||
    raw.includes('ETIMEDOUT')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    !process.env.GEMINI_API_KEY ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('API key not valid')
  ) {
    return {
      status: 400,
      message:
        'Chave da API Gemini ausente ou inválida. Verifique a configuração em Settings > Secrets.',
    };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message:
        'Permissão negada pela API Gemini. Verifique a chave configurada em Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message:
        'Limite de requisições atingido no momento. Aguarde alguns instantes e tente novamente.',
    };
  }
  if (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand')
  ) {
    return {
      status: 503,
      message:
        'O servidor de IA está com alta demanda temporária no momento. Aguarde alguns segundos e clique em "Tentar novamente".',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: 'Modelo de IA indisponível ou não encontrado.',
    };
  }
  return {
    status: 500,
    message:
      extractReadableError(err) ||
      'Erro inesperado ao gerar resposta. Tente novamente.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, assistant: 'Thiago Almeida' });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ChatRequestBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const mode = typeof body.mode === 'string' ? body.mode : 'geral';
    const depth = body.depth === 'profundo' ? 'profundo' : 'rapido';

    if (messages.length === 0) {
      res.status(400).json({ error: 'Envie pelo menos uma mensagem para iniciar a conversa.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(400).json({
        error:
          'Chave da API Gemini não encontrada. Configure GEMINI_API_KEY em Settings > Secrets.',
      });
      return;
    }

    const contents: Content[] = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'model'))
      .map((m) => {
        const parts: Part[] = [];
        if (m.image?.data && m.image?.mimeType) {
          parts.push({
            inlineData: {
              mimeType: m.image.mimeType,
              data: m.image.data,
            },
          });
        }
        if (typeof m.text === 'string' && m.text.trim().length > 0) {
          parts.push({ text: m.text });
        } else if (parts.length === 0) {
          parts.push({ text: ' ' });
        }
        return {
          role: m.role,
          parts,
        };
      });

    if (contents.length === 0) {
      res.status(400).json({ error: 'Formato de mensagens inválido.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let aborted = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        aborted = true;
      }
    });

    try {
      const thinkingLevel =
        depth === 'profundo' ? ThinkingLevel.HIGH : ThinkingLevel.LOW;
      const systemInstruction = buildSystemInstruction(mode);

      const attempts: Array<{ model: string; backoffMs: number }> = [
        { model: PRIMARY_MODEL, backoffMs: 0 },
        { model: PRIMARY_MODEL, backoffMs: 700 },
        { model: PRIMARY_MODEL, backoffMs: 1500 },
        { model: FALLBACK_MODEL, backoffMs: 400 },
      ];

      let streamedAnyChunk = false;
      let lastErr: unknown = null;

      for (const attempt of attempts) {
        if (aborted) break;
        if (attempt.backoffMs > 0) {
          await sleep(attempt.backoffMs);
          if (aborted) break;
        }

        try {
          const stream = await ai.models.generateContentStream({
            model: attempt.model,
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel },
            },
          });

          for await (const chunk of stream) {
            if (aborted) break;
            const text = chunk.text;
            if (text) {
              streamedAnyChunk = true;
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }

          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (streamedAnyChunk || !isTransientError(err)) {
            throw err;
          }
        }
      }

      if (lastErr) {
        throw lastErr;
      }

      if (!aborted && !res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (err) {
      const formatted = formatGeminiError(err);
      if (!aborted && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: formatted.message })}\n\n`);
        res.end();
      }
    }
  });

  app.post('/api/transcribe', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      audioBase64?: string;
      mimeType?: string;
    };
    const audioBase64 =
      typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '';
    const rawMime =
      typeof body.mimeType === 'string' ? body.mimeType.trim() : 'audio/webm';
    const cleanMime = rawMime.split(';')[0] || 'audio/webm';

    if (!audioBase64) {
      res.status(400).json({ error: 'Áudio não enviado para transcrição.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(400).json({
        error:
          'Chave da API Gemini não encontrada. Configure GEMINI_API_KEY em Settings > Secrets.',
      });
      return;
    }

    const backoffs = [0, 700, 1500];
    let lastErr: unknown = null;

    for (const delayMs of backoffs) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        const response = await aiBeta.models.generateContent({
          model: TRANSCRIBE_MODEL,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMime,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcreva fielmente este áudio em português. Retorne apenas o texto transcrito, sem comentários extras.',
              },
            ],
          },
        });

        const text = (response.text ?? '').trim();
        res.json({ text });
        return;
      } catch (err) {
        lastErr = err;
        if (!isTransientError(err)) break;
      }
    }

    const formatted = formatGeminiError(lastErr);
    res.status(formatted.status).json({ error: formatted.message });
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      text?: string;
      voiceName?: string;
    };
    const rawText = typeof body.text === 'string' ? body.text : '';
    const cleanedText = rawText
      .replace(/```[\s\S]*?```/g, ' Bloco de código omitido na leitura. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_~>-]{1,3}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3800);

    if (!cleanedText) {
      res.status(400).json({ error: 'Texto vazio para conversão em fala.' });
      return;
    }

    if (!process.env.GEMINI_API_KEY) {
      res.status(400).json({
        error:
          'Chave da API Gemini não encontrada. Configure GEMINI_API_KEY em Settings > Secrets.',
      });
      return;
    }

    const allowedVoices = new Set([
      'Puck',
      'Charon',
      'Kore',
      'Fenrir',
      'Zephyr',
    ]);
    const voiceName =
      typeof body.voiceName === 'string' && allowedVoices.has(body.voiceName)
        ? body.voiceName
        : 'Charon';

    const backoffs = [0, 700, 1500];
    let lastErr: unknown = null;

    for (const delayMs of backoffs) {
      if (delayMs > 0) await sleep(delayMs);
      try {
        const response = await aiBeta.models.generateContent({
          model: TTS_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanedText,
                  speechMetadata: {
                    style:
                      'Clear, natural, articulate Brazilian Portuguese assistant voice',
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });

        const base64Audio =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!base64Audio) {
          throw new Error('Áudio não gerado pelo serviço de voz.');
        }

        res.json({
          audioBase64: base64Audio,
          mimeType: 'audio/wav',
        });
        return;
      } catch (err) {
        lastErr = err;
        if (!isTransientError(err)) break;
      }
    }

    const formatted = formatGeminiError(lastErr);
    res.status(formatted.status).json({ error: formatted.message });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Thiago Almeida server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
