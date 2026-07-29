import type { VerificationFormConfig } from '@/modules/verification-checks/commons/verification-form.types';

export type BasePackageSlot = 'SLOT_1' | 'SLOT_2' | 'SLOT_3';
export type CheckSubitemSelectionType = 'CHECKBOX' | 'RADIO';
export type MoveDirection = 'up' | 'down';

export interface BaseCheckSubitem {
  id: string;
  definitionKey: string;
  name: string;
  price: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BaseCheckFormPreviewVariant {
  variantKey: string;
  label: string;
  selectedSubitemDefinitionKeys: string[];
  formComponentKey: string;
  formVersion: string;
  formConfig: VerificationFormConfig;
}

export interface BaseCheckFormPreview {
  formComponentKey: string;
  formVersion: string;
  variants: BaseCheckFormPreviewVariant[];
}

export interface BaseCheck {
  id: string;
  definitionKey: string;
  icon: string;
  name: string;
  enableMultiple: boolean;
  allowAdditionalCharges: boolean;
  price: string | null;
  subitemSelectionType: CheckSubitemSelectionType | null;
  // Reference: each option carries its own multiplier (capped at maxTotal).
  perSubitemQuantity?: boolean;
  subitemQuantityMaxTotal?: number | null;
  sortOrder: number;
  formPreview: BaseCheckFormPreview;
  metadata: {
    supportsAdditionalCharges: boolean;
    formComponentKey: string;
    formVersion: string;
  };
  subitems: BaseCheckSubitem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BasePackageCheckSelection {
  id: string;
  sortOrder: number;
  quantity: number | null;
  check: BaseCheck;
  selectedSubitemIds: string[];
  // subitemId → saved multiplier (per-subitem-quantity checks like reference).
  subitemQuantities?: Record<string, number>;
  selectedSubitems: BaseCheckSubitem[];
  // OR grouping key — rows sharing it are mutually-exclusive alternatives.
  orGroupId?: string | null;
}

export interface BasePackageSummary {
  id: string;
  slot: BasePackageSlot;
  name: string;
  price: string;
  currencyCode: 'INR' | 'USD' | 'EUR' | 'JPY' | 'GBP';
  description: string;
  checks: unknown[];
  selectedChecksCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BasePackageDetail extends BasePackageSummary {
  selectedChecks: BasePackageCheckSelection[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BaseCheckListResponse {
  data: BaseCheck[];
  meta: PaginationMeta;
}

export interface UpdateBasePackagePayload {
  name?: string;
  price?: number;
  description?: string;
}

export interface BasePackageSelectionDraft {
  checkId: string;
  quantity?: number | null;
  selectedSubitemIds?: string[];
  subitemQuantities?: Record<string, number>;
  orGroupId?: string | null;
}

export interface SaveBasePackageDraft {
  slot: BasePackageSlot;
  initialPackage: BasePackageDetail;
  name: string;
  price: number;
  description: string;
  selectedChecks: BasePackageSelectionDraft[];
}

export interface BaseCheckSubitemDraft {
  id: string;
  definitionKey: string;
  name: string;
  price: string;
  sortOrder: number;
}

export interface SaveBaseCheckDraft {
  initialCheck: BaseCheck;
  price: string;
  allowAdditionalCharges: boolean;
  subitems: BaseCheckSubitemDraft[];
}

export interface QueryState {
  page: number;
  pageSize: number;
  search: string;
}
