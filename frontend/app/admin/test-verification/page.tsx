'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { me, type AuthUser } from '../../lib/api';
import { getToken } from '../../lib/session';
import { doLogout } from '../../lib/logout';
import { ICONS, type SidebarItem } from '../../components/Sidebar';
import AppShell from '../../components/AppShell';
import {
  Button,
  Callout,
  Input,
  InputFieldWrapper,
} from '@/shared/components/ui';
import { apiRequest, ApiError } from '@/shared/http/api-client';

const ADMIN_NAV: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/admin/clients', label: 'Clients', icon: ICONS.clients },
  { href: '/admin/invoices', label: 'Invoices', icon: ICONS.invoices },
  { href: '/admin/operations', label: 'Operations', icon: ICONS.operations },
  { href: '/admin/vendors', label: 'Vendors', icon: ICONS.vendors },
  {
    href: '/admin/test-verification',
    label: 'Test Verification',
    icon: ICONS.testVerification,
  },
];

// ─── API catalog ────────────────────────────────────────────────────────────

interface FieldDef {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}

interface ApiDef {
  id: string;
  title: string;
  vendor: string;
  method: 'GET' | 'POST';
  /** Route template shown on the card. */
  route: string;
  fields: FieldDef[];
  buildPath: (values: Record<string, string>) => string;
  buildBody?: (
    values: Record<string, string>,
  ) => Record<string, unknown> | undefined;
  note?: string;
}

const DOB = 'DD-MM-YYYY';

const APIS: ApiDef[] = [
  {
    id: 'pan',
    title: 'PAN Verification',
    vendor: 'Surepass',
    method: 'POST',
    route: 'POST /verify/pan',
    fields: [
      {
        name: 'idNumber',
        label: 'PAN Number',
        placeholder: 'EKRPR1234F',
        required: true,
        hint: '10-character PAN',
      },
    ],
    buildPath: () => '/verify/pan',
    buildBody: (v) => ({ idNumber: v.idNumber }),
  },
  {
    id: 'voter',
    title: 'Voter ID Verification',
    vendor: 'Surepass',
    method: 'POST',
    route: 'POST /verify/voter-id',
    fields: [
      {
        name: 'idNumber',
        label: 'Voter ID (EPIC) Number',
        placeholder: 'ABC1234567',
        required: true,
      },
    ],
    buildPath: () => '/verify/voter-id',
    buildBody: (v) => ({ idNumber: v.idNumber }),
  },
  {
    id: 'passport',
    title: 'Passport Verification',
    vendor: 'Surepass',
    method: 'POST',
    route: 'POST /verify/passport',
    fields: [
      {
        name: 'fileNumber',
        label: 'File Number',
        placeholder: 'AB1234567',
        required: true,
      },
      {
        name: 'dob',
        label: 'Date of Birth',
        placeholder: DOB,
        required: true,
        hint: DOB,
      },
    ],
    buildPath: () => '/verify/passport',
    buildBody: (v) => ({ fileNumber: v.fileNumber, dob: v.dob }),
  },
  {
    id: 'driving-license',
    title: 'Driving License Verification',
    vendor: 'Surepass',
    method: 'POST',
    route: 'POST /verify/driving-license',
    fields: [
      {
        name: 'idNumber',
        label: 'License Number',
        placeholder: 'DL14 2011 0012345',
        required: true,
      },
      {
        name: 'dob',
        label: 'Date of Birth',
        placeholder: DOB,
        required: true,
        hint: DOB,
      },
    ],
    buildPath: () => '/verify/driving-license',
    buildBody: (v) => ({ idNumber: v.idNumber, dob: v.dob }),
  },
  {
    id: 'employment',
    title: 'Employment History (EPFO)',
    vendor: 'Surepass',
    method: 'POST',
    route: 'POST /verify/employment-history',
    fields: [
      {
        name: 'uan',
        label: 'UAN',
        placeholder: '100123456789',
        required: true,
        hint: '12 digits',
      },
    ],
    buildPath: () => '/verify/employment-history',
    buildBody: (v) => ({ uan: v.uan }),
  },
  {
    id: 'digilocker-init',
    title: 'DigiLocker — Initialize',
    vendor: 'Surepass',
    method: 'POST',
    route: 'POST /verify/digilocker/initialize',
    fields: [],
    buildPath: () => '/verify/digilocker/initialize',
    buildBody: () => undefined,
    note: 'Returns a client_id and a URL the candidate opens to authorize. Feed the client_id into the Status / Fetch Aadhaar cards.',
  },
  {
    id: 'digilocker-status',
    title: 'DigiLocker — Status',
    vendor: 'Surepass',
    method: 'GET',
    route: 'GET /verify/digilocker/status/{clientId}',
    fields: [
      {
        name: 'clientId',
        label: 'Client ID',
        placeholder: 'from Initialize',
        required: true,
      },
    ],
    buildPath: (v) =>
      `/verify/digilocker/status/${encodeURIComponent(v.clientId ?? '')}`,
  },
  {
    id: 'digilocker-aadhaar',
    title: 'DigiLocker — Fetch Aadhaar',
    vendor: 'Surepass',
    method: 'GET',
    route: 'GET /verify/digilocker/aadhaar/{clientId}',
    fields: [
      {
        name: 'clientId',
        label: 'Client ID',
        placeholder: 'from Initialize',
        required: true,
      },
    ],
    buildPath: (v) =>
      `/verify/digilocker/aadhaar/${encodeURIComponent(v.clientId ?? '')}`,
    note: 'Only works after Status reports completed: true.',
  },
  {
    id: 'crime-check',
    title: 'Crime Check',
    vendor: 'KonnectNXT',
    method: 'POST',
    route: 'POST /verify/crime-check',
    fields: [
      { name: 'name', label: 'Full Name', placeholder: 'John Doe', required: true },
      { name: 'fatherName', label: "Father's Name", placeholder: '(optional)' },
      { name: 'dob', label: 'Date of Birth', placeholder: `${DOB} (optional)`, hint: DOB },
      {
        name: 'address',
        label: 'Address',
        placeholder: '(optional, min 10 chars)',
      },
      {
        name: 'panNumber',
        label: 'PAN Number',
        placeholder: '(optional) EKRPR1234F',
      },
    ],
    buildPath: () => '/verify/crime-check',
    buildBody: (v) => {
      const body: Record<string, unknown> = { name: v.name };
      if (v.fatherName) body.fatherName = v.fatherName;
      if (v.dob) body.dob = v.dob;
      if (v.address) body.address = v.address;
      if (v.panNumber) body.panNumber = v.panNumber;
      return body;
    },
  },
  {
    id: 'crime-report',
    title: 'Crime Check — Report',
    vendor: 'KonnectNXT',
    method: 'GET',
    route: 'GET /verify/crime-check/{requestId}',
    fields: [
      {
        name: 'requestId',
        label: 'Request ID',
        placeholder: 'from Crime Check',
        required: true,
      },
    ],
    buildPath: (v) =>
      `/verify/crime-check/${encodeURIComponent(v.requestId ?? '')}`,
    note: 'Poll for the result using the request_id returned by Crime Check.',
  },
  {
    id: 'credit-check',
    title: 'Credit Check',
    vendor: 'KonnectNXT',
    method: 'POST',
    route: 'POST /verify/credit-check',
    fields: [
      { name: 'name', label: 'Full Name', placeholder: 'John Doe', required: true },
      {
        name: 'panNumber',
        label: 'PAN Number',
        placeholder: 'EKRPR1234F',
        required: true,
        hint: 'credit bureau keys on PAN',
      },
      { name: 'dob', label: 'Date of Birth', placeholder: `${DOB} (optional)`, hint: DOB },
      { name: 'fatherName', label: "Father's Name", placeholder: '(optional)' },
      { name: 'street', label: 'Street', placeholder: '12 MG Road', required: true },
      { name: 'city', label: 'City', placeholder: 'Bengaluru', required: true },
      { name: 'state', label: 'State', placeholder: 'Karnataka', required: true },
      {
        name: 'pincode',
        label: 'Pincode',
        placeholder: '560001',
        required: true,
        hint: '6 digits',
      },
      { name: 'country', label: 'Country', placeholder: 'India (default)' },
    ],
    buildPath: () => '/verify/credit-check',
    buildBody: (v) => {
      const body: Record<string, unknown> = {
        name: v.name,
        panNumber: v.panNumber,
        street: v.street,
        city: v.city,
        state: v.state,
        pincode: v.pincode,
      };
      if (v.dob) body.dob = v.dob;
      if (v.fatherName) body.fatherName = v.fatherName;
      if (v.country) body.country = v.country;
      return body;
    },
    note: 'KonnectNXT v2 BGV submit — requires PAN + a complete address. Returns a case_id; fetch its report below.',
  },
  {
    id: 'credit-report',
    title: 'Credit Check — Report',
    vendor: 'KonnectNXT',
    method: 'GET',
    route: 'GET /verify/credit-check/{caseId}',
    fields: [
      {
        name: 'caseId',
        label: 'Case ID',
        placeholder: 'from Credit Check',
        required: true,
      },
    ],
    buildPath: (v) =>
      `/verify/credit-check/${encodeURIComponent(v.caseId ?? '')}`,
    note: 'Returns the signed report PDF URL once the case completes (null while still processing).',
  },
];

// ─── Result types ─────────────────────────────────────────────────────────────

type RunResult =
  | { ok: true; ms: number; data: unknown }
  | {
      ok: false;
      ms: number;
      status: number | null;
      message: string;
      payload: unknown;
    };

function ApiTester({ def }: { def: ApiDef }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const missingRequired = def.fields.some(
    (f) => f.required && !(values[f.name]?.trim()),
  );

  const run = async () => {
    setRunning(true);
    setResult(null);
    const started = Date.now();
    try {
      const body = def.buildBody?.(values);
      const data = await apiRequest<unknown>(def.buildPath(values), {
        method: def.method,
        ...(body !== undefined ? { body } : {}),
      });
      setResult({ ok: true, ms: Date.now() - started, data });
    } catch (err) {
      const ms = Date.now() - started;
      if (err instanceof ApiError) {
        setResult({
          ok: false,
          ms,
          status: err.status,
          message: err.message,
          payload: err.payload,
        });
      } else {
        setResult({
          ok: false,
          ms,
          status: null,
          message: err instanceof Error ? err.message : 'Request failed',
          payload: null,
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const responseBody = result
    ? result.ok
      ? result.data
      : (result.payload ?? { message: result.message })
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-default bg-white p-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-text-heading">
            {def.title}
          </h3>
          <span className="rounded-full bg-neutral-300 px-2 py-0.5 text-body-sm font-medium text-text-subheading">
            {def.vendor}
          </span>
        </div>
        <code className="font-mono text-body-sm text-text-subheading">
          {def.route}
        </code>
      </div>

      {def.note && (
        <p className="text-body-sm text-text-subheading">{def.note}</p>
      )}

      {def.fields.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {def.fields.map((field) => (
            <InputFieldWrapper
              key={field.name}
              label={field.required ? field.label : `${field.label} (optional)`}
              note={field.hint}
            >
              <Input
                value={values[field.name] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: event.target.value,
                  }))
                }
              />
            </InputFieldWrapper>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={run}
          isLoading={running}
          disabled={running || missingRequired}
        >
          Run
        </Button>
        {result && (
          <span className="text-body-sm text-text-subheading">{result.ms} ms</span>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-2">
          <Callout
            state={result.ok ? 'Success' : 'Error'}
            configuration={result.ok ? 'Text Only' : 'Text & Subtext'}
            title={
              result.ok
                ? 'Success'
                : `Failed${result.status ? ` · HTTP ${result.status}` : ''}`
            }
            subtext={result.ok ? undefined : result.message}
          />
          <pre className="max-h-80 overflow-auto rounded-md border border-border-default bg-neutral-200 p-3 font-mono text-body-sm leading-relaxed text-text-body">
            {JSON.stringify(responseBody, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function TestVerificationPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const authedUser = await me(token);
        if (cancelled) return;
        if (authedUser.role !== 'admin') {
          router.replace('/home');
          return;
        }
        setUser(authedUser);
      } catch {
        if (!cancelled) doLogout(router);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <AppShell
      nav={ADMIN_NAV}
      user={user}
      onLogout={() => doLogout(router)}
      breadcrumbs={[
        { label: 'Home', href: '/admin' },
        { label: 'Test Verification' },
      ]}
    >
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-text-heading">
            Test Verification
          </h1>
          <p className="text-body-md text-text-subheading">
            Run any vendor API directly against the live integration by filling
            the required fields. Every call — success or failure — is recorded
            and shows up on the Vendors dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {APIS.map((def) => (
            <ApiTester key={def.id} def={def} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
