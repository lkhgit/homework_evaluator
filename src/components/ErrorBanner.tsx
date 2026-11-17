import Link from "next/link";

export default function ErrorBanner({ message }: { message: string }) {
  return <div role="alert" className="error-banner"><p>{message}</p><Link href="/">처음으로</Link></div>;
}
