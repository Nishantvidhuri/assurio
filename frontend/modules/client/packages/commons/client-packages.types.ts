import type { CSSProperties, ReactNode } from 'react';
import type {
  PackageCardIncludedItem,
  PackageCardProps as SharedPackageCardProps,
} from '@/shared/components/ui';
import type {
  PackageCheckLike,
  PackageCheckSubitemLike,
} from '@/shared/lib/package-checks';

export type PackageCardProps = SharedPackageCardProps;

export type ClientPackageType = 'BASE' | 'CUSTOM';
export type ClientPackageStatus = 'DRAFT' | 'PUBLISHED';

export type ClientPackageSubitem = PackageCheckSubitemLike;

export interface ClientPackageCheck extends PackageCheckLike {
  subitems: ClientPackageSubitem[];
}

export interface ClientPackageSelection {
  id: string;
  sortOrder: number;
  quantity: number | null;
  selectedSubitemIds: string[];
  // subitemId → saved multiplier (per-subitem-quantity checks like reference).
  subitemQuantities?: Record<string, number>;
  selectedSubitems: ClientPackageSubitem[];
  check: ClientPackageCheck;
  // OR grouping — selections sharing a non-null orGroupId are mutually-exclusive
  // alternatives the candidate resolves by picking one.
  orGroupId?: string | null;
}

export interface ClientPortalPackage {
  id: string;
  type: ClientPackageType;
  slot: string | null;
  name: string;
  description: string;
  price: string;
  status: ClientPackageStatus;
  selectable: boolean;
  sortOrder: number;
  isDefault: boolean;
  availableUnits: number;
  selectedChecks: ClientPackageSelection[];
}

export type ClientPortalAddOnCheck = ClientPackageCheck;

export interface ClientPackagesPageData {
  settings: {
    currencyCode: string;
    showAddOns: boolean;
  };
  defaultPackageId: string | null;
  basePackages: ClientPortalPackage[];
  customPackages: ClientPortalPackage[];
  addOns: ClientPortalAddOnCheck[];
}

export interface ClientPackageSelectionContextResponse {
  currencyCode: string;
  showAddOns: boolean;
  defaultPackageId: string | null;
  basePackages: ClientPortalPackage[];
  customPackages: ClientPortalPackage[];
  addOns: ClientPortalAddOnCheck[];
}

export interface PackageItem extends PackageCardProps {
  id: string;
}

export interface PackageProps {
  items: PackageItem[];
  className?: string;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface CustomPackageDialogProps {
  open: boolean;
  packageName: string;
  includedItems: string[];
  onClose: () => void;
}

export interface CustomPackageCardProps {
  id: string;
  packageName: string;
  description: string;
  price: number | string;
  currency?: string;
  priceSuffix?: string;
  /** Available-units badge. Omitted for postpaid clients (nothing pre-bought). */
  unitsLabel?: string;
  // Same item shape as the shared PackageCard: a plain string, or a row that
  // can carry rich label markup + a per-row action (used by OR slots).
  includedItems: Array<string | PackageCardIncludedItem>;
  selected?: boolean;
  isDefault?: boolean;
  defaultTagLabel?: string;
  previewChecksCount?: number;
  className?: string;
  style?: CSSProperties;
  priceActionSlot?: ReactNode;
  rightSlot?: ReactNode;
  onSelect?: (id: string) => void;
  onMarkAsDefault?: (id: string) => void;
}

export interface CustomPackageProps {
  items: CustomPackageCardProps[];
  className?: string;
  columnGap?: number;
  rowGap?: number;
}
