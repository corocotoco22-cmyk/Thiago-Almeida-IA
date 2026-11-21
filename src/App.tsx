import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertCircle,
  ArrowUp,
  Check,
  Copy,
  Download,
  ImagePlus,
  Loader2,
  Menu,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  type AssistantMode,
  type ChatMessage,
  type Conversation,
  type ImageAttachment,
  MODE_CONFIGS,
  MODE_LIST,
  type ThinkingDepth,
} from './types/chat';
import { Sidebar } from './components/Sidebar';
import { ThiagoAvatar } from './components/ThiagoAvatar';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { exportConversationAsHtml } from './utils/exportHtml';

const STORAGE_CONVERSATIONS_KEY = 'thiago_almeida_conversations_v1';
const STORAGE_THEME_KEY = 'thiago_almeida_theme_v1';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildTitleFromPrompt(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Nova conversa';
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}...` : cleaned;
}

function formatMessageTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CONVERSATIONS_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as Conversation[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () => {
      try {
        const saved = localStorage.getItem(STORAGE_CONVERSATIONS_KEY);
        if (!saved) return null;
        const parsed = JSON.parse(saved) as Conversation[];
        return Array.isArray(parsed) && parsed.length > 0 ? parsed[0].id : null;
      } catch {
        return null;
      }
    }
  );

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  const [mode, setMode] = useState<AssistantMode>('geral');
  const [depth, setDepth] = useState<ThinkingDepth>('rapido');
  const [inputValue, setInputValue] = useState('');
  const [attachment, setAttachment] = useState<ImageAttachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // Speech-to-Text (Fala -> Texto)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Text-to-Speech (Texto -> Fala)
  const [loadingTtsMessageId, setLoadingTtsMessageId] = useState<string | null>(
    null
  );
  const [playingTtsMessageId, setPlayingTtsMessageId] = useState<string | null>(
    null
  );
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingCancelledRef = useRef(false);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
  const autoSpeakRef = useRef(autoSpeakReplies);

  useEffect(() => {
    autoSpeakRef.current = autoSpeakReplies;
  }, [autoSpeakReplies]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioElementRef.current?.pause();
      ttsCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      ttsCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage quota errors
    }
  }, [isDark]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_CONVERSATIONS_KEY,
        JSON.stringify(conversations)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [conversations]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  useEffect(() => {
    if (activeConversation) {
      setMode(activeConversation.mode);
    }
  }, [activeConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages.length, isStreaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputValue]);

  const handleNewConversation = useCallback(() => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setActiveConversationId(null);
    setErrorMessage(null);
    setInputValue('');
    setAttachment(null);
    setTimeout(() => textareaRef.current?.focus(), 40);
  }, [isStreaming]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (isStreaming) {
        abortControllerRef.current?.abort();
        setIsStreaming(false);
      }
      setActiveConversationId(id);
      setErrorMessage(null);
    },
    [isStreaming]
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeConversationId === id) {
          setActiveConversationId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    },
    [activeConversationId]
  );

  const handleClearAllConversations = useCallback(() => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setConversations([]);
    setActiveConversationId(null);
    setErrorMessage(null);
  }, [isStreaming]);

  const handleModeChange = (nextMode: AssistantMode) => {
    setMode(nextMode);
    if (activeConversationId) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId ? { ...c, mode: nextMode } : c
        )
      );
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Selecione um arquivo de imagem válido (PNG, JPG ou WebP).');
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setErrorMessage('A imagem deve ter no máximo 4 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (!base64) {
        setErrorMessage('Não foi possível ler a imagem selecionada.');
        return;
      }
      setErrorMessage(null);
      setAttachment({
        mimeType: file.type,
        data: base64,
        previewUrl: result,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const stopAudioPlayback = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }
    setPlayingTtsMessageId(null);
  }, []);

  const playMessageAudio = useCallback(
    async (messageId: string, text: string, suppressError = false) => {
      if (playingTtsMessageId === messageId) {
        stopAudioPlayback();
        return;
      }

      stopAudioPlayback();

      const startPlayback = async (objectUrl: string) => {
        const audio = new Audio(objectUrl);
        audioElementRef.current = audio;
        setPlayingTtsMessageId(messageId);

        audio.onended = () => {
          if (audioElementRef.current === audio) {
            audioElementRef.current = null;
          }
          setPlayingTtsMessageId((current) =>
            current === messageId ? null : current
          );
        };

        audio.onerror = () => {
          if (audioElementRef.current === audio) {
            audioElementRef.current = null;
          }
          setPlayingTtsMessageId((current) =>
            current === messageId ? null : current
          );
        };

        try {
          await audio.play();
        } catch {
          setPlayingTtsMessageId(null);
          if (!suppressError) {
            setErrorMessage(
              'O navegador bloqueou a reprodução automática. Clique em "Ouvir" na resposta.'
            );
          }
        }
      };

      const cachedUrl = ttsCacheRef.current.get(messageId);
      if (cachedUrl) {
        await startPlayback(cachedUrl);
        return;
      }

      setLoadingTtsMessageId(messageId);
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        const data = (await res.json()) as {
          audioBase64?: string;
          mimeType?: string;
          error?: string;
        };

        if (!res.ok || !data.audioBase64) {
          throw new Error(
            data.error || 'Não foi possível gerar o áudio desta resposta.'
          );
        }

        const binary = atob(data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: data.mimeType || 'audio/wav',
        });
        const objectUrl = URL.createObjectURL(blob);
        ttsCacheRef.current.set(messageId, objectUrl);
        await startPlayback(objectUrl);
      } catch (err) {
        if (!suppressError) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Erro ao converter texto em fala.'
          );
        }
      } finally {
        setLoadingTtsMessageId((current) =>
          current === messageId ? null : current
        );
      }
    },
    [playingTtsMessageId, stopAudioPlayback]
  );

  const transcribeAudioBlob = useCallback(async (blob: Blob) => {
    setIsTranscribing(true);
    setErrorMessage(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = typeof reader.result === 'string' ? reader.result : '';
          const encoded = res.split(',')[1];
          if (!encoded) {
            reject(new Error('Falha ao ler áudio gravado.'));
          } else {
            resolve(encoded);
          }
        };
        reader.onerror = () =>
          reject(new Error('Erro ao processar arquivo de áudio.'));
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
        }),
      });

      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        throw new Error(
          data.error || 'Não foi possível converter sua fala em texto.'
        );
      }

      const transcript = (data.text ?? '').trim();
      if (!transcript) {
        setErrorMessage(
          'Nenhuma fala foi reconhecida no áudio. Tente falar mais perto do microfone.'
        );
        return;
      }

      setInputValue((prev) =>
        prev.trim() ? `${prev.trim()} ${transcript}` : transcript
      );
      setTimeout(() => textareaRef.current?.focus(), 40);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Erro ao converter fala em texto.'
      );
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const stopRecordingCleanup = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
    setRecordingSeconds(0);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing || isStreaming) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErrorMessage(
        'Gravação de áudio pelo microfone não é suportada neste navegador.'
      );
      return;
    }

    setErrorMessage(null);
    recordingCancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mimeType = preferredTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const type = recorder.mimeType || 'audio/webm';
        stopRecordingCleanup();

        if (recordingCancelledRef.current || chunks.length === 0) {
          return;
        }
        const audioBlob = new Blob(chunks, { type });
        void transcribeAudioBlob(audioBlob);
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      stopRecordingCleanup();
      setErrorMessage(
        'Não foi possível acessar o microfone. Verifique as permissões do navegador.'
      );
    }
  }, [
    isRecording,
    isStreaming,
    isTranscribing,
    stopRecordingCleanup,
    transcribeAudioBlob,
  ]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingCleanup();
    }
  }, [stopRecordingCleanup]);

  const cancelRecording = useCallback(() => {
    recordingCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingCleanup();
    }
  }, [stopRecordingCleanup]);

  const streamResponse = useCallback(
    async (
      conversationId: string,
      historyForApi: ChatMessage[],
      assistantMessageId: string,
      activeMode: AssistantMode,
      activeDepth: ThinkingDepth
    ) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);
      setErrorMessage(null);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            mode: activeMode,
            depth: activeDepth,
            messages: historyForApi.map((m) => ({
              role: m.role,
              text: m.text,
              image: m.image
                ? { mimeType: m.image.mimeType, data: m.image.data }
                : undefined,
            })),
          }),
        });

        if (!response.ok) {
          let errText = 'Não foi possível conectar ao servidor do Thiago Almeida.';
          try {
            const errJson = (await response.json()) as { error?: string };
            if (errJson.error) errText = errJson.error;
          } catch {
            // Keep fallback error message
          }
          throw new Error(errText);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Fluxo de resposta indisponível.');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            const line = event
              .split('\n')
              .find((l) => l.startsWith('data: '));
            if (!line) continue;

            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;

            const parsed = JSON.parse(payload) as {
              text?: string;
              error?: string;
            };

            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.text) {
              accumulated += parsed.text;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === conversationId
                    ? {
                        ...c,
                        updatedAt: Date.now(),
                        messages: c.messages.map((m) =>
                          m.id === assistantMessageId
                            ? { ...m, text: accumulated }
                            : m
                        ),
                      }
                    : c
                )
              );
            }
          }
        }
        if (autoSpeakRef.current && accumulated.trim().length > 0) {
          void playMessageAudio(assistantMessageId, accumulated, true);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Erro ao gerar resposta do Thiago Almeida.';
        setErrorMessage(message);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.filter(
                    (m) => !(m.id === assistantMessageId && m.text.trim() === '')
                  ),
                }
              : c
          )
        );
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [playMessageAudio]
  );

  const sendMessage = useCallback(
    async (overridePrompt?: string) => {
      const textToSend = (overridePrompt ?? inputValue).trim();
      if ((!textToSend && !attachment) || isStreaming) return;

      const now = Date.now();
      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        text: textToSend || 'Analise esta imagem.',
        timestamp: now,
        image: attachment
          ? {
              mimeType: attachment.mimeType,
              data: attachment.data,
              name: attachment.name,
            }
          : undefined,
      };

      const assistantMessageId = createId();
      const assistantPlaceholder: ChatMessage = {
        id: assistantMessageId,
        role: 'model',
        text: '',
        timestamp: now + 1,
        mode,
      };

      let targetConversationId = activeConversationId;
      let historyForApi: ChatMessage[] = [];

      if (!targetConversationId || !activeConversation) {
        const newId = createId();
        targetConversationId = newId;
        historyForApi = [userMessage];
        const newConversation: Conversation = {
          id: newId,
          title: buildTitleFromPrompt(userMessage.text),
          mode,
          createdAt: now,
          updatedAt: now,
          messages: [userMessage, assistantPlaceholder],
        };
        setConversations((prev) => [newConversation, ...prev]);
        setActiveConversationId(newId);
      } else {
        historyForApi = [...activeConversation.messages, userMessage];
        setConversations((prev) =>
          prev.map((c) =>
            c.id === targetConversationId
              ? {
                  ...c,
                  mode,
                  updatedAt: now,
                  messages: [...c.messages, userMessage, assistantPlaceholder],
                }
              : c
          )
        );
      }

      if (!overridePrompt) {
        setInputValue('');
      }
      setAttachment(null);

      await streamResponse(
        targetConversationId,
        historyForApi,
        assistantMessageId,
        mode,
        depth
      );
    },
    [
      activeConversation,
      activeConversationId,
      attachment,
      depth,
      inputValue,
      isStreaming,
      mode,
      streamResponse,
    ]
  );

  const handleRegenerateLast = useCallback(async () => {
    if (!activeConversation || isStreaming) return;
    const msgs = activeConversation.messages;
    if (msgs.length === 0) return;

    const lastUserIndex = [...msgs]
      .reverse()
      .findIndex((m) => m.role === 'user');
    if (lastUserIndex === -1) return;

    const actualUserIndex = msgs.length - 1 - lastUserIndex;
    const trimmedHistory = msgs.slice(0, actualUserIndex + 1);
    const assistantMessageId = createId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantMessageId,
      role: 'model',
      text: '',
      timestamp: Date.now(),
      mode,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? {
              ...c,
              updatedAt: Date.now(),
              messages: [...trimmedHistory, assistantPlaceholder],
            }
          : c
      )
    );

    await streamResponse(
      activeConversation.id,
      trimmedHistory,
      assistantMessageId,
      mode,
      depth
    );
  }, [activeConversation, depth, isStreaming, mode, streamResponse]);

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text);
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const handleExportActiveHtml = () => {
    if (!activeConversation || activeConversation.messages.length === 0) return;
    exportConversationAsHtml(activeConversation);
  };

  const activeModeConfig = MODE_CONFIGS[mode];
  const hasMessages = Boolean(
    activeConversation && activeConversation.messages.length > 0
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        isDark={isDark}
        isOpenMobile={isSidebarOpenMobile}
        canExport={hasMessages}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onClearAllConversations={handleClearAllConversations}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onExportHtml={handleExportActiveHtml}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb/Title — Mode Tabs — Single Primary Action */}
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 lg:px-6 py-3 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpenMobile(true)}
              aria-label="Abrir histórico de conversas"
              className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex items-center gap-2 text-sm">
              <span className="font-display font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0">
                Thiago Almeida
              </span>
              <span
                aria-hidden="true"
                className="text-slate-300 dark:text-slate-700"
              >
                /
              </span>
              <span className="truncate text-slate-500 dark:text-slate-400 max-w-[180px] sm:max-w-[260px]">
                {activeConversation ? activeConversation.title : 'Nova conversa'}
              </span>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Especialidade do Thiago Almeida"
            className="hidden xl:flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-900 p-1"
          >
            {MODE_LIST.map((m) => {
              const selected = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleModeChange(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    selected
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {m.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportActiveHtml}
              disabled={!hasMessages}
              className="min-h-[38px] inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Exportar HTML</span>
            </button>
          </div>
        </header>

        {/* Main Chat Viewport */}
        <main className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
              <div className="flex flex-col items-start gap-5">
                <ThiagoAvatar size="lg" />

                <div className="space-y-2.5">
                  <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
                    Olá, eu sou o Thiago Almeida.
                  </h1>
                  <p className="max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
                    Sua inteligência artificial em português para pensar com
                    clareza, escrever código, estruturar estratégias e aprender
                    novos temas sem rodeios.
                  </p>
                </div>

                {/* Mode selector tabs for smaller screens & quick inspection */}
                <div className="w-full space-y-2.5 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {MODE_LIST.map((m) => {
                      const selected = m.id === mode;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleModeChange(m.id)}
                          className={`min-h-[36px] rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            selected
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                              : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Modo {activeModeConfig.label} · {activeModeConfig.description}
                  </p>
                </div>

                {/* Starter Prompts Grid */}
                <div className="grid w-full grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                  {activeModeConfig.starters.map((starter) => (
                    <button
                      key={starter.title}
                      type="button"
                      onClick={() => void sendMessage(starter.prompt)}
                      className="group flex flex-col items-start justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 text-left transition-colors hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {starter.title}
                      </span>
                      <span className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                        {starter.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-8">
              {activeConversation?.messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isLastMessage =
                  index === activeConversation.messages.length - 1;
                const isPendingFirstToken =
                  !isUser && isStreaming && isLastMessage && msg.text === '';

                if (isUser) {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/90 px-4 py-3 text-[15px] leading-relaxed text-slate-900 dark:text-slate-100">
                        {msg.image && (
                          <div className="mb-2.5 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                            <img
                              src={`data:${msg.image.mimeType};base64,${msg.image.data}`}
                              alt={msg.image.name || 'Imagem enviada'}
                              className="max-h-64 w-auto object-contain"
                            />
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <article key={msg.id} className="flex items-start gap-3.5">
                    <ThiagoAvatar size="sm" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          Thiago Almeida
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {MODE_CONFIGS[msg.mode ?? mode]?.label ?? 'Geral'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatMessageTime(msg.timestamp)}</span>
                      </div>

                      {isPendingFirstToken ? (
                        <div
                          aria-label="Thiago Almeida está escrevendo"
                          className="space-y-2.5 py-1"
                        >
                          <div className="h-3.5 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                          <div className="h-3.5 w-1/2 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
                        </div>
                      ) : (
                        <MarkdownRenderer content={msg.text} />
                      )}

                      {!isPendingFirstToken && msg.text.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => void playMessageAudio(msg.id, msg.text)}
                            disabled={loadingTtsMessageId === msg.id}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-60 whitespace-nowrap"
                          >
                            {loadingTtsMessageId === msg.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Gerando áudio...</span>
                              </>
                            ) : playingTtsMessageId === msg.id ? (
                              <>
                                <VolumeX className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                <span>Parar áudio</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3.5 w-3.5" />
                                <span>Ouvir</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(msg)}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>

                          {isLastMessage && !isStreaming && (
                            <button
                              type="button"
                              onClick={() => void handleRegenerateLast()}
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Gerar novamente</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>{errorMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRegenerateLast()}
                    className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/50 whitespace-nowrap"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Composer Dock */}
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 sm:px-6 shrink-0">
          <div className="mx-auto max-w-3xl">
            {errorMessage && !hasMessages && (
              <div
                role="alert"
                className="mb-2.5 flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2 text-xs text-red-800 dark:text-red-200"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 focus-within:border-blue-600 dark:focus-within:border-blue-500 transition-colors">
              {attachment && (
                <div className="mb-2 flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-2 w-fit max-w-full">
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="h-10 w-10 rounded object-cover shrink-0"
                  />
                  <span className="truncate text-xs text-slate-700 dark:text-slate-200 max-w-[180px]">
                    {attachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    aria-label="Remover imagem anexada"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {(isRecording || isTranscribing) && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 text-xs">
                  {isTranscribing ? (
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                      <span>Convertendo fala em texto...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-medium tabular-nums">
                        <Mic className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        <span>
                          Gravando ·{' '}
                          {String(Math.floor(recordingSeconds / 60)).padStart(
                            2,
                            '0'
                          )}
                          :{String(recordingSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={cancelRecording}
                          className="rounded px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 whitespace-nowrap"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="rounded bg-blue-700 px-2.5 py-1 font-medium text-white hover:bg-blue-800 whitespace-nowrap"
                        >
                          Transcrever
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <textarea
                ref={textareaRef}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Escreva ou fale sua mensagem para o Thiago Almeida..."
                aria-label="Mensagem para o Thiago Almeida"
                className="w-full resize-none bg-transparent px-1.5 py-1 text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none max-h-[180px]"
              />

              <div className="mt-2 flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming || isRecording}
                    title="Anexar imagem"
                    aria-label="Anexar imagem"
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-45 whitespace-nowrap shrink-0"
                  >
                    <ImagePlus className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Imagem</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      isRecording ? stopRecording() : void startRecording()
                    }
                    disabled={isStreaming || isTranscribing}
                    title={
                      isRecording
                        ? 'Parar gravação e transcrever'
                        : 'Falar mensagem'
                    }
                    aria-label={
                      isRecording
                        ? 'Parar gravação e transcrever'
                        : 'Falar mensagem'
                    }
                    className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 ${
                      isRecording
                        ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="h-4 w-4 shrink-0" />
                        <span className="hidden sm:inline">Parar</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4 shrink-0" />
                        <span className="hidden sm:inline">Falar</span>
                      </>
                    )}
                  </button>

                  <div
                    role="group"
                    aria-label="Profundidade de raciocínio"
                    className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => setDepth('rapido')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        depth === 'rapido'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Rápido
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepth('profundo')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        depth === 'profundo'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      Profundo
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAutoSpeakReplies((prev) => !prev)}
                    aria-pressed={autoSpeakReplies}
                    title={
                      autoSpeakReplies
                        ? 'Leitura automática ativada'
                        : 'Ativar leitura automática das respostas'
                    }
                    className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      autoSpeakReplies
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {autoSpeakReplies ? (
                      <Volume2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <VolumeX className="h-4 w-4 shrink-0" />
                    )}
                    <span className="hidden md:inline">Voz automática</span>
                  </button>
                </div>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStreaming}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-medium text-white dark:text-slate-900 transition-colors hover:bg-slate-800 dark:hover:bg-white whitespace-nowrap shrink-0"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    <span>Parar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={
                      (!inputValue.trim() && !attachment) ||
                      isRecording ||
                      isTranscribing
                    }
                    aria-label="Enviar mensagem"
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500 whitespace-nowrap shrink-0"
                  >
                    <span>Enviar</span>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
