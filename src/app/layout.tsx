import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "StudyHub · Dein Studium im Blick",
  description: "Lokales persönliches Uni-Dashboard",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
