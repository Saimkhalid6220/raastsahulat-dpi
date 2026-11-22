export function Spinner() {
  return <span className="loading-spinner" aria-hidden="true" />;
}

export function LoadingIndicator({ label }: { label: string }) {
  return <p className="loading-indicator" role="status"><Spinner />{label}</p>;
}

export function LoadingSkeleton({ label }: { label: string }) {
  return <div className="stack">
    <LoadingIndicator label={label} />
    <div className="loading-skeleton" aria-hidden="true"><span /><span /><span /></div>
  </div>;
}

export function ResourceLoading({ resource, label, refreshLabel = "Updating…" }: {
  resource: { loading: boolean; data: unknown };
  label: string;
  refreshLabel?: string;
}) {
  if (!resource.loading) return null;
  return resource.data === null
    ? <LoadingSkeleton label={label} />
    : <LoadingIndicator label={refreshLabel} />;
}
