// Shared catalog of the CallMissed models this app exposes. Imported by both
// the API routes (for validation) and the UI (for pickers), so the two can
// never drift apart. Credit costs come from docs.callmissed.com (1 credit = ₹1).

export type ChatModel = {
  id: string;
  label: string;
  blurb: string;
  // Whether the model honours reasoning_effort: "none" (thinking off).
  canDisableThinking: boolean;
};

export const CHAT_MODELS: ChatModel[] = [
  { id: "gemma-4-31b", label: "Gemma 4 31B", blurb: "Fastest replies", canDisableThinking: true },
  { id: "kimi-k2.6", label: "Kimi K2.6", blurb: "Strong all-rounder", canDisableThinking: true },
  { id: "glm-4.7-flash", label: "GLM 4.7 Flash", blurb: "Quick and light", canDisableThinking: true },
  { id: "sarvam-105b", label: "Sarvam 105B", blurb: "Best for Indian languages", canDisableThinking: true },
  { id: "gpt-oss-120b", label: "GPT-OSS 120B", blurb: "Open-weight reasoning", canDisableThinking: false },
];
export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;

export type ImageModel = { id: string; label: string; credits: number; speed: string; maxSide: number };

export const IMAGE_MODELS: ImageModel[] = [
  { id: "sdxl-lightning", label: "SDXL Lightning", credits: 4, speed: "Fast", maxSide: 2048 },
  { id: "dreamshaper-8-lcm", label: "DreamShaper 8", credits: 4, speed: "Fast · stylised", maxSide: 2048 },
  { id: "lucid-origin", label: "Lucid Origin", credits: 8, speed: "Cinematic", maxSide: 2048 },
  { id: "phoenix-1.0", label: "Phoenix 1.0", credits: 10, speed: "Photoreal", maxSide: 2048 },
  { id: "flux-2-klein-9b", label: "FLUX.2 Klein", credits: 10, speed: "High fidelity", maxSide: 2048 },
];
export const DEFAULT_IMAGE_MODEL = "flux-2-klein-9b";

export const IMAGE_SIZES = ["1024x1024", "768x768", "1024x1536", "1536x1024"] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

// Voice agent stack. The two TTS engines have disjoint voice sets.
export type TtsModel = "sonic-3.6" | "bulbul:v3";

export const VOICES: Record<TtsModel, { id: string; label: string; note?: string }[]> = {
  "sonic-3.6": [
    { id: "skylar", label: "Skylar", note: "Warm, female" },
    { id: "daniel", label: "Daniel", note: "Calm, male" },
    { id: "katie", label: "Katie", note: "Bright, female" },
    { id: "ronald", label: "Ronald", note: "Deep, male" },
    { id: "riya", label: "Riya", note: "Hindi / Hinglish, female" },
    { id: "kabir", label: "Kabir", note: "Hindi / Hinglish, male" },
  ],
  "bulbul:v3": [
    { id: "shubh", label: "Shubh", note: "Male" },
    { id: "priya", label: "Priya", note: "Female" },
    { id: "kavya", label: "Kavya", note: "Female" },
    { id: "aditya", label: "Aditya", note: "Male" },
    { id: "ritu", label: "Ritu", note: "Female" },
    { id: "rahul", label: "Rahul", note: "Male" },
  ],
};

export const VOICE_LANGUAGES = [
  { id: "en-IN", label: "English (India)" },
  { id: "hi-IN", label: "Hindi" },
  { id: "ta-IN", label: "Tamil" },
  { id: "te-IN", label: "Telugu" },
  { id: "mr-IN", label: "Marathi" },
  { id: "bn-IN", label: "Bengali" },
  { id: "kn-IN", label: "Kannada" },
] as const;

export const VOICE_LLMS = [
  { id: "gemma-4-31b", label: "Gemma 4 31B", note: "Lowest latency" },
  { id: "sarvam-105b", label: "Sarvam 105B", note: "Indic-first" },
] as const;

export type VoicePersona = {
  id: string;
  name: string;
  role: string;
  tagline: string;
  prompt: string;
  greeting: string;
};

export const VOICE_PERSONAS: VoicePersona[] = [
  {
    id: "assistant",
    name: "Aria",
    role: "General assistant",
    tagline: "Short spoken answers to anything.",
    prompt:
      "You are Aria, a friendly and concise voice assistant. Your replies are spoken aloud, so keep them to one to three short sentences, avoid lists and markdown, and ask a clarifying question when the request is ambiguous.",
    greeting: "Hi, I'm Aria. What can I help you with today?",
  },
  {
    id: "receptionist",
    name: "Dosa Junction",
    role: "Restaurant host",
    tagline: "Takes table bookings for a South Indian restaurant.",
    prompt:
      "You are the host at Dosa Junction, a South Indian restaurant in Bengaluru open 8am to 11pm. You take table reservations: collect the guest's name, party size, date and time, then read the booking back to confirm. Popular dishes are masala dosa, rava idli and filter coffee. Keep every reply short and natural for a phone call. If asked something you do not know, say you will check with the manager.",
    greeting: "Namaste, thanks for calling Dosa Junction! Would you like to book a table?",
  },
  {
    id: "interviewer",
    name: "Coach",
    role: "Mock interviewer",
    tagline: "Practise a behavioural interview out loud.",
    prompt:
      "You are a supportive interview coach running a mock behavioural interview for a software engineering internship. Ask one question at a time, listen to the answer, give one sentence of specific feedback using the STAR method, then ask the next question. Keep each turn under four sentences.",
    greeting: "Hello! Ready to practise? Let's start: tell me about a project you're proud of.",
  },
  {
    id: "hinglish",
    name: "Dost",
    role: "Hinglish buddy",
    tagline: "Casual chat that mixes Hindi and English.",
    prompt:
      "You are Dost, a cheerful friend who chats in natural Hinglish, mixing Hindi and English the way young people in India speak. Keep replies short, warm and conversational. Never use markdown or emoji.",
    greeting: "Arre hello! Kaise ho? Batao, aaj kya chal raha hai?",
  },
];

// Hard ceiling on a single voice call; keeps one call from draining budget.
export const MAX_VOICE_SECONDS = 300;
