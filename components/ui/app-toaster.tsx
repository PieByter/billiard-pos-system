'use client';

import { Toaster } from 'sonner';

export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="top-center"
      closeButton
      richColors={false}
      gap={8}
      toastOptions={{
        style: {
          background: '#171f33',
          border: '1px solid rgba(60, 74, 66, 0.55)',
          color: '#dae2fd',
          borderRadius: '12px',
          fontFamily: 'var(--font-sans)',
          boxShadow: '0 24px 60px -20px rgba(0,0,0,0.8)',
        },
        classNames: {
          actionButton: '!bg-primary !text-[#003824]',
          closeButton: '!bg-[#222a3d] !text-[#bbcabf] !border-[#2d3449]',
        },
      }}
    />
  );
}
