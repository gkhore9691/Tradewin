import Decimal from 'decimal.js';

// Configure Decimal.js for high precision financial calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_DOWN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
  maxE: 9e15,
  minE: -9e15,
  modulo: Decimal.ROUND_FLOOR,
  crypto: false
});

export { Decimal };

export interface PrecisionConfig {
  pricePrecision: number;
  quantityPrecision: number;
  minQty: Decimal;
  minNotional: Decimal;
  maxQty?: Decimal;
}

/**
 * Round quantity down to specified precision
 */
export function roundQuantityDown(qty: Decimal, precision: number): Decimal {
  const multiplier = new Decimal(10).pow(precision);
  return qty.mul(multiplier).floor().div(multiplier);
}

/**
 * Round quantity up to specified precision
 */
export function roundQuantityUp(qty: Decimal, precision: number): Decimal {
  const multiplier = new Decimal(10).pow(precision);
  return qty.mul(multiplier).ceil().div(multiplier);
}

/**
 * Round price to specified precision
 */
export function roundPrice(price: Decimal, precision: number): Decimal {
  const multiplier = new Decimal(10).pow(precision);
  return price.mul(multiplier).round().div(multiplier);
}

/**
 * Check if quantity meets minimum requirements
 */
export function validateQuantity(qty: Decimal, config: PrecisionConfig): {
  valid: boolean;
  adjustedQty?: Decimal;
  error?: string;
} {
  // Round down to precision
  const roundedQty = roundQuantityDown(qty, config.quantityPrecision);
  
  // Check minimum quantity
  if (roundedQty.lt(config.minQty)) {
    return {
      valid: false,
      error: `Quantity ${roundedQty.toString()} below minimum ${config.minQty.toString()}`
    };
  }
  
  // Check maximum quantity if specified
  if (config.maxQty && roundedQty.gt(config.maxQty)) {
    return {
      valid: false,
      error: `Quantity ${roundedQty.toString()} exceeds maximum ${config.maxQty.toString()}`
    };
  }
  
  return { valid: true, adjustedQty: roundedQty };
}

/**
 * Check if notional value meets minimum requirements
 */
export function validateNotional(qty: Decimal, price: Decimal, minNotional: Decimal): {
  valid: boolean;
  notional: Decimal;
  error?: string;
} {
  const notional = qty.mul(price);
  
  if (notional.lt(minNotional)) {
    return {
      valid: false,
      notional,
      error: `Notional ${notional.toString()} below minimum ${minNotional.toString()}`
    };
  }
  
  return { valid: true, notional };
}

/**
 * Calculate fee in basis points
 */
export function calculateFee(notional: Decimal, feeBps: number): Decimal {
  return notional.mul(feeBps).div(10000);
}

/**
 * Apply fee to notional (reduce by fee amount)
 */
export function applyFee(notional: Decimal, feeBps: number): Decimal {
  const fee = calculateFee(notional, feeBps);
  return notional.sub(fee);
}

/**
 * Calculate price impact in basis points
 */
export function calculatePriceImpactBps(bestPrice: Decimal, worstPrice: Decimal, side: 'BUY' | 'SELL'): Decimal {
  if (side === 'BUY') {
    return worstPrice.div(bestPrice).sub(1).mul(10000);
  } else {
    return bestPrice.div(worstPrice).sub(1).mul(10000);
  }
}

/**
 * Calculate edge (profit/loss) in basis points
 */
export function calculateEdgeBps(initialAmount: Decimal, finalAmount: Decimal): Decimal {
  return finalAmount.div(initialAmount).sub(1).mul(10000);
}

/**
 * Convert basis points to decimal
 */
export function bpsToDecimal(bps: number): Decimal {
  return new Decimal(bps).div(10000);
}

/**
 * Convert decimal to basis points
 */
export function decimalToBps(decimal: Decimal): number {
  return decimal.mul(10000).toNumber();
}

/**
 * Generate quantum sizes for sizing ladder
 */
export function generateQuantumSizes(
  baseAmount: Decimal,
  maxAmount: Decimal,
  minQuantum: Decimal,
  multiplier: number = 2
): Decimal[] {
  const sizes: Decimal[] = [];
  let current = baseAmount;
  
  while (current.lte(maxAmount)) {
    sizes.push(current);
    current = current.mul(multiplier);
  }
  
  // Add the final size if it doesn't exceed max
  if (current.gte(maxAmount) && !sizes.includes(maxAmount)) {
    sizes.push(maxAmount);
  }
  
  return sizes;
}

/**
 * Check if timestamp is stale
 */
export function isTimestampStale(timestampNs: number, maxAgeMs: number): boolean {
  const now = Date.now() * 1000000; // Convert to nanoseconds
  const maxAgeNs = maxAgeMs * 1000000;
  return (now - timestampNs) > maxAgeNs;
}

/**
 * Format number to fixed precision string
 */
export function toFixedPrecision(value: Decimal, precision: number): string {
  return value.toFixed(precision, Decimal.ROUND_DOWN);
}

