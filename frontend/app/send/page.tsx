'use client';

import { useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function SendPage() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !message.trim()) return;

    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch(`${API}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), message: message.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.message || `Server error ${res.status}`);
      }

      if (data.ok) {
        setStatus('sent');
        setMessage('');
      } else {
        throw new Error('OpenWA returned ok: false — check session is connected');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div className="wa-send-page">
      <div className="wa-card">
        {/* Header */}
        <div className="wa-card-head">
          <span className="wa-icon">
            <MessageCircle size={20} strokeWidth={2} />
          </span>
          <div>
            <h1 className="wa-title">Send WhatsApp</h1>
            <p className="wa-sub">Test your OpenWA connection</p>
          </div>
        </div>

        <form onSubmit={handleSend} className="wa-form">
          {/* Phone */}
          <div className="wa-field">
            <label className="wa-label" htmlFor="wa-phone">
              Phone number
            </label>
            <input
              id="wa-phone"
              type="tel"
              className="wa-input"
              placeholder="919876543210 or +91 98765 43210"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setStatus('idle'); }}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="wa-hint">
              Include country code — e.g. <strong>91</strong> for India
            </span>
          </div>

          {/* Message */}
          <div className="wa-field">
            <label className="wa-label" htmlFor="wa-msg">
              Message
            </label>
            <textarea
              id="wa-msg"
              className="wa-textarea"
              placeholder="Type your message here…"
              rows={5}
              value={message}
              onChange={(e) => { setMessage(e.target.value); setStatus('idle'); }}
              spellCheck={false}
            />
            <span className="wa-hint">
              Supports *bold*, _italic_ WhatsApp formatting
            </span>
          </div>

          {/* Status feedback */}
          {status === 'sent' && (
            <div className="wa-feedback wa-feedback-ok">
              ✓ Message sent successfully
            </div>
          )}
          {status === 'error' && (
            <div className="wa-feedback wa-feedback-err">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="wa-submit"
            disabled={status === 'sending' || !phone.trim() || !message.trim()}
          >
            {status === 'sending' ? (
              <>
                <span className="wa-spinner" />
                Sending…
              </>
            ) : (
              <>
                <Send size={15} strokeWidth={2.5} />
                Send message
              </>
            )}
          </button>
        </form>
      </div>

      <style>{`
        .wa-send-page {
          min-height: 100vh;
          background: var(--paper, #f3ecdc);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
        }
        .wa-card {
          width: 100%;
          max-width: 480px;
          background: var(--card, #fbf6e9);
          border: 1px solid var(--rule, #e0d4bb);
          border-radius: 20px;
          padding: 36px 32px;
          box-shadow: 0 2px 4px rgba(26,22,18,.03), 0 12px 40px rgba(26,22,18,.07);
        }
        .wa-card-head {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 32px;
        }
        .wa-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #25d366;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .wa-title {
          margin: 0;
          font-family: var(--font-display, Georgia), serif;
          font-size: 20px;
          font-weight: 500;
          color: var(--ink, #1a1612);
          letter-spacing: -0.01em;
        }
        .wa-sub {
          margin: 2px 0 0;
          font-size: 13px;
          color: var(--ink-3, #9c8e7e);
        }
        .wa-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .wa-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .wa-label {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink-2, #6b5e4e);
        }
        .wa-input,
        .wa-textarea {
          width: 100%;
          padding: 11px 14px;
          font-size: 14.5px;
          font-family: inherit;
          color: var(--ink, #1a1612);
          background: var(--paper, #f3ecdc);
          border: 1.5px solid var(--rule, #e0d4bb);
          border-radius: 10px;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
          resize: vertical;
        }
        .wa-input:focus,
        .wa-textarea:focus {
          border-color: var(--accent, #25d366);
          box-shadow: 0 0 0 3px rgba(37,211,102,.12);
        }
        .wa-hint {
          font-size: 12px;
          color: var(--ink-3, #9c8e7e);
        }
        .wa-feedback {
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 500;
        }
        .wa-feedback-ok {
          background: #edf7f0;
          border: 1px solid #c8e6c9;
          color: #2e7d32;
        }
        .wa-feedback-err {
          background: #fdf2f2;
          border: 1px solid #f5c6c6;
          color: #c0392b;
          word-break: break-word;
        }
        .wa-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 13px 24px;
          background: #25d366;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.01em;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
        }
        .wa-submit:hover:not(:disabled) { background: #1ebe5d; }
        .wa-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .wa-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,.4);
          border-top-color: #fff;
          border-radius: 50%;
          animation: wa-spin 0.7s linear infinite;
        }
        @keyframes wa-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
