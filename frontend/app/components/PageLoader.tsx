import { Loader } from '@/shared/components/ui';

/**
 * Standard full-viewport page loading state — the RDS conic-ring loader,
 * centered. Used wherever a route waits on auth/data before rendering.
 */
export default function PageLoader({ description }: { description?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader description={description} />
    </div>
  );
}
