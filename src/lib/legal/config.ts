// SIG-1057: shared settings for the legal pages (/privacidade, /termos).

/**
 * Review banner shown at the top of both legal pages. Set to `false` (or delete the constant and
 * its use in LegalDocument) once the texts have been through legal review.
 */
export const LEGAL_DRAFT_BANNER = true;
export const LEGAL_DRAFT_BANNER_TEXT = "Rascunho — sujeito a revisão jurídica";

/** Placeholders to be replaced by the real company data before publication. */
export const LEGAL_PLACEHOLDERS = {
  company: "[RAZÃO SOCIAL]",
  cnpj: "[CNPJ]",
  address: "[ENDEREÇO]",
  contact: "[E-MAIL DE CONTATO / ENCARREGADO (DPO)]",
  date: "[DATA]",
  forum: "[COMARCA]",
} as const;

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
  /** Paragraphs shown after the list. */
  after?: string[];
};

export type LegalText = {
  lang: "pt-BR" | "en";
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
};
