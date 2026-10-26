import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "AccessLens — 과제 자체를 검사합니다",
  description: "디지털 학습 과제를 위한 접근성 사전 점검 도구.",
  openGraph: {
    title: "AccessLens — 과제 자체를 검사합니다",
    description: "페이지만 검사하지 않습니다. 과제 자체를 검사합니다.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "AccessLens — 페이지만 검사하지 않습니다. 과제 자체를 검사합니다." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessLens — 과제 자체를 검사합니다",
    description: "디지털 학습을 위한 접근성 사전 점검",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geist.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
