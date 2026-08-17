'use client';

import PageLoader from '@/app/components/PageLoader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink,
  FileText,
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
  type WaContact,
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

/**
 * Contacts are stored as the last 10 digits (national), chats may carry a full
 * international number. Never treat the first two digits of a 10-digit number
 * as a country code — that rendered 9650824873 as "+96 50824873".
 */
function prettyPhone(p: string): string {
  const digits = p.replace(/\D/g, '');
  if (!digits) return p;
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : '91';
  return national.length === 10
    ? `+${cc} ${national.slice(0, 5)} ${national.slice(5)}`
    : `+${digits}`;
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

/** Who this number belongs to on the platform. */
function KindBadge({ kind }: { kind: WaContact['kind'] }) {
  const tone =
    kind === 'client'
      ? 'bg-primary-200 text-primary'
      : kind === 'candidate'
        ? 'bg-surface-success text-success'
        : 'bg-neutral-200 text-text-subheading';
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-caption capitalize ${tone}`}
    >
      {kind}
    </span>
  );
}

/** Session cache of fetched media object URLs, keyed by chatId|waMessageId. */
const mediaCache = new Map<string, string>();

/**
 * Resolves a message's media to a usable URL: the just-sent local blob, then
 * our own durable S3 copy, then the bytes fetched from OpenWA through the
 * authenticated proxy.
 */
function useMediaUrl(msg: WaMessage) {
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

  return { url, failed };
}

/** Renders a real image bubble, falling back to a chip if the fetch fails. */
function ChatImage({ msg }: { msg: WaMessage }) {
  const { url, failed } = useMediaUrl(msg);

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

/**
 * PDF bubble: a real first-page preview (the browser's own PDF renderer in a
 * non-interactive iframe) with a footer carrying the filename. The whole card
 * opens the document in a new tab.
 */
function ChatPdf({ msg }: { msg: WaMessage }) {
  const { url, failed } = useMediaUrl(msg);
  const name = msg.mediaFilename || 'Document.pdf';

  if (failed) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-1 text-caption text-text-subheading">
        <Paperclip size={12} /> Document
      </div>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={url ? `Open ${name}` : 'Loading…'}
      className="block w-56 overflow-hidden rounded-lg border border-border-default bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative h-40 bg-neutral-100">
        {url ? (
          <>
            <iframe
              src={`${url}#toolbar=0&navpanes=0&view=FitH`}
              title={name}
              className="pointer-events-none h-full w-full"
            />
            {/* Swallow clicks so the whole card is one link target. */}
            <span className="absolute inset-0" />
          </>
        ) : (
          <span className="flex h-full items-center justify-center text-caption text-text-placeholder">
            Loading preview…
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border-default px-2.5 py-2">
        <FileText size={16} className="shrink-0 text-failure" />
        <span className="min-w-0 flex-1 truncate text-caption text-text-heading">
          {name}
        </span>
        <ExternalLink size={13} className="shrink-0 text-icon-default" />
      </div>
    </a>
  );
}

export default function WhatsAppPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [contacts, setContacts] = useState<WaContact[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
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
      setContacts(res.contacts ?? []);
    } catch {
      setConfigured(false);
    } finally {
      setLoadingChats(false);
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
          body: text,
          type: imageOut ? 'image' : file ? 'document' : 'chat',
          direction: 'outbound',
          timestamp: now,
          // Preview straight from the local file for both images and PDFs, so
          // the bubble renders instantly rather than waiting on the round-trip.
          localUrl: file ? URL.createObjectURL(file) : undefined,
          mediaMimetype: file ? file.type : undefined,
          mediaFilename: file ? file.name : undefined,
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

  /**
   * Which candidate/client/draft a chat belongs to. Chats addressed by @lid
   * carry a linked-device id rather than the number, so match on the display
   * name too — that's where the real number shows up.
   */
  const contactFor = useCallback(
    (chat: { name: string; phone: string }): WaContact | undefined => {
      const digits = `${chat.name} ${chat.phone}`.replace(/\D/g, '');
      return contacts.find((k) => digits.includes(k.phone.slice(-10)));
    },
    [contacts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    const digitQ = q.replace(/\D/g, '');
    return chats.filter((c) => {
      const who = contacts.find((k) =>
        `${c.name} ${c.phone}`.replace(/\D/g, '').includes(k.phone.slice(-10)),
      );
      return (
        c.name.toLowerCase().includes(q) ||
        (who?.name.toLowerCase().includes(q) ?? false) ||
        (digitQ.length > 0 && `${c.phone}${who?.phone ?? ''}`.includes(digitQ))
      );
    });
  }, [chats, contacts, search]);

  // Paginate the list rather than rendering every conversation at once.
  const PAGE = 10;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [search]);
  const shownChats = filtered.slice(0, visible);
  const moreCount = filtered.length - shownChats.length;

  // Candidates/clients/drafts we hold a number for but have never messaged —
  // OpenWA only knows about existing conversations, so without this they'd be
  // invisible and unreachable from this page.
  const contactsWithoutChat = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A chat addressed by @lid carries a linked-device id in `phone`, not the
    // real number — the number only appears in its display name. Match on both,
    // exactly as the server-side platform filter does, or contacts we HAVE
    // messaged get mislabelled "no conversation yet".
    const chatDigits = chats.map((c) =>
      `${c.name} ${c.phone}`.replace(/\D/g, ''),
    );
    const hasChat = (tenDigits: string) =>
      chatDigits.some((d) => d.includes(tenDigits));
    return contacts
      .filter((c) => !hasChat(c.phone.slice(-10)))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q.replace(/\D/g, '')),
      );
  }, [contacts, chats, search]);

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

            {loadingChats ? (
              // Skeleton rows rather than a flash of "No conversations yet".
              <div className="space-y-1 px-3 py-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex animate-pulse items-center gap-3 py-2.5">
                    <div className="size-12 shrink-0 rounded-full bg-neutral-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/5 rounded bg-neutral-200" />
                      <div className="h-3 w-3/5 rounded bg-neutral-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : configured &&
              filtered.length === 0 &&
              contactsWithoutChat.length === 0 &&
              !showOpenNew ? (
              <div className="px-4 py-8 text-center text-body-sm text-text-subheading">
                {chats.length === 0 ? 'No conversations yet.' : 'No matches.'}
              </div>
            ) : (
              shownChats.map((c) => {
                const active = c.id === activePhone;
                const who = contactFor(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      void openChat(c.id, who?.name || c.name || prettyPhone(c.phone))
                    }
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                      active ? 'bg-primary-bg' : 'hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-lg font-semibold text-text-body">
                      {initialOf(c)}
                    </span>
                    <div className="min-w-0 flex-1 border-b border-border-default pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-body-md text-text-heading">
                            {who?.name || c.name || prettyPhone(c.phone)}
                          </span>
                          {who && <KindBadge kind={who.kind} />}
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

            {!loadingChats && moreCount > 0 && (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE)}
                className="w-full px-4 py-3 text-center text-body-sm font-medium text-text-link hover:bg-neutral-100"
              >
                Load {Math.min(moreCount, PAGE)} more
                <span className="text-text-placeholder"> ({moreCount} left)</span>
              </button>
            )}

            {!loadingChats && contactsWithoutChat.length > 0 && (
              <>
                <div className="px-4 pb-1 pt-4 text-caption font-medium uppercase tracking-wide text-text-placeholder">
                  No conversation yet
                </div>
                {contactsWithoutChat.map((c) => (
                  <button
                    key={`contact-${c.phone}`}
                    type="button"
                    onClick={() => void openChat(c.phone, c.name)}
                    className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors ${
                      c.phone === activePhone ? 'bg-primary-bg' : 'hover:bg-neutral-100'
                    }`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg font-semibold text-text-subheading">
                      {initialOf({ name: c.name, phone: c.phone })}
                    </span>
                    <div className="min-w-0 flex-1 border-b border-border-default pb-3">
                      <div className="truncate text-body-md text-text-heading">
                        {c.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="truncate text-body-sm text-text-subheading">
                          {prettyPhone(c.phone)}
                        </span>
                        <KindBadge kind={c.kind} />
                      </div>
                    </div>
                  </button>
                ))}
              </>
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
                              if (isPdfMsg) {
                                return (
                                  <div className="mb-1">
                                    <ChatPdf msg={m} />
                                  </div>
                                );
                              }
                              if (m.mediaMimetype) {
                                const href = m.mediaUrl || m.localUrl;
                                const chip = (
                                  <span className="mb-1 inline-flex items-center gap-1.5 rounded bg-neutral-100 px-2 py-1 text-caption text-text-subheading">
                                    <Paperclip size={12} />
                                    {m.type || 'Attachment'}
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
