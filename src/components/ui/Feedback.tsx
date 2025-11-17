import clsx from "clsx";

export const Placeholder = ({ text, large = false }: { text: string; large?: boolean }) => (
  <div
    className={clsx(
      "rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-slate-300",
      large && "text-base"
    )}
  >
    {text}
  </div>
);

export const ErrorBanner = ({ message }: { message: string }) => (
  <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
    {message}
  </div>
);
