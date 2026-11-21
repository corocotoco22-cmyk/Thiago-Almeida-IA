import { type Conversation, MODE_CONFIGS } from '../types/chat';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMessageHtml(text: string): string {
  const escaped = escapeHtml(text);
  // Format fenced code blocks cleanly
  const withCodeBlocks = escaped.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang: string, code: string) => {
      const label = lang ? `<div class="code-lang">${lang}</div>` : '';
      return `<pre class="code-block">${label}<code>${code}</code></pre>`;
    }
  );
  return withCodeBlocks.replaceAll('\n', '<br />');
}

export function exportConversationAsHtml(conversation: Conversation): void {
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const messagesHtml = conversation.messages
    .map((msg) => {
      const isUser = msg.role === 'user';
      const author = isUser ? 'Você' : 'Thiago Almeida';
      const modeLabel =
        !isUser && msg.mode ? ` · ${MODE_CONFIGS[msg.mode].label}` : '';
      const timeStr = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(msg.timestamp);

      return `
        <article class="message ${isUser ? 'user' : 'assistant'}">
          <header class="meta">${escapeHtml(author)}${escapeHtml(modeLabel)} · ${escapeHtml(timeStr)}</header>
          <div class="body">${formatMessageHtml(msg.text)}</div>
        </article>
      `;
    })
    .join('\n');

  const htmlDocument = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(conversation.title)} — Thiago Almeida</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.6;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 36px;
    }
    .doc-header {
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .doc-header h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 700;
    }
    .doc-header p {
      margin: 0;
      font-size: 13px;
      color: #64748b;
    }
    .message {
      margin-bottom: 24px;
      padding: 16px 20px;
      border-radius: 10px;
      border: 1px solid #e2e8f0;
    }
    .message.user {
      background: #f1f5f9;
    }
    .message.assistant {
      background: #ffffff;
    }
    .meta {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 8px;
    }
    .body {
      font-size: 15px;
      word-break: break-word;
    }
    .code-block {
      background: #0f172a;
      color: #f8fafc;
      padding: 14px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 13px;
      margin: 12px 0;
    }
    .code-lang {
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 6px;
    }
  </style>
</head>
<body>
  <main>
    <header class="doc-header">
      <h1>${escapeHtml(conversation.title)}</h1>
      <p>Conversa com Thiago Almeida · Exportada em ${escapeHtml(
        dateFormatter.format(Date.now())
      )}</p>
    </header>
    ${messagesHtml}
  </main>
</body>
</html>`;

  const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeSlug = conversation.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);

  anchor.href = url;
  anchor.download = `thiago-almeida-${safeSlug || 'conversa'}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
