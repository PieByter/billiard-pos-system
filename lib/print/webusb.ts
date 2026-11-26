type UsbEndpoint = {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
};

type UsbAlternate = {
  endpoints: UsbEndpoint[];
};

type UsbInterface = {
  interfaceNumber: number;
  alternates: UsbAlternate[];
};

type UsbConfiguration = {
  interfaces: UsbInterface[];
};

type UsbDevice = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (value: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: Uint8Array) => Promise<unknown>;
  configuration: UsbConfiguration | null;
};

type UsbApi = {
  requestDevice: (options: { filters: Array<Record<string, number>> }) => Promise<UsbDevice>;
};

function usbApi(): UsbApi {
  const usb = (navigator as Navigator & { usb?: UsbApi }).usb;
  if (!usb) {
    throw new Error('WebUSB tidak tersedia. Gunakan Chrome/Edge atau print agent lokal.');
  }
  return usb;
}

/**
 * Cetak langsung ke printer thermal USB dari browser.
 * Beberapa printer membutuhkan driver/vendor filter; jika device tidak muncul,
 * gunakan print agent lokal (RAW spooler/network 9100) sebagai fallback.
 */
export async function printViaWebUsb(bytes: Uint8Array): Promise<void> {
  const device = await usbApi().requestDevice({ filters: [] });
  await device.open();
  try {
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }
    const interfaces = device.configuration?.interfaces ?? [];
    let claimedInterface: number | null = null;
    let target: { interfaceNumber: number; endpointNumber: number } | null = null;
    for (const usbInterface of interfaces) {
      for (const alternate of usbInterface.alternates) {
        const endpoint = alternate.endpoints.find(
          (entry) => entry.direction === 'out' && entry.type === 'bulk',
        );
        if (endpoint) {
          target = {
            interfaceNumber: usbInterface.interfaceNumber,
            endpointNumber: endpoint.endpointNumber,
          };
          break;
        }
      }
      if (target) break;
    }
    if (!target) throw new Error('Endpoint bulk OUT tidak ditemukan pada printer.');
    await device.claimInterface(target.interfaceNumber);
    claimedInterface = target.interfaceNumber;
    await device.transferOut(target.endpointNumber, bytes);
    if (claimedInterface !== null) {
      await device.releaseInterface(claimedInterface).catch(() => undefined);
    }
  } finally {
    await device.close().catch(() => undefined);
  }
}
