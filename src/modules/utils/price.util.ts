import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from 'generated/prisma/client';

// Matches the DECIMAL(10, 2) price columns: up to 8 integer digits and 2 fractional digits.
const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

const PRICE_MESSAGE =
  'يجب أن يكون السعر رقمًا غير سالب بحد أقصى منزلتين عشريتين ولا يتجاوز 99999999.99';

export const priceField = z
  .union([z.number(), z.string()])
  .transform((val) => String(val).trim())
  .refine((val) => PRICE_PATTERN.test(val), { message: PRICE_MESSAGE })
  .transform((val) => new Prisma.Decimal(val));

// Multipart forms send '' for an absent optional amount; it means "no price" (null), never 0.
export const nullablePriceField = z.union([
  z.literal('').transform(() => null),
  z.null(),
  priceField,
]);

type Price = Prisma.Decimal | null | undefined;

export type DiscountPrices = {
  is_discounted?: boolean | null;
  initial_price?: Price;
  original_price?: Price;
  initial_price_egp?: Price;
  original_price_egp?: Price;
};

export type PriceIssue = { field: string; message: string };

export function getDiscountPriceIssues(prices: DiscountPrices): PriceIssue[] {
  if (!prices.is_discounted) return [];

  const pairs = [
    ['initial_price', 'original_price', 'USD'],
    ['initial_price_egp', 'original_price_egp', 'EGP'],
  ] as const;

  const issues: PriceIssue[] = [];
  for (const [currentKey, originalKey, currency] of pairs) {
    const current = prices[currentKey];
    const original = prices[originalKey];
    // Zod still runs object refinements after a field fails; that field already has its own issue.
    if (
      (current != null && !Prisma.Decimal.isDecimal(current)) ||
      (original != null && !Prisma.Decimal.isDecimal(original))
    ) {
      continue;
    }
    if (current == null) {
      issues.push({
        field: currentKey,
        message: `السعر الحالي بعملة ${currency} مطلوب عند تفعيل الخصم`,
      });
    } else if (original == null) {
      issues.push({
        field: originalKey,
        message: `السعر الأصلي بعملة ${currency} مطلوب عند تفعيل الخصم`,
      });
    } else if (!original.gt(current)) {
      issues.push({
        field: originalKey,
        message: `السعر الأصلي بعملة ${currency} يجب أن يكون أكبر من السعر الحالي`,
      });
    }
  }
  return issues;
}

export function throwPriceIssues(issues: PriceIssue[]) {
  if (issues.length) {
    throw new BadRequestException({
      message: 'بيانات الطلب غير صالحة',
      errors: issues,
    });
  }
}
