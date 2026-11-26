'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { saveOutletAction } from '@/app/actions/outlet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError, Input } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { formatDate } from '@/lib/format';

type OutletRow = {
  id: string;
  code: string;
  name: string;
  address: string;
  timezone: string;
  active: boolean;
  createdAt: string;
};

export function OutletManager({ outlets }: { outlets: OutletRow[] }) {
  const router = useRouter();
  const [editor, setEditor] = useState<OutletRow | 'new' | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(outlet: OutletRow | 'new') {
    setEditor(outlet);
    setCode(outlet === 'new' ? '' : outlet.code);
    setName(outlet === 'new' ? '' : outlet.name);
    setAddress(outlet === 'new' ? '' : outlet.address);
    setTimezone(outlet === 'new' ? 'Asia/Jakarta' : outlet.timezone);
    setActive(outlet === 'new' ? true : outlet.active);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveOutletAction({
      id: editor === 'new' || editor === null ? undefined : editor.id,
      code,
      name,
      address: address || null,
      timezone,
      active,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(editor === 'new' ? 'Outlet dibuat' : 'Outlet diperbarui');
    setEditor(null);
    router.refresh();
  }

  return (
    <section className="panel flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-headline-md font-bold text-on-surface">Multi-outlet</h2>
          <p className="text-body-sm text-on-surface-variant">
            Setiap outlet punya meja, menu, stok, shift, dan laporan terpisah.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => open('new')}>
          <Icon name="add_business" className="text-[16px]" />
          Tambah outlet
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {outlets.map((outlet) => (
          <div
            key={outlet.id}
            className="rounded-lg border border-outline-variant/20 bg-surface-container p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="numeric text-body-sm font-bold text-primary">{outlet.code}</span>
                  <Badge tone={outlet.active ? 'primary' : 'neutral'} dot>
                    {outlet.active ? 'Active' : 'Off'}
                  </Badge>
                </div>
                <p className="text-body-sm font-semibold text-on-surface">{outlet.name}</p>
                <p className="text-[10px] text-on-surface-variant">
                  {outlet.address || 'Tanpa alamat'} · {outlet.timezone}
                </p>
                <p className="text-[9px] text-outline">Sejak {formatDate(outlet.createdAt)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => open(outlet)}
                aria-label={`Edit outlet ${outlet.name}`}
              >
                <Icon name="edit" className="text-[15px]" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor === 'new' ? 'Tambah outlet' : 'Edit outlet'}
        subtitle="Outlet baru otomatis mendapat pengaturan venue default."
        icon="store"
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditor(null)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" className="flex-[2]" onClick={save} loading={saving}>
              Simpan outlet
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Kode outlet"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="MAIN / CAB2"
            />
            <Input label="Nama outlet" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <Input label="Alamat" value={address} onChange={(event) => setAddress(event.target.value)} />
          <Input label="Timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          <Switch checked={active} onChange={setActive} label="Outlet aktif" />
          <FormError message={error} />
        </div>
      </Modal>
    </section>
  );
}
