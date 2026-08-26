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
  {
    href: "/wiki",
    label: "Metrics Wiki",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
        <path d="M10.75 16.82A7.462 7.462 0 0115 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0018 15.06v-11a.75.75 0 00-.546-.721A9.006 9.006 0 0015 3a8.963 8.963 0 00-4.25 1.065V16.82zM9.25 4.065A8.963 8.963 0 005 3c-.85 0-1.673.118-2.454.339A.75.75 0 002 4.06v11a.75.75 0 00.954.721A7.506 7.506 0 015 15.5c1.579 0 3.042.487 4.25 1.32V4.065z" />
      </svg>
    ),
  },
  {
    href: "/training-plan",
    label: "Training Plan",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
        <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.75a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1v-.01zm0 5.25a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1V10zm0 5.25a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1v-.01z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/nutrition",
    label: "Nutrition",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
        <path d="M3 3.75A.75.75 0 013.75 3h.5a.75.75 0 01.75.75v.25H6a.75.75 0 010 1.5H5v7.25A2.25 2.25 0 007.25 15h5.5A2.25 2.25 0 0015 12.75V5.5h-1a.75.75 0 010-1.5h1.25V3.75A.75.75 0 0116 3h.25a.75.75 0 010 1.5H16v8.25A3.75 3.75 0 0112.25 16.5h-5.5A3.75 3.75 0 013 12.75V4.5h-.25a.75.75 0 010-1.5H3v-.75z" />
        <path d="M9.25 8.75a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5zm3 0a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" />
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
        className="p-2 rounded-lg text-zinc-200 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
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
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        className={`fixed left-0 top-0 bottom-0 w-full sm:w-60 bg-zinc-900 border-r border-zinc-800 z-50 flex flex-col transition-transform duration-200 ease-out shadow-2xl ${
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
            className="p-1.5 rounded text-zinc-300 hover:text-zinc-200 transition-colors"
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
                  : "text-zinc-200 hover:text-zinc-100 hover:bg-zinc-800/50"
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
