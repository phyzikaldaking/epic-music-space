import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata = {
    title: "Epic Music Space — Digital Music Licensing Platform",
    description: "License music. Earn revenue. Participate in the future of independent music distribution.",
    openGraph: {
        title: "Epic Music Space",
        description: "Digital Music Licensing + Revenue Participation Platform",
        type: "website",
    },
};
export default function RootLayout({ children, }) {
    return (<html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <main>{children}</main>
        <footer className="border-t border-white/10 py-8 text-center text-sm text-white/40">
          <p>
            © {new Date().getFullYear()} Epic Music Space, LLC. All rights
            reserved.
          </p>
          <div className="mt-2 flex justify-center gap-6">
            <a href="/legal/terms" className="hover:text-white/80">
              Terms of Service
            </a>
            <a href="/legal/privacy" className="hover:text-white/80">
              Privacy Policy
            </a>
            <a href="/legal/licensing" className="hover:text-white/80">
              Licensing Agreement
            </a>
          </div>
        </footer>
      </body>
    </html>);
}
