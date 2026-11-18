export function StatusPanel({
  title,
  body,
  command,
  children,
}: {
  title: string;
  body: string;
  command?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-card p-6">
      <div className="max-w-md space-y-3">
        <h2 className="type-wide text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        {command && (
          <pre className="overflow-x-auto rounded-md border bg-background px-3 py-2 text-[13px]">
            <code>{command}</code>
          </pre>
        )}
        {children}
      </div>
    </div>
  );
}
