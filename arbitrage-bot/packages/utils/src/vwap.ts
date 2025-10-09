import { Decimal, PrecisionConfig } from './decimal';

export interface DepthLevel {
  px: Decimal;
  qty: Decimal;
}

export interface VwapResult {
  filledQty: Decimal;
  avgPrice: Decimal;
  worstPrice: Decimal;
  levelsUsed: number;
  notional: Decimal;
}

/**
 * Calculate VWAP (Volume Weighted Average Price) by walking the order book
 */
export function calculateVwap(
  levels: DepthLevel[],
  qtyWanted: Decimal,
  side: 'BUY' | 'SELL'
): VwapResult {
  if (levels.length === 0 || qtyWanted.lte(0)) {
    return {
      filledQty: new Decimal(0),
      avgPrice: new Decimal(0),
      worstPrice: new Decimal(0),
      levelsUsed: 0,
      notional: new Decimal(0)
    };
  }

  // Sort levels based on side
  const sortedLevels = [...levels];
  if (side === 'BUY') {
    // For BUY, use asks (ascending price order)
    sortedLevels.sort((a, b) => a.px.comparedTo(b.px));
  } else {
    // For SELL, use bids (descending price order)
    sortedLevels.sort((a, b) => b.px.comparedTo(a.px));
  }

  let remaining = qtyWanted;
  let totalNotional = new Decimal(0);
  let totalQty = new Decimal(0);
  let worstPrice = new Decimal(0);
  let levelsUsed = 0;

  for (const level of sortedLevels) {
    if (remaining.lte(0)) break;

    const take = Decimal.min(level.qty, remaining);
    const notional = take.mul(level.px);

    totalNotional = totalNotional.add(notional);
    totalQty = totalQty.add(take);
    remaining = remaining.sub(take);
    worstPrice = level.px;
    levelsUsed++;

    if (remaining.lte(0)) break;
  }

  const avgPrice = totalQty.gt(0) ? totalNotional.div(totalQty) : new Decimal(0);

  return {
    filledQty: totalQty,
    avgPrice,
    worstPrice,
    levelsUsed,
    notional: totalNotional
  };
}

/**
 * Check if we can fill the desired quantity within slippage limits
 */
export function canFill(
  levels: DepthLevel[],
  qtyWanted: Decimal,
  side: 'BUY' | 'SELL',
  bestPrice: Decimal,
  maxSlippageBps: number
): { canFill: boolean; result: VwapResult; slippageBps: Decimal } {
  const result = calculateVwap(levels, qtyWanted, side);
  
  if (result.filledQty.lt(qtyWanted)) {
    return {
      canFill: false,
      result,
      slippageBps: new Decimal(0)
    };
  }

  const slippageBps = calculateSlippageBps(bestPrice, result.worstPrice, side);
  const canFill = slippageBps.lte(maxSlippageBps);

  return { canFill, result, slippageBps };
}

/**
 * Calculate slippage in basis points
 */
export function calculateSlippageBps(bestPrice: Decimal, worstPrice: Decimal, side: 'BUY' | 'SELL'): Decimal {
  if (side === 'BUY') {
    return worstPrice.div(bestPrice).sub(1).mul(10000);
  } else {
    return bestPrice.div(worstPrice).sub(1).mul(10000);
  }
}

/**
 * Estimate quantity needed for a target notional amount
 * Uses binary search to find the right quantity
 */
export function estimateQuantityForNotional(
  levels: DepthLevel[],
  targetNotional: Decimal,
  side: 'BUY' | 'SELL',
  precision: number,
  maxIterations: number = 10
): Decimal {
  if (levels.length === 0) return new Decimal(0);

  // Get best price for initial estimate
  const sortedLevels = [...levels];
  if (side === 'BUY') {
    sortedLevels.sort((a, b) => a.px.comparedTo(b.px));
  } else {
    sortedLevels.sort((a, b) => b.px.comparedTo(a.px));
  }

  const bestPrice = sortedLevels[0].px;
  let qty = targetNotional.div(bestPrice);

  // Binary search to find the right quantity
  let low = new Decimal(0);
  let high = qty.mul(2); // Start with a reasonable upper bound
  let iteration = 0;

  while (iteration < maxIterations) {
    const mid = low.add(high).div(2);
    const result = calculateVwap(levels, mid, side);

    const diff = result.notional.sub(targetNotional).abs();
    
    // If we're close enough, return
    if (diff.lt(targetNotional.mul(0.001))) { // 0.1% tolerance
      return roundToPrecision(mid, precision);
    }

    if (result.notional.lt(targetNotional)) {
      low = mid;
    } else {
      high = mid;
    }

    iteration++;
  }

  // Return the best estimate we found
  return roundToPrecision(qty, precision);
}

/**
 * Round to specified precision
 */
function roundToPrecision(value: Decimal, precision: number): Decimal {
  const multiplier = new Decimal(10).pow(precision);
  return value.mul(multiplier).round().div(multiplier);
}

/**
 * Calculate total available liquidity up to K levels
 */
export function calculateTotalLiquidity(levels: DepthLevel[], maxLevels: number): Decimal {
  return levels
    .slice(0, maxLevels)
    .reduce((sum, level) => sum.add(level.qty), new Decimal(0));
}

/**
 * Check if there's sufficient liquidity for the desired quantity
 */
export function hasSufficientLiquidity(
  levels: DepthLevel[],
  qtyWanted: Decimal,
  maxLevels: number,
  bufferBps: number = 0
): boolean {
  const totalLiquidity = calculateTotalLiquidity(levels, maxLevels);
  const requiredLiquidity = qtyWanted.mul(1 + bufferBps / 10000);
  return totalLiquidity.gte(requiredLiquidity);
}

