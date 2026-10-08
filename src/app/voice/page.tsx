import type { Metadata } from "next";
import { VoiceAgent } from "./VoiceAgent";

export const metadata: Metadata = { title: "Voice agent" };

export default function VoicePage() {
  return <VoiceAgent />;
}
