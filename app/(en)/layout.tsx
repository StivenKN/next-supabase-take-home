import type { Metadata } from "next";
import { RootDocument } from "../root-document";
import { getDictionary } from "@/lib/coffee-health/i18n";

const dictionary = getDictionary("en");

export const metadata: Metadata = {
  title: dictionary.title,
  description: dictionary.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument locale="en">{children}</RootDocument>;
}
