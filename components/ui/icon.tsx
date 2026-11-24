import { cn } from '@/lib/format';

type IconProps = React.HTMLAttributes<HTMLSpanElement> & {
  name: string;
  filled?: boolean;
};

export function Icon({ name, filled = false, className, ...props }: IconProps) {
  return (
    <span
      aria-hidden
      className={cn('material-symbols-outlined select-none', filled && 'icon-fill', className)}
      {...props}
    >
      {name}
    </span>
  );
}
