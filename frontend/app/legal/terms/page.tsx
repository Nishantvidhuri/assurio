import type { Metadata } from 'next';
import { TermsContent } from '../../components/TermsContent';

export const metadata: Metadata = {
  title: 'Terms & Conditions — Recrify',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 lg:py-14">
      <div className="rounded-xl border border-border-default bg-white p-6 lg:p-8">
        <TermsContent />
      </div>
    </main>
  );
}
