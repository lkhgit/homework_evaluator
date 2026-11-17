import type { Metadata } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { DemoNotice } from "@/components/DemoControls";

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
  other: { "page-type": "software", "site-kind": "software" },
  title: "Homework evaluator | 과제 점검과 수행 안내",
  description: "교사는 과제 지침을 점검하고, 학생은 준비부터 제출까지 해야 할 일을 확인합니다.",
  openGraph: {
    title: "Homework evaluator | 과제 점검과 수행 안내",
    description: "과제 지침을 점검하고 학생이 해야 할 일을 정리합니다.",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Homework evaluator: 과제 지침을 점검하고 학생이 해야 할 일을 정리합니다." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Homework evaluator | 과제 점검과 수행 안내",
    description: "교사용 과제 점검과 학생용 수행 안내",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" data-type="software" className={`${geist.variable} ${instrumentSerif.variable}`}>
      <body><a className="skip-link" href="#main-content">본문으로 이동</a>{children}<DemoNotice /><footer className="site-footer"><p>입력 자료는 분석할 때 외부 AI 서비스로 전송됩니다.</p><nav aria-label="서비스 안내"><Link href="/guide">이용 방법과 자료 처리 안내</Link></nav></footer></body>
    </html>
  );
}
