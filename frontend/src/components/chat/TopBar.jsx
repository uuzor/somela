import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, ShoppingBag, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function TopBar() {
  const location = useLocation();
  const { session } = useAuth();

  const navItems = [
    { label: "Chat", path: "/" },
    { label: "Shop", path: "/marketplace", icon: ShoppingBag },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Try On", path: "/tryon" },
  ];

  const isActive = (path) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-5">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-black flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <span className="block text-[15px] font-extrabold text-black tracking-tight">OpenCommerceLens</span>
            <span className="block text-[10px] font-semibold text-gray-400 uppercase tracking-[0.2em]">
              Shopping Agent
            </span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1.5">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition inline-flex items-center gap-1.5 ${
                isActive(item.path)
                  ? "bg-gray-100 text-black"
                  : "text-gray-500 hover:text-black hover:bg-gray-50"
              }`}
            >
              {item.icon ? <item.icon className="w-4 h-4" /> : null}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-[12px] text-gray-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {session?.isGuest ? "Guest session" : "Signed in"}
        </div>
        <div className="w-8 h-8 rounded-full bg-black-100 flex items-center justify-center">
          <User className="w-4 h-4 text-black-600" />
        </div>
      </div>
    </header>
  );
}

