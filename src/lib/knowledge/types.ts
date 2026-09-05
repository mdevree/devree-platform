export const SOURCE_TYPES = [
  "NORM",
  "NWWI_INSTRUCTION",
  "NWWI_UPDATE",
  "INTERNAL_GUIDE",
  "LITERATURE",
  "VALIDATED_REPORT",
  "DRAFT_REPORT",
] as const;

export type KnowledgeSourceType = (typeof SOURCE_TYPES)[number];

export type KnowledgeField = {
  key: string;
  label: string;
  content: string;
};

export type KnowledgeImport = {
  slug: string;
  title: string;
  sourceType: KnowledgeSourceType;
  authorityRank?: number;
  publisher?: string | null;
  sourceUrl?: string | null;
  notionPageId?: string | null;
  reportTaxateur?: string | null;
  reportAddress?: string | null;
  reportPostcode?: string | null;
  reportCity?: string | null;
  reportPropertyType?: string | null;
  reportBuildYear?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  validationStatus?: string | null;
  validatedAt?: string | null;
  realworksTaxcode?: string | null;
  realworksDossierNumber?: string | null;
  projectId?: string | null;
  status?: string;
  fields: KnowledgeField[];
  metadata?: Record<string, unknown>;
};

export type KnowledgeSearchOptions = {
  query: string;
  limit?: number;
  sourceTypes?: string[];
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  buildYear?: number;
};
