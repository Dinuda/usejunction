import { LegalDocument } from "@/components/public/legal-document";
import { privacyPage } from "@/content/legal";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

export const metadata = contentPageMetadata(privacyPage);

export default function PrivacyPage() {
  return <LegalDocument page={privacyPage} />;
}
