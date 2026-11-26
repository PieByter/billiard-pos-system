export type EscPosDocument = {
  title: string;
  subtitle?: string;
  lines: string[];
  footer?: string;
  width?: number;
  cut?: boolean;
};

const ESC = 0x1b;
const GS = 0x1d;

function ascii(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00b7/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/[^\x0a\x20-\x7e]/g, '');
}

function wrap(text: string, width: number): string[] {
  const result: string[] = [];
  for (const rawLine of ascii(text).split('\n')) {
    if (rawLine.length <= width) {
      result.push(rawLine);
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > width) {
      result.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    if (remaining) result.push(remaining);
  }
  return result;
}

/**
 * Dokumen ESC/POS sederhana untuk printer thermal 58/80mm.
 * Agent lokal bisa memakai bytes ini langsung ke /dev/usb/lp0, RAW spooler,
 * atau WebUSB. Tidak ada dependency native di server.
 */
export function buildEscPosDocument(document: EscPosDocument): Uint8Array {
  const width = document.width ?? 42;
  const chunks: number[] = [];
  const push = (...values: number[]) => chunks.push(...values);
  const text = (value: string) => {
    for (const char of ascii(value)) push(char.charCodeAt(0));
  };

  push(ESC, 0x40); // init
  push(ESC, 0x61, 0x01); // center
  push(ESC, 0x21, 0x08); // bold
  text(document.title);
  push(0x0a, ESC, 0x21, 0x00); // bold off
  if (document.subtitle) {
    text(document.subtitle);
    push(0x0a);
  }
  push(ESC, 0x61, 0x00); // left
  for (const line of document.lines.flatMap((entry) => wrap(entry, width))) {
    text(line);
    push(0x0a);
  }
  if (document.footer) {
    push(ESC, 0x61, 0x01);
    for (const line of wrap(document.footer, width)) {
      text(line);
      push(0x0a);
    }
  }
  push(0x0a, 0x0a, 0x0a);
  if (document.cut !== false) {
    push(GS, 0x56, 0x42, 0x00); // feed + cut
  }
  return new Uint8Array(chunks);
}

export function escPosToText(document: EscPosDocument): string {
  const width = document.width ?? 42;
  const lines = [
    document.title,
    document.subtitle ?? '',
    ...document.lines.flatMap((entry) => wrap(entry, width)),
    document.footer ?? '',
  ];
  return lines.filter((line, index, list) => line !== '' || list[index - 1] !== '').join('\n');
}
