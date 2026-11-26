'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setActiveOutletAction } from '@/app/actions/outlet';
import { Icon } from '@/components/ui/icon';
import { Select } from '@/components/ui/form';

export function OutletSwitcher({
  outlets,
  activeOutletId,
}: {
  outlets: Array<{ id: string; code: string; name: string }>;
  activeOutletId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(activeOutletId);
  const [switching, setSwitching] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSwitching(true);
    const result = await setActiveOutletAction(next);
    setSwitching(false);
    if (!result.ok) {
      setValue(previous);
      toast.error(result.error);
      return;
    }
    const outlet = outlets.find((item) => item.id === next);
    toast.success(`Outlet aktif: ${outlet?.name ?? 'Outlet'}`);
    router.refresh();
  }

  if (outlets.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface-container px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
        <Icon name="store" className="text-[15px] text-primary" />
        {outlets[0]?.name ?? 'Cue & Tap'}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-outline">
        <Icon name="store" className="text-[15px] text-primary" />
        Outlet
      </span>
      <Select
        value={value}
        onChange={(event) => void change(event.target.value)}
        disabled={switching}
        containerClassName="w-[220px]"
        className="h-9 text-body-sm"
      >
        {outlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.code} · {outlet.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
