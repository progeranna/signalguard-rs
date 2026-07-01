type ErrorPanelProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function ErrorPanel({
  title = "Unable to load data",
  message,
  onRetry,
}: ErrorPanelProps) {
  return (
    <div className="sg-panel border-orange-400/30 bg-orange-950/20 px-5 py-5">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-orange-200/80">
          Error
        </p>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm leading-6 text-slate-300">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-full border border-orange-300/30 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition hover:bg-orange-400/20"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
