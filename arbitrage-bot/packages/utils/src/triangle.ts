import { Decimal, PrecisionConfig, calculateFee, applyFee, calculateEdgeBps } from './decimal';
import { DepthLevel, calculateVwap, canFill, estimateQuantityForNotional } from './vwap';

export type Route = 'STRAIGHT' | 'REVERSE';

export interface Triangle {
  id: string;
  symbol: string;
  route: Route;
  markets: string[];
  sides: string[];
  capInr: Decimal;
}

export interface MarketConfig {
  market: string;
  precision: PrecisionConfig;
  slipCapBps: number;
  feeBps: number;
}

export interface TriangleEvaluationResult {
  canExecute: boolean;
  expectedEdge: Decimal;
  legs: TriangleLeg[];
  capitalInr: Decimal;
  error?: string;
}

export interface TriangleLeg {
  market: string;
  side: 'BUY' | 'SELL';
  qty: Decimal;
  price: Decimal;
  vwapPrice: Decimal;
  worstPrice: Decimal;
  impactBps: Decimal;
  levelsUsed: number;
  notional: Decimal;
  fee: Decimal;
}

/**
 * Enumerate all possible triangles for given symbols
 * CoinDCX symbol format: BTCUSDT, BTCINR, USDTINR
 */
export function enumerateTriangles(symbols: string[]): Triangle[] {
  const triangles: Triangle[] = [];
  
  for (const symbol of symbols) {
    // Straight route: INR → USDT → X → INR
    triangles.push({
      id: `${symbol}:STRAIGHT`,
      symbol,
      route: 'STRAIGHT',
      markets: ['USDTINR', `${symbol}USDT`, `${symbol}INR`],
      sides: ['BUY', 'BUY', 'SELL'],
      capInr: new Decimal(10000) // Default cap
    });
    
    // Reverse route: INR → X → USDT → INR
    triangles.push({
      id: `${symbol}:REVERSE`,
      symbol,
      route: 'REVERSE',
      markets: [`${symbol}INR`, `${symbol}USDT`, 'USDTINR'],
      sides: ['BUY', 'SELL', 'SELL'],
      capInr: new Decimal(10000) // Default cap
    });
  }
  
  return triangles;
}

/**
 * Evaluate a triangle for arbitrage opportunity
 */
export function evaluateTriangle(
  triangle: Triangle,
  marketStates: Map<string, { asks: DepthLevel[]; bids: DepthLevel[]; bestBid: Decimal; bestAsk: Decimal }>,
  marketConfigs: Map<string, MarketConfig>,
  capitalInr: Decimal,
  entryThresholdBps: number
): TriangleEvaluationResult {
  try {
    const legs: TriangleLeg[] = [];
    let currentAmount = capitalInr;
    let currentAsset = 'INR';
    
    // Process each leg of the triangle
    for (let i = 0; i < triangle.markets.length; i++) {
      const market = triangle.markets[i];
      const side = triangle.sides[i] as 'BUY' | 'SELL';
      const marketState = marketStates.get(market);
      const config = marketConfigs.get(market);
      
      if (!marketState || !config) {
        return {
          canExecute: false,
          expectedEdge: new Decimal(0),
          legs: [],
          capitalInr,
          error: `Missing market state or config for ${market}`
        };
      }
      
      const leg = processTriangleLeg(
        market,
        side,
        currentAsset,
        currentAmount,
        marketState,
        config
      );
      
      if (!leg) {
        return {
          canExecute: false,
          expectedEdge: new Decimal(0),
          legs: [],
          capitalInr,
          error: `Failed to process leg ${i + 1} for market ${market}`
        };
      }
      
      legs.push(leg);
      
      // Update for next leg
      currentAmount = leg.notional;
      currentAsset = getNextAsset(triangle.symbol, i, triangle.route);
    }
    
    // Calculate final edge
    const finalAmount = legs[legs.length - 1].notional;
    const expectedEdge = calculateEdgeBps(capitalInr, finalAmount);
    
    const canExecute = expectedEdge.gte(entryThresholdBps);
    
    return {
      canExecute,
      expectedEdge,
      legs,
      capitalInr,
      error: canExecute ? undefined : `Edge ${expectedEdge.toFixed(2)} bps below threshold ${entryThresholdBps} bps`
    };
    
  } catch (error) {
    return {
      canExecute: false,
      expectedEdge: new Decimal(0),
      legs: [],
      capitalInr,
      error: `Evaluation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Process a single leg of the triangle
 */
function processTriangleLeg(
  market: string,
  side: 'BUY' | 'SELL',
  currentAsset: string,
  currentAmount: Decimal,
  marketState: { asks: DepthLevel[]; bids: DepthLevel[]; bestBid: Decimal; bestAsk: Decimal },
  config: MarketConfig
): TriangleLeg | null {
  const { asks, bids, bestBid, bestAsk } = marketState;
  const levels = side === 'BUY' ? asks : bids;
  const bestPrice = side === 'BUY' ? bestAsk : bestBid;
  
  // Determine quantity needed
  let qty: Decimal;
  if (side === 'BUY') {
    // For BUY, we have quote currency and need base currency
    qty = estimateQuantityForNotional(levels, currentAmount, side, config.precision.quantityPrecision);
  } else {
    // For SELL, we have base currency
    qty = currentAmount;
  }
  
  // Validate quantity
  const qtyValidation = validateQuantity(qty, config.precision);
  if (!qtyValidation.valid) {
    return null;
  }
  
  qty = qtyValidation.adjustedQty!;
  
  // Check if we can fill with acceptable slippage
  const fillCheck = canFill(levels, qty, side, bestPrice, config.slipCapBps);
  if (!fillCheck.canFill) {
    return null;
  }
  
  const { result, slippageBps } = fillCheck;
  
  // Calculate notional and fee
  const notional = result.notional;
  const fee = calculateFee(notional, config.feeBps);
  const netNotional = applyFee(notional, config.feeBps);
  
  return {
    market,
    side,
    qty,
    price: bestPrice,
    vwapPrice: result.avgPrice,
    worstPrice: result.worstPrice,
    impactBps: slippageBps,
    levelsUsed: result.levelsUsed,
    notional: netNotional,
    fee
  };
}

/**
 * Get the next asset in the triangle sequence
 */
function getNextAsset(symbol: string, legIndex: number, route: Route): string {
  if (route === 'STRAIGHT') {
    switch (legIndex) {
      case 0: return 'USDT'; // INR → USDT
      case 1: return symbol; // USDT → X
      case 2: return 'INR';  // X → INR
      default: return 'INR';
    }
  } else { // REVERSE
    switch (legIndex) {
      case 0: return symbol; // INR → X
      case 1: return 'USDT'; // X → USDT
      case 2: return 'INR';  // USDT → INR
      default: return 'INR';
    }
  }
}

/**
 * Validate quantity against market constraints
 */
function validateQuantity(qty: Decimal, precision: PrecisionConfig): { valid: boolean; adjustedQty?: Decimal } {
  // Round down to precision
  const multiplier = new Decimal(10).pow(precision.quantityPrecision);
  const roundedQty = qty.mul(multiplier).floor().div(multiplier);
  
  // Check minimum quantity
  if (roundedQty.lt(precision.minQty)) {
    return { valid: false };
  }
  
  // Check maximum quantity if specified
  if (precision.maxQty && roundedQty.gt(precision.maxQty)) {
    return { valid: false };
  }
  
  return { valid: true, adjustedQty: roundedQty };
}

/**
 * Generate sizing ladder for capital allocation
 */
export function generateSizingLadder(
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
  
  return sizes;
}

/**
 * Find optimal size for triangle execution
 */
export function findOptimalSize(
  triangle: Triangle,
  marketStates: Map<string, { asks: DepthLevel[]; bids: DepthLevel[]; bestBid: Decimal; bestAsk: Decimal }>,
  marketConfigs: Map<string, MarketConfig>,
  entryThresholdBps: number,
  minQuantum: Decimal,
  maxAmount: Decimal
): TriangleEvaluationResult | null {
  const sizingLadder = generateSizingLadder(minQuantum, maxAmount, minQuantum);
  
  // Try sizes from largest to smallest to find the best opportunity
  for (let i = sizingLadder.length - 1; i >= 0; i--) {
    const size = sizingLadder[i];
    const result = evaluateTriangle(triangle, marketStates, marketConfigs, size, entryThresholdBps);
    
    if (result.canExecute) {
      return result;
    }
  }
  
  return null;
}
