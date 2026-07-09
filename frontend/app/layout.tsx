import type { Metadata } from "next";
import { Orbitron, Roboto } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Navbar from "./components/Navbar";
import PwaRegistrar from "./components/PwaRegistrar";

const orbitron = Orbitron({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-orbitron",
});

const roboto = Roboto({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-roboto",
});

const roadRage = localFont({
  src: "../public/fonts/Roadrage-owgBd.otf", // sti relativ til denne fila
  variable: "--font-road-rage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NB-transcribe",
  description: "Transkriber lydfiler med norsk tale i synthwave-stil",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="no">
      <head>
        <meta name="theme-color" content="#050816" />
        <link rel="icon" type="image/png" sizes="64x64" href="/icons/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      </head>
      <body
        className={`${orbitron.variable} ${roboto.variable} ${roadRage.variable} app-shell-background antialiased text-white`}
      >
        <Navbar />
        <PwaRegistrar />
        <div>{children}</div>
      </body>
    </html>
  );
}
