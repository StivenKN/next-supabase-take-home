import {
  ExplorerPage,
  type RawSearchParams,
} from "@/components/explorer/explorer-page";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  return <ExplorerPage locale="en" searchParams={searchParams} />;
}
