'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  Button,
  ButtonContainer,
  DialogBox,
  Divider,
  Input,
  InputFieldWrapper,
  Menu,
  toast,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import { internalVendorsService } from '../services/internal-vendors.service';
import {
  LOW_BALANCE_THRESHOLD_OPTIONS,
  RENEWAL_THRESHOLD_OPTIONS,
} from '../commons/internal-vendors.constants';
import type {
  VendorBillingModel,
  VendorCode,
  VendorSettings,
} from '../commons/internal-vendors.types';

function normalizeThreshold(value: string | null): string {
  if (value == null) return '';
  const rounded = Math.round(Number(value));
  return Number.isFinite(rounded) ? String(rounded) : '';
}

interface VendorSettingsModalProps {
  open: boolean;
  onClose: () => void;
  code: VendorCode;
  billingModel: VendorBillingModel;
  settings: VendorSettings;
  onSaved: (settings: VendorSettings) => void;
}

export function VendorSettingsModal({
  open,
  onClose,
  code,
  billingModel,
  settings,
  onSaved,
}: VendorSettingsModalProps) {
  const [threshold, setThreshold] = useState(
    normalizeThreshold(settings.lowBalanceThreshold),
  );
  const [timeoutMs, setTimeoutMs] = useState(
    settings.requestTimeoutMs != null ? String(settings.requestTimeoutMs) : '',
  );
  const [saving, setSaving] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const syncPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    syncPosition();
    window.addEventListener('resize', syncPosition);
    window.addEventListener('scroll', syncPosition, true);
    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('resize', syncPosition);
      window.removeEventListener('scroll', syncPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  // The in-house OCR is our own (internal) service, so it has no balance alert
  // at all. Subscription vendors (TeleCMI) alert on days-to-renewal rather than
  // a ₹ balance.
  const isInternal = billingModel === 'INTERNAL';
  const isSubscription = billingModel === 'SUBSCRIPTION';
  const thresholdOptions = [
    { value: '', label: 'No alert' },
    ...(isSubscription
      ? RENEWAL_THRESHOLD_OPTIONS
      : LOW_BALANCE_THRESHOLD_OPTIONS),
  ];
  const selectedLabel =
    thresholdOptions.find((option) => option.value === threshold)?.label ??
    'No alert';

  const handleSave = async () => {
    const parsedTimeout =
      timeoutMs.trim() === '' ? undefined : Number(timeoutMs);
    if (
      parsedTimeout !== undefined &&
      (!Number.isInteger(parsedTimeout) ||
        parsedTimeout < 1000 ||
        parsedTimeout > 120000)
    ) {
      toast.error('Request timeout must be between 1,000 and 120,000 ms.');
      return;
    }

    setSaving(true);
    try {
      const updated = await internalVendorsService.updateSettings(code, {
        lowBalanceThreshold: threshold === '' ? null : Number(threshold),
        ...(parsedTimeout !== undefined
          ? { requestTimeoutMs: parsedTimeout }
          : {}),
      });
      onSaved(updated);
      toast.success('Vendor settings updated.');
      onClose();
    } catch {
      toast.error('Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogBox
      open={open}
      onClose={onClose}
      placement="center"
      className="w-[520px] max-w-[90vw]"
      footer={
        <ButtonContainer alignment="Right" configuration="With Padding">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            isLoading={saving}
          >
            Save Changes
          </Button>
        </ButtonContainer>
      }
    >
      <div className="relative flex flex-col gap-5 p-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-icon-default transition-colors hover:text-text-body"
        >
          <X className="size-5" />
        </button>

        <h2 className="text-xl font-semibold text-text-heading">
          Vendor Settings
        </h2>

        <div className="flex flex-col gap-3">
          {!isInternal ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-base font-semibold text-text-body">
                    {isSubscription
                      ? 'Renewal Alert Threshold'
                      : 'Low Balance Alert Threshold'}
                  </span>
                  <span className="text-body-md text-text-subheading">
                    {isSubscription
                      ? 'Receive an alert when fewer than the selected number of days remain before renewal.'
                      : 'Receive an alert when the vendor balance falls below the specified amount.'}
                  </span>
                </div>
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className={cn(
                    'flex w-[160px] shrink-0 items-center gap-2 rounded-md border border-border-default bg-white px-3 py-2 text-left transition-colors hover:border-border-hover focus:outline-none focus-visible:border-border-focused',
                    menuOpen && 'border-border-focused',
                  )}
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                >
                  <span className="flex-1 truncate text-body-md font-normal leading-[20px] tracking-body-md text-text-body">
                    {selectedLabel}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-icon-default transition-transform',
                      menuOpen && 'rotate-180',
                    )}
                  />
                </button>
              </div>
              <Divider />
            </>
          ) : null}

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold text-text-body">
                Request Timeout
              </span>
              <span className="text-body-md text-text-subheading">
                Maximum time to wait for a vendor response before marking the
                request as failed.
              </span>
            </div>
            <InputFieldWrapper className="w-[160px] shrink-0">
              <Input
                type="number"
                min={1000}
                max={120000}
                step={500}
                value={timeoutMs}
                onChange={(event) => setTimeoutMs(event.target.value)}
                placeholder="15000"
                rightIcon={
                  <span className="text-xs text-text-subheading">ms</span>
                }
              />
            </InputFieldWrapper>
          </div>
        </div>
      </div>

      {menuOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[80]"
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
              }}
            >
              <Menu
                className="w-full"
                items={thresholdOptions.map((option) => ({
                  id: option.value || 'none',
                  menuText: option.label,
                  onClick: () => {
                    setThreshold(option.value);
                    setMenuOpen(false);
                  },
                }))}
              />
            </div>,
            document.body,
          )
        : null}
    </DialogBox>
  );
}
