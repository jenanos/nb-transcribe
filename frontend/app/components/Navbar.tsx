"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import Image from "next/image";

const links = [
  { href: "/", label: "Transkribering", icon: "graphic_eq" },
  { href: "/transcriptions", label: "Transkripsjoner", icon: "article" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 bg-black/70 backdrop-blur-md border-b border-white/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center space-x-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-md shadow-[0_0_10px_#00e5ff]">
            <Image src="/icons/icon-192.png" alt="NB-transcribe ikon" fill className="object-cover" />
          </div>
          <div>
            <p className="font-orbitron text-lg">NB-transcribe</p>
          </div>
        </Link>

        <button
          className="md:hidden rounded-md border border-white/10 bg-white/5 p-2 hover:bg-white/10"
          aria-label="Toggle navigation"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="material-icons text-2xl">{open ? "close" : "menu"}</span>
        </button>

        <nav className="hidden items-center space-x-4 md:flex">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center space-x-2 rounded-md px-3 py-2 text-sm transition ${active
                  ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/40"
                  : "text-gray-200 hover:text-white hover:bg-white/5"
                  }`}
              >
                <span className="material-icons text-lg">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div >

      {open && (
        <div className="md:hidden border-t border-white/10 bg-black/80 backdrop-blur-sm">
          <nav className="flex flex-col px-4 py-2 space-y-1">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-2 rounded-md px-3 py-2 text-sm transition ${active
                    ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/40"
                    : "text-gray-200 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <span className="material-icons text-lg">{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )
      }
    </header >
  );
}
