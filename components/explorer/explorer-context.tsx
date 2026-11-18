"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useOptimistic,
  useRef,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { Dictionary, Locale } from "@/lib/coffee-health/i18n";
import type { ExplorerState } from "@/lib/coffee-health/schema";
import { hrefForState } from "@/lib/coffee-health/search-params";

type ExplorerContextValue = {
  locale: Locale;
  t: Dictionary;
  pathname: string;
  /**
   * The view the user asked for. It runs ahead of the server while a request
   * is in flight, so a ticked checkbox stays ticked before the rows arrive.
   */
  state: ExplorerState;
  /**
   * The view the rows on screen belong to. Numbers that came from the server,
   * such as the match count, are described with this one.
   */
  renderedState: ExplorerState;
  isPending: boolean;
  /**
   * Moves to another view by changing the URL. `replace` swaps the current
   * history entry instead of adding one. Typing in a range uses it so the
   * back button does not step through every keystroke.
   */
  navigate: (next: ExplorerState, options?: { replace?: boolean }) => void;
  /** The element that scrolls the table. navigate() returns it to the top. */
  scroller: React.RefObject<HTMLDivElement | null>;
};

const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function ExplorerProvider({
  locale,
  dictionary,
  pathname,
  state,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  pathname: string;
  state: ExplorerState;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticState, setOptimisticState] = useOptimistic(state);
  const scroller = useRef<HTMLDivElement>(null);

  const navigate = useCallback<ExplorerContextValue["navigate"]>(
    (next, options) => {
      const href = hrefForState(pathname, next);
      scroller.current?.scrollTo({ top: 0 });
      startTransition(() => {
        setOptimisticState(next);
        if (options?.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [pathname, router, setOptimisticState],
  );

  const value = useMemo(
    () => ({
      locale,
      t: dictionary,
      pathname,
      state: optimisticState,
      renderedState: state,
      isPending,
      navigate,
      scroller,
    }),
    [locale, dictionary, pathname, optimisticState, state, isPending, navigate],
  );

  return <ExplorerContext value={value}>{children}</ExplorerContext>;
}

export function useExplorer(): ExplorerContextValue {
  const value = use(ExplorerContext);
  if (!value) throw new Error("useExplorer needs an ExplorerProvider above it");
  return value;
}
