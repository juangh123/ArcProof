import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ArcProof | Verified supplier quote processing on Arc",
    template: "%s | ArcProof",
  },
  description:
    "Turn supplier quotations into structured line items with verified USDC settlement on Arc.",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ArcProof",
    title: "ArcProof | Verified supplier quote processing on Arc",
    description:
      "Turn supplier quotations into structured line items with verified USDC settlement on Arc.",
    images: [
      {
        url: "/arcproof-proof.png",
        alt: "ArcProof public payment receipt",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ArcProof | Verified supplier quote processing on Arc",
    description:
      "Turn supplier quotations into structured line items with verified USDC settlement on Arc.",
    images: ["/arcproof-proof.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
