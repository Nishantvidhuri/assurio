'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  ButtonContainer,
  SelectInput,
  SvgIcon,
} from '@/shared/components/ui';
import type { PackageCheckLike } from '@/shared/lib/package-checks';
import trashIcon from '@/public/assets/icons/trash-full/Trash_Full=20px.svg';
import addIcon from '@/public/assets/icons/add-plus/Add_Plus=16px.svg';

// The "'OR' Conditions" popover. It hangs off the check row's "Add 'OR'
// Condition" link rather than opening centred, so the admin keeps sight of the
// check they are editing. The admin adds alternative checks; the candidate
// later picks exactly one of the anchor + all alternatives. Returns the chosen
// alternative check ids (anchor excluded).
export function PackageOrConditionsDialog<
  TCheck extends PackageCheckLike = PackageCheckLike,
>({
  anchorCheck,
  initialAlternativeIds,
  candidateChecks,
  onClose,
  onSave,
}: {
  anchorCheck: TCheck;
  // Alternative check ids already in the group (anchor excluded).
  initialAlternativeIds: string[];
  // Checks eligible to be an alternative (anchor already excluded by caller).
  candidateChecks: TCheck[];
  onClose: () => void;
  onSave: (alternativeCheckIds: string[]) => void;
}) {
  // One row per alternative; '' is an unfilled "Select check" row.
  const [rows, setRows] = useState<string[]>(
    initialAlternativeIds.length > 0 ? initialAlternativeIds : [''],
  );

  const nameById = useMemo(
    () => new Map(candidateChecks.map((check) => [check.id, check.name])),
    [candidateChecks],
  );

  const updateRow = (index: number, value: string) => {
    setRows((current) =>
      current.map((row, i) => (i === index ? value : row)),
    );
  };

  const removeRow = (index: number) => {
    setRows((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
  };

  const addRow = () => setRows((current) => [...current, '']);

  const handleSave = () => {
    // Dedupe, drop empties, keep order.
    const seen = new Set<string>();
    const chosen: string[] = [];
    for (const row of rows) {
      if (row && nameById.has(row) && !seen.has(row)) {
        seen.add(row);
        chosen.push(row);
      }
    }
    onSave(chosen);
  };

  return (
    <div
      role="dialog"
      aria-label="'OR' Conditions"
      className="flex w-[420px] flex-col items-start gap-8 overflow-hidden rounded-md border border-border-default bg-surface-page text-left"
      // The row itself is clickable in some hosts — keep clicks local.
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex w-full flex-col items-start gap-4 px-4 pb-0 pt-4">
        <h2 className="text-subtitle-md font-semibold leading-6 tracking-subtitle-md text-text-heading">
          &lsquo;OR&rsquo; Conditions
        </h2>

        {/* Anchor check — the slot this OR group is built around. Same pill as
            the "OR ✕" chip on the check rows, so the two read as one control. */}
        <span className="inline-flex w-fit items-center justify-center gap-1 rounded-full bg-neutral-400 px-2 py-px text-body-sm font-medium leading-5 text-text-body">
          {anchorCheck.name}
        </span>

        <div className="flex w-full flex-col gap-3">
          {rows.map((row, index) => {
            // Options: eligible checks not already chosen in another row.
            const takenElsewhere = new Set(
              rows.filter((_, i) => i !== index).filter(Boolean),
            );
            const options = candidateChecks
              .filter((check) => !takenElsewhere.has(check.id))
              .map((check) => ({ value: check.id, label: check.name }));

            return (
              <div key={index} className="flex w-full items-center gap-3">
                <span className="text-body-sm font-medium text-text-subheading">
                  OR
                </span>
                <div className="min-w-0 flex-1">
                  <SelectInput
                    value={row}
                    options={options}
                    placeholder="Select check"
                    onChange={(value) => updateRow(index, value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  aria-label="Remove condition"
                  className="flex size-5 items-center justify-center text-failure transition-colors hover:opacity-80"
                >
                  <SvgIcon src={trashIcon} size={5} color="text-failure" alt="" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="flex w-fit items-center justify-center gap-1 p-0 text-body-sm font-medium text-text-link transition-colors hover:text-primary-700"
        >
          <SvgIcon src={addIcon} color="text-text-link" alt="" />
          Add &lsquo;OR&rsquo; Condition
        </button>
      </div>

      <ButtonContainer
        alignment="Right"
        configuration="Without Padding"
        className="px-4 py-3 border-t border-border-default"
      >
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Save
        </Button>
      </ButtonContainer>
    </div>
  );
}
