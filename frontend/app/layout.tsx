import type { Metadata } from "next";
import { Orbitron, Roboto } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

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
  description: "Transkriber og renskriv lydfiler med norsk tale i synthwave-stil",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="no">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${orbitron.variable} ${roboto.variable} ${roadRage.variable} antialiased bg-black text-white`}
      >
        {children}
      </body>
    </html>
  );
}
