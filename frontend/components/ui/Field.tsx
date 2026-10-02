import type { ReactNode } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const field =
  "w-full min-w-0 max-w-full rounded-2xl border border-line bg-white px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-accent sm:text-sm";

export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}{required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</span>
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
