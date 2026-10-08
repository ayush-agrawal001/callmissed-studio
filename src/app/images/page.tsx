import type { Metadata } from "next";
import { ImageStudio } from "./ImageStudio";

export const metadata: Metadata = { title: "Images" };

export default function ImagesPage() {
  return <ImageStudio />;
}
