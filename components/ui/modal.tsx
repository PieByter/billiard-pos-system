'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/format';
import { Icon } from './icon';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const sizes: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-6xl',
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
  sheetOnMobile?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  bodyClassName,
  sheetOnMobile = true,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[80] flex justify-center bg-background/80 backdrop-blur-md animate-fade',
        sheetOnMobile ? 'items-end sm:items-center' : 'items-center',
        'p-0 sm:p-5',
      )}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[92dvh] w-full flex-col overflow-hidden border border-outline-variant/50 bg-surface-container-low shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]',
          sizes[size],
          sheetOnMobile
            ? 'rounded-t-2xl sm:rounded-2xl animate-sheet'
            : 'rounded-2xl animate-rise',
        )}
      >
        {title ? (
          <header className="flex items-start justify-between gap-4 border-b border-outline-variant/30 bg-surface-container/60 px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name={icon} className="text-[20px]" />
                </span>
              ) : null}
              <div className="min-w-0">
                <h2 className="text-headline-md font-bold tracking-tight text-on-surface">
                  {title}
                </h2>
                {subtitle ? (
                  <div className="mt-0.5 text-body-sm text-on-surface-variant">{subtitle}</div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant transition-colors hover:bg-surface-bright hover:text-on-surface"
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </header>
        ) : null}

        <div className={cn('min-h-0 flex-1 overflow-y-auto p-5', bodyClassName)}>{children}</div>

        {footer ? (
          <footer className="border-t border-outline-variant/30 bg-surface-container/70 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
