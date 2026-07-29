import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, MessageSquare, ShoppingBag, Wand2, User } from "lucide-react";

export default function SideNav() {
  const location = useLocation();

  const navItems = [
    { icon: Home, label: "Home", path: "/dashboard" },
    { icon: MessageSquare, label: "Chat", path: "/" },
    { icon: ShoppingBag, label: "Shop", path: "/dashboard" },
    { icon: Wand2, label: "Try On", path: "/tryon" },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="w-16 shrink-0 bg-white border-r border-gray-100 flex flex-col items-center justify-between py-5">
      <div className="flex flex-col items-center gap-1">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
          <span className="text-white text-sm font-extrabold">S</span>
        </div>
        {navItems.map((item, i) => (
          <Link
            key={i}
            to={item.path}
            title={item.label}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition ${
              isActive(item.path) 
                ? "bg-purple-100 text-purple-600" 
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
          >
            <item.icon className="w-5 h-5" strokeWidth={1.8} />
          </Link>
        ))}
      </div>
      <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
        <User className="w-4 h-4" />
      </div>
    </nav>
  );
}