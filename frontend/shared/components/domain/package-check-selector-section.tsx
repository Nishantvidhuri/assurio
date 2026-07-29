'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimatedToggle } from '@/shared/hooks/use-animated-toggle';
import { useClickOutside } from '@/shared/hooks/use-click-outside';
import { cn } from '@/shared/lib/utils';
import {
  Checkbox,
  NumberCounter,
  RadioButton,
  SearchBar,
  SvgIcon,
} from '@/shared/components/ui';
import { reorderById, useDragReorder } from '@/shared/hooks/use-drag-reorder';
import {
  checkUsesPerSubitemQuantity,
  defaultPackageCheckSelection,
  formatPackageCheckLabel,
  getMandatorySubitemDefinitionKeys,
  getPackageCheckMaxQuantity,
  getSubitemQuantityTotal,
  isCheckPackageMandatory,
  matchesPackageCheckSearch,
  type PackageCheckLike,
  type PackageCheckSelectionDraft,
} from '@/shared/lib/package-checks';
import { PackageOrConditionsDialog } from './package-or-conditions-dialog';
import chevronIcon from '@/public/assets/icons/chevron-down-medium/Chevron_Down_Medium=16px.svg'
import dragVerticalIcon from '@/public/assets/icons/drag-vertical/Drag_Vertical=20px.svg'
import closeIcon from '@/public/assets/icons/close-md/Close_MD=16px.svg'

const PACKAGE_CHECK_CARD_SELECTOR = '[data-package-check-card="true"]';

function ExpandableCheckContent({
  isExpanded,
  children,
}: {
  isExpanded: boolean;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { shouldRender, isVisible } = useAnimatedToggle(isExpanded, 400);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = contentRef.current;
    if (!shouldRender || !element) {
      return;
    }

    // Measure now AND whenever the content's own height changes — e.g. when an
    // unselected reference is expanded (short read-only list) and then
    // selected, swapping in the taller per-option rows. Without re-measuring,
    // the cached short height clamps the panel and the new rows get cut off.
    const measure = () => setHeight(element.scrollHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shouldRender]);

  if (!shouldRender && !isExpanded) return null;

  return (
    <div
      className="overflow-hidden transition-all duration-400 ease-in-out"
      style={{
        maxHeight: isVisible ? `${height}px` : '0px',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

interface PackageCheckSelectorSectionProps<
  TCheck extends PackageCheckLike = PackageCheckLike,
> {
  title?: string;
  checks: TCheck[];
  selectedChecks: PackageCheckSelectionDraft<TCheck>[];
  totalChecksCount: number;
  searchValue: string;
  loading?: boolean;
  emptyMessage?: string;
  enableReorder?: boolean;
  onSearchChange: (value: string) => void;
  onSelectedChecksChange: (nextSelections: PackageCheckSelectionDraft<TCheck>[]) => void;
}

export function PackageCheckSelectorSection<
  TCheck extends PackageCheckLike = PackageCheckLike,
>({
  title = 'Checks',
  checks,
  selectedChecks,
  totalChecksCount,
  searchValue,
  loading = false,
  emptyMessage = 'No checks found.',
  enableReorder = true,
  onSearchChange,
  onSelectedChecksChange,
}: PackageCheckSelectorSectionProps<TCheck>) {
  const [expandedCheckIds, setExpandedCheckIds] = useState<string[]>([]);
  // checkId of the OR group's anchor whose "'OR' Conditions" dialog is open.
  const [orDialogAnchorId, setOrDialogAnchorId] = useState<string | null>(null);
  // Wraps the open "'OR' Conditions" trigger + popover, so a click anywhere
  // else dismisses it (and clicking the trigger itself still toggles).
  const orPopoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(orPopoverRef, () => setOrDialogAnchorId(null));

  const {
    draggedId,
    dragOverId,
    clearDragOver,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  } = useDragReorder({
    onReorder: (sourceId, targetId) => {
      onSelectedChecksChange(
        reorderById(
          selectedChecks,
          sourceId,
          targetId,
          (selection) => selection.checkId,
        ),
      );
    },
    itemSelector: PACKAGE_CHECK_CARD_SELECTOR,
    flipRowSelector: PACKAGE_CHECK_CARD_SELECTOR,
    styleDragPreview: (preview, sourceElement) => {
      preview.style.width = `${sourceElement.offsetWidth}px`;
      preview.style.padding = '4px';
      preview.style.background = 'var(--color-surface-page, #ffffff)';
      preview.style.border = '1px solid var(--color-border-default, #d8dee8)';
      preview.style.borderRadius = '12px';
      preview.style.boxShadow = '0px 8px 24px rgba(11, 26, 59, 0.12)';
      preview.style.opacity = '1';
    },
  });

  const selectedCheckIds = useMemo(
    () => new Set(selectedChecks.map((selection) => selection.checkId)),
    [selectedChecks],
  );

  const selectedRows = useMemo(
    () =>
      selectedChecks.filter((selection) =>
        matchesPackageCheckSearch(selection.check, searchValue),
      ),
    [searchValue, selectedChecks],
  );

  const availableChecks = useMemo(
    () => checks.filter((check) => !selectedCheckIds.has(check.id)),
    [checks, selectedCheckIds],
  );

  const renderedChecks = useMemo(
    () => [
      ...selectedRows.map((selection) => ({
        check: selection.check,
        isSelected: true,
        selection,
      })),
      ...availableChecks
        .filter((check) => matchesPackageCheckSearch(check, searchValue))
        .map((check) => ({
          check,
          isSelected: false,
          selection: null,
        })),
    ],
    [availableChecks, searchValue, selectedRows],
  );

  const expandedCheckIdSet = useMemo(
    () => new Set(expandedCheckIds),
    [expandedCheckIds],
  );

  const toggleExpanded = (checkId: string) => {
    setExpandedCheckIds((current) =>
      current.includes(checkId)
        ? current.filter((value) => value !== checkId)
        : [...current, checkId],
    );
  };

  const setCheckSelected = (check: TCheck, shouldSelect: boolean) => {
    if (shouldSelect) {
      if (selectedChecks.some((selection) => selection.checkId === check.id)) {
        return;
      }

      onSelectedChecksChange([
        ...selectedChecks,
        defaultPackageCheckSelection(check),
      ]);
      return;
    }

    // Platform-mandatory checks can never be removed from a package
    // (the server rejects the API call too — this is a UI-side guard).
    if (isCheckPackageMandatory(check.definitionKey)) {
      return;
    }

    onSelectedChecksChange(
      selectedChecks.filter((selection) => selection.checkId !== check.id),
    );
    setExpandedCheckIds((current) =>
      current.filter((value) => value !== check.id),
    );
  };

  const handleQuantityChange = (checkId: string, nextValue: number) => {
    onSelectedChecksChange(
      selectedChecks.map((selection) =>
        selection.checkId === checkId
          ? {
              ...selection,
              quantity: (() => {
                const maxQuantity = getPackageCheckMaxQuantity(selection.check);
                const mandatoryCount = getMandatorySubitemDefinitionKeys(
                  selection.check.definitionKey,
                ).length;
                // Checks with mandatory subitems can go as low as 0
                // (mandatory only, no additional docs). Others floor at 1.
                const minQuantity = mandatoryCount > 0 ? 0 : 1;
                const normalized = Math.max(minQuantity, nextValue);

                return maxQuantity == null
                  ? normalized
                  : Math.min(maxQuantity, normalized);
              })(),
            }
          : selection,
      ),
    );
  };

  const toggleSubitem = (checkId: string, subitemId: string, checked: boolean) => {
    onSelectedChecksChange(
      selectedChecks.map((selection) => {
        if (selection.checkId !== checkId) return selection;

        const nextIds = new Set(selection.selectedSubitemIds);
        if (checked) nextIds.add(subitemId);
        else nextIds.delete(subitemId);

        return { ...selection, selectedSubitemIds: Array.from(nextIds) };
      }),
    );
  };

  const chooseRadioSubitem = (checkId: string, subitemId: string) => {
    onSelectedChecksChange(
      selectedChecks.map((selection) =>
        selection.checkId === checkId
          ? { ...selection, selectedSubitemIds: [subitemId] }
          : selection,
      ),
    );
  };

  // Per-subitem-quantity (reference): toggle an option on/off, seeding its
  // count to 1 when added.
  const toggleReferenceOption = (
    checkId: string,
    subitemId: string,
    checked: boolean,
  ) => {
    onSelectedChecksChange(
      selectedChecks.map((selection) => {
        if (selection.checkId !== checkId) return selection;
        const nextIds = new Set(selection.selectedSubitemIds);
        const nextQuantities = { ...(selection.subitemQuantities ?? {}) };
        if (checked) {
          nextIds.add(subitemId);
          nextQuantities[subitemId] = Math.max(1, nextQuantities[subitemId] ?? 1);
        } else {
          nextIds.delete(subitemId);
          delete nextQuantities[subitemId];
        }
        return {
          ...selection,
          selectedSubitemIds: Array.from(nextIds),
          subitemQuantities: nextQuantities,
        };
      }),
    );
  };

  // Per-subitem-quantity (reference): change one option's count, clamped so
  // the total across options never exceeds the cap.
  const handleSubitemQuantityChange = (
    checkId: string,
    subitemId: string,
    nextValue: number,
  ) => {
    onSelectedChecksChange(
      selectedChecks.map((selection) => {
        if (selection.checkId !== checkId) return selection;
        const max = selection.check.subitemQuantityMaxTotal ?? Number.MAX_SAFE_INTEGER;
        const others = getSubitemQuantityTotal(
          selection.selectedSubitemIds.filter((id) => id !== subitemId),
          selection.subitemQuantities,
        );
        const cap = Math.max(1, max - others);
        const normalized = Math.min(cap, Math.max(1, nextValue));
        return {
          ...selection,
          subitemQuantities: {
            ...(selection.subitemQuantities ?? {}),
            [subitemId]: normalized,
          },
        };
      }),
    );
  };

  // Save the OR group for `anchorCheckId`: adds any missing alternatives, tags
  // anchor + alternatives with one orGroupId (or dissolves when none), and
  // reorders so the group is contiguous (anchor first).
  const handleOrGroupSave = (
    anchorCheckId: string,
    alternativeCheckIds: string[],
  ) => {
    const anchor = selectedChecks.find((s) => s.checkId === anchorCheckId);
    const previousGroupId = anchor?.orGroupId ?? null;
    const orGroupId =
      alternativeCheckIds.length > 0
        ? previousGroupId ?? crypto.randomUUID()
        : null;
    const groupIds = [anchorCheckId, ...alternativeCheckIds];
    const groupSet = new Set(groupIds);

    // Add any alternative not yet selected.
    let next: PackageCheckSelectionDraft<TCheck>[] = [...selectedChecks];
    for (const altId of alternativeCheckIds) {
      if (!next.some((s) => s.checkId === altId)) {
        const altCheck = checks.find((c) => c.id === altId);
        if (altCheck) next.push(defaultPackageCheckSelection(altCheck));
      }
    }

    // Re-tag membership: group members get orGroupId; ex-members of this group
    // (no longer included) are cleared.
    next = next.map((selection) => {
      if (groupSet.has(selection.checkId)) {
        return { ...selection, orGroupId };
      }
      if (previousGroupId && selection.orGroupId === previousGroupId) {
        return { ...selection, orGroupId: null };
      }
      return selection;
    });

    // Reorder group members contiguously (anchor first), at roughly the
    // anchor's original position among the non-group checks.
    if (orGroupId) {
      const anchorIndex = next.findIndex((s) => s.checkId === anchorCheckId);
      const members = groupIds
        .map((id) => next.find((s) => s.checkId === id))
        .filter((s): s is PackageCheckSelectionDraft<TCheck> => Boolean(s));
      const rest = next.filter((s) => !groupSet.has(s.checkId));
      const insertAt = Math.min(Math.max(0, anchorIndex), rest.length);
      next = [...rest.slice(0, insertAt), ...members, ...rest.slice(insertAt)];
    }

    onSelectedChecksChange(next);
    setOrDialogAnchorId(null);
  };

  const dissolveOrGroup = (orGroupId: string) => {
    onSelectedChecksChange(
      selectedChecks.map((selection) =>
        selection.orGroupId === orGroupId
          ? { ...selection, orGroupId: null }
          : selection,
      ),
    );
  };

  const orDialogAnchor = orDialogAnchorId
    ? selectedChecks.find((s) => s.checkId === orDialogAnchorId)
    : null;
  const orDialogAlternativeIds = useMemo(() => {
    if (!orDialogAnchor?.orGroupId) return [];
    return selectedChecks
      .filter(
        (s) =>
          s.orGroupId === orDialogAnchor.orGroupId &&
          s.checkId !== orDialogAnchor.checkId,
      )
      .map((s) => s.checkId);
  }, [orDialogAnchor, selectedChecks]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-body-lg font-semibold leading-[24px] tracking-body-lg text-text-body">
            {title}
          </h3>

          <SearchBar
            value={searchValue}
            onChange={onSearchChange}
            onClear={() => onSearchChange('')}
            placeholder="Search"
            className="[&_>div]:h-8 [&_>div]:w-[210px]"
          />
        </div>

        <p className="text-body-sm font-medium leading-[20px] tracking-body-sm text-text-subheading">
          <span className="text-text-body">{selectedChecks.length}</span>
          {' out of '}
          <span className="text-text-body">{totalChecksCount}</span>
          {' checks selected'}
        </p>
      </div>

      <div className="flex flex-col gap-1 rounded-md">
        {loading ? (
          <div className="rounded-md border border-border-default px-4 py-6 text-body-md text-text-subheading">
            Loading checks...
          </div>
        ) : renderedChecks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-default px-4 py-6 text-body-md text-text-subheading">
            {emptyMessage}
          </div>
        ) : (
          renderedChecks.map((item, renderIndex) => {
            const { check, isSelected, selection } = item;
            const prev = renderIndex > 0 ? renderedChecks[renderIndex - 1] : null;
            const orGroupId = selection?.orGroupId ?? null;
            const isGroupContinuation = Boolean(
              orGroupId && prev?.selection?.orGroupId === orGroupId,
            );
            const hasSubitems = check.subitems.length > 0;
            const isExpanded = hasSubitems && expandedCheckIdSet.has(check.id);
            const isDragSource = draggedId === check.id;
            const isDragTarget = dragOverId === check.id;
            const maxQuantity = getPackageCheckMaxQuantity(check);

            return (
              <Fragment key={check.id}>
                {/* "OR" divider joining consecutive alternatives of one slot. */}
                {isGroupContinuation && orGroupId ? (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <span className="inline-flex items-center justify-center gap-1 rounded-full bg-neutral-400 px-2 py-px text-caption font-medium leading-5 text-text-body">
                      OR
                      <button
                        type="button"
                        onClick={() => dissolveOrGroup(orGroupId)}
                        aria-label="Remove OR condition"
                        className="flex size-4 items-center justify-center text-text-body transition-colors hover:opacity-70"
                      >
                        <SvgIcon src={closeIcon} alt="" />
                      </button>
                    </span>
                  </div>
                ) : null}
              <div
                data-package-check-card="true"
                onDragOver={
                  enableReorder && isSelected
                    ? (event) => handleDragOver(event, check.id)
                    : undefined
                }
                onDragLeave={enableReorder && isSelected ? clearDragOver : undefined}
                onDrop={
                  enableReorder && isSelected
                    ? (event) => void handleDrop(event, check.id)
                    : undefined
                }
                // Positioning context for the "'OR' Conditions" popover, which
                // must escape the card's own overflow-hidden.
                ref={orDialogAnchorId === check.id ? orPopoverRef : null}
                className={cn(
                  'relative grid gap-1 rounded-sm p-1 transition-colors',
                  enableReorder
                    ? 'grid-cols-[16px_minmax(0,1fr)]'
                    : 'grid-cols-[minmax(0,1fr)]',
                  isDragTarget && 'bg-primary-bg',
                  isDragSource && 'opacity-70',
                )}
              >
                {/* Hangs off the row's "'OR' Condition" link, so the check
                    being edited stays in view. */}
                {orDialogAnchor && orDialogAnchor.checkId === check.id ? (
                  <div className="absolute right-1 top-12 z-30">
                    <PackageOrConditionsDialog
                      anchorCheck={orDialogAnchor.check}
                      initialAlternativeIds={orDialogAlternativeIds}
                      // Package-mandatory checks (Identity) are on every
                      // package by definition, so they can never be the
                      // alternative the candidate trades away.
                      candidateChecks={checks.filter(
                        (candidate) =>
                          candidate.id !== check.id &&
                          !isCheckPackageMandatory(candidate.definitionKey),
                      )}
                      onClose={() => setOrDialogAnchorId(null)}
                      onSave={(alternativeCheckIds) =>
                        handleOrGroupSave(check.id, alternativeCheckIds)
                      }
                    />
                  </div>
                ) : null}
                {enableReorder ? (
                  <div className="flex h-[43px] items-center">
                    {isSelected ? (
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => handleDragStart(event, check.id)}
                        onDragEnd={handleDragEnd}
                        className="flex size-4 items-center justify-center text-icon-muted"
                        aria-label={`Reorder ${check.name}`}
                      >
                        <SvgIcon src={dragVerticalIcon} alt='Drag' />
                      </button>
                    ) : (
                      <span className="block size-4" aria-hidden />
                    )}
                  </div>
                ) : null}

                {(() => {
                  const isCheckMandatory = isCheckPackageMandatory(
                    check.definitionKey,
                  );
                  const mandatorySubitemCount = getMandatorySubitemDefinitionKeys(
                    check.definitionKey,
                  ).length;
                  // Min quantity = 0 for checks with mandatory subitems
                  // (Aadhaar alone is acceptable). Else legacy floor of 1.
                  const minQuantity = mandatorySubitemCount > 0 ? 0 : 1;
                  return (
                <div className="overflow-hidden rounded-md border border-border-default bg-white">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        size="Medium"
                        checked={isSelected}
                        onChange={(event) =>
                          setCheckSelected(check, event.target.checked)
                        }
                        showLabel={false}
                        disabled={isCheckMandatory}
                      />

                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-body-md font-medium leading-[20px] tracking-body-md text-text-body">
                          {isSelected &&
                          selection &&
                          !checkUsesPerSubitemQuantity(check)
                            ? formatPackageCheckLabel({
                                check,
                                quantity: selection.quantity,
                                selectedSubitemIds:
                                  selection.selectedSubitemIds ?? [],
                                subitemQuantities: selection.subitemQuantities,
                              })
                            : check.name}
                        </span>
                        {check.enableMultiple &&
                        !checkUsesPerSubitemQuantity(check) ? (
                          <div className="shrink-0">
                            <NumberCounter
                              value={Math.min(
                                maxQuantity ?? Number.MAX_SAFE_INTEGER,
                                Math.max(
                                  minQuantity,
                                  Number(selection?.quantity ?? minQuantity),
                                ),
                              )}
                              onChange={(nextValue) =>
                                handleQuantityChange(check.id, nextValue)
                              }
                              min={minQuantity}
                              max={maxQuantity}
                              disabled={!isSelected}
                            />
                          </div>
                        ) : null}
                        {hasSubitems ? (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(check.id)}
                            className="flex size-4 shrink-0 items-center justify-center text-icon-default"
                            aria-label={
                              isExpanded
                                ? `Collapse ${check.name}`
                                : `Expand ${check.name}`
                            }
                          >
                            <SvgIcon src={chevronIcon} className={cn("size-4 transition-transform duration-400", isExpanded && "-rotate-180")} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-4">
                      {/* OR condition entry — shown on standalone selected
                          checks ("Add") and each group's anchor ("Edit").
                          Package-mandatory checks (Identity) are always
                          verified, so they are never part of a choice. */}
                      {isSelected &&
                      !isGroupContinuation &&
                      !isCheckMandatory ? (
                        <button
                          type="button"
                          onClick={() =>
                            setOrDialogAnchorId((current) =>
                              current === check.id ? null : check.id,
                            )
                          }
                          className="whitespace-nowrap text-body-sm font-medium text-text-link transition-colors hover:text-primary-700"
                        >
                          {orGroupId
                            ? "Edit 'OR' Condition"
                            : "Add 'OR' Condition"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {hasSubitems ? (
                    <ExpandableCheckContent isExpanded={isExpanded}>
                      <div className="border-t border-border-default">
                        {isSelected && checkUsesPerSubitemQuantity(check) ? (
                          <div className="flex flex-col gap-2 px-4 py-3">
                            {check.subitems.map((subitem) => {
                              const optionSelected = (
                                selection?.selectedSubitemIds ?? []
                              ).includes(subitem.id);
                              const optionCount = Math.max(
                                1,
                                Math.floor(
                                  selection?.subitemQuantities?.[subitem.id] ?? 1,
                                ),
                              );
                              // Cap this option so the running total never
                              // exceeds the check's max.
                              const max =
                                check.subitemQuantityMaxTotal ??
                                Number.MAX_SAFE_INTEGER;
                              const others = getSubitemQuantityTotal(
                                (selection?.selectedSubitemIds ?? []).filter(
                                  (id) => id !== subitem.id,
                                ),
                                selection?.subitemQuantities,
                              );
                              const optionMax = Math.max(1, max - others);
                              return (
                                <div
                                  key={subitem.id}
                                  className="flex items-center justify-between gap-3"
                                >
                                  <Checkbox
                                    size="Small"
                                    checked={optionSelected}
                                    onChange={(event) =>
                                      toggleReferenceOption(
                                        check.id,
                                        subitem.id,
                                        event.target.checked,
                                      )
                                    }
                                    label={subitem.name}
                                    labelClassName="text-body-sm tracking-body-sm"
                                  />
                                  <NumberCounter
                                    value={optionSelected ? optionCount : 0}
                                    onChange={(nextValue) =>
                                      handleSubitemQuantityChange(
                                        check.id,
                                        subitem.id,
                                        nextValue,
                                      )
                                    }
                                    min={1}
                                    max={optionMax}
                                    disabled={!optionSelected}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : isSelected && !check.enableMultiple ? (
                          <div className="flex flex-col gap-2 px-4 py-3">
                            {check.subitems.map((subitem) => {
                              const isChecked = (selection?.selectedSubitemIds ?? []).includes(
                                subitem.id,
                              );

                              return check.subitemSelectionType === 'RADIO' ? (
                                <RadioButton
                                  key={subitem.id}
                                  checked={isChecked}
                                  onChange={() =>
                                    chooseRadioSubitem(check.id, subitem.id)
                                  }
                                  label={subitem.name}
                                />
                              ) : (
                                <Checkbox
                                  key={subitem.id}
                                  checked={isChecked}
                                  onChange={(event) =>
                                    toggleSubitem(
                                      check.id,
                                      subitem.id,
                                      event.target.checked,
                                    )
                                  }
                                  label={subitem.name}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 px-4 py-3">
                            {check.subitems.map((subitem) => (
                              <div
                                key={subitem.id}
                                className="flex items-center gap-2 text-body-sm font-medium leading-[20px] tracking-body-sm text-text-subheading"
                              >
                                <span>{subitem.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </ExpandableCheckContent>
                  ) : null}
                </div>
                  );
                })()}
              </div>
              </Fragment>
            );
          })
        )}
      </div>

    </section>
  );
}
