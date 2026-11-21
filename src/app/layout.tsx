import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RaastSahulat", template: "%s | RaastSahulat" },
  description: "A synthetic relief and scam protection prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <body>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="prototype-banner" role="note"><strong>Prototype</strong><span>Unofficial demo · Use synthetic data and documents only.</span></div>
      {children}
    </body>
  </html>;
}
