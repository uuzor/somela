import React from "react";
import SideNav from "@/components/chat/SideNav";
import TopBar from "@/components/chat/TopBar";

export default function AppShell({ children, contentClassName = "" }) {
  return (
    <div className="h-screen flex bg-white overflow-hidden">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className={`flex-1 min-h-0 overflow-hidden ${contentClassName}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
