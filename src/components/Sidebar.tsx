import { useMemo, useState } from 'react';
import {
  Download,
  MessageSquarePlus,
  Moon,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { type Conversation, MODE_CONFIGS } from '../types/chat';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isDark: boolean;
  isOpenMobile: boolean;
  canExport: boolean;
  onCloseMobile: () => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onClearAllConversations: () => void;
  onToggleTheme: () => void;
  onExportHtml: () => void;
}

function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

export function Sidebar({
  conversations,
  activeId,
  isDark,
  isOpenMobile,
  canExport,
  onCloseMobile,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onClearAllConversations,
  onToggleTheme,
  onExportHtml,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (conv) =>
        conv.title.toLowerCase().includes(q) ||
        conv.messages.some((m) => m.text.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const sidebarContent = (
    <aside className="flex h-full w-[272px] shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
          Thiago Almeida
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Fechar menu lateral"
          className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-3 space-y-2.5">
        <button
          type="button"
          onClick={() => {
            onNewConversation();
            onCloseMobile();
          }}
          className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 transition-colors hover:bg-slate-800 dark:hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0"
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" />
          <span>Nova conversa</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar conversas..."
            aria-label="Buscar conversas"
            className="w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1.5">
        <h2 className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Histórico de conversas
        </h2>
        {conversations.length > 0 && !confirmingClear && (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
          >
            Limpar tudo
          </button>
        )}
      </div>

      {confirmingClear && conversations.length > 0 && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs">
          <span className="text-red-800 dark:text-red-200 font-medium">
            Apagar todas?
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onClearAllConversations();
                setConfirmingClear(false);
              }}
              className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700"
            >
              Apagar
            </button>
          </div>
        </div>
      )}

      <nav
        aria-label="Histórico de conversas"
        className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5"
      >
        {filteredConversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {searchQuery.trim()
              ? 'Nenhuma conversa encontrada.'
              : 'Suas conversas aparecerão aqui.'}
          </p>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <div
                key={conv.id}
                className={`group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                    : 'border border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onCloseMobile();
                  }}
                  className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
                >
                  <div className="truncate text-sm font-medium">
                    {conv.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span className="truncate">
                      {MODE_CONFIGS[conv.mode]?.shortLabel ?? 'Geral'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">
                      {formatRelativeDate(conv.updatedAt)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  title="Excluir conversa"
                  aria-label={`Excluir conversa ${conv.title}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
        <button
          type="button"
          onClick={onExportHtml}
          disabled={!canExport}
          className="w-full min-h-[40px] inline-flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span>Exportar HTML</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full min-h-[40px] inline-flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-200/70 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          {isDark ? (
            <>
              <Sun className="h-4 w-4 shrink-0" />
              <span>Modo claro</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 shrink-0" />
              <span>Modo escuro</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <div className="hidden lg:block h-full">{sidebarContent}</div>

      {/* Mobile slide-over sidebar */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
