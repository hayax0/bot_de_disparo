import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "Disparador de Mensagens",
  description: "Plataforma de Prospecção Automática via WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable} antialiased`}>
      <body className="bg-[#08090D] text-slate-100 font-sans selection:bg-purple-500/30 selection:text-purple-200 min-h-screen">
        {children}
      </body>
    </html>
  );
}
