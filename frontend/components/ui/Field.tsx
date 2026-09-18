import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const field =
  "w-full min-w-0 max-w-full rounded-2xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${field} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${field} min-h-[96px] resize-y ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${field} ${props.className ?? ""}`} />;
}
