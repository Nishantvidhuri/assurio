'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { me, checkWhatsAppNumber, sendWhatsAppPdf, sendWhatsAppImage, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';

const DEFAULT_MSG =
  `Hey Nishant 👋\n\nrecriauth.com registered you as Software Engineer and initiated a background verification via recriauth.com.\n\nTap below to begin — takes less than 10 minutes:\nhttps://recriauth.com/invite/demo`;

export default function WhatsAppDemoPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState(DEFAULT_MSG);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'yes' | 'no' | 'unknown'>('idle');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/login'); return; }
    me(token)
      .then((u) => { if (u.role !== 'admin') router.replace('/home'); else setUser(u); })
      .catch(() => router.replace('/login'));
  }, [router]);

  function onPhoneChange(val: string) {
    setPhone(val);
    setSendStatus('idle');
    setCheckStatus('idle');
    const digits = val.replace(/\D/g, '');
    if (digits.length === 10) {
      const full = `91${digits}`;
      const token = getToken();
      if (!token) return;
      setCheckStatus('checking');
      checkWhatsAppNumber(token, full)
        .then((res) => {
          if (res.onWhatsApp === true) setCheckStatus('yes');
          else if (res.onWhatsApp === false) setCheckStatus('no');
          else setCheckStatus('unknown');
        })
        .catch(() => setCheckStatus('unknown'));
    }
  }

  const isImage = (f: File) => f.type.startsWith('image/');
  const isPdf   = (f: File) => f.type === 'application/pdf';
  const accept  = 'application/pdf,image/jpeg,image/png,image/webp,image/gif';

  function onFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (isPdf(f) || isImage(f))) { setFile(f); setSendStatus('idle'); }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setErrMsg('Enter a valid phone number'); setSendStatus('err'); return; }
    if (!file) { setErrMsg('Pick a PDF or image first'); setSendStatus('err'); return; }
    const full = digits.startsWith('91') ? digits : `91${digits}`;
    const token = getToken();
    if (!token) { router.replace('/login'); return; }

    setSendStatus('sending');
    setErrMsg('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = isImage(file)
        ? await sendWhatsAppImage(token, full, base64, file.type, file.name, message)
        : await sendWhatsAppPdf(token, full, base64, file.name, message);

      setSendStatus(res.ok ? 'ok' : 'err');
      if (!res.ok) setErrMsg('OpenWA returned ok: false — check the session is connected.');
    } catch (err) {
      setSendStatus('err');
      setErrMsg(err instanceof Error ? err.message : 'Failed to send');
    }
  }

  if (!user) return null;

  const imageUrl = 'https://pbs.twimg.com/profile_images/1893698244586377216/I5dQ_qN1_400x400.jpg';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 560, width: '100%', padding: '32px 16px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-display,serif)', fontSize: 26, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            WhatsApp Sender
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6 }}>
            Send a PDF with a message to any WhatsApp number.
          </p>
        </div>

        {/* Preview */}
        <div className="wa-demo-card">
          <div className="wa-demo-phone-shell">
            <div className="wa-demo-status-bar"><span>9:41</span><span>●●●</span></div>
            <div className="wa-demo-chat-header">
              <div className="wa-demo-avatar">R</div>
              <div>
                <div className="wa-demo-chat-name">recriauth.com</div>
                <div className="wa-demo-chat-sub">Business account</div>
              </div>
            </div>
            <div className="wa-demo-chat-body">
              <div className="wa-demo-bubble">
                {/* File preview in bubble */}
                {file && isImage(file) ? (
                  <img src={URL.createObjectURL(file)} alt="attachment" className="wa-demo-img" style={{ objectFit: 'cover' }} />
                ) : file && isPdf(file) ? (
                  <div style={{ background: '#f0f0f0', borderRadius: '8px 8px 0 0', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, background: '#e74c3c', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{(file.size / 1024).toFixed(0)} KB · PDF</div>
                    </div>
                  </div>
                ) : (
                  <img src={imageUrl} alt="Invite header" className="wa-demo-img" />
                )}
                <div className="wa-demo-bubble-text">
                  {message.split('\n').map((line, i) => {
                    const urlRe = /(https?:\/\/[^\s]+)/g;
                    const parts = line.split(urlRe);
                    return (
                      <p key={i} style={{ margin: i === 0 ? '0 0 4px' : '4px 0' }}>
                        {parts.map((part, j) =>
                          urlRe.test(part)
                            ? <span key={j} className="wa-demo-link">{part}</span>
                            : part.replace(/\*([^*]+)\*/g, '$1')
                        )}
                      </p>
                    );
                  })}
                </div>
                <div className="wa-demo-bubble-time">12:30 PM ✓✓</div>
              </div>
            </div>
          </div>
        </div>

        {/* Unified form */}
        <div className="wa-demo-form-card">
          <form onSubmit={handleSend} className="wa-demo-form">

            {/* Phone */}
            <div className="wa-demo-input-wrap">
              <span className="wa-demo-prefix">+91</span>
              <input
                type="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                className="wa-demo-input"
                maxLength={15}
                disabled={sendStatus === 'sending'}
              />
              {checkStatus === 'checking' && <span className="wa-demo-spinner" style={{ width: 13, height: 13, marginLeft: 8 }} />}
              {checkStatus === 'yes' && <span style={{ marginLeft: 8, width: 9, height: 9, borderRadius: '50%', background: '#2f6649', display: 'inline-block', flexShrink: 0 }} title="On WhatsApp" />}
              {checkStatus === 'no'  && <span style={{ marginLeft: 8, width: 9, height: 9, borderRadius: '50%', background: '#9c3936', display: 'inline-block', flexShrink: 0 }} title="Not on WhatsApp" />}
            </div>
            {checkStatus === 'yes' && <p style={{ margin: '2px 0 10px', fontSize: 12, color: '#2f6649' }}>✓ On WhatsApp</p>}
            {checkStatus === 'no'  && <p style={{ margin: '2px 0 10px', fontSize: 12, color: '#9c3936' }}>✗ Not on WhatsApp</p>}

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sendStatus === 'sending'}
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                border: '1px solid var(--rule)', borderRadius: 8,
                padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
                color: 'var(--ink)', background: 'var(--card)',
                outline: 'none', marginBottom: 12, lineHeight: 1.55,
              }}
            />

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onFileDrop}
              style={{
                border: `2px dashed ${dragOver ? 'var(--ink)' : file ? '#2f6649' : 'var(--rule)'}`,
                borderRadius: 10, padding: file ? '12px 16px' : '20px 16px', textAlign: 'center',
                cursor: 'pointer', background: dragOver ? 'var(--paper)' : file ? '#f0f7f0' : 'transparent',
                transition: 'all 0.15s', marginBottom: file ? 0 : 12,
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && (isPdf(f) || isImage(f))) { setFile(f); setSendStatus('idle'); }
                }}
              />
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2f6649" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2f6649', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                    <div style={{ fontSize: 11, color: '#5a8a6a' }}>{(file.size / 1024).toFixed(0)} KB · {isImage(file) ? 'Image' : 'PDF'} — tap to change</div>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); setSendStatus('idle'); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2f6649', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              ) : (
                <div>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 4 }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
                  </svg>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
                    Drop a <strong style={{ color: 'var(--ink)' }}>PDF or image</strong> here or{' '}
                    <span style={{ color: 'var(--ink)', textDecoration: 'underline' }}>browse</span>
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-2)' }}>JPG · PNG · WEBP · GIF · PDF</p>
                </div>
              )}
            </div>

            {/* Real-time file preview */}
            {file && (
              <div style={{ marginBottom: 12, borderRadius: '0 0 10px 10px', overflow: 'hidden', border: '2px solid #2f6649', borderTop: 'none' }}>
                {isImage(file) ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt="preview"
                    style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block', background: '#f8f8f8' }}
                  />
                ) : (
                  <iframe
                    src={URL.createObjectURL(file)}
                    style={{ width: '100%', height: 380, border: 'none', display: 'block', background: '#f8f8f8' }}
                    title="PDF preview"
                  />
                )}
              </div>
            )}

            <button
              type="submit"
              className="wa-demo-btn"
              disabled={sendStatus === 'sending' || !file}
              style={{ width: '100%', opacity: !file ? 0.5 : 1 }}
            >
              {sendStatus === 'sending' ? (
                <><span className="wa-demo-spinner" />Sending…</>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
                  </svg>
                  {file && isImage(file) ? 'Send Image + Message' : 'Send PDF + Message'}
                </>
              )}
            </button>
          </form>

          {sendStatus === 'ok' && <div className="wa-demo-alert wa-demo-alert-ok" style={{ marginTop: 12 }}>✅ Sent! Check WhatsApp.</div>}
          {sendStatus === 'err' && <div className="wa-demo-alert wa-demo-alert-err" style={{ marginTop: 12 }}>❌ {errMsg || 'Something went wrong.'}</div>}
        </div>

      </div>
    </div>
  );
}
