'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, homePathForRole } from './lib/session';

/**
 * Global 404 handler — instead of showing a bare "not found" page, send the
 * visitor to their home page: the role dashboard when signed in, otherwise
 * the public landing.
 */
export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    router.replace(user ? homePathForRole(user.role) : '/');
  }, [router]);

  return null;
}
