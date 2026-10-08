import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

// Shared field styling so inputs, selects and textareas read as one family.
export const FIELD =
  "rounded-xl border border-border-strong bg-surface px-4 text-[15px] text-text outline-none transition placeholder:text-muted focus:border-text";

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="label">{eyebrow}</p>
      <h1 className="text-4xl leading-[1.05] font-medium tracking-[-0.04em] sm:text-5xl">{title}</h1>
      {children && <p className="max-w-[540px] text-[17px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-text text-bg hover:opacity-85",
  secondary: "border border-border-strong bg-surface text-text hover:border-text",
  ghost: "text-muted hover:text-text",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function IconButton({
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-text disabled:opacity-40 ${className}`}
    />
  );
}

export function Select({ label, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className={`flex flex-col gap-2.5 text-sm font-medium ${className}`}>
      {label}
      <select {...props} className={`${FIELD} h-12 px-3 font-normal`} />
    </label>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 px-4 py-3 text-sm text-danger">
      <span className="flex-1 leading-relaxed">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="font-mono text-xs underline underline-offset-2">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 animate-spin rounded-full border-[1.5px] border-current border-r-transparent ${className}`}
    />
  );
}

// Read a JSON error body from one of our API routes.
export async function apiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
  } catch {}
  return `Request failed (${res.status})`;
}
