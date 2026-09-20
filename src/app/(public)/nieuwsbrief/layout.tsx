import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Nieuwsbrief inschrijving | De Vree Makelaardij',
  robots: { index: false, follow: false },
};
export default function NewsletterPublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
