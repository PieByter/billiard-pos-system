import { cn } from '@/lib/format';

export const inputClass =
  'h-10 w-full rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-colors focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-50';

export const textareaClass =
  'w-full rounded-lg border border-outline-variant/55 bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface placeholder:text-outline/70 transition-colors focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-50';

export function Label({
  children,
  hint,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'flex items-center justify-between gap-2 text-label-badge font-bold uppercase tracking-[0.08em] text-on-surface-variant',
        className,
      )}
    >
      <span>{children}</span>
      {hint ? <span className="font-medium normal-case tracking-normal text-outline">{hint}</span> : null}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerClassName?: string;
};

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  className,
  containerClassName,
  id,
  ...props
}: InputProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label ? <Label htmlFor={id} hint={hint}>{label}</Label> : null}
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-on-surface-variant">
            {leading}
          </span>
        ) : null}
        <input
          id={id}
          className={cn(inputClass, Boolean(leading) && 'pl-9', Boolean(trailing) && 'pr-10', className)}
          {...props}
        />
        {trailing ? (
          <span className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-on-surface-variant">
            {trailing}
          </span>
        ) : null}
      </div>
      {error ? <span className="text-body-sm text-error">{error}</span> : null}
    </div>
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  containerClassName?: string;
};

export function Select({
  label,
  hint,
  error,
  className,
  containerClassName,
  children,
  id,
  ...props
}: SelectProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label ? <Label htmlFor={id} hint={hint}>{label}</Label> : null}
      <select id={id} className={cn(inputClass, 'appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      {error ? <span className="text-body-sm text-error">{error}</span> : null}
    </div>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  containerClassName?: string;
};

export function Textarea({
  label,
  hint,
  error,
  className,
  containerClassName,
  id,
  children,
  ...props
}: TextareaProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label ? <Label htmlFor={id} hint={hint}>{label}</Label> : null}
      <textarea id={id} className={cn(textareaClass, className)} {...props}>
        {children}
      </textarea>
      {error ? <span className="text-body-sm text-error">{error}</span> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-body-sm text-error">
      <span className="material-symbols-outlined mt-px text-[16px]">error</span>
      <span>{message}</span>
    </div>
  );
}
