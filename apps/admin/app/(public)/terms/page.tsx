import { ContentArticle } from "@/components/public/content-article";
import { termsPage } from "@/content/legal";
import { contentPageMetadata } from "@/lib/public/seo-metadata";

export const metadata = contentPageMetadata(termsPage);

export default function TermsPage() {
  return <ContentArticle page={termsPage} />;
}
