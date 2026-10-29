import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import { APP_DISPLAY_NAME } from "@/lib/constant";
import { PROD_CSP } from "@/lib/csp";
export const metadata: Metadata = {
  title: APP_DISPLAY_NAME,
  icons: { icon: "./icons/ryxnontop.svg", apple: "./icons/ryxnontop.png" },
  description: "A local desktop workspace for Listen, Ask, and Notes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === "production" && (
          <meta httpEquiv="Content-Security-Policy" content={PROD_CSP} />
        )}
        <meta name="referrer" content="no-referrer" />
      </head>
      <body>{children}</body>
    </html>
  );
}
