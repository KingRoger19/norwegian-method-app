"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
        <path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm5-2.25A2.25 2.25 0 019.25 5.5h1.5A2.25 2.25 0 0113 7.75v4.5A2.25 2.25 0 0110.75 14.5h-1.5A2.25 2.25 0 017 12.25v-4.5z" />
      </svg>
    ),
  },
  {
    href: "/advanced-metrics",
    label: "Advanced Metrics",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
        <path
          fillRule="evenodd"
          d="M.99 5.24A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5l-.01-.01zm8.26 9.5v-.006H3.75v.006h5.5zm1.5 0h5.5v-.006h-5.5v.006zm5.5-4.494v-.006h-5.5v.006h5.5zm-7 0v-.006H3.75v.006h5.5zm7-4.5v-.006h-5.5v.006h5.5zm-7 0v-.006H3.75v.006h5.5z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    href: "/athlete-settings",
    label: "Athlete Profile",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
        <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
      </svg>
    ),
  },
];

export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Hamburger trigger */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        aria-label="Open navigation"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path
            fillRule="evenodd"
            d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5A.75.75 0 012.75 14h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 14.75z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed left-0 top-0 bottom-0 w-60 bg-zinc-900 border-r border-zinc-800 z-50 flex flex-col transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🏔</span>
            <span className="font-semibold text-sm text-zinc-100">Norwegian Method</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 transition-colors"
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
