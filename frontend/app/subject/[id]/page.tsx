'use client';
import PageLoader from '@/app/components/PageLoader';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSubject, me, type AuthUser, type Subject } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { CLIENT_NAV } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import SubjectReport from '../../components/SubjectReport';

export default function SubjectReportPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const subjectId = params?.id;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // Initial load.
  useEffect(() => {
    mountedRef.current = true;
    if (!subjectId) return;
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const u = await me(token);
        if (cancelled) return;
        setUser(u);
        const s = await getSubject(token, subjectId);
        if (cancelled) return;
        setSubject(s);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && /401|expired|invalid/i.test(err.message)) {
          doLogout(router);
        } else {
          setLoadError(err instanceof Error ? err.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [subjectId, router]);

  // SSE — live subject updates while any check is still pending.
  useEffect(() => {
    if (!subject || !subjectId) return;
    const allDone =
      Boolean(subject.panResult) &&
      Boolean(subject.aadhaarResult) &&
      Boolean(subject.crimeResult);
    if (allDone) return;

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const es = new EventSource(`${API_URL}/subjects/${subjectId}/events`, {
      withCredentials: true,
    });
    es.onmessage = (e: MessageEvent) => {
      try {
        const fresh = JSON.parse(e.data as string);
        if (mountedRef.current) setSubject(fresh);
      } catch {
        /* ignore malformed */
      }
    };
    return () => es.close();
  }, [subject, subjectId]);

  async function refreshNow() {
    if (!subjectId) return;
    setRefreshing(true);
    try {
      const token = getToken();
      if (!token) return;
      const fresh = await getSubject(token, subjectId);
      setSubject(fresh);
    } catch {
      /* swallow */
    } finally {
      setRefreshing(false);
    }
  }

  function handleLogout() {
    doLogout(router);
  }

  if (loadError) {
    const errorBody = (
      <>
        <div className="error">{loadError}</div>
        <Link className="cd-back" href="/home">
          <ArrowLeft size={14} />
          Back to dashboard
        </Link>
      </>
    );
    return user ? (
      <AppShell nav={CLIENT_NAV} user={user} onLogout={handleLogout}>
        {errorBody}
      </AppShell>
    ) : (
      <div className="p-10">{errorBody}</div>
    );
  }

  if (!user || !subject) {
    return <PageLoader />;
  }

  return (
    <AppShell nav={CLIENT_NAV} user={user} onLogout={handleLogout}>
      <SubjectReport
        subject={{ ...subject, clientName: user.name }}
        onBack={() => router.push('/home')}
        onRefresh={refreshNow}
        refreshing={refreshing}
        onSubjectUpdate={(u) =>
          setSubject((prev) =>
            prev ? ({ ...prev, ...u } as Subject) : prev,
          )
        }
      />
    </AppShell>
  );
}
