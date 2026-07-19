import { ContentArticle } from "@/components/public/content-article";
import { privacyPage } from "@/content/legal";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

export const metadata = contentPageMetadata(privacyPage);

export default function PrivacyPage() {
  return <ContentArticle page={privacyPage} />;
}
