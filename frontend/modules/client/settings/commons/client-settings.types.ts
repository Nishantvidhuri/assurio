export interface BrandLogoTransformParams {
  crop: { x: number; y: number; width: number; height: number } | null;
  cropPercentages?: { x: number; y: number; width: number; height: number } | null;
  rotation: number;
  sourceWidth: number | null;
  sourceHeight: number | null;
  identity?: boolean;
}

export interface BrandLogoState {
  status: 'PROCESSING' | 'READY' | 'NONE';
  version: number;
  transformParams: BrandLogoTransformParams | null;
  displayUrl: string | null;
  originalEditUrl: string | null;
}

export interface OrgProfile {
  legalName: string;
  brandName: string | null;
  brandLogo: BrandLogoState;
  websiteUrl: string | null;
  hrms: string | null;
  ats: string | null;
}

export interface EmailTemplateSettings {
  showCompanyLogo: boolean;
  showBrandName: boolean;
  hrNoteEnabled: boolean;
  useCustomHrNote: boolean;
  defaultHrNote: string;
  customHrNote: string | null;
  overdueNoteEnabled: boolean;
  useCustomOverdueNote: boolean;
  defaultOverdueNote: string;
  customOverdueNote: string | null;
}

export interface OrgSettingsResponse {
  profile: OrgProfile;
  emailTemplate: EmailTemplateSettings;
}

export interface UpdateOrgProfilePayload {
  brandName?: string;
  websiteUrl?: string;
  hrms?: string;
  ats?: string;
}

export interface UpdateEmailTemplatePayload {
  showCompanyLogo?: boolean;
  showBrandName?: boolean;
  hrNoteEnabled?: boolean;
  useCustomHrNote?: boolean;
  customHrNote?: string;
  overdueNoteEnabled?: boolean;
  useCustomOverdueNote?: boolean;
  customOverdueNote?: string;
}

export interface SaveEmailTemplatePayload {
  profile: UpdateOrgProfilePayload;
  emailTemplate: UpdateEmailTemplatePayload;
}
