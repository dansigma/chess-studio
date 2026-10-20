import type { Metadata } from "next";
import { PRIVACY_EN, PRIVACY_PT } from "@/src/lib/legal/privacy";
import { LegalDocument } from "@/src/site/LegalDocument";

export const metadata: Metadata = {
  title: "Política de Privacidade | Xadrez Digital",
  description: "Como o Xadrez Digital trata dados pessoais, conforme a LGPD.",
};

export default function PrivacyPage() {
  return <LegalDocument pt={PRIVACY_PT} en={PRIVACY_EN} />;
}
