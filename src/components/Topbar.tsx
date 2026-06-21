"use client";

import { Bell, HelpCircle, Search } from "lucide-react";
import { UserButton } from "@clerk/nextjs";

export default function Topbar() {
  return (
    <header className="h-20 bg-white border-b border-zinc-200 flex items-center justify-between px-10">
      <div className="relative w-96">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-zinc-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2.5 border-none rounded-full bg-[#f3f4f6] text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          placeholder="Search workflows..."
        />
      </div>

      <div className="flex items-center gap-6">
        <button className="text-zinc-600 hover:text-zinc-900 transition-colors">
          <Bell size={20} />
        </button>
        <button className="text-zinc-600 hover:text-zinc-900 transition-colors">
          <HelpCircle size={20} />
        </button>
        
        <div className="h-8 w-px bg-zinc-200 mx-2"></div>
        
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-zinc-900">Alex Rivera</p>
            <p className="text-xs text-zinc-500 font-medium">Pro Plan</p>
          </div>
          <UserButton />
        </div>
      </div>
    </header>
  );
}
