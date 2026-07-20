import { LegalDocument } from "@/components/public/legal-document";
import { termsPage } from "@/content/legal";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

export const metadata = contentPageMetadata(termsPage);

export default function TermsPage() {
  return <LegalDocument page={termsPage} />;
}
