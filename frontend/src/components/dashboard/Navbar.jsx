import React from "react";
import { Search, ShoppingBag, Heart } from "lucide-react";

export default function Navbar() {
  return (
    <header className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-black rounded-sm flex items-center justify-center">
            <span className="text-white text-[11px] font-extrabold">N</span>
          </div>
          <span className="font-extrabold text-lg tracking-tight text-black">NÉVRA</span>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-[13px] font-semibold text-gray-600">
          <span className="cursor-pointer hover:text-black transition">New Arrival</span>
          <span className="cursor-pointer hover:text-black transition">Top Products</span>
          <span className="cursor-pointer hover:text-black transition">Collection</span>
          <span className="cursor-pointer hover:text-black transition">Our Store</span>
        </nav>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1 text-[13px] font-semibold text-gray-700 border border-gray-200 rounded-full px-3 py-1.5">
          <span className="text-xs">$</span>
          <span>USD</span>
        </div>
        <Search className="w-5 h-5 text-gray-700 cursor-pointer" strokeWidth={2} />
        <Heart className="w-5 h-5 text-gray-700 cursor-pointer" strokeWidth={2} />
        <ShoppingBag className="w-5 h-5 text-gray-700 cursor-pointer" strokeWidth={2} />
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
          A
        </div>
      </div>
    </header>
  );
}