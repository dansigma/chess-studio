// SIG-1057: shared settings for the legal pages (/privacidade, /termos).

/**
 * Review banner shown at the top of both legal pages. Set to `false` (or delete the constant and
 * its use in LegalDocument) once the texts have been through legal review.
 */
export const LEGAL_DRAFT_BANNER = false;
export const LEGAL_DRAFT_BANNER_TEXT = "Rascunho — sujeito a revisão jurídica";

/** Company data shown on both legal pages (controller of the personal data). */
export const LEGAL_COMPANY = {
  company: "Sigma Labs Tecnologia da Informação LTDA",
  /** Trade name (nome fantasia); the legal name and CNPJ above stay the registered ones. */
  tradeName: "Xadrez Digital",
  cnpj: "62.281.698/0001-18",
  address: "Rua Pais Leme, 215, conj. 1713, Pinheiros, São Paulo/SP, CEP 05424-150",
  contact: "contato@xadrez.digital",
  date: "21 de outubro de 2026",
  dateEn: "October 21, 2026",
  forum: "São Paulo/SP",
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
