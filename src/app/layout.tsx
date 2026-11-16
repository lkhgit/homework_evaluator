import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Korean textbook body face; self-hosted (SIL OFL 1.1, see fonts/Pretendard-LICENSE.txt).
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "AccessLens — 과제 자체를 검사합니다",
  description: "디지털 과제의 접근성을 배포 전에 점검하는 도구입니다.",
  openGraph: {
    title: "AccessLens — 과제 자체를 검사합니다",
    description: "페이지만 검사하지 않습니다. 과제 자체를 검사합니다.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "AccessLens — 페이지만 검사하지 않습니다. 과제 자체를 검사합니다." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AccessLens — 과제 자체를 검사합니다",
    description: "디지털 과제 접근성 사전 점검",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>{children}</body>
    </html>
  );
}
