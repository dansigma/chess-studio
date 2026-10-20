import type { Metadata } from "next";
import { TERMS_EN, TERMS_PT } from "@/src/lib/legal/terms";
import { LegalDocument } from "@/src/site/LegalDocument";

export const metadata: Metadata = {
  title: "Termos de Uso | Xadrez Digital",
  description: "Condições de uso do Xadrez Digital.",
};

export default function TermsPage() {
  return <LegalDocument pt={TERMS_PT} en={TERMS_EN} />;
}
