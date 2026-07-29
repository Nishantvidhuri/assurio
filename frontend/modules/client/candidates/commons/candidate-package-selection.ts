import type {
  CreatePackagePreviewPayload,
} from '@/modules/client/billing/commons/client-billing.types';
import type {
  ClientPortalAddOnCheck,
  ClientPortalPackage,
  ClientPackageSelection,
  ClientPackageSubitem,
} from '@/modules/client/packages/commons/client-packages.types';
import {
  checkUsesPerSubitemQuantity,
  getMandatorySubitemDefinitionKeys,
} from '@/shared/lib/package-checks';

export interface CandidatePackageCustomizationDraft {
  checkId: string;
  selectedSubitemIds: string[];
}

export interface CandidatePackageAddOnDraft {
  checkId: string;
  quantity?: number;
  selectedSubitemIds?: string[];
  // Per-option multiplier (per-subitem-quantity checks like reference),
  // keyed by subitem id.
  subitemQuantities?: Record<string, number>;
}

// The candidate's resolution of one OR slot: which alternative check they took.
export interface CandidatePackageOrGroupSelectionDraft {
  orGroupId: string;
  chosenCheckId: string;
}

export interface CandidatePackageDraft {
  customizedChecks: CandidatePackageCustomizationDraft[];
  addOnSelections: CandidatePackageAddOnDraft[];
  orGroupSelections: CandidatePackageOrGroupSelectionDraft[];
}

// View-model for one OR slot, derived from the package + the current draft.
export interface CandidatePackageOrGroup {
  orGroupId: string;
  // Alternative checks in package order.
  alternatives: ClientPackageSelection[];
  chosenCheckId: string | null;
  // The chosen alternative, when the candidate has picked one.
  chosen: ClientPackageSelection | null;
  resolved: boolean;
}

export interface CandidatePackageAddOnGroup {
  checkId: string;
  selectionId: string;
  check: ClientPackageSelection['check'] | ClientPortalAddOnCheck;
  mode: 'quantity' | 'radio' | 'checkbox' | 'per-subitem-quantity';
  packageQuantity: number;
  includedSubitemIds: string[];
  remainingSubitems: ClientPackageSubitem[];
  selectedQuantity: number | null;
  maxQuantity: number | null;
  selectedSubitemIds: string[];
  // Per-subitem-quantity (reference) add-on state: the add-on's per-option
  // counts, the package-included counts (both consume the shared cap), and
  // the cap itself.
  subitemQuantities: Record<string, number>;
  includedSubitemQuantities: Record<string, number>;
  subitemQuantityMaxTotal: number | null;
  customizable: boolean;
  includedInPackage: boolean;
}

export function emptyCandidatePackageDraft(): CandidatePackageDraft {
  return {
    customizedChecks: [],
    addOnSelections: [],
    orGroupSelections: [],
  };
}

/**
 * Resolve the package to pre-select when the candidate-add flow opens.
 * Never auto-selects a non-selectable package: prefers the org default (when
 * still selectable), then the first selectable package, otherwise empty.
 */
export function resolveInitialSelectablePackageId(
  packages: ClientPortalPackage[],
  defaultPackageId: string | null | undefined,
): string {
  const selectablePackages = packages.filter((pkg) => pkg.selectable);
  const defaultPackage = defaultPackageId
    ? selectablePackages.find((pkg) => pkg.id === defaultPackageId)
    : undefined;

  return (
    defaultPackage?.id ??
    selectablePackages.find((pkg) => pkg.isDefault)?.id ??
    selectablePackages[0]?.id ??
    ''
  );
}

/**
 * Whether the candidate picks WHICH documents this check covers, via the
 * "Customize Package" dialog.
 *
 * The operator sets a count (identity: "Aadhaar + any 2"); the candidate
 * chooses which optional documents fill those slots. Checks with a document
 * choice are package-mandatory (identity today), so they are never part of an
 * OR slot — the two never overlap.
 */
export function isCustomizablePackageSelection(
  selection: ClientPackageSelection,
) {
  const check = selection.check;
  // Reference (per-subitem-quantity): the package's chosen options are fixed —
  // you "stick with" them and add more only via add-ons. Never customizable
  // inline like identity.
  if (checkUsesPerSubitemQuantity(check)) {
    return false;
  }
  if (
    !check.enableMultiple ||
    check.subitemSelectionType !== 'CHECKBOX' ||
    check.subitems.length === 0
  ) {
    return false;
  }

  // Mandatory subitems (e.g. Aadhaar) are always included; the operator's
  // `quantity` counts ADDITIONAL docs beyond mandatory. We show the
  // picker whenever there are additional docs at all — even if all of
  // them are forced (additional == optional pool size). In that case
  // the user can still see WHICH optionals they're getting, just can't
  // deselect any.
  const mandatoryKeys = new Set(
    getMandatorySubitemDefinitionKeys(check.definitionKey),
  );
  const hasMandatory = mandatoryKeys.size > 0;
  const additionalCount = hasMandatory
    ? Math.max(0, Number(selection.quantity ?? 0))
    : Math.max(1, Number(selection.quantity ?? 1));

  return additionalCount > 0;
}

export function getCustomizablePackageSelections(pkg: ClientPortalPackage) {
  return pkg.selectedChecks.filter(isCustomizablePackageSelection);
}

export function hasCustomizablePackageSelections(pkg: ClientPortalPackage) {
  return getCustomizablePackageSelections(pkg).length > 0;
}

// ─── OR groups (candidate picks one alternative per slot) ──────────────────

// Package selections grouped into OR slots (order preserved).
export function getPackageOrGroups(
  pkg: ClientPortalPackage,
): Map<string, ClientPackageSelection[]> {
  const groups = new Map<string, ClientPackageSelection[]>();
  for (const selection of pkg.selectedChecks) {
    if (!selection.orGroupId) continue;
    const members = groups.get(selection.orGroupId) ?? [];
    members.push(selection);
    groups.set(selection.orGroupId, members);
  }
  return groups;
}

export function hasOrGroupSelections(pkg: ClientPortalPackage): boolean {
  return getPackageOrGroups(pkg).size > 0;
}

// Resolve each OR slot against the current draft into a view-model.
export function deriveCandidatePackageOrGroups(
  pkg: ClientPortalPackage,
  draft: CandidatePackageDraft,
): CandidatePackageOrGroup[] {
  const selectionByGroup = new Map(
    (draft.orGroupSelections ?? []).map((entry) => [entry.orGroupId, entry]),
  );

  return [...getPackageOrGroups(pkg).entries()].map(
    ([orGroupId, alternatives]) => {
      const entry = selectionByGroup.get(orGroupId);
      const chosen =
        (entry &&
          alternatives.find((alt) => alt.check.id === entry.chosenCheckId)) ??
        null;

      return {
        orGroupId,
        alternatives,
        chosenCheckId: chosen ? chosen.check.id : null,
        chosen,
        resolved: chosen != null,
      };
    },
  );
}

// Checks the candidate passed over in an OR slot — the package no longer
// covers them, so they behave like any check outside the package (mirrors the
// server's `resolveOrGroups`). Unresolved slots exclude nothing.
export function getExcludedOrAlternativeCheckIds(
  pkg: ClientPortalPackage,
  draft: CandidatePackageDraft,
): Set<string> {
  const excluded = new Set<string>();
  for (const group of deriveCandidatePackageOrGroups(pkg, draft)) {
    if (!group.chosenCheckId) continue;
    for (const alternative of group.alternatives) {
      if (alternative.check.id !== group.chosenCheckId) {
        excluded.add(alternative.check.id);
      }
    }
  }
  return excluded;
}

// Every OR slot resolved → the candidate can proceed / the package can commit.
export function areAllOrGroupsResolved(
  pkg: ClientPortalPackage,
  draft: CandidatePackageDraft,
): boolean {
  return deriveCandidatePackageOrGroups(pkg, draft).every(
    (group) => group.resolved,
  );
}

export function resolvePackageCustomization(
  selection: ClientPackageSelection,
  customization?: CandidatePackageCustomizationDraft,
) {
  const check = selection.check;

  if (check.subitems.length === 0) {
    return [];
  }

  // Per-subitem-quantity (reference): the package's included options are
  // exactly the saved selection — never the mandatory/additional slice logic.
  if (checkUsesPerSubitemQuantity(check)) {
    return selection.selectedSubitemIds;
  }

  if (check.enableMultiple && check.subitemSelectionType === 'CHECKBOX') {
    // Mandatory subitems (e.g. Aadhaar) are always included; the
    // package's `quantity` counts ADDITIONAL docs beyond those. This
    // runs even when the picker isn't shown (e.g. additionalCount = 0)
    // so the snapshot still gets Aadhaar.
    const mandatoryKeys = new Set(
      getMandatorySubitemDefinitionKeys(check.definitionKey),
    );
    const mandatorySubitemIds = check.subitems
      .filter((s) => s.definitionKey && mandatoryKeys.has(s.definitionKey))
      .map((s) => s.id);
    const optionalSubitems = check.subitems.filter(
      (s) => !s.definitionKey || !mandatoryKeys.has(s.definitionKey),
    );
    const hasMandatory = mandatoryKeys.size > 0;
    const additionalCount = hasMandatory
      ? Math.max(0, Number(selection.quantity ?? 0))
      : Math.max(1, Number(selection.quantity ?? 1));
    const mandatoryIdSet = new Set(mandatorySubitemIds);

    const customizedOptionalIds = (customization?.selectedSubitemIds ?? [])
      .filter((id) => !mandatoryIdSet.has(id))
      .filter((id) => optionalSubitems.some((s) => s.id === id));

    const optionalIds =
      customizedOptionalIds.length > 0
        ? Array.from(new Set(customizedOptionalIds)).slice(0, additionalCount)
        : optionalSubitems.slice(0, additionalCount).map((s) => s.id);

    return [...mandatorySubitemIds, ...optionalIds];
  }

  if (check.enableMultiple) {
    const packageQuantity = Math.max(1, Number(selection.quantity ?? 1));
    return check.subitems.slice(0, packageQuantity).map((subitem) => subitem.id);
  }

  return selection.selectedSubitemIds;
}

export function deriveCandidatePackageAddOnGroups(
  pkg: ClientPortalPackage,
  addOnCatalog: ClientPortalAddOnCheck[],
  draft: CandidatePackageDraft,
): CandidatePackageAddOnGroup[] {
  const customizationByCheckId = new Map(
    draft.customizedChecks.map((entry) => [entry.checkId, entry]),
  );
  const addOnByCheckId = new Map(
    draft.addOnSelections.map((entry) => [entry.checkId, entry]),
  );
  // OR alternatives the candidate passed over are not part of the package —
  // they stay available as paid add-ons, exactly as the server prices them.
  const excludedCheckIds = getExcludedOrAlternativeCheckIds(pkg, draft);
  const packageSelectionByCheckId = new Map(
    pkg.selectedChecks
      .filter((selection) => !excludedCheckIds.has(selection.check.id))
      .map((selection) => [selection.check.id, selection]),
  );

  return addOnCatalog.flatMap<CandidatePackageAddOnGroup>((catalogCheck) => {
    const selection = packageSelectionByCheckId.get(catalogCheck.id);
    const check = selection?.check ?? catalogCheck;
    const includedInPackage = Boolean(selection);
    const packageQuantity = selection
      ? Math.max(1, Number(selection.quantity ?? 1))
      : 0;
    const includedSubitemIds = selection
      ? resolvePackageCustomization(
          selection,
          customizationByCheckId.get(check.id),
        )
      : [];

    if (check.subitems.length === 0) {
      if (includedInPackage && !check.enableMultiple) {
        return [];
      }

      const addOn = addOnByCheckId.get(check.id);
      const selectedQuantity =
        addOn?.quantity && addOn.quantity > 0 ? addOn.quantity : null;

      return [
        {
          checkId: check.id,
          selectionId: selection?.id ?? `addon-${check.id}`,
          check,
          mode: 'quantity' as const,
          packageQuantity,
          includedSubitemIds: [],
          remainingSubitems: [],
          selectedQuantity,
          maxQuantity: check.enableMultiple ? null : 1,
          selectedSubitemIds: [],
          subitemQuantities: {},
          includedSubitemQuantities: {},
          subitemQuantityMaxTotal: null,
          customizable: Boolean(selection && isCustomizablePackageSelection(selection)),
          includedInPackage,
        },
      ];
    }

    const addOn = addOnByCheckId.get(check.id);

    // Per-subitem-quantity (reference): the package's options are fixed, but
    // EVERY option (including already-included ones) can be topped up via
    // add-ons. The package counts + add-on counts share one total cap, so the
    // add-on budget is `maxTotal − includedTotal`.
    if (checkUsesPerSubitemQuantity(check)) {
      const includedSubitemQuantities = Object.fromEntries(
        includedSubitemIds.map((id) => [
          id,
          Math.max(1, Math.floor(selection?.subitemQuantities?.[id] ?? 1)),
        ]),
      );
      const includedTotal = Object.values(includedSubitemQuantities).reduce(
        (sum, count) => sum + count,
        0,
      );
      const maxTotal =
        check.subitemQuantityMaxTotal ?? Number.POSITIVE_INFINITY;
      // No capacity left beyond what the package already includes.
      if (maxTotal - includedTotal < 1) {
        return [];
      }
      const allSubitems = check.subitems;
      const selectedSubitemIds = Array.from(
        new Set(addOn?.selectedSubitemIds ?? []),
      ).filter((subitemId) =>
        allSubitems.some((subitem) => subitem.id === subitemId),
      );
      const subitemQuantities = Object.fromEntries(
        selectedSubitemIds.map((id) => [
          id,
          Math.max(1, Math.floor(addOn?.subitemQuantities?.[id] ?? 1)),
        ]),
      );

      return [
        {
          checkId: check.id,
          selectionId: selection?.id ?? `addon-${check.id}`,
          check,
          mode: 'per-subitem-quantity' as const,
          packageQuantity,
          includedSubitemIds,
          remainingSubitems: allSubitems,
          selectedQuantity: null,
          maxQuantity: null,
          selectedSubitemIds,
          subitemQuantities,
          includedSubitemQuantities,
          subitemQuantityMaxTotal: check.subitemQuantityMaxTotal ?? null,
          customizable: false,
          includedInPackage,
        },
      ];
    }

    const remainingSubitems = check.subitems.filter(
      (subitem) => !includedSubitemIds.includes(subitem.id),
    );

    if (remainingSubitems.length === 0) {
      return [];
    }

    const selectedSubitemIds = Array.from(
      new Set(addOn?.selectedSubitemIds ?? []),
    ).filter((subitemId) =>
      remainingSubitems.some((subitem) => subitem.id === subitemId),
    );

    return [
      {
        checkId: check.id,
        selectionId: selection?.id ?? `addon-${check.id}`,
        check,
        mode:
          check.subitemSelectionType === 'RADIO'
            ? ('radio' as const)
            : ('checkbox' as const),
        packageQuantity,
        includedSubitemIds,
        remainingSubitems,
        selectedQuantity: null,
        maxQuantity: null,
        selectedSubitemIds,
        subitemQuantities: {},
        includedSubitemQuantities: {},
        subitemQuantityMaxTotal: null,
        customizable: Boolean(selection && isCustomizablePackageSelection(selection)),
        includedInPackage,
      },
    ];
  });
}

export function upsertPackageCustomization(
  draft: CandidatePackageDraft,
  update: CandidatePackageCustomizationDraft,
): CandidatePackageDraft {
  const nextCustomizations = draft.customizedChecks.filter(
    (entry) => entry.checkId !== update.checkId,
  );

  nextCustomizations.push({
    checkId: update.checkId,
    selectedSubitemIds: Array.from(new Set(update.selectedSubitemIds)),
  });

  return {
    ...draft,
    customizedChecks: nextCustomizations,
  };
}

export function updatePackageAddOnSelection(
  draft: CandidatePackageDraft,
  update: CandidatePackageAddOnDraft,
): CandidatePackageDraft {
  const nextAddOns = draft.addOnSelections.filter(
    (entry) => entry.checkId !== update.checkId,
  );

  const normalizedSubitemIds = Array.from(
    new Set(update.selectedSubitemIds ?? []),
  );
  const normalizedQuantity =
    update.quantity && update.quantity > 0 ? update.quantity : undefined;

  // Per-subitem-quantity (reference): keep only counts for selected options,
  // each clamped to ≥1.
  const normalizedSubitemQuantities = update.subitemQuantities
    ? Object.fromEntries(
        normalizedSubitemIds
          .filter((id) => update.subitemQuantities?.[id] != null)
          .map((id) => [
            id,
            Math.max(1, Math.floor(update.subitemQuantities![id])),
          ]),
      )
    : undefined;
  const hasSubitemQuantities =
    normalizedSubitemQuantities != null &&
    Object.keys(normalizedSubitemQuantities).length > 0;

  if (
    normalizedQuantity != null ||
    normalizedSubitemIds.length > 0
  ) {
    nextAddOns.push({
      checkId: update.checkId,
      quantity: normalizedQuantity,
      selectedSubitemIds:
        normalizedSubitemIds.length > 0 ? normalizedSubitemIds : undefined,
      subitemQuantities: hasSubitemQuantities
        ? normalizedSubitemQuantities
        : undefined,
    });
  }

  return {
    ...draft,
    addOnSelections: nextAddOns,
  };
}

export function sanitizeCandidatePackageDraft(
  pkg: ClientPortalPackage,
  addOnCatalog: ClientPortalAddOnCheck[],
  draft: CandidatePackageDraft,
): CandidatePackageDraft {
  const customizationByCheckId = new Map(
    draft.customizedChecks.map((entry) => [entry.checkId, entry]),
  );

  const sanitizedCustomizations = getCustomizablePackageSelections(pkg).map(
    (selection) => ({
      checkId: selection.check.id,
      selectedSubitemIds: resolvePackageCustomization(
        selection,
        customizationByCheckId.get(selection.check.id),
      ),
    }),
  );

  const sanitizedAddOns = deriveCandidatePackageAddOnGroups(
    pkg,
    addOnCatalog,
    draft,
  ).flatMap<CandidatePackageAddOnDraft>((group) => {
    if (group.selectedQuantity != null) {
      return [{ checkId: group.checkId, quantity: group.selectedQuantity }];
    }

    if (group.mode === 'per-subitem-quantity') {
      if (group.selectedSubitemIds.length === 0) {
        return [];
      }
      return [
        {
          checkId: group.checkId,
          selectedSubitemIds: group.selectedSubitemIds,
          subitemQuantities: group.subitemQuantities,
        },
      ];
    }

    if (group.selectedSubitemIds.length > 0) {
      return [
        {
          checkId: group.checkId,
          selectedSubitemIds: group.selectedSubitemIds,
        },
      ];
    }

    return [];
  });

  // Drop OR selections whose group or chosen alternative no longer exists.
  const sanitizedOrGroupSelections = deriveCandidatePackageOrGroups(pkg, draft)
    .filter((group) => group.chosenCheckId != null)
    .map((group) => ({
      orGroupId: group.orGroupId,
      chosenCheckId: group.chosenCheckId as string,
    }));

  return {
    customizedChecks: sanitizedCustomizations,
    addOnSelections: sanitizedAddOns,
    orGroupSelections: sanitizedOrGroupSelections,
  };
}

export function buildPackagePreviewPayload(
  organizationPackageId: string,
  draft: CandidatePackageDraft,
): CreatePackagePreviewPayload {
  return {
    organizationPackageId,
    customizedChecks:
      draft.customizedChecks.length > 0 ? draft.customizedChecks : undefined,
    addOnSelections:
      draft.addOnSelections.length > 0 ? draft.addOnSelections : undefined,
    orGroupSelections:
      draft.orGroupSelections?.length > 0
        ? draft.orGroupSelections
        : undefined,
  };
}

export function buildPreviewCacheKey(
  organizationPackageId: string,
  draft: CandidatePackageDraft,
) {
  return JSON.stringify(buildPackagePreviewPayload(organizationPackageId, draft));
}

export function formatIncludedCheckLabel(input: {
  checkName: string;
  packageQuantity: number | null;
  selectedSubitems: Array<{ name: string; quantity?: number }>;
  enableMultiple: boolean;
  subitemSelectionType: 'CHECKBOX' | 'RADIO' | null;
  // Reference (per-option multiplier): each option shows its own count.
  perSubitemQuantity?: boolean;
}) {
  // Reference: "Reference (Last Employment x2, 2nd Last Employment x3)".
  if (input.perSubitemQuantity) {
    if (input.selectedSubitems.length === 0) {
      return input.checkName;
    }
    const parts = input.selectedSubitems.map(
      (subitem) => `${subitem.name} x ${Math.max(1, Number(subitem.quantity ?? 1))}`,
    );
    return `${input.checkName} (${parts.join(', ')})`;
  }

  if (input.selectedSubitems.length === 0 && input.enableMultiple) {
    return `${input.checkName} x ${Math.max(1, Number(input.packageQuantity ?? 1))}`;
  }

  if (input.selectedSubitems.length === 0) {
    return input.checkName;
  }

  return `${input.checkName} (${input.selectedSubitems
    .map((subitem) => subitem.name)
    .join(', ')})`;
}

export function formatAddOnLabel(input: {
  checkName: string;
  quantity: number | null;
  // Per-subitem-quantity (reference) options carry an optional count → "Name xN".
  selectedSubitems: Array<{ name: string; quantity?: number }>;
}) {
  if (input.quantity != null) {
    return `${input.checkName} x ${input.quantity}`;
  }

  if (input.selectedSubitems.length === 0) {
    return input.checkName;
  }

  return `${input.checkName} (${input.selectedSubitems
    .map((subitem) =>
      // Per-option-quantity subitems (reference) always show their count,
      // including x1. Other subitems (no quantity) show just the name.
      subitem.quantity != null
        ? `${subitem.name} x ${Math.max(1, subitem.quantity)}`
        : subitem.name,
    )
    .join(', ')})`;
}
