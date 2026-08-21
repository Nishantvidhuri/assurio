import type { ReactNode } from 'react';
import { SSEProvider } from '@/shared/contexts/sse-context';
import { VendorObservabilityShell } from '@/modules/internal/vendors/components/vendor-observability-shell';
import AdminVendorsShell from './admin-shell';

// One layout across every /vendors route so the overview ⇄ logs chrome stays
// mounted while only the page content swaps. The shell itself decides which
// routes get the shared chrome (detail passes through).
//
// Recrify additions:
//  • AdminVendorsShell supplies the admin gate + app chrome that Recriauth's
//    app/dashboard/internal layout provided.
//  • SSEProvider is required because the ported components call useSSEEvent
//    (useSSE throws without a provider). Recrify has no /v1/sse/subscribe
//    endpoint, and the provider only opens an EventSource once it sees an
//    authenticated session from its own auth context — which our shim reports
//    as null here — so it stays inert instead of reconnect-looping. Live
//    "vendor.updated" refreshes therefore don't fire; a manual reload shows
//    saved settings.
export default function VendorsLayout({ children }: { children: ReactNode }) {
  return (
    <AdminVendorsShell>
      <SSEProvider>
        <VendorObservabilityShell>{children}</VendorObservabilityShell>
      </SSEProvider>
    </AdminVendorsShell>
  );
}
