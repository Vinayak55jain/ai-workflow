"use client";

import Link from "next/link";
import { LayoutDashboard, Network, Library, Settings, Plus, Boxes } from "lucide-react";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Workflows", href: "/workflows", icon: Network },
    { name: "Templates", href: "/templates", icon: Boxes },
    { name: "Library", href: "/library", icon: Library },
  ];

  return (
    <aside className="w-64 bg-[#f8f9fc] border-r border-zinc-200 h-screen flex flex-col p-6 font-sans">
      <div className="flex items-center gap-3 mb-10">
        <div className="bg-blue-600 p-2 rounded-lg text-white">
          <Network size={24} />
        </div>
        <div>
          <h1 className="font-bold text-xl text-blue-900 leading-tight">Magica</h1>
          <p className="text-xs text-zinc-500 font-medium tracking-wide">AI Orchestrator</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <item.icon size={18} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          <Settings size={18} />
          Settings
        </Link>
        <form action={async () => {
          const { createWorkflow } = await import("@/actions/workflow");
          await createWorkflow("Untitled Workflow");
        }}>
          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white flex items-center justify-center gap-2 py-3 rounded-xl font-semibold shadow-md transition-all active:scale-95"
          >
            <Plus size={18} />
            New Workflow
          </button>
        </form>
      </div>
    </aside>
  );
}
