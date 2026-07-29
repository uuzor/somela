import React from "react";
import TopBar from "@/components/chat/TopBar";
import ChatInterface from "@/components/chat/ChatInterface";
import SideNav from "@/components/chat/SideNav";

export default function Chat() {
  return (
    <div className="h-screen flex bg-white overflow-hidden">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ChatInterface />
      </div>
    </div>
  );
}