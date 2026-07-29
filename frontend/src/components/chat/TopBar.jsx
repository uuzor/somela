import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, ShoppingBag, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function TopBar() {
  const location = useLocation();
  const { session } = useAuth();

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-5">
      <div className="flex items-center gap-2.5">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-[16px] font-extrabold text-black tracking-tight">Somela</span>
        </Link>
      </div>
      
      <div className="flex items-center gap-6">
        <nav className="flex items-center gap-1">
          <Link 
            to="/" 
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${
              location.pathname === "/" 
                ? "bg-gray-100 text-black" 
                : "text-gray-500 hover:text-black hover:bg-gray-50"
            }`}
          >
            Chat
          </Link>
          <Link 
            to="/dashboard" 
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${
              location.pathname === "/dashboard" 
                ? "bg-gray-100 text-black" 
                : "text-gray-500 hover:text-black hover:bg-gray-50"
            }`}
          >
            <ShoppingBag className="w-4 h-4 inline mr-1" />
            Shop
          </Link>
          <Link 
            to="/tryon" 
            className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition ${
              location.pathname === "/tryon" 
                ? "bg-gray-100 text-black" 
                : "text-gray-500 hover:text-black hover:bg-gray-50"
            }`}
          >
            Try On
          </Link>
        </nav>
        
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500">
            {session?.isGuest ? "Guest" : "Signed in"}
          </span>
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
            <User className="w-4 h-4 text-purple-600" />
          </div>
        </div>
      </div>
    </header>
  );
}