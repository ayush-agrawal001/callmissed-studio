import type { Metadata } from "next";
import { ChatApp } from "./ChatApp";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return <ChatApp />;
}
