import type { BadgeTone } from '@/components/ui/badge';
import type { OrderStatus } from '@/lib/types';

export function orderStatusTone(status: OrderStatus): BadgeTone {
  switch (status) {
    case 'pending':
      return 'error';
    case 'accepted':
      return 'cyan';
    case 'preparing':
      return 'paused';
    case 'ready':
      return 'primary';
    case 'served':
      return 'neutral';
    case 'cancelled':
      return 'error';
    default:
      return 'neutral';
  }
}

export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  pending: 'Pending',
  accepted: 'Baru',
  preparing: 'Dimasak',
  ready: 'Siap',
  served: 'Served',
  cancelled: 'Batal',
};

export const ORDER_SOURCE_LABEL = {
  customer_qr: 'QR Self-order',
  cashier: 'Kasir',
} as const;
