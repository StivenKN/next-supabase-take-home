import { ThemeProvider } from "next-themes";
import { archivo } from "./fonts";
import type { Locale } from "@/lib/coffee-health/i18n";
import "./globals.css";

/**
 * The <html> shell both languages share. English lives at "/" and Spanish at
 * "/es", each under its own root layout, so <html lang> is correct in the
 * static HTML without reading a cookie or header on every request.
 */
export function RootDocument({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${archivo.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
