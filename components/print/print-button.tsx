'use client';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

export function PrintButton({ label = 'Print 80mm' }: { label?: string }) {
  return (
    <div className="no-print flex items-center gap-2">
      <Button variant="secondary" size="md" onClick={() => window.close()}>
        <Icon name="close" className="text-[18px]" />
        Tutup
      </Button>
      <Button variant="primary" size="md" onClick={() => window.print()}>
        <Icon name="print" className="text-[18px]" />
        {label}
      </Button>
    </div>
  );
}
