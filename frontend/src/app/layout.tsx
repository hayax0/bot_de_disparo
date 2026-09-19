import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-KREW1ZNY8S";

export const metadata: Metadata = {
  metadataBase: new URL("https://botdisparo.cmpx.tec.br"),
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
    "whatsapp marketing",
    "geração de leads whatsapp",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Disparador de Mensagens — Prospecção Automática no WhatsApp",
    description:
      "Automatize sua prospecção ativa no WhatsApp com cadência humana, delays inteligentes e execução 24/7 na nuvem.",
    url: "https://botdisparo.cmpx.tec.br",
    siteName: "Disparador de Mensagens",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Disparador de Mensagens Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Disparador de Mensagens — Prospecção Automática no WhatsApp",
    description:
      "Automatize sua prospecção ativa no WhatsApp com cadência humana, delays inteligentes e execução 24/7 na nuvem.",
    images: ["/logo.png"],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  icons: {
    icon: [
      { url: "/icon.png", href: "/icon.png" },
      { url: "/logo.png", href: "/logo.png" },
    ],
    apple: "/icon.png",
    shortcut: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Disparador de Mensagens",
    operatingSystem: "Web",
    applicationCategory: "BusinessApplication",
    url: "https://botdisparo.cmpx.tec.br",
    description:
      "Plataforma SaaS de prospecção e disparo de mensagens humanizado via WhatsApp com controle de cadência e motor de execução na nuvem.",
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: "97.00",
    },
  };

  return (
    <html lang="pt-BR" className={`dark ${inter.variable} antialiased`}>
      <head>
        <link rel="icon" href="/icon.png?v=2" type="image/png" />
        <link rel="shortcut icon" href="/icon.png?v=2" />
        <link rel="apple-touch-icon" href="/icon.png?v=2" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-[#08090D] text-slate-100 font-sans selection:bg-purple-500/30 selection:text-purple-200 min-h-screen">
        {/* Google Analytics GA4 */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
        {children}
      </body>
    </html>
  );
}
