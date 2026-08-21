'use client';

/**
 * Scratch page proving the imported RDS component library renders correctly
 * inside Recrify. Safe to delete once the components are in real use.
 */
import { useState, type ChangeEvent } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DateRangeInput,
  Divider,
  Input,
  ProgressBar,
  RadioButton,
  Switch,
  Tag,
  type DateRangeValue,
} from '@/shared/components/ui';

export default function RdsDemoPage() {
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);
  const [text, setText] = useState('');

  return (
    <main className="min-h-screen bg-white p-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold">RDS Components</h1>
          <p className="mt-1 text-sm text-gray-500">
            Imported from Recriauth — rendering inside Recrify.
          </p>
        </div>

        <Divider />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Buttons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="link">Link</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Badges &amp; Tags</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Badge</Badge>
            <Tag label="Verified" />
            <Tag label="Pending" variant="Warning" />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            Date range (replaces Start / End Date)
          </h2>
          <DateRangeInput label="Date Range" value={range} onChange={setRange} />
          <p className="text-xs text-gray-500">
            {range?.from
              ? `${range.from.toDateString()} → ${range.to?.toDateString() ?? '…'}`
              : 'No range selected'}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Form controls</h2>
          <Input
            placeholder="Enter a name"
            value={text}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-6">
            <Checkbox
              label="Consent given"
              showLabel
              checked={checked}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setChecked(e.target.checked)}
            />
            <RadioButton label="Selected" showLabel checked readOnly />
            <Switch
              checked={on}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setOn(e.target.checked)}
            />
          </div>
          <ProgressBar value={64} showLabel />
        </section>
      </div>
    </main>
  );
}
