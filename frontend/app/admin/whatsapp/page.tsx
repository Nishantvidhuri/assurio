'use client';

import PageLoader from '@/app/components/PageLoader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical,
  Paperclip,
  Phone,
  Search,
  Send,
  SquarePen,
  Video,
  X,
} from 'lucide-react';
import {
  me,
  getWhatsAppChats,
  getWhatsAppMessages,
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppPdf,
  fetchWhatsAppMediaUrl,
  type AuthUser,
  type WaChat,
  type WaMessage,
} from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import { SvgIcon } from '@/shared/components/ui/svg-icon';
import checkAllIcon from '@/public/assets/icons/check-all/Check_All=16px.svg';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  { href: '/admin/packages', label: 'Packages', icon: ICONS.packages },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  {
    href: '/admin/test-verification',
    label: 'Test Verification',
    icon: ICONS.testVerification,
  },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: ICONS.whatsapp },
];

const isImage = (f: File) => f.type.startsWith('image/');
const isPdf = (f: File) => f.type === 'application/pdf';

function fmtTime(tsSeconds: number): string {
  if (!tsSeconds) return '';
  const d = new Date(tsSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

/** Chat-list timestamp: time if today, else a short date. */
function fmtChatStamp(tsSeconds: number): string {
  if (!tsSeconds) return '';
  const d = new Date(tsSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function prettyPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  return digits ? `+${digits.replace(/^(\d{2})(\d+)/, '$1 $2')}` : p;
}

function initialOf(chat: { name: string; phone: string }): string {
  const src = chat.name || chat.phone || '#';
  const ch = src.replace(/[^A-Za-z0-9]/g, '').slice(0, 1);
  return (ch || '#').toUpperCase();
}

/** WhatsApp-style rich text: *bold*, _italic_, links. */
function renderBody(body: string) {
  return body.split('\n').map((line, i) => {
    const urlRe = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlRe);
    return (
      <p key={i} className={i === 0 ? '' : 'mt-0.5'}>
        {parts.map((part, j) =>
          /^https?:\/\//.test(part) ? (
            <a
              key={j}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-link underline break-all"
            >
              {part}
            </a>
          ) : (
            <span key={j}>
              {part.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1')}
            </span>
          ),
        )}
      </p>
    );
  });
}

/** Session cache of fetched media object URLs, keyed by chatId|waMessageId. */
const mediaCache = new Map<string, string>();

/** Renders a real image bubble — local blob for just-sent images, else the
 *  authenticated media proxy. Falls back to a chip if the fetch fails. */
function ChatImage({ msg }: { msg: WaMessage }) {
  // Prefer the durable copy: the just-sent local blob, then our S3 URL, then
  // fall back to fetching the bytes from OpenWA through the authenticated proxy.
  const direct = msg.localUrl ?? msg.mediaUrl ?? null;
  const key = `${msg.chatId ?? ''}|${msg.waMessageId ?? msg.id}`;
  const [url, setUrl] = useState<string | null>(
    direct ?? mediaCache.get(key) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (direct) {
      setUrl(direct);
      return;
    }
    if (url || failed) return;
    if (!msg.chatId || !(msg.waMessageId || msg.id)) return;
    let alive = true;
    fetchWhatsAppMediaUrl(msg.chatId, msg.waMessageId || msg.id)
      .then((u) => {
        mediaCache.set(key, u);
        if (alive) setUrl(u);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [key, direct, msg.chatId, msg.waMessageId, msg.id, url, failed]);

  if (failed) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-1 text-caption text-text-subheading">
        <Paperclip size={12} /> Image
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-40 w-52 items-center justify-center rounded-lg bg-neutral-100 text-caption text-text-placeholder">
        Loading image…
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Shared image"
        className="max-h-72 max-w-full rounded-lg object-cover"
      />
    </a>
  );
}

export default function WhatsAppPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [configured, setConfigured] = useState(true);
  const [search, setSearch] = useState('');
  const [activePhone, setActivePhone] = useState('');
  const [activeName, setActiveName] = useState('');
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    me(token)
      .then((u) => {
        if (u.role !== 'admin') router.replace('/home');
        else setUser(u);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  const loadChats = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await getWhatsAppChats(token);
      setConfigured(res.configured);
      setChats(res.chats);
    } catch {
      setConfigured(false);
    }
  }, []);

  const loadMessages = useCallback(async (full: string) => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await getWhatsAppMessages(token, full);
      setConfigured(res.configured);
      setMessages(res.messages);
    } catch {
      setConfigured(false);
    }
  }, []);

  // Poll the chat list.
  useEffect(() => {
    if (!user) return;
    void loadChats();
    const t = setInterval(() => void loadChats(), 8000);
    return () => clearInterval(t);
  }, [user, loadChats]);

  // Poll the open conversation.
  useEffect(() => {
    if (!activePhone) return;
    void loadMessages(activePhone);
    const t = setInterval(() => void loadMessages(activePhone), 5000);
    return () => clearInterval(t);
  }, [activePhone, loadMessages]);

  // Auto-scroll to newest.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, activePhone]);

  // Live thumbnail for a selected image attachment.
  useEffect(() => {
    if (!file || !isImage(file)) {
      setFilePreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setFilePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // `id` is the chat's original WhatsApp id ("…@lid" / "…@g.us" / "…@c.us") for
  // existing chats, or a plain phone number for a freshly-typed one.
  async function openChat(id: string, name?: string) {
    if (!id) return;
    setActivePhone(id);
    setActiveName(name || (id.includes('@') ? id : prettyPhone(id)));
    setSendError('');
    setMessages([]);
    setLoadingChat(true);
    await loadMessages(id);
    setLoadingChat(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activePhone || sending || (!draft.trim() && !file)) return;
    const token = getToken();
    if (!token) return;
    const text = draft.trim();
    setSending(true);
    setSendError('');
    try {
      let res: { ok: boolean };
      if (file) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        res = isImage(file)
          ? await sendWhatsAppImage(token, activePhone, base64, file.type, file.name, text)
          : await sendWhatsAppPdf(token, activePhone, base64, file.name, text);
      } else {
        res = await sendWhatsAppText(token, activePhone, text);
      }
      if (!res.ok) {
        setSendError('Message not sent — check the OpenWA session is connected.');
        return;
      }
      // Optimistically show it (OpenWA stores the message a moment after sending).
      const now = Math.floor(Date.now() / 1000);
      const imageOut = file && isImage(file);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${now}-${prev.length}`,
          body: text || (file && !imageOut ? `📎 ${file.name}` : ''),
          type: imageOut ? 'image' : file ? 'document' : 'chat',
          direction: 'outbound',
          timestamp: now,
          localUrl: imageOut ? URL.createObjectURL(file) : undefined,
          mediaMimetype: file ? file.type : undefined,
        },
      ]);
      setDraft('');
      setFile(null);
      setTimeout(() => void loadMessages(activePhone), 1500);
      void loadChats();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setSending(false);
    }
  }

  function handleLogout() {
    doLogout(router);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '')),
    );
  }, [chats, search]);

  const searchDigits = search.replace(/\D/g, '');
  const showOpenNew =
    searchDigits.length >= 10 &&
    !chats.some((c) => c.phone.includes(searchDigits));

  if (!user) return <PageLoader />;

  return (
    <AppShell nav={ADMIN_NAV} user={user} onLogout={handleLogout}>
      <div className="mb-4">
        <div className="text-body-sm text-text-placeholder">Operations</div>
        <h1 className="text-h3 font-semibold tracking-h3 text-text-heading">
          WhatsApp
        </h1>
      </div>

      {!configured && (
        <div className="mb-3 rounded-lg border border-border-warning bg-surface-warning px-4 py-2.5 text-body-sm text-warning">
          OpenWA isn’t connected — start the session and set{' '}
          <code>OPENWA_URL</code> / <code>OPENWA_SESSION</code>.
        </div>
      )}

      {/* ── Chat client (RDS tokens) ── */}
      <div className="flex h-[calc(100vh-190px)] min-h-[520px] overflow-hidden rounded-xl border border-border-default shadow-sm">
        {/* Left: chat list */}
        <aside className="flex w-full max-w-[380px] flex-col border-r border-border-default bg-white">
          <div className="flex items-center justify-between border-b border-border-default bg-neutral-100 px-4 py-3">
            <div className="flex flex-col">
              <span className="text-body-lg font-semibold text-text-heading">
                Chats
              </span>
              <span className="text-caption text-text-placeholder">
                Candidates, clients &amp; drafts only
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setActivePhone('');
                searchRef.current?.focus();
              }}
              title="New chat"
              className="flex size-9 items-center justify-center rounded-full text-icon-default transition-colors hover:bg-neutral-200"
              aria-label="New chat"
            >
              <SquarePen size={19} />
            </button>
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-1.5">
              <Search size={16} className="text-icon-default" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or enter a number to message"
                className="min-w-0 flex-1 bg-transparent text-body-md text-text-heading placeholder:text-text-placeholder outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {showOpenNew && (
              <button
                type="button"
                onClick={() => void openChat(searchDigits, prettyPhone(searchDigits))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-100"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-white">
                  +
                </span>
                <div className="min-w-0">
                  <div className="text-body-md text-text-heading">
                    Open {prettyPhone(searchDigits)}
                  </div>
                  <div className="text-body-sm text-text-subheading">
                    Start a new chat
                  </div>
                </div>
              </button>
            )}

            {configured && filtered.length === 0 && !showOpenNew ? (
              <div className="px-4 py-8 text-center text-body-sm text-text-subheading">
                {chats.length === 0 ? 'No conversations yet.' : 'No matches.'}
              </div>
            ) : (
              filtered.map((c) => {
                const active = c.id === activePhone;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openChat(c.id, c.name || prettyPhone(c.phone))}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                      active ? 'bg-primary-bg' : 'hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-lg font-semibold text-text-body">
                      {initialOf(c)}
                    </span>
                    <div className="min-w-0 flex-1 border-b border-border-default pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-body-md text-text-heading">
                          {c.name || prettyPhone(c.phone)}
                        </span>
                        <span
                          className={`shrink-0 text-caption ${
                            c.unreadCount > 0 ? 'text-primary' : 'text-text-placeholder'
                          }`}
                        >
                          {fmtChatStamp(c.timestamp)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-body-sm text-text-subheading">
                          {c.isGroup ? '👥 ' : ''}
                          {c.lastMessage || ' '}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: conversation */}
        <section className="flex min-w-0 flex-1 flex-col bg-neutral-100">
          {!activePhone ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-white text-icon-default shadow-sm">
                <Send size={26} />
              </span>
              <p className="text-body-md text-text-subheading">
                Select a chat to view the conversation
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-border-default bg-neutral-100 px-4 py-2.5">
                <span className="flex size-10 items-center justify-center rounded-full bg-neutral-200 text-base font-semibold text-text-body">
                  {initialOf({ name: activeName, phone: activePhone })}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-body-md font-medium text-text-heading">
                    {activeName || 'Chat'}
                  </div>
                  {!activePhone.includes('@') && (
                    <div className="truncate text-caption text-text-subheading">
                      {prettyPhone(activePhone)}
                    </div>
                  )}
                </div>
                <Video size={19} className="text-icon-default" />
                <Phone size={18} className="text-icon-default" />
                <MoreVertical size={19} className="text-icon-default" />
              </div>

              {/* Messages */}
              <div ref={bodyRef} className="flex-1 overflow-y-auto bg-neutral-100 px-6 py-4">
                {loadingChat ? (
                  <div className="flex h-full items-center justify-center text-body-sm text-text-subheading">
                    Loading…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-body-sm text-text-subheading">
                    No messages yet.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {messages.map((m) => {
                      const out = m.direction === 'outbound';
                      return (
                        <div
                          key={m.id}
                          className={`flex ${out ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-2.5 py-1.5 text-body-md leading-snug text-text-heading shadow-sm ${
                              out
                                ? 'rounded-tr-none bg-primary-200'
                                : 'rounded-tl-none bg-white'
                            }`}
                          >
                            {(() => {
                              // OpenWA reports media messages as type 'image' /
                              // 'document' — often with a null mediaMimetype — so
                              // key off the type first.
                              const isImg =
                                m.type === 'image' ||
                                (m.mediaMimetype?.startsWith('image/') ?? false);
                              const isPdfMsg =
                                m.type === 'document' ||
                                m.mediaMimetype === 'application/pdf';
                              if (isImg) {
                                return (
                                  <div className="mb-1">
                                    <ChatImage msg={m} />
                                  </div>
                                );
                              }
                              if (m.mediaMimetype || isPdfMsg) {
                                const href = m.mediaUrl || m.localUrl;
                                const label = isPdfMsg
                                  ? 'Document'
                                  : m.type || 'Attachment';
                                const chip = (
                                  <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-1 text-caption text-text-subheading">
                                    <Paperclip size={12} />
                                    {label}
                                  </span>
                                );
                                return href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                  >
                                    {chip}
                                  </a>
                                ) : (
                                  chip
                                );
                              }
                              return null;
                            })()}
                            {m.body && (
                              <div className="whitespace-pre-wrap break-words">
                                {renderBody(m.body)}
                              </div>
                            )}
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-caption text-text-placeholder">
                              {fmtTime(m.timestamp)}
                              {out && (
                                <SvgIcon
                                  src={checkAllIcon}
                                  size={4}
                                  color={
                                    m.status === 'read'
                                      ? 'text-primary'
                                      : 'text-icon-muted'
                                  }
                                  alt={m.status === 'read' ? 'Read' : 'Delivered'}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {sendError && (
                <div className="flex items-center justify-between gap-3 border-t border-border-error bg-surface-error px-4 py-2 text-body-sm text-failure">
                  <span>{sendError}</span>
                  <button
                    type="button"
                    onClick={() => setSendError('')}
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Attachment preview */}
              {file && (
                <div className="flex items-center gap-3 border-t border-border-default bg-neutral-100 px-4 pt-3">
                  {filePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={filePreview}
                      alt="Attachment preview"
                      className="size-16 rounded-lg border border-border-default object-cover"
                    />
                  ) : (
                    <span className="flex size-16 items-center justify-center rounded-lg border border-border-default bg-white text-icon-default">
                      <Paperclip size={22} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body-md text-text-heading">
                      {file.name}
                    </div>
                    <div className="text-caption text-text-subheading">
                      {isImage(file) ? 'Image' : 'Document'} ·{' '}
                      {(file.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="shrink-0 rounded-full p-1.5 text-icon-default hover:bg-neutral-200"
                    aria-label="Remove attachment"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-border-default bg-neutral-100 px-4 py-2.5"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && (isPdf(f) || isImage(f))) setFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-full p-1.5 text-icon-default hover:bg-neutral-200"
                  aria-label="Attach"
                >
                  <Paperclip size={22} />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={file ? 'Add a caption…' : 'Type a message'}
                    disabled={sending}
                    className="min-w-0 flex-1 bg-transparent text-body-md text-text-heading placeholder:text-text-placeholder outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending || (!draft.trim() && !file)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
