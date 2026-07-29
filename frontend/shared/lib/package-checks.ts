export type PackageCheckSubitemSelectionType = 'CHECKBOX' | 'RADIO';
export type PackageCheckMoveDirection = 'up' | 'down';

// Subitems flagged here are always materialised on every package's
// instance of the parent check. Currently only Aadhaar on the identity
// check — drives the package-builder UI to pre-check / disable Aadhaar
// and shifts the "any N" label to "Aadhaar + any N more". Keep in sync
// with the server-side `isMandatory` flag in `verification-check-catalog.ts`.
export const MANDATORY_SUBITEM_DEFINITION_KEYS_BY_CHECK: Readonly<
  Record<string, readonly string[]>
> = {
  'identity-verification': ['aadhaar'],
};

export function getMandatorySubitemDefinitionKeys(
  checkDefinitionKey: string | undefined,
): readonly string[] {
  if (!checkDefinitionKey) return [];
  return MANDATORY_SUBITEM_DEFINITION_KEYS_BY_CHECK[checkDefinitionKey] ?? [];
}

export interface PackageCheckSubitemLike {
  id: string;
  // definitionKey lets the package builder + summary recognise specific
  // subitems (e.g. Aadhaar) regardless of which org's check they belong
  // to. Optional for backward compat with shapes that don't carry it.
  definitionKey?: string;
  name: string;
  price: string;
  sortOrder: number;
}

export interface PackageCheckLike {
  id: string;
  // definitionKey identifies the check across orgs (e.g.
  // 'identity-verification'). Used to look up mandatory subitems.
  definitionKey?: string;
  icon: string;
  name: string;
  enableMultiple: boolean;
  price: string | null;
  subitemSelectionType: PackageCheckSubitemSelectionType | null;
  sortOrder: number;
  subitems: PackageCheckSubitemLike[];
  // When true (reference), each selected subitem carries its own multiplier
  // and the selector renders a per-option Checkbox + NumberCounter; the sum of
  // counts is capped at `subitemQuantityMaxTotal`.
  perSubitemQuantity?: boolean;
  subitemQuantityMaxTotal?: number | null;
}

export interface PackageCheckSelectionDraft<TCheck extends PackageCheckLike = PackageCheckLike> {
  checkId: string;
  check: TCheck;
  quantity: number | null;
  selectedSubitemIds: string[];
  // Per-subitem multiplier (perSubitemQuantity checks only), keyed by subitem id.
  subitemQuantities?: Record<string, number>;
  // OR grouping — drafts sharing a non-null orGroupId are mutually-exclusive
  // alternatives of one slot (candidate picks one). Null/undefined = standalone.
  orGroupId?: string | null;
}

export function checkUsesPerSubitemQuantity(check: PackageCheckLike): boolean {
  return Boolean(check.perSubitemQuantity);
}

// Sum of per-option counts for a per-subitem-quantity selection.
export function getSubitemQuantityTotal(
  selectedSubitemIds: string[],
  subitemQuantities: Record<string, number> | undefined,
): number {
  return selectedSubitemIds.reduce(
    (total, id) => total + Math.max(1, Math.floor(subitemQuantities?.[id] ?? 1)),
    0,
  );
}

// Per-subitem-quantity selection is valid when ≥1 option is selected and the
// total count is within [1, maxTotal].
export function isPerSubitemQuantitySelectionValid<
  TCheck extends PackageCheckLike,
>(check: TCheck, selection: PackageCheckSelectionDraft<TCheck>): boolean {
  if (selection.selectedSubitemIds.length === 0) return false;
  const total = getSubitemQuantityTotal(
    selection.selectedSubitemIds,
    selection.subitemQuantities,
  );
  const max = check.subitemQuantityMaxTotal ?? Infinity;
  return total >= 1 && total <= max;
}

export interface PackageCheckSummaryInput<TCheck extends PackageCheckLike = PackageCheckLike> {
  check: TCheck;
  quantity?: number | null;
  selectedSubitemIds?: string[];
  subitemQuantities?: Record<string, number>;
}

export interface PersistedPackageCheckSelection {
  check: { id: string };
  quantity: number | null;
  selectedSubitemIds: string[];
  subitemQuantities?: Record<string, number>;
}

export function getPackageCheckSummary<TCheck extends PackageCheckLike>({
  check,
  quantity,
  selectedSubitemIds = [],
  subitemQuantities,
}: PackageCheckSummaryInput<TCheck>): string | null {
  // Per-subitem-quantity (reference): "Last Employment x1, 2nd Last Employment x4".
  if (checkUsesPerSubitemQuantity(check)) {
    const parts = check.subitems
      .filter((subitem) => selectedSubitemIds.includes(subitem.id))
      .map(
        (subitem) =>
          `${subitem.name} x ${Math.max(1, Math.floor(subitemQuantities?.[subitem.id] ?? 1))}`,
      );
    return parts.length > 0 ? parts.join(', ') : null;
  }

  if (check.subitems.length > 0 && !check.enableMultiple) {
    const selectedNames = check.subitems
      .filter((subitem) => selectedSubitemIds.includes(subitem.id))
      .map((subitem) => subitem.name);

    return selectedNames.length > 0 ? selectedNames.join(', ') : null;
  }

  if (check.subitems.length > 0 && check.enableMultiple) {
    const mandatoryKeys = getMandatorySubitemDefinitionKeys(
      check.definitionKey,
    );
    if (mandatoryKeys.length > 0) {
      // Format the mandatory subitems by their actual name (e.g.
      // "Aadhaar") so the summary reads naturally regardless of how
      // many mandatory items the check might gain in the future.
      const mandatoryNames = check.subitems
        .filter((s) => s.definitionKey && mandatoryKeys.includes(s.definitionKey))
        .map((s) => s.name);
      const mandatoryLabel =
        mandatoryNames.length > 0
          ? mandatoryNames.join(' + ')
          : mandatoryKeys.join(' + ');
      const additionalCount = Math.max(0, Number(quantity ?? 0));
      if (additionalCount === 0) {
        return mandatoryLabel;
      }
      return `${mandatoryLabel} + any ${additionalCount}`;
    }
    return `Any ${Math.max(1, Number(quantity ?? 1))}`;
  }

  return null;
}

export function formatPackageCheckLabel<TCheck extends PackageCheckLike>(
  input: PackageCheckSummaryInput<TCheck>,
): string {
  if (input.check.subitems.length === 0 && input.check.enableMultiple) {
    return `${input.check.name} x ${Math.max(1, Number(input.quantity ?? 1))}`;
  }

  const summary = getPackageCheckSummary(input);
  return summary ? `${input.check.name} (${summary})` : input.check.name;
}

// Shape shared by every package-check row that can take part in an OR group
// (admin base/custom package details + the client-facing package payload).
export interface OrGroupAwareSelection<TCheck extends PackageCheckLike = PackageCheckLike> {
  check: TCheck;
  quantity?: number | null;
  selectedSubitemIds?: string[];
  subitemQuantities?: Record<string, number> | null;
  orGroupId?: string | null;
}

function formatOrGroupMemberLabel<TCheck extends PackageCheckLike>(
  selection: OrGroupAwareSelection<TCheck>,
): string {
  return formatPackageCheckLabel({
    check: selection.check,
    quantity: selection.quantity,
    selectedSubitemIds: selection.selectedSubitemIds,
    subitemQuantities: selection.subitemQuantities ?? undefined,
  });
}

/**
 * Package card rows, collapsing each OR group into one
 * "Check A or Check B" line at the position of its first member.
 * Non-grouped checks keep their normal label. `selection` is the row's
 * representative (first member) — use it for the icon.
 */
export function packageCheckDisplayRows<
  TCheck extends PackageCheckLike,
  TSelection extends OrGroupAwareSelection<TCheck>,
>(selections: TSelection[]): { label: string; selection: TSelection }[] {
  const emittedGroups = new Set<string>();

  return selections.flatMap((selection) => {
    const groupId = selection.orGroupId;
    if (!groupId) {
      return [{ label: formatOrGroupMemberLabel(selection), selection }];
    }

    if (emittedGroups.has(groupId)) return [];
    emittedGroups.add(groupId);

    const label = selections
      .filter((other) => other.orGroupId === groupId)
      .map((member) => formatOrGroupMemberLabel(member))
      .join(' or ');

    return [{ label, selection }];
  });
}

export function defaultPackageCheckSelection<TCheck extends PackageCheckLike>(
  check: TCheck,
): PackageCheckSelectionDraft<TCheck> {
  // Per-subitem-quantity checks (reference) default to the first option ×1
  // (the minimum valid selection, e.g. "Last Employment x1").
  if (checkUsesPerSubitemQuantity(check) && check.subitems[0]) {
    const firstId = check.subitems[0].id;
    return {
      checkId: check.id,
      check,
      quantity: null,
      selectedSubitemIds: [firstId],
      subitemQuantities: { [firstId]: 1 },
    };
  }

  const selectedSubitemIds =
    check.subitems.length > 0 && !check.enableMultiple && check.subitems[0]
      ? [check.subitems[0].id]
      : [];

  // Checks with mandatory subitems start at quantity 0 ("mandatory
  // only, no additional docs"). Other enableMultiple checks default to
  // 1 (legacy behaviour).
  const hasMandatorySubitems =
    getMandatorySubitemDefinitionKeys(check.definitionKey).length > 0;
  const defaultQuantity = check.enableMultiple
    ? hasMandatorySubitems
      ? 0
      : 1
    : null;

  return {
    checkId: check.id,
    check,
    quantity: defaultQuantity,
    selectedSubitemIds,
  };
}

export function getPackageCheckMaxQuantity<TCheck extends PackageCheckLike>(
  check: TCheck,
): number | undefined {
  if (
    check.enableMultiple &&
    check.subitemSelectionType === 'CHECKBOX' &&
    check.subitems.length > 0
  ) {
    // Quantity = "additional beyond mandatory" — the picker max should
    // exclude mandatory subitems.
    const mandatoryCount = getMandatorySubitemDefinitionKeys(
      check.definitionKey,
    ).length;
    return check.subitems.length - mandatoryCount;
  }

  return undefined;
}

// Whether this check must be present on every package — used to hide
// the "remove" affordance and disable selection-toggle UX in the builder.
// Mirror of the server-side `isCheckPackageMandatory` helper.
export function isCheckPackageMandatory(
  checkDefinitionKey: string | undefined,
): boolean {
  if (!checkDefinitionKey) return false;
  return checkDefinitionKey in MANDATORY_SUBITEM_DEFINITION_KEYS_BY_CHECK;
}

export function matchesPackageCheckSearch<TCheck extends PackageCheckLike>(
  check: TCheck,
  search: string,
) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;

  return (
    check.name.toLowerCase().includes(normalizedSearch) ||
    check.subitems.some((subitem) =>
      subitem.name.toLowerCase().includes(normalizedSearch),
    )
  );
}

export interface SyncPackageCheckSelectionInput {
  checkId: string;
  quantity?: number | null;
  selectedSubitemIds?: string[];
  subitemQuantities?: Record<string, number>;
}

export async function syncPackageCheckSelections({
  initialSelections,
  nextSelections,
  upsertSelection,
  removeSelection,
  moveSelection,
}: {
  initialSelections: PersistedPackageCheckSelection[];
  nextSelections: SyncPackageCheckSelectionInput[];
  upsertSelection: (selection: SyncPackageCheckSelectionInput) => Promise<void>;
  removeSelection: (checkId: string) => Promise<void>;
  moveSelection: (
    checkId: string,
    direction: PackageCheckMoveDirection,
  ) => Promise<void>;
}) {
  const nextSelectionsById = new Map(
    nextSelections.map((selection) => [selection.checkId, selection]),
  );

  for (const currentSelection of initialSelections) {
    if (!nextSelectionsById.has(currentSelection.check.id)) {
      await removeSelection(currentSelection.check.id);
    }
  }

  for (const selection of nextSelections) {
    await upsertSelection(selection);
  }

  const current = [...initialSelections.map((selection) => selection.check.id)];
  for (const selection of nextSelections) {
    if (!current.includes(selection.checkId)) {
      current.push(selection.checkId);
    }
  }

  const desiredOrder = nextSelections.map((selection) => selection.checkId);
  for (let targetIndex = 0; targetIndex < desiredOrder.length; targetIndex += 1) {
    const targetId = desiredOrder[targetIndex];
    let currentIndex = current.indexOf(targetId);

    while (currentIndex > targetIndex) {
      await moveSelection(targetId, 'up');
      [current[currentIndex - 1], current[currentIndex]] = [
        current[currentIndex],
        current[currentIndex - 1],
      ];
      currentIndex -= 1;
    }
  }
}

// Reconcile OR groups after the check rows themselves are synced. The server
// assigns a fresh orGroupId per call, so the client `orGroupId` is only a
// grouping KEY, not the persisted id. Two passes make this order-independent:
//   1. clear every pre-existing group (via a surviving member — one call each);
//   2. set every desired group of ≥2 members.
// Must run AFTER upserts (rows must exist) and removals (dropped rows are gone,
// so we clear a group only through a member that still exists).
export async function reconcileOrGroups({
  initialSelections,
  nextSelections,
  setOrGroup,
}: {
  initialSelections: Array<{
    check: { id: string };
    orGroupId?: string | null;
  }>;
  nextSelections: Array<{ checkId: string; orGroupId?: string | null }>;
  setOrGroup: (checkIds: string[]) => Promise<void>;
}) {
  const survivingIds = new Set(nextSelections.map((s) => s.checkId));

  // Pass 1 — clear pre-existing groups. Setting a single surviving member
  // (length < 2) dissolves the whole group it currently belongs to.
  const initialGroups = new Map<string, string[]>();
  for (const sel of initialSelections) {
    if (!sel.orGroupId) continue;
    const members = initialGroups.get(sel.orGroupId) ?? [];
    members.push(sel.check.id);
    initialGroups.set(sel.orGroupId, members);
  }
  for (const members of initialGroups.values()) {
    const survivor = members.find((id) => survivingIds.has(id));
    if (survivor) await setOrGroup([survivor]);
  }

  // Pass 2 — form the desired groups fresh.
  const desiredGroups = new Map<string, string[]>();
  for (const sel of nextSelections) {
    if (!sel.orGroupId) continue;
    const members = desiredGroups.get(sel.orGroupId) ?? [];
    members.push(sel.checkId);
    desiredGroups.set(sel.orGroupId, members);
  }
  for (const members of desiredGroups.values()) {
    if (members.length >= 2) await setOrGroup(members);
  }
}
