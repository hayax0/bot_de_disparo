import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "Disparador de Mensagens — Prospecção Automática no WhatsApp",
  description:
    "Plataforma de automação e prospecção ativa via WhatsApp com controle de cadência humana, execução 100% em nuvem e histórico permanente por workspace.",
  keywords: [
    "prospecção whatsapp",
    "disparador de mensagens",
    "automação whatsapp",
    "vendas b2b",
    "cadência de disparo",
    "envio em massa seguro",
  ],
  openGraph: {
    title: "Disparador de Mensagens — Prospecção Automática no WhatsApp",
    description:
      "Automatize sua prospecção ativa no WhatsApp com cadência humana, delays inteligentes e execução 24/7 na nuvem.",
    locale: "pt_BR",
    type: "website",
  },
  icons: {
    icon: [
      { url: '/icon.png', href: '/icon.png' },
      { url: '/logo.png', href: '/logo.png' }
    ],
    apple: '/icon.png',
    shortcut: '/icon.png'
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable} antialiased`}>
      <head>
        <link rel="icon" href="/icon.png?v=2" type="image/png" />
        <link rel="shortcut icon" href="/icon.png?v=2" />
        <link rel="apple-touch-icon" href="/icon.png?v=2" />
      </head>
      <body className="bg-[#08090D] text-slate-100 font-sans selection:bg-purple-500/30 selection:text-purple-200 min-h-screen">
        {children}
      </body>
    </html>
  );
}
