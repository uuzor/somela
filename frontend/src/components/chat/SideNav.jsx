import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, MessageSquare, ShoppingBag, Wand2, User } from "lucide-react";

export default function SideNav() {
  const location = useLocation();

  const navItems = [
    { icon: MessageSquare, label: "Chat", path: "/" },
    { icon: ShoppingBag, label: "Shop", path: "/marketplace" },
    { icon: Home, label: "Dashboard", path: "/dashboard" },
    { icon: Wand2, label: "Try On", path: "/tryon" },
  ];

  const isActive = (path) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  return (
    <nav className="w-20 shrink-0 bg-white border-r border-gray-100 flex flex-col items-center justify-between py-5">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-black to-fuchsia-500 flex items-center justify-center mb-4 shadow-sm">
          <span className="text-white text-sm font-extrabold">S</span>
        </div>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            title={item.label}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
              isActive(item.path)
                ? "bg-black-100 text-black-700"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            <item.icon className="w-5 h-5" strokeWidth={1.8} />
          </Link>
        ))}
      </div>
      <div className="w-9 h-9 rounded-full bg-black-100 flex items-center justify-center text-black-600">
        <User className="w-4 h-4" />
      </div>
    </nav>
  );
}

