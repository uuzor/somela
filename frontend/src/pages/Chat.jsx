import React from "react";
import AppShell from "@/components/layout/AppShell";
import ChatInterface from "@/components/chat/ChatInterface";

export default function Chat() {
  return (
    <AppShell>
      <ChatInterface />
    </AppShell>
  );
}