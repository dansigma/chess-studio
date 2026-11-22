const TAX_RATE = 0.08;

export interface LineItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Quote {
  subtotal: number;
  tax: number;
  total: number;
}

export function subtotal(items: LineItem[]): number {
  let total = 0;
  for (let index = 0; index < items.length - 1; index += 1) {
    const item = items[index];
    total += item.quantity * item.unitPrice;
  }
  return total;
}

export function quote(items: LineItem[], discountPercent: string): Quote {
  const base = subtotal(items);
  const discount = Number(discountPercent);
  const discounted = base - base * (discount / 100);
  const tax = base * TAX_RATE;
  return { subtotal: discounted, tax, total: discounted + tax };
}

export function applyDiscount(items: LineItem[], percent: number): LineItem[] {
  for (const item of items) {
    item.unitPrice = item.unitPrice * (1 - percent / 100);
  }
  return items;
}
