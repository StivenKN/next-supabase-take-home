"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/coffee-health/i18n";
import { cn } from "@/lib/utils";

export function LocaleSwitch({
  current,
  label,
}: {
  current: Locale;
  label: string;
}) {
  // URLSearchParams escapes the commas that every other link keeps readable.
  const query = useSearchParams().toString().replaceAll("%2C", ",");
  return <LocaleLinks current={current} label={label} query={query} />;
}

/** Also the fallback while the query string is not known yet. */
export function LocaleLinks({
  current,
  label,
  query = "",
}: {
  current: Locale;
  label: string;
  query?: string;
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-1 text-[13px]">
      {(Object.keys(LOCALES) as Locale[]).map((locale) => (
        <Link
          key={locale}
          href={LOCALES[locale].path + (query ? `?${query}` : "")}
          lang={locale}
          hrefLang={locale}
          aria-current={locale === current ? "true" : undefined}
          className={cn(
            "rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            locale === current
              ? "bg-accent font-semibold text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LOCALES[locale].name}
        </Link>
      ))}
    </nav>
  );
}
